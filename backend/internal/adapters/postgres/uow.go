package postgres

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/dasepmoch/fersaku-new/backend/internal/application"
)

// OutboxInsert is one durable outbox row written in the same TX as a mutation.
type OutboxInsert struct {
	ID           string
	Topic        string
	Payload      json.RawMessage
	DedupeKey    *string
	PaymentMode  *string // SANDBOX|LIVE or nil
	AvailableAt  time.Time
	Status       string // default pending
}

// IdempotencyInsert records first-writer-wins idempotency state.
type IdempotencyInsert struct {
	ID             string
	SubjectType    string
	SubjectID      string
	Operation      string
	PaymentMode    *string
	KeyHash        string
	RequestHash    string
	Status         string // IN_PROGRESS|COMPLETED|FAILED|UNKNOWN_PROVIDER_OUTCOME
	ResourceType   *string
	ResourceID     *string
	ResponseStatus *int32
	ResponseBody   json.RawMessage
	RequestID      *string
	LeaseExpiresAt *time.Time
	ExpiresAt      time.Time
}

// AuditStubInsert is the minimal audit row for atomic-commit proofs (full JCS audit is BE-530).
type AuditStubInsert struct {
	ID          string
	SequenceNo  int64
	PayloadHash []byte // exactly 32 bytes
}

// AtomicWrite is the unit-of-work payload: domain mutation + optional idempotency +
// outbox rows + optional audit stub, all in one PostgreSQL transaction.
type AtomicWrite struct {
	// Domain runs first inside the TX (caller-owned SQL / repository work).
	Domain func(ctx context.Context, tx pgx.Tx) error
	// Idempotency is optional; when set, inserted after domain.
	Idempotency *IdempotencyInsert
	// Outbox rows are inserted after domain/idempotency.
	Outbox []OutboxInsert
	// Audit is optional minimal stub (BE-100); full chain is BE-530.
	Audit *AuditStubInsert
}

// RunAtomic commits domain mutation + idempotency + outbox (+ optional audit) together.
// Any failure rolls the entire transaction back (no partial durable effects).
func (p *Pool) RunAtomic(ctx context.Context, w AtomicWrite) error {
	return p.WithTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		if w.Domain != nil {
			if err := w.Domain(ctx, tx); err != nil {
				return err
			}
		}
		if w.Idempotency != nil {
			if err := insertIdempotency(ctx, tx, *w.Idempotency); err != nil {
				return err
			}
		}
		for i := range w.Outbox {
			if err := insertOutbox(ctx, tx, w.Outbox[i]); err != nil {
				return err
			}
		}
		if w.Audit != nil {
			if err := insertAuditStub(ctx, tx, *w.Audit); err != nil {
				return err
			}
		}
		return nil
	})
}

func insertOutbox(ctx context.Context, tx pgx.Tx, m OutboxInsert) error {
	if m.ID == "" || m.Topic == "" {
		return fmt.Errorf("postgres: outbox id and topic are required")
	}
	status := m.Status
	if status == "" {
		status = "pending"
	}
	available := m.AvailableAt
	if available.IsZero() {
		available = time.Now().UTC()
	}
	payload := m.Payload
	if payload == nil {
		payload = json.RawMessage(`{}`)
	}
	_, err := tx.Exec(ctx, `
		INSERT INTO outbox_events (
			id, topic, payload, status, attempts, available_at, created_at,
			dedupe_key, payment_mode
		) VALUES (
			$1, $2, $3::jsonb, $4, 0, $5, now(), $6, $7
		)`,
		m.ID, m.Topic, []byte(payload), status, available, m.DedupeKey, m.PaymentMode,
	)
	if err != nil {
		return fmt.Errorf("postgres: insert outbox: %w", err)
	}
	return nil
}

func insertIdempotency(ctx context.Context, tx pgx.Tx, r IdempotencyInsert) error {
	if r.ID == "" || r.SubjectType == "" || r.SubjectID == "" || r.Operation == "" || r.KeyHash == "" || r.RequestHash == "" {
		return fmt.Errorf("postgres: idempotency required fields missing")
	}
	if r.Status == "" {
		return fmt.Errorf("postgres: idempotency status is required")
	}
	if r.ExpiresAt.IsZero() {
		return fmt.Errorf("postgres: idempotency expires_at is required")
	}
	var body any
	if r.ResponseBody != nil {
		body = []byte(r.ResponseBody)
	}
	_, err := tx.Exec(ctx, `
		INSERT INTO idempotency_records (
			id, subject_type, subject_id, operation, payment_mode,
			key_hash, request_hash, status, resource_type, resource_id,
			response_status, response_body, request_id, lease_expires_at,
			expires_at, created_at, updated_at
		) VALUES (
			$1, $2, $3, $4, $5,
			$6, $7, $8, $9, $10,
			$11, $12::jsonb, $13, $14,
			$15, now(), now()
		)`,
		r.ID, r.SubjectType, r.SubjectID, r.Operation, r.PaymentMode,
		r.KeyHash, r.RequestHash, r.Status, r.ResourceType, r.ResourceID,
		r.ResponseStatus, body, r.RequestID, r.LeaseExpiresAt,
		r.ExpiresAt,
	)
	if err != nil {
		return fmt.Errorf("postgres: insert idempotency: %w", err)
	}
	return nil
}

func insertAuditStub(ctx context.Context, tx pgx.Tx, a AuditStubInsert) error {
	if a.ID == "" || len(a.PayloadHash) == 0 {
		return fmt.Errorf("postgres: audit requires id and payload")
	}
	// BE-530: use append_audit_event; SequenceNo is assigned by the chain head lock.
	canonical := a.PayloadHash
	if len(canonical) == 32 {
		// Treat 32-byte hash as opaque content for legacy AtomicWrite callers.
		canonical = []byte(fmt.Sprintf(`{"legacyAtomicAudit":"%x"}`, a.PayloadHash))
	}
	_, err := callAppendOnTx(ctx, tx, application.AuditAppendParams{
		ID:               a.ID,
		ChainScope:       "default",
		CanonicalVersion: "JCS-1",
		CanonicalPayload: canonical,
		Action:           "atomic.stub",
		ResourceType:     "atomic",
		CreatedAt:        time.Now().UTC(),
		MetadataJSON:     []byte("{}"),
	})
	if err != nil {
		return fmt.Errorf("postgres: insert audit: %w", err)
	}
	return nil
}

// TryInsertIdempotency attempts first-writer-wins insert.
// Returns (true, nil) if this caller won; (false, nil) if the scope already exists.
func (p *Pool) TryInsertIdempotency(ctx context.Context, r IdempotencyInsert) (inserted bool, err error) {
	err = p.WithTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		tag, execErr := tx.Exec(ctx, `
			INSERT INTO idempotency_records (
				id, subject_type, subject_id, operation, payment_mode,
				key_hash, request_hash, status, resource_type, resource_id,
				response_status, response_body, request_id, lease_expires_at,
				expires_at, created_at, updated_at
			) VALUES (
				$1, $2, $3, $4, $5,
				$6, $7, $8, $9, $10,
				$11, $12::jsonb, $13, $14,
				$15, now(), now()
			)
			ON CONFLICT ON CONSTRAINT idempotency_records_scope_uidx
			DO NOTHING`,
			r.ID, r.SubjectType, r.SubjectID, r.Operation, r.PaymentMode,
			r.KeyHash, r.RequestHash, r.Status, r.ResourceType, r.ResourceID,
			r.ResponseStatus, nullableJSON(r.ResponseBody), r.RequestID, r.LeaseExpiresAt,
			r.ExpiresAt,
		)
		if execErr != nil {
			return fmt.Errorf("postgres: try insert idempotency: %w", execErr)
		}
		inserted = tag.RowsAffected() == 1
		return nil
	})
	return inserted, err
}

func nullableJSON(b json.RawMessage) any {
	if b == nil {
		return nil
	}
	return []byte(b)
}
