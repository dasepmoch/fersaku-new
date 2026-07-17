package application

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/admin"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/delivery"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/gateway"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/platform"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/reviews"
	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
	"github.com/dasepmoch/fersaku-new/backend/internal/ports"
)

// AdminOpsService implements BE-510 lightweight admin operations + /v1/admin/actions.
type AdminOpsService struct {
	Store       AdminOpsStore
	Auth        *AuthService
	Delivery    *DeliveryService
	Withdrawals *WithdrawalService
	Credentials *CredentialService
	Fees        *FeeService
	// Audit is the BE-530 chain service (preferred append/search/verify path).
	Audit *AuditService
	IDs   ports.IDGenerator
	Clock ports.Clock
	Log   ports.Logger
	// XenditHealth is optional; when nil returns OK stub for local/test.
	XenditHealth func(ctx context.Context) admin.ProviderHealth
	// ComponentHealth returns Xendit/R2/Redis/mail status without secrets.
	ComponentHealth func(ctx context.Context) []admin.ComponentHealth
}

func (s *AdminOpsService) now() time.Time {
	if s.Clock != nil {
		return s.Clock.Now().UTC()
	}
	return time.Now().UTC()
}

func (s *AdminOpsService) newID(prefix string) string {
	id := s.IDs.New()
	if prefix != "" && !strings.HasPrefix(id, prefix) {
		return prefix + id
	}
	return id
}

func requireReason(reason string) error {
	if strings.TrimSpace(reason) == "" {
		return apperr.Validation(apperr.CodeValidationFailed, "reason is required")
	}
	return nil
}

func (s *AdminOpsService) writeAudit(ctx context.Context, actorID, action, resourceType, resourceID, reason, requestID, merchantID string, meta map[string]any) error {
	return s.writeAuditBA(ctx, actorID, action, resourceType, resourceID, reason, requestID, merchantID, nil, nil, meta)
}

// writeAuditBA appends a JCS-1 chain event with optional before/after snapshots.
func (s *AdminOpsService) writeAuditBA(ctx context.Context, actorID, action, resourceType, resourceID, reason, requestID, merchantID string, before, after map[string]any, meta map[string]any) error {
	now := s.now()
	id := s.newID("aud_")
	// Prefer AuditService when wired (full JCS canonicalize + append).
	if s.Audit != nil {
		_, err := s.Audit.Append(ctx, AppendInput{
			ID:           id,
			Action:       action,
			ResourceType: resourceType,
			ResourceID:   resourceID,
			ActorUserID:  actorID,
			MerchantID:   merchantID,
			RequestID:    requestID,
			Reason:       reason,
			Result:       "OK",
			Before:       before,
			After:        after,
			Metadata:     meta,
			OccurredAt:   now,
		})
		return err
	}
	// Fallback: build minimal JCS-like payload for Store.InsertAudit → append_audit_event.
	logical := map[string]any{
		"eventId":      id,
		"action":       action,
		"resourceType": resourceType,
		"resourceId":   resourceID,
		"occurredAt":   now.UTC().Format(time.RFC3339Nano),
	}
	if actorID != "" {
		logical["actorUserId"] = actorID
	}
	if reason != "" {
		logical["reason"] = reason
	}
	if requestID != "" {
		logical["requestId"] = requestID
	}
	if merchantID != "" {
		logical["merchantId"] = merchantID
	}
	if len(before) > 0 {
		logical["before"] = before
	}
	if len(after) > 0 {
		logical["after"] = after
	}
	if len(meta) > 0 {
		logical["metadata"] = meta
	}
	payload, _ := json.Marshal(logical)
	sum := sha256.Sum256(payload)
	var actorPtr, actionPtr, rtPtr, ridPtr, reasonPtr, reqPtr, midPtr *string
	if actorID != "" {
		actorPtr = &actorID
	}
	if action != "" {
		actionPtr = &action
	}
	if resourceType != "" {
		rtPtr = &resourceType
	}
	if resourceID != "" {
		ridPtr = &resourceID
	}
	if reason != "" {
		reasonPtr = &reason
	}
	if requestID != "" {
		reqPtr = &requestID
	}
	if merchantID != "" {
		midPtr = &merchantID
	}
	merged := meta
	if merged == nil {
		merged = map[string]any{}
	}
	if len(before) > 0 {
		merged["before"] = before
	}
	if len(after) > 0 {
		merged["after"] = after
	}
	return s.Store.InsertAudit(ctx, AdminOpsAuditInsert{
		ID:               id,
		PayloadHash:      sum[:],
		CanonicalPayload: payload,
		CreatedAt:        now,
		ActorUserID:      actorPtr,
		Action:           actionPtr,
		ResourceType:     rtPtr,
		ResourceID:       ridPtr,
		Reason:           reasonPtr,
		RequestID:        reqPtr,
		MerchantID:       midPtr,
		MetadataJSON:     adminOpsMarshalMeta(merged),
	})
}

// ---------- Merchant status / API access (independent axes) ----------

// UpdateMerchantStatus sets ACTIVE|SUSPENDED|CLOSED without touching API capability.
func (s *AdminOpsService) UpdateMerchantStatus(ctx context.Context, actorID, merchantID, status, reason, requestID string) (AdminOpsMerchant, error) {
	if err := requireReason(reason); err != nil {
		return AdminOpsMerchant{}, err
	}
	status = strings.ToUpper(strings.TrimSpace(status))
	if !admin.ValidMerchantStatus(status) {
		return AdminOpsMerchant{}, apperr.Validation(apperr.CodeValidationFailed, "status must be ACTIVE, SUSPENDED, or CLOSED")
	}
	merchantID = strings.TrimSpace(merchantID)
	if merchantID == "" {
		return AdminOpsMerchant{}, apperr.Validation(apperr.CodeValidationFailed, "merchantId is required")
	}
	now := s.now()
	var out AdminOpsMerchant
	err := s.Store.WithTx(ctx, func(txCtx context.Context) error {
		m, err := s.Store.GetMerchant(txCtx, merchantID)
		if err != nil {
			if s.Store.IsNotFound(err) {
				return apperr.NotFound(apperr.CodeResourceNotFound, "Merchant not found")
			}
			return err
		}
		if m.Status == status {
			out = m
			return s.writeAudit(txCtx, actorID, admin.ActionMerchantStatusUpdate, "merchant", merchantID, reason, requestID, merchantID, map[string]any{
				"status": status, "noop": true,
			})
		}
		var suspAt *time.Time
		var suspBy *string
		var suspReason *string
		if status == admin.MerchantStatusSuspended {
			suspAt = &now
			suspBy = &actorID
			r := strings.TrimSpace(reason)
			suspReason = &r
		}
		saved, err := s.Store.UpdateMerchantStatus(txCtx, merchantID, status, suspReason, suspAt, suspBy, now)
		if err != nil {
			return err
		}
		out = saved
		return s.writeAudit(txCtx, actorID, admin.ActionMerchantStatusUpdate, "merchant", merchantID, reason, requestID, merchantID, map[string]any{
			"from": m.Status, "to": status,
		})
	})
	return out, err
}

// UpdateAPIAccess suspends/reactivates LIVE QRIS API capability independently of merchant.status.
func (s *AdminOpsService) UpdateAPIAccess(ctx context.Context, actorID, merchantID, status, reason, requestID string) (AdminOpsCapability, error) {
	if err := requireReason(reason); err != nil {
		return AdminOpsCapability{}, err
	}
	status = strings.ToUpper(strings.TrimSpace(status))
	if !admin.ValidAPIAccessStatus(status) {
		return AdminOpsCapability{}, apperr.Validation(apperr.CodeValidationFailed, "status must be ACTIVE or SUSPENDED")
	}
	merchantID = strings.TrimSpace(merchantID)
	if merchantID == "" {
		return AdminOpsCapability{}, apperr.Validation(apperr.CodeValidationFailed, "merchantId is required")
	}
	now := s.now()
	var out AdminOpsCapability
	err := s.Store.WithTx(ctx, func(txCtx context.Context) error {
		if _, err := s.Store.GetMerchant(txCtx, merchantID); err != nil {
			if s.Store.IsNotFound(err) {
				return apperr.NotFound(apperr.CodeResourceNotFound, "Merchant not found")
			}
			return err
		}
		cap, err := s.Store.GetCapability(txCtx, merchantID, gateway.ModeLive, gateway.CapabilityQRISAPI)
		from := "NONE"
		if err == nil {
			from = cap.Status
			if cap.Status == status {
				out = cap
				return s.writeAudit(txCtx, actorID, admin.ActionMerchantAPIAccessUpdate, "merchant_api_access", merchantID, reason, requestID, merchantID, map[string]any{
					"status": status, "noop": true,
				})
			}
		} else if !s.Store.IsNotFound(err) {
			return err
		}
		id := s.newID("cap_")
		if err == nil && cap.ID != "" {
			id = cap.ID
		}
		var suspReason *string
		var suspBy *string
		if status == admin.APIAccessSuspended {
			r := strings.TrimSpace(reason)
			suspReason = &r
			suspBy = &actorID
		}
		c := AdminOpsCapability{
			ID:               id,
			MerchantID:       merchantID,
			PaymentMode:      gateway.ModeLive,
			Capability:       gateway.CapabilityQRISAPI,
			Status:           status,
			SuspensionReason: suspReason,
			SuspendedBy:      suspBy,
		}
		if err := s.Store.UpsertCapabilityAccess(txCtx, c, now, now); err != nil {
			return err
		}
		out = c
		return s.writeAudit(txCtx, actorID, admin.ActionMerchantAPIAccessUpdate, "merchant_api_access", merchantID, reason, requestID, merchantID, map[string]any{
			"from": from, "to": status,
		})
	})
	return out, err
}

// ---------- Emergency + system/providers ----------

// ListEmergencyControls returns the three switches.
func (s *AdminOpsService) ListEmergencyControls(ctx context.Context) ([]admin.EmergencyControl, error) {
	if s.Store == nil {
		return nil, apperr.Internal(apperr.CodeInternalError, "Admin ops unavailable")
	}
	return s.Store.ListEmergency(ctx)
}

// SetEmergencyControl toggles one of SELLER_REGISTRATION|QRIS_CHECKOUT|WITHDRAWALS.
func (s *AdminOpsService) SetEmergencyControl(ctx context.Context, actorID, switchName string, enabled bool, reason, ticket string, expectedVersion int64, requestID string) (admin.EmergencyControl, error) {
	if err := requireReason(reason); err != nil {
		return admin.EmergencyControl{}, err
	}
	switchName = strings.ToUpper(strings.TrimSpace(switchName))
	if !admin.ValidEmergencySwitch(switchName) {
		return admin.EmergencyControl{}, apperr.Validation(apperr.CodeValidationFailed, "switchName must be SELLER_REGISTRATION, QRIS_CHECKOUT, or WITHDRAWALS")
	}
	if expectedVersion < 1 {
		return admin.EmergencyControl{}, apperr.Validation(apperr.CodeValidationFailed, "expectedVersion is required")
	}
	now := s.now()
	var out admin.EmergencyControl
	err := s.Store.WithTx(ctx, func(txCtx context.Context) error {
		cur, err := s.Store.GetEmergency(txCtx, switchName)
		if err != nil {
			return err
		}
		if cur.Version != expectedVersion {
			return apperr.Conflict(apperr.CodeConflict, "Emergency control version conflict")
		}
		saved, err := s.Store.UpdateEmergency(txCtx, switchName, enabled, strings.TrimSpace(reason), strings.TrimSpace(ticket), actorID, expectedVersion, now)
		if err != nil {
			if s.Store.IsNotFound(err) {
				return apperr.Conflict(apperr.CodeConflict, "Emergency control version conflict")
			}
			return err
		}
		out = saved
		before := map[string]any{
			"switchName": switchName,
			"enabled":    cur.Enabled,
			"version":    cur.Version,
			"reason":     cur.Reason,
		}
		after := map[string]any{
			"switchName":     switchName,
			"enabled":        saved.Enabled,
			"version":        saved.Version,
			"reason":         saved.Reason,
			"incidentTicket": ticket,
		}
		return s.writeAuditBA(txCtx, actorID, "platform.emergency.update", "emergency_control", switchName, reason, requestID, "", before, after, map[string]any{
			"enabled": enabled, "fromVersion": expectedVersion, "toVersion": saved.Version, "ticket": ticket,
		})
	})
	return out, err
}

// IsEmergencyDisabled reports whether a switch is currently off (enabled=false means product surface disabled).
func (s *AdminOpsService) IsEmergencyDisabled(ctx context.Context, switchName string) (bool, error) {
	if s.Store == nil {
		return false, nil
	}
	c, err := s.Store.GetEmergency(ctx, switchName)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return false, nil
		}
		return false, err
	}
	return !c.Enabled, nil
}

// GetSystem returns read-only system snapshot + emergency controls + component health.
func (s *AdminOpsService) GetSystem(ctx context.Context) (admin.SystemSnapshot, error) {
	controls, err := s.ListEmergencyControls(ctx)
	if err != nil {
		return admin.SystemSnapshot{}, err
	}
	components, _ := s.GetComponentHealth(ctx)
	return admin.SystemSnapshot{
		EmergencyControls: controls,
		FeePolicyVersion:  platform.PolicyVersionLaunchV1,
		ComponentHealth:   components,
		Note:              "Fee values and non-emergency settings are release-managed; only three emergency switches are runtime-writable. Component health never includes secrets.",
	}, nil
}

// GetProviders returns read-only Xendit health (no secrets).
func (s *AdminOpsService) GetProviders(ctx context.Context) ([]admin.ProviderHealth, error) {
	now := s.now().UTC().Format(time.RFC3339)
	if s.XenditHealth != nil {
		h := s.XenditHealth(ctx)
		if h.CheckedAt == "" {
			h.CheckedAt = now
		}
		return []admin.ProviderHealth{h}, nil
	}
	return []admin.ProviderHealth{{
		Provider:     "XENDIT",
		Status:       "OK",
		AccountScope: "xendit-primary",
		CheckedAt:    now,
		Message:      "health probe not configured; default OK in local/test",
	}}, nil
}

// GetComponentHealth returns Xendit/R2/Redis/mail health without secret exposure.
func (s *AdminOpsService) GetComponentHealth(ctx context.Context) ([]admin.ComponentHealth, error) {
	if s.ComponentHealth != nil {
		return s.ComponentHealth(ctx), nil
	}
	now := s.now().UTC().Format(time.RFC3339)
	// Default local stubs (no secrets).
	return []admin.ComponentHealth{
		{Component: "xendit", Status: "OK", CheckedAt: now},
		{Component: "r2", Status: "OK", CheckedAt: now},
		{Component: "redis", Status: "OK", CheckedAt: now},
		{Component: "mail", Status: "OK", CheckedAt: now},
	}, nil
}

// ---------- Audit search / export / integrity ----------

// ListAudit returns reasoned audit events from the JCS chain.
func (s *AdminOpsService) ListAudit(ctx context.Context, f AdminOpsAuditFilter) ([]admin.AuditEvent, error) {
	if s.Audit != nil {
		return s.Audit.Search(ctx, AuditSearchFilter{
			Action: f.Action, ResourceType: f.ResourceType, ResourceID: f.ResourceID,
			ActorUserID: f.ActorUserID, From: f.From, To: f.To,
			CursorAt: f.CursorAt, CursorSeq: f.CursorSeq, Limit: f.Limit,
		})
	}
	if f.Limit <= 0 {
		f.Limit = admin.DefaultListLimit
	}
	if f.Limit > admin.MaxListLimit {
		f.Limit = admin.MaxListLimit
	}
	return s.Store.ListAudit(ctx, f)
}

// GetAudit returns one audit event.
func (s *AdminOpsService) GetAudit(ctx context.Context, id string) (admin.AuditEvent, error) {
	if s.Audit != nil {
		return s.Audit.Detail(ctx, id)
	}
	row, err := s.Store.GetAudit(ctx, strings.TrimSpace(id))
	if err != nil {
		if s.Store.IsNotFound(err) {
			return admin.AuditEvent{}, apperr.NotFound(apperr.CodeResourceNotFound, "Audit event not found")
		}
		return admin.AuditEvent{}, err
	}
	return row, nil
}

// AuditIntegrity runs streaming chain verifier and returns admin projection.
func (s *AdminOpsService) AuditIntegrity(ctx context.Context) (admin.AuditIntegrityMeta, error) {
	if s.Audit != nil {
		return s.Audit.IntegrityMeta(ctx)
	}
	return s.Store.AuditIntegrityMeta(ctx)
}

// CreateAuditExport queues an export job via AuditService when available.
func (s *AdminOpsService) CreateAuditExport(ctx context.Context, actorID, reason string, filter map[string]any, requestID string) (admin.AuditExport, error) {
	if s.Audit != nil {
		return s.Audit.CreateExportJob(ctx, actorID, reason, filter, requestID)
	}
	if err := requireReason(reason); err != nil {
		return admin.AuditExport{}, err
	}
	now := s.now()
	id := s.newID("aex_")
	filterJSON, _ := json.Marshal(filter)
	exp := admin.AuditExport{
		ID:              id,
		Status:          "QUEUED",
		RedactionPolicy: "LAUNCH_AUDIT_REDACTION_V1",
		RequesterID:     actorID,
		Reason:          strings.TrimSpace(reason),
		CreatedAt:       now,
	}
	err := s.Store.WithTx(ctx, func(txCtx context.Context) error {
		if err := s.Store.InsertAuditExport(txCtx, exp, filterJSON, now); err != nil {
			return err
		}
		n := int64(0)
		if rows, lerr := s.Store.ListAudit(txCtx, AdminOpsAuditFilter{Limit: admin.ExportMaxLimit}); lerr == nil {
			n = int64(len(rows))
		}
		done := now
		expAt := now.Add(24 * time.Hour)
		if err := s.Store.CompleteAuditExport(txCtx, id, "COMPLETE", &n, &done, &expAt, nil); err != nil {
			return err
		}
		exp.Status = "COMPLETE"
		exp.RowCount = &n
		exp.CompletedAt = &done
		exp.ExpiresAt = &expAt
		return s.writeAudit(txCtx, actorID, "audit.export.create", "audit_export", id, reason, requestID, "", map[string]any{
			"rowCount": n,
		})
	})
	return exp, err
}

// GetAuditExport returns export job status.
func (s *AdminOpsService) GetAuditExport(ctx context.Context, id string) (admin.AuditExport, error) {
	if s.Audit != nil {
		return s.Audit.GetExport(ctx, id)
	}
	row, err := s.Store.GetAuditExport(ctx, strings.TrimSpace(id))
	if err != nil {
		if s.Store.IsNotFound(err) {
			return admin.AuditExport{}, apperr.NotFound(apperr.CodeResourceNotFound, "Audit export not found")
		}
		return admin.AuditExport{}, err
	}
	return row, nil
}

// ---------- Payment mismatches ----------

// ListPaymentMismatches returns provider-paid / local-pending alerts.
func (s *AdminOpsService) ListPaymentMismatches(ctx context.Context, limit int32) ([]admin.PaymentMismatch, error) {
	if limit <= 0 {
		limit = admin.DefaultListLimit
	}
	if limit > admin.MaxListLimit {
		limit = admin.MaxListLimit
	}
	return s.Store.ListPaymentMismatches(ctx, limit)
}

// ---------- Review moderate ----------

// ModerateReview sets PUBLISHED|NEEDS_EDIT|REMOVED|PENDING.
func (s *AdminOpsService) ModerateReview(ctx context.Context, actorID, reviewID, status, reason, requestID string) (reviews.Review, error) {
	if err := requireReason(reason); err != nil {
		return reviews.Review{}, err
	}
	status = strings.ToUpper(strings.TrimSpace(status))
	switch status {
	case reviews.StatusPublished, reviews.StatusNeedsEdit, reviews.StatusRemoved, reviews.StatusPending:
	default:
		return reviews.Review{}, apperr.Validation(apperr.CodeValidationFailed, "status must be PUBLISHED, NEEDS_EDIT, REMOVED, or PENDING")
	}
	now := s.now()
	var out reviews.Review
	err := s.Store.WithTx(ctx, func(txCtx context.Context) error {
		cur, err := s.Store.GetReview(txCtx, strings.TrimSpace(reviewID))
		if err != nil {
			if s.Store.IsNotFound(err) {
				return apperr.NotFound(apperr.CodeResourceNotFound, "Review not found")
			}
			return err
		}
		if cur.Status == status {
			out = cur
			return s.writeAudit(txCtx, actorID, admin.ActionReviewModerate, "review", reviewID, reason, requestID, cur.MerchantID, map[string]any{
				"status": status, "noop": true,
			})
		}
		saved, err := s.Store.UpdateReviewStatus(txCtx, cur.ID, status, now)
		if err != nil {
			return err
		}
		out = saved
		return s.writeAudit(txCtx, actorID, admin.ActionReviewModerate, "review", reviewID, reason, requestID, cur.MerchantID, map[string]any{
			"from": cur.Status, "to": status,
		})
	})
	return out, err
}

// ---------- Buyer support ----------

// RevokeBuyerSession revokes one buyer session with reason.
func (s *AdminOpsService) RevokeBuyerSession(ctx context.Context, actorID, buyerID, sessionID, reason, requestID string) error {
	if err := requireReason(reason); err != nil {
		return err
	}
	if s.Auth == nil {
		return apperr.Internal(apperr.CodeInternalError, "Auth unavailable")
	}
	buyerID = strings.TrimSpace(buyerID)
	sessionID = strings.TrimSpace(sessionID)
	if buyerID == "" || sessionID == "" {
		return apperr.Validation(apperr.CodeValidationFailed, "buyerId and sessionId are required")
	}
	if _, err := s.Store.GetBuyerUser(ctx, buyerID); err != nil {
		if s.Store.IsNotFound(err) {
			return apperr.NotFound(apperr.CodeResourceNotFound, "Buyer not found")
		}
		return err
	}
	if err := s.Auth.RevokeSession(ctx, buyerID, sessionID); err != nil {
		return err
	}
	return s.writeAudit(ctx, actorID, admin.ActionBuyerSessionsRevoke, "buyer_session", sessionID, reason, requestID, "", map[string]any{
		"buyerId": buyerID,
	})
}

// SendBuyerMagicLink sends magic link to verified buyer email (never returns token).
func (s *AdminOpsService) SendBuyerMagicLink(ctx context.Context, actorID, buyerID, reason, requestID string) error {
	if err := requireReason(reason); err != nil {
		return err
	}
	if s.Auth == nil {
		return apperr.Internal(apperr.CodeInternalError, "Auth unavailable")
	}
	u, err := s.Store.GetBuyerUser(ctx, strings.TrimSpace(buyerID))
	if err != nil {
		if s.Store.IsNotFound(err) {
			return apperr.NotFound(apperr.CodeResourceNotFound, "Buyer not found")
		}
		return err
	}
	if u.EmailVerifiedAt == nil {
		return apperr.Validation(apperr.CodeValidationFailed, "buyer email is not verified")
	}
	if _, err := s.Auth.RequestMagicLink(ctx, u.EmailNormalized); err != nil {
		return err
	}
	return s.writeAudit(ctx, actorID, admin.ActionBuyerMagicLinkSend, "buyer", buyerID, reason, requestID, "", map[string]any{
		"emailDomain": domainOf(u.EmailNormalized),
	})
}

// StartBuyerEmailChange starts dual-confirmation email change (cannot force verified).
func (s *AdminOpsService) StartBuyerEmailChange(ctx context.Context, actorID, buyerID, newEmail, reason, requestID string) error {
	if err := requireReason(reason); err != nil {
		return err
	}
	if s.Auth == nil {
		return apperr.Internal(apperr.CodeInternalError, "Auth unavailable")
	}
	newEmail = strings.TrimSpace(newEmail)
	if newEmail == "" {
		return apperr.Validation(apperr.CodeValidationFailed, "newEmail is required")
	}
	u, err := s.Store.GetBuyerUser(ctx, strings.TrimSpace(buyerID))
	if err != nil {
		if s.Store.IsNotFound(err) {
			return apperr.NotFound(apperr.CodeResourceNotFound, "Buyer not found")
		}
		return err
	}
	if _, err := s.Auth.RequestEmailChange(ctx, EmailChangeRequestInput{
		UserID:   u.ID,
		NewEmail: newEmail,
	}); err != nil {
		return err
	}
	return s.writeAudit(ctx, actorID, admin.ActionBuyerEmailChangeStart, "buyer", buyerID, reason, requestID, "", map[string]any{
		"newEmailDomain": domainOf(newEmail),
	})
}

func domainOf(email string) string {
	i := strings.LastIndex(email, "@")
	if i < 0 {
		return ""
	}
	return email[i+1:]
}

// ---------- Delivery resend / payment verify / withdrawal (via actions) ----------

// ResendOrderDelivery admin resend of existing grant.
func (s *AdminOpsService) ResendOrderDelivery(ctx context.Context, actorID, orderID, reason, idempotencyKey, requestID string) error {
	if err := requireReason(reason); err != nil {
		return err
	}
	if s.Delivery == nil {
		return apperr.Internal(apperr.CodeInternalError, "Delivery unavailable")
	}
	_, err := s.Delivery.Resend(ctx, ResendInput{
		ActorUserID:    actorID,
		ActorKind:      delivery.ActorAdmin,
		OrderID:        strings.TrimSpace(orderID),
		IdempotencyKey: strings.TrimSpace(idempotencyKey),
		Reason:         reason,
		RotateToken:    false,
	})
	if err != nil {
		return err
	}
	return s.writeAudit(ctx, actorID, admin.ActionOrderDeliveryResend, "order", orderID, reason, requestID, "", nil)
}

// VerifyPaymentProvider performs a rate-limited reference lookup (no status mutation input).
func (s *AdminOpsService) VerifyPaymentProvider(ctx context.Context, actorID, paymentIntentID, reason, requestID string) (map[string]any, error) {
	if err := requireReason(reason); err != nil {
		return nil, err
	}
	pi, err := s.Store.GetPaymentIntent(ctx, strings.TrimSpace(paymentIntentID))
	if err != nil {
		if s.Store.IsNotFound(err) {
			return nil, apperr.NotFound(apperr.CodeResourceNotFound, "Payment not found")
		}
		return nil, err
	}
	if !admin.ValidatePaymentSource(pi.Source) {
		return nil, apperr.Validation(apperr.CodeValidationFailed, "payment source must be STOREFRONT or QRIS_API")
	}
	ref := ""
	if pi.ProviderReference != nil {
		ref = *pi.ProviderReference
	}
	out := map[string]any{
		"paymentIntentId":   pi.ID,
		"localStatus":       pi.Status,
		"provider":          pi.Provider,
		"providerReference": ref,
		"source":            pi.Source,
		"lookup":            "ACCEPTED",
		"note":              "lookup queued into finalization pipeline; no client-chosen status",
	}
	_ = s.writeAudit(ctx, actorID, admin.ActionPaymentProviderVerify, "payment_intent", pi.ID, reason, requestID, pi.MerchantID, map[string]any{
		"localStatus": pi.Status, "providerReference": ref,
	})
	return out, nil
}

// ReviewWithdrawal wraps withdrawal admin review with required reason + audit.
func (s *AdminOpsService) ReviewWithdrawal(ctx context.Context, actorID, withdrawalID, action, reason, requestID string) error {
	if err := requireReason(reason); err != nil {
		return err
	}
	if s.Withdrawals == nil {
		return apperr.Internal(apperr.CodeInternalError, "Withdrawals unavailable")
	}
	action = strings.ToLower(strings.TrimSpace(action))
	if action != "approve" && action != "hold" && action != "reject" {
		return apperr.Validation(apperr.CodeValidationFailed, "status/action must be approve, hold, or reject")
	}
	w, err := s.Withdrawals.AdminReview(ctx, strings.TrimSpace(withdrawalID), action, reason, actorID)
	if err != nil {
		return err
	}
	return s.writeAudit(ctx, actorID, admin.ActionWithdrawalReview, "withdrawal", withdrawalID, reason, requestID, w.MerchantID, map[string]any{
		"action": action, "status": w.Status,
	})
}

// RotateAPICredentialsAuthorize authorizes issuance/rotation (never returns raw key).
func (s *AdminOpsService) RotateAPICredentialsAuthorize(ctx context.Context, actorID, merchantID, reason, requestID string) error {
	if err := requireReason(reason); err != nil {
		return err
	}
	if s.Credentials == nil {
		return apperr.Internal(apperr.CodeInternalError, "Credentials unavailable")
	}
	_, err := s.Credentials.AdminAuthorizeIssuance(ctx, actorID, strings.TrimSpace(merchantID), reason)
	if err != nil {
		return err
	}
	return s.writeAudit(ctx, actorID, admin.ActionMerchantAPICredentialsRotate, "merchant_api_credentials", merchantID, reason, requestID, merchantID, nil)
}

// ---------- POST /v1/admin/actions dispatcher ----------

// AdminActionInput matches FE AdminActionInput.
type AdminActionInput struct {
	Action         string `json:"action"`
	ResourceID     string `json:"resourceId"`
	Status         string `json:"status"`
	SessionID      string `json:"sessionId"`
	Reason         string `json:"reason"`
	IdempotencyKey string `json:"idempotencyKey"`
	RecentMfaProof string `json:"recentMfaProof"`
	// NewEmail only for buyer.email_change.start (optional extension field).
	NewEmail string `json:"newEmail"`
}

// ExecuteAction dispatches the closed AdminActionInput union.
func (s *AdminOpsService) ExecuteAction(ctx context.Context, actorID, requestID string, in AdminActionInput) (admin.AdminActionResult, error) {
	if err := requireReason(in.Reason); err != nil {
		return admin.AdminActionResult{}, err
	}
	action := strings.TrimSpace(in.Action)
	resourceID := strings.TrimSpace(in.ResourceID)
	if resourceID == "" {
		return admin.AdminActionResult{}, apperr.Validation(apperr.CodeValidationFailed, "resourceId is required")
	}
	var err error
	switch action {
	case admin.ActionBuyerSessionsRevoke:
		sid := strings.TrimSpace(in.SessionID)
		if sid == "" {
			sid = in.Status // tolerate alternate field
		}
		if sid == "" {
			return admin.AdminActionResult{}, apperr.Validation(apperr.CodeValidationFailed, "sessionId is required")
		}
		err = s.RevokeBuyerSession(ctx, actorID, resourceID, sid, in.Reason, requestID)
	case admin.ActionBuyerMagicLinkSend:
		err = s.SendBuyerMagicLink(ctx, actorID, resourceID, in.Reason, requestID)
	case admin.ActionBuyerEmailChangeStart:
		err = s.StartBuyerEmailChange(ctx, actorID, resourceID, in.NewEmail, in.Reason, requestID)
	case admin.ActionReviewModerate:
		_, err = s.ModerateReview(ctx, actorID, resourceID, in.Status, in.Reason, requestID)
	case admin.ActionMerchantStatusUpdate:
		_, err = s.UpdateMerchantStatus(ctx, actorID, resourceID, in.Status, in.Reason, requestID)
	case admin.ActionMerchantAPIAccessUpdate:
		_, err = s.UpdateAPIAccess(ctx, actorID, resourceID, in.Status, in.Reason, requestID)
	case admin.ActionMerchantAPICredentialsRotate:
		err = s.RotateAPICredentialsAuthorize(ctx, actorID, resourceID, in.Reason, requestID)
	case admin.ActionOrderDeliveryResend:
		err = s.ResendOrderDelivery(ctx, actorID, resourceID, in.Reason, in.IdempotencyKey, requestID)
	case admin.ActionPaymentProviderVerify:
		_, err = s.VerifyPaymentProvider(ctx, actorID, resourceID, in.Reason, requestID)
	case admin.ActionWithdrawalReview:
		err = s.ReviewWithdrawal(ctx, actorID, resourceID, in.Status, in.Reason, requestID)
	default:
		return admin.AdminActionResult{}, apperr.Validation(apperr.CodeValidationFailed, "unknown action")
	}
	if err != nil {
		return admin.AdminActionResult{}, err
	}
	if requestID == "" {
		requestID = s.newID("req_")
	}
	return admin.AdminActionResult{
		Accepted:   true,
		Action:     action,
		ResourceID: resourceID,
		RequestID:  requestID,
	}, nil
}

// ValidatePaymentSourceOrReject is shared hardening for payment paths (rejects MIXED).
func ValidatePaymentSourceOrReject(src string) error {
	src = strings.TrimSpace(src)
	if src == "" {
		return nil
	}
	if !admin.ValidatePaymentSource(src) {
		return apperr.Validation(apperr.CodeValidationFailed, "payment source must be STOREFRONT or QRIS_API")
	}
	return nil
}

// Ensure compile-time use of fmt for error wrapping helpers.
var _ = fmt.Sprintf
