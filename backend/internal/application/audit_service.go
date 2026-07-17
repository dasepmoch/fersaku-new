package application

import (
	"context"
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/admin"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/audit"
	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
	"github.com/dasepmoch/fersaku-new/backend/internal/platform/metrics"
	"github.com/dasepmoch/fersaku-new/backend/internal/ports"
)

// AuditService implements BE-530 JCS-1 append-only audit chain operations.
type AuditService struct {
	Store AuditStore
	IDs   ports.IDGenerator
	Clock ports.Clock
	Log   ports.Logger
	// ChainScope defaults to audit.DefaultChainScope.
	ChainScope string
	// Signer is optional Ed25519 private key for checkpoints (32-byte seed or 64-byte key).
	// When nil, CreateCheckpoint uses a deterministic local test key from seed "fersaku-audit-local".
	Signer ed25519.PrivateKey
	// PublicKey is the pinned verification key (derived from Signer when nil).
	PublicKey ed25519.PublicKey
	// KeyID labels the signing key in checkpoints.
	KeyID string
	// OnChainBroken is optional alert hook (log/outbox); never stops payment processing.
	OnChainBroken func(ctx context.Context, report audit.IntegrityReport)
}

func (s *AuditService) scope() string {
	if s.ChainScope == "" {
		return audit.DefaultChainScope
	}
	return s.ChainScope
}

func (s *AuditService) now() time.Time {
	if s.Clock != nil {
		return s.Clock.Now().UTC()
	}
	return time.Now().UTC()
}

func (s *AuditService) newID(prefix string) string {
	id := s.IDs.New()
	if prefix != "" && !strings.HasPrefix(id, prefix) {
		return prefix + id
	}
	return id
}

func (s *AuditService) signer() (ed25519.PrivateKey, ed25519.PublicKey, string) {
	keyID := s.KeyID
	if keyID == "" {
		keyID = "local-dev"
	}
	if len(s.Signer) == ed25519.PrivateKeySize {
		pub := s.PublicKey
		if len(pub) != ed25519.PublicKeySize {
			pub = s.Signer.Public().(ed25519.PublicKey)
		}
		return s.Signer, pub, keyID
	}
	// Deterministic local key for tests/dev (not for production money).
	seed := sha256.Sum256([]byte("fersaku-audit-local-v1"))
	priv := ed25519.NewKeyFromSeed(seed[:])
	return priv, priv.Public().(ed25519.PublicKey), keyID
}

// AppendInput is the application-facing append request (canonicalized to JCS-1).
type AppendInput struct {
	ID                   string
	Action               string
	ResourceType         string
	ResourceID           string
	ActorUserID          string
	ActingSessionID      string
	ImpersonationSession string
	MerchantID           string
	StoreID              string
	RequestID            string
	Reason               string
	Result               string
	PaymentMode          string
	IPHash               string
	UAHash               string
	Before               map[string]any
	After                map[string]any
	Metadata             map[string]any
	OccurredAt           time.Time
}

// Append canonicalizes the logical event and commits via append_audit_event.
func (s *AuditService) Append(ctx context.Context, in AppendInput) (AuditAppendResult, error) {
	if s.Store == nil {
		return AuditAppendResult{}, apperr.Internal(apperr.CodeInternalError, "Audit store unavailable")
	}
	id := strings.TrimSpace(in.ID)
	if id == "" {
		id = s.newID("aud_")
	}
	at := in.OccurredAt
	if at.IsZero() {
		at = s.now()
	}
	logical := audit.LogicalEvent{
		EventID:              id,
		Action:               in.Action,
		ResourceType:         in.ResourceType,
		ResourceID:           in.ResourceID,
		ActorUserID:          in.ActorUserID,
		ActingSessionID:      in.ActingSessionID,
		ImpersonationSession: in.ImpersonationSession,
		MerchantID:           in.MerchantID,
		StoreID:              in.StoreID,
		RequestID:            in.RequestID,
		Reason:               in.Reason,
		Result:               in.Result,
		PaymentMode:          in.PaymentMode,
		IPHash:               in.IPHash,
		UAHash:               in.UAHash,
		Before:               in.Before,
		After:                in.After,
		Metadata:             in.Metadata,
		OccurredAt:           at.UTC(),
	}
	payload, err := audit.CanonicalizeLogicalEvent(logical)
	if err != nil {
		return AuditAppendResult{}, apperr.Wrap(apperr.KindInternal, apperr.CodeInternalError, "Audit canonicalize failed", err)
	}
	meta := in.Metadata
	if meta == nil {
		meta = map[string]any{}
	}
	// Embed before/after into searchable metadata when present.
	if len(in.Before) > 0 {
		meta["before"] = in.Before
	}
	if len(in.After) > 0 {
		meta["after"] = in.After
	}
	metaJSON, _ := json.Marshal(meta)
	return s.Store.Append(ctx, AuditAppendParams{
		ID:               id,
		ChainScope:       s.scope(),
		CanonicalVersion: audit.CanonicalVersionLaunch,
		CanonicalPayload: payload,
		ActorUserID:      in.ActorUserID,
		Action:           in.Action,
		ResourceType:     in.ResourceType,
		ResourceID:       in.ResourceID,
		Reason:           in.Reason,
		RequestID:        in.RequestID,
		MerchantID:       in.MerchantID,
		MetadataJSON:     metaJSON,
		CreatedAt:        at.UTC(),
	})
}

// Search returns redacted projection rows for admin list.
func (s *AuditService) Search(ctx context.Context, f AuditSearchFilter) ([]admin.AuditEvent, error) {
	if s.Store == nil {
		return nil, apperr.Internal(apperr.CodeInternalError, "Audit store unavailable")
	}
	if f.ChainScope == "" {
		f.ChainScope = s.scope()
	}
	if f.Limit <= 0 {
		f.Limit = admin.DefaultListLimit
	}
	if f.Limit > admin.MaxListLimit {
		f.Limit = admin.MaxListLimit
	}
	rows, err := s.Store.Search(ctx, f)
	if err != nil {
		return nil, err
	}
	out := make([]admin.AuditEvent, 0, len(rows))
	for _, r := range rows {
		out = append(out, chainToAdmin(r))
	}
	return out, nil
}

// Detail returns one event.
func (s *AuditService) Detail(ctx context.Context, id string) (admin.AuditEvent, error) {
	if s.Store == nil {
		return admin.AuditEvent{}, apperr.Internal(apperr.CodeInternalError, "Audit store unavailable")
	}
	row, err := s.Store.GetByID(ctx, strings.TrimSpace(id))
	if err != nil {
		if s.Store.IsNotFound(err) {
			return admin.AuditEvent{}, apperr.NotFound(apperr.CodeResourceNotFound, "Audit event not found")
		}
		return admin.AuditEvent{}, err
	}
	return chainToAdmin(row), nil
}

// CreateExportJob queues/completes a redacted export job and audits the export itself.
func (s *AuditService) CreateExportJob(ctx context.Context, actorID, reason string, filter map[string]any, requestID string) (admin.AuditExport, error) {
	if strings.TrimSpace(reason) == "" {
		return admin.AuditExport{}, apperr.Validation(apperr.CodeValidationFailed, "reason is required")
	}
	now := s.now()
	id := s.newID("aex_")
	filterJSON, _ := json.Marshal(filter)
	exp := admin.AuditExport{
		ID:              id,
		Status:          "QUEUED",
		RedactionPolicy: audit.RedactionPolicyLaunch,
		RequesterID:     actorID,
		Reason:          strings.TrimSpace(reason),
		CreatedAt:       now,
	}
	err := s.Store.WithTx(ctx, func(txCtx context.Context) error {
		if err := s.Store.InsertExport(txCtx, exp, filterJSON, now); err != nil {
			return err
		}
		sf := AuditSearchFilter{Limit: admin.ExportMaxLimit, ChainScope: s.scope()}
		n := int64(0)
		if rows, lerr := s.Store.Search(txCtx, sf); lerr == nil {
			n = int64(len(rows))
		}
		done := now
		expAt := now.Add(24 * time.Hour)
		if err := s.Store.CompleteExport(txCtx, id, "COMPLETE", &n, &done, &expAt, nil); err != nil {
			return err
		}
		exp.Status = "COMPLETE"
		exp.RowCount = &n
		exp.CompletedAt = &done
		exp.ExpiresAt = &expAt
		_, err := s.Append(txCtx, AppendInput{
			Action:       "audit.export.create",
			ResourceType: "audit_export",
			ResourceID:   id,
			ActorUserID:  actorID,
			RequestID:    requestID,
			Reason:       reason,
			Result:       "OK",
			Metadata:     map[string]any{"rowCount": n},
			OccurredAt:   now,
		})
		return err
	})
	return exp, err
}

// GetExport returns export job status.
func (s *AuditService) GetExport(ctx context.Context, id string) (admin.AuditExport, error) {
	row, err := s.Store.GetExport(ctx, strings.TrimSpace(id))
	if err != nil {
		if s.Store.IsNotFound(err) {
			return admin.AuditExport{}, apperr.NotFound(apperr.CodeResourceNotFound, "Audit export not found")
		}
		return admin.AuditExport{}, err
	}
	return row, nil
}

// CreateCheckpoint signs the current head and inserts a retention-locked checkpoint.
func (s *AuditService) CreateCheckpoint(ctx context.Context) (audit.Checkpoint, error) {
	if s.Store == nil {
		return audit.Checkpoint{}, apperr.Internal(apperr.CodeInternalError, "Audit store unavailable")
	}
	scope := s.scope()
	seq, headHash, err := s.Store.GetHead(ctx, scope)
	if err != nil {
		return audit.Checkpoint{}, err
	}
	if seq <= 0 {
		return audit.Checkpoint{}, apperr.Validation(apperr.CodeValidationFailed, "no audit events to checkpoint")
	}
	priv, _, keyID := s.signer()
	now := s.now()
	signedAt := now.Format(time.RFC3339Nano)
	msg := audit.CheckpointSignPayload(scope, seq, headHash, audit.CanonicalVersionLaunch, signedAt)
	sig := ed25519.Sign(priv, msg)
	cp := audit.Checkpoint{
		ID:               s.newID("acp_"),
		ChainScope:       scope,
		SequenceNo:       seq,
		HeadHash:         headHash,
		CanonicalVersion: audit.CanonicalVersionLaunch,
		Signature:        sig,
		KeyID:            keyID,
		SignedAt:         now,
		LockedUntil:      now.Add(365 * 24 * time.Hour),
		CreatedAt:        now,
	}
	if err := s.Store.CreateCheckpoint(ctx, cp); err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "overwrite") || strings.Contains(err.Error(), "already exists") {
			return audit.Checkpoint{}, apperr.Conflict(apperr.CodeConflict, "checkpoint overwrite denied")
		}
		return audit.Checkpoint{}, err
	}
	return cp, nil
}

// VerifyChain streams by sequence_no, recomputes hashes, checks gaps and checkpoint signature.
// On failure returns AUDIT_CHAIN_BROKEN and invokes OnChainBroken.
func (s *AuditService) VerifyChain(ctx context.Context) (audit.IntegrityReport, error) {
	scope := s.scope()
	report := audit.IntegrityReport{
		ChainScope:     scope,
		ChainMode:      audit.ChainModeJCS,
		VerifierStatus: audit.VerifierPending,
	}
	if s.Store == nil {
		return report, apperr.Internal(apperr.CodeInternalError, "Audit store unavailable")
	}
	count, err := s.Store.Count(ctx, scope)
	if err != nil {
		return report, err
	}
	minSeq, maxSeq, err := s.Store.MinMaxSeq(ctx, scope)
	if err != nil {
		return report, err
	}
	report.EventCount = count
	report.MinSequence = minSeq
	report.HeadSequence = maxSeq

	headSeq, headHash, err := s.Store.GetHead(ctx, scope)
	if err == nil {
		report.HeadSequence = headSeq
		hx := hex.EncodeToString(headHash)
		report.HeadHashHex = &hx
	}

	var cpSeq int64
	var cpHash []byte
	var cpSig []byte
	var cpKeyID string
	var cpSignedAt time.Time
	if cp, cerr := s.Store.LatestCheckpoint(ctx, scope); cerr == nil {
		cpSeq = cp.SequenceNo
		cpHash = cp.HeadHash
		cpSig = cp.Signature
		cpKeyID = cp.KeyID
		cpSignedAt = cp.SignedAt
		report.CheckpointSequence = cpSeq
	} else if !s.Store.IsNotFound(cerr) && cerr != nil {
		// no checkpoint is OK for empty/new chains
		_ = cpKeyID
	}
	if maxSeq > cpSeq {
		report.UncheckpointedTail = maxSeq - cpSeq
	}

	if count == 0 {
		report.VerifierStatus = audit.VerifierOK
		return report, nil
	}

	// Stream in batches.
	const batch = int32(500)
	var prevHash []byte
	var inModern bool // true once we see a post-BE-530 JCS payload
	expectSeq := minSeq
	from := minSeq
	for {
		rows, err := s.Store.StreamFrom(ctx, scope, from, batch)
		if err != nil {
			return report, err
		}
		if len(rows) == 0 {
			break
		}
		for _, row := range rows {
			if row.SequenceNo != expectSeq {
				return s.broken(ctx, report, fmt.Sprintf("gap or duplicate: expected sequence %d got %d", expectSeq, row.SequenceNo))
			}
			legacy := isLegacyAuditRow(row)
			if !legacy {
				inModern = true
				if prevHash != nil && !bytesEqual(row.PrevHash, prevHash) {
					return s.broken(ctx, report, fmt.Sprintf("prev_hash mismatch at sequence %d", row.SequenceNo))
				}
				if len(row.CanonicalPayload) > 0 && row.CanonicalVersion == audit.CanonicalVersionLaunch {
					computed := audit.ComputeRowHash(row.SequenceNo, row.PrevHash, row.CanonicalVersion, row.CanonicalPayload)
					if !bytesEqual(computed, row.RowHash) {
						return s.broken(ctx, report, fmt.Sprintf("row_hash mismatch at sequence %d", row.SequenceNo))
					}
				}
			} else if inModern {
				// Modern chain must not be followed by legacy rows.
				return s.broken(ctx, report, fmt.Sprintf("legacy row after modern chain at sequence %d", row.SequenceNo))
			}
			// Checkpoint anchor check when we hit the checkpoint sequence.
			if cpSeq > 0 && row.SequenceNo == cpSeq {
				if !bytesEqual(row.RowHash, cpHash) {
					return s.broken(ctx, report, fmt.Sprintf("checkpoint head_hash mismatch at sequence %d", cpSeq))
				}
				_, pub, _ := s.signer()
				msg := audit.CheckpointSignPayload(scope, cpSeq, cpHash, audit.CanonicalVersionLaunch, cpSignedAt.UTC().Format(time.RFC3339Nano))
				if len(cpSig) > 0 && !ed25519.Verify(pub, msg, cpSig) {
					return s.broken(ctx, report, "checkpoint signature invalid")
				}
			}
			prevHash = row.RowHash
			report.LastVerifiedSeq = row.SequenceNo
			expectSeq++
		}
		if int32(len(rows)) < batch {
			break
		}
		from = rows[len(rows)-1].SequenceNo + 1
	}

	if report.LastVerifiedSeq != maxSeq && maxSeq > 0 {
		return s.broken(ctx, report, fmt.Sprintf("incomplete scan: last=%d max=%d", report.LastVerifiedSeq, maxSeq))
	}

	report.VerifierStatus = audit.VerifierOK
	metrics.Global.IncAuditChain("ok")
	return report, nil
}

func (s *AuditService) broken(ctx context.Context, report audit.IntegrityReport, reason string) (audit.IntegrityReport, error) {
	report.VerifierStatus = audit.VerifierBroken
	report.BrokenReason = reason
	metrics.Global.IncAuditChain("broken")
	if s.Log != nil {
		s.Log.Error("AUDIT_CHAIN_BROKEN", "reason", reason, "chainScope", report.ChainScope, "headSequence", report.HeadSequence)
	} else {
		slog.Error("AUDIT_CHAIN_BROKEN", "reason", reason)
	}
	if s.OnChainBroken != nil {
		s.OnChainBroken(ctx, report)
	}
	return report, apperr.Internal(apperr.CodeAuditChainBroken, "Audit chain integrity verification failed")
}

// IntegrityMeta returns admin integrity projection (runs streaming verify).
func (s *AuditService) IntegrityMeta(ctx context.Context) (admin.AuditIntegrityMeta, error) {
	rep, err := s.VerifyChain(ctx)
	// Always return meta even on broken chain (status reflects failure).
	m := admin.AuditIntegrityMeta{
		EventCount:      rep.EventCount,
		HeadSequence:    rep.HeadSequence,
		MinSequence:     rep.MinSequence,
		HeadPayloadHash: rep.HeadHashHex,
		HeadCreatedAt:   rep.HeadCreatedAt,
		ChainMode:       rep.ChainMode,
		VerifierStatus:  rep.VerifierStatus,
	}
	if err != nil && rep.VerifierStatus != audit.VerifierBroken {
		return m, err
	}
	// Broken chain still returns 200 with failed status for admin UI.
	return m, nil
}

func chainToAdmin(r audit.ChainEvent) admin.AuditEvent {
	meta := r.Metadata
	if meta == nil && len(r.JCSPayload) > 0 {
		meta = r.JCSPayload
	}
	hashHex := hex.EncodeToString(r.RowHash)
	if hashHex == "" && len(r.RowHash) == 0 {
		// fallback
	}
	return admin.AuditEvent{
		ID:           r.ID,
		SequenceNo:   r.SequenceNo,
		PayloadHash:  hashHex,
		CreatedAt:    r.CreatedAt,
		ActorUserID:  r.ActorUserID,
		Action:       r.Action,
		ResourceType: r.ResourceType,
		ResourceID:   r.ResourceID,
		Reason:       r.Reason,
		RequestID:    r.RequestID,
		MerchantID:   r.MerchantID,
		Metadata:     meta,
	}
}

func bytesEqual(a, b []byte) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

// isLegacyAuditRow detects pre-BE-530 stub rows (32-byte hash-only payload, not JSON JCS).
func isLegacyAuditRow(row audit.ChainEvent) bool {
	if len(row.CanonicalPayload) == 0 {
		return true
	}
	// Modern JCS payloads are JSON objects starting with '{'.
	if row.CanonicalPayload[0] == '{' {
		return false
	}
	return true
}
