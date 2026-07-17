package application

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/admin"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/auth"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/authz"
	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
	"github.com/dasepmoch/fersaku-new/backend/internal/ports"
)

// ImpersonationService implements BE-520 admin impersonation.
type ImpersonationService struct {
	Store ImpersonationStore
	Auth  *AuthService
	IDs   ports.IDGenerator
	Clock ports.Clock
	Log   ports.Logger
}

func (s *ImpersonationService) now() time.Time {
	if s.Clock != nil {
		return s.Clock.Now().UTC()
	}
	return time.Now().UTC()
}

func (s *ImpersonationService) newID(prefix string) string {
	id := s.IDs.New()
	if prefix != "" && !strings.HasPrefix(id, prefix) {
		return prefix + id
	}
	return id
}

// StartImpersonationInput is the user-target start contract.
type StartImpersonationInput struct {
	ActorAdminID      string
	ActorSessionID    string
	TargetUserID      string
	TargetMerchantID  string // optional context from merchant resolver
	Scope             string
	Reason            string
	Ticket            string
	TTLMinutes        int
	MFACode           string
	IdempotencyKey    string
	RequestID         string
	IP                string
	UserAgent         string
	// ActorPermissions used to check impersonation.start / support_write.
	ActorPermissions []string
}

// StartImpersonationResult is returned to the handler (cookie + banner DTO).
type StartImpersonationResult struct {
	Session       admin.ImpersonationSession `json:"session"`
	Banner        admin.ImpersonationBanner  `json:"banner"`
	RawToken      string                     `json:"-"`
	CSRFToken     string                     `json:"csrfToken"`
	DerivedExpiry time.Time                  `json:"-"`
	TargetSurface string                     `json:"targetSurface"`
}

// StartImpersonation mints a derived session for the target user.
func (s *ImpersonationService) StartImpersonation(ctx context.Context, in StartImpersonationInput) (StartImpersonationResult, error) {
	// Validate policy inputs before infrastructure dependencies.
	if !hasPerm(in.ActorPermissions, authz.PermImpersonationStart) {
		return StartImpersonationResult{}, apperr.Forbidden(apperr.CodeForbidden, "Missing impersonation.start")
	}
	if err := requireReasonMin(in.Reason, 12); err != nil {
		return StartImpersonationResult{}, err
	}
	ticket := strings.TrimSpace(in.Ticket)
	if ticket == "" {
		return StartImpersonationResult{}, apperr.Validation(apperr.CodeValidationFailed, "ticket is required")
	}
	if !admin.ValidImpersonationTTL(in.TTLMinutes) {
		return StartImpersonationResult{}, apperr.Validation(apperr.CodeValidationFailed, "ttlMinutes must be 15, 30, or 60")
	}
	scope := admin.NormalizeImpersonationScope(in.Scope)
	if scope == "" {
		scope = admin.ImpersonationScopeReadOnly
	}
	if admin.IsPrivilegedLikeScope(scope) || !admin.ValidImpersonationScope(scope) {
		return StartImpersonationResult{}, apperr.Validation(apperr.CodeValidationFailed, "scope must be READ_ONLY or SUPPORT_WRITE")
	}
	if scope == admin.ImpersonationScopeSupportWrite && !hasPerm(in.ActorPermissions, authz.PermImpersonationSupportWrite) {
		return StartImpersonationResult{}, apperr.Forbidden(apperr.CodeForbidden, "Missing impersonation.support_write")
	}
	targetID := strings.TrimSpace(in.TargetUserID)
	if targetID == "" {
		return StartImpersonationResult{}, apperr.Validation(apperr.CodeValidationFailed, "userId is required")
	}
	if targetID == in.ActorAdminID {
		return StartImpersonationResult{}, apperr.Validation(apperr.CodeValidationFailed, "cannot impersonate self")
	}
	if strings.TrimSpace(in.ActorSessionID) == "" {
		return StartImpersonationResult{}, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required")
	}
	if s.Auth == nil || s.Store == nil {
		return StartImpersonationResult{}, apperr.Internal(apperr.CodeInternalError, "Impersonation unavailable")
	}

	// Nested impersonation: actor must not already be on a derived session.
	if _, err := s.Store.GetByDerivedSessionID(ctx, in.ActorSessionID); err == nil {
		return StartImpersonationResult{}, apperr.Forbidden(apperr.CodeForbidden, "Nested impersonation is not allowed")
	} else if !s.Store.IsNotFound(err) {
		return StartImpersonationResult{}, apperr.Internal(apperr.CodeInternalError, "Impersonation start failed")
	}

	// Fresh MFA required.
	if err := s.Auth.requireFreshMFA(ctx, in.ActorAdminID, in.ActorSessionID, strings.TrimSpace(in.MFACode)); err != nil {
		return StartImpersonationResult{}, err
	}

	target, err := s.Store.GetUser(ctx, targetID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return StartImpersonationResult{}, apperr.NotFound(apperr.CodeResourceNotFound, "User not found")
		}
		return StartImpersonationResult{}, apperr.Internal(apperr.CodeInternalError, "Impersonation start failed")
	}
	if target.Status != auth.UserActive {
		return StartImpersonationResult{}, apperr.Validation(apperr.CodeValidationFailed, "target user is not active")
	}
	isAdmin, err := s.Store.IsAdminUser(ctx, targetID)
	if err != nil {
		return StartImpersonationResult{}, apperr.Internal(apperr.CodeInternalError, "Impersonation start failed")
	}
	if isAdmin {
		return StartImpersonationResult{}, apperr.Forbidden(apperr.CodeForbidden, "Admin-to-admin impersonation is not allowed")
	}

	// Prefer SELLER surface for merchant owners; otherwise BUYER.
	surface := auth.SurfaceSeller
	if mid := strings.TrimSpace(in.TargetMerchantID); mid != "" {
		owner, oerr := s.Store.GetMerchantOwner(ctx, mid)
		if oerr != nil || owner != targetID {
			return StartImpersonationResult{}, apperr.Validation(apperr.CodeValidationFailed, "merchant owner mismatch")
		}
	}

	now := s.now()
	expiresAt := now.Add(time.Duration(in.TTLMinutes) * time.Minute)

	// End any prior active impersonation by this actor (single active derived session).
	if prev, err := s.Store.GetActiveByActor(ctx, in.ActorAdminID, now); err == nil {
		_ = s.endInternal(ctx, prev, in.ActorAdminID, "superseded", now)
	}

	// Mint derived auth session bound to target user (does not revoke target's real sessions).
	issue, err := s.Auth.createSessionWithExpiry(ctx, target, surface, in.IP, in.UserAgent, false, expiresAt)
	if err != nil {
		return StartImpersonationResult{}, apperr.Internal(apperr.CodeInternalError, "Failed to mint derived session")
	}

	var merchantPtr *string
	if mid := strings.TrimSpace(in.TargetMerchantID); mid != "" {
		merchantPtr = &mid
	}
	impID := s.newID("imp_")
	row := admin.ImpersonationSession{
		ID:                impID,
		ActorAdminID:      in.ActorAdminID,
		TargetUserID:      targetID,
		TargetMerchantID:  merchantPtr,
		Scope:             scope,
		Status:            admin.ImpersonationStatusActive,
		Reason:            strings.TrimSpace(in.Reason),
		Ticket:            ticket,
		MFAAt:             now,
		OriginalSessionID: in.ActorSessionID,
		DerivedSessionID:  issue.SessionID,
		SessionTokenHash:  s.Auth.hashTok(issue.RawToken),
		ExpiresAt:         expiresAt,
		CreatedAt:         now,
		UpdatedAt:         now,
	}

	err = s.Store.WithTx(ctx, func(txCtx context.Context) error {
		if err := s.Store.InsertSession(txCtx, row); err != nil {
			return err
		}
		return s.writeAudit(txCtx, in.ActorAdminID, admin.ActionImpersonationStart, "impersonation_session", impID, row.Reason, in.RequestID, ptrStr(merchantPtr), map[string]any{
			"targetUserId":      targetID,
			"actorAdminId":      in.ActorAdminID,
			"scope":             scope,
			"ttlMinutes":        in.TTLMinutes,
			"ticket":            ticket,
			"derivedSessionId":  issue.SessionID,
			"originalSessionId": in.ActorSessionID,
			"targetMerchantId":  midOrEmpty(merchantPtr),
			"expiresAt":         expiresAt.UTC().Format(time.RFC3339Nano),
		})
	})
	if err != nil {
		// Best-effort revoke orphaned derived session if insert failed.
		_, _ = s.Auth.Store.RevokeSession(ctx, issue.SessionID, targetID, now)
		return StartImpersonationResult{}, apperr.Internal(apperr.CodeInternalError, "Impersonation start failed")
	}

	return StartImpersonationResult{
		Session: row,
		Banner: admin.ImpersonationBanner{
			SessionID:    impID,
			ActorAdminID: in.ActorAdminID,
			TargetUserID: targetID,
			TargetName:   target.Name,
			TargetEmail:  target.EmailDisplay,
			Scope:        scope,
			Reason:       row.Reason,
			Ticket:       ticket,
			StartedAt:    now,
			ExpiresAt:    expiresAt,
			TTLMinutes:   in.TTLMinutes,
		},
		RawToken:      issue.RawToken,
		CSRFToken:     issue.CSRFToken,
		DerivedExpiry: expiresAt,
		TargetSurface: string(surface),
	}, nil
}

// StartForMerchant resolves exactly one non-admin owner then starts user impersonation.
func (s *ImpersonationService) StartForMerchant(ctx context.Context, in StartImpersonationInput, merchantID string) (StartImpersonationResult, error) {
	merchantID = strings.TrimSpace(merchantID)
	if merchantID == "" {
		return StartImpersonationResult{}, apperr.Validation(apperr.CodeValidationFailed, "merchantId is required")
	}
	owner, err := s.Store.GetMerchantOwner(ctx, merchantID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return StartImpersonationResult{}, apperr.NotFound(apperr.CodeResourceNotFound, "Merchant not found")
		}
		return StartImpersonationResult{}, apperr.Internal(apperr.CodeInternalError, "Merchant owner resolve failed")
	}
	owner = strings.TrimSpace(owner)
	if owner == "" {
		return StartImpersonationResult{}, apperr.Validation(apperr.CodeValidationFailed, "merchant has no owner")
	}
	// Ambiguity: owner must resolve to one non-admin user (single owner column = deterministic).
	isAdmin, err := s.Store.IsAdminUser(ctx, owner)
	if err != nil {
		return StartImpersonationResult{}, apperr.Internal(apperr.CodeInternalError, "Merchant owner resolve failed")
	}
	if isAdmin {
		return StartImpersonationResult{}, apperr.Forbidden(apperr.CodeForbidden, "Cannot impersonate admin merchant owner")
	}
	in.TargetUserID = owner
	in.TargetMerchantID = merchantID
	return s.StartImpersonation(ctx, in)
}

// TerminateInput ends an active impersonation session.
type TerminateInput struct {
	ActorAdminID     string
	ActorSessionID   string
	ImpersonationID  string
	Reason           string
	RequestID        string
	// If true, only the actor who started may terminate (or the derived session holder).
	RequireActor bool
}

// Terminate ends the impersonation and revokes the derived auth session immediately.
func (s *ImpersonationService) Terminate(ctx context.Context, in TerminateInput) (admin.ImpersonationSession, error) {
	if s.Store == nil || s.Auth == nil {
		return admin.ImpersonationSession{}, apperr.Internal(apperr.CodeInternalError, "Impersonation unavailable")
	}
	id := strings.TrimSpace(in.ImpersonationID)
	if id == "" {
		return admin.ImpersonationSession{}, apperr.Validation(apperr.CodeValidationFailed, "sessionId is required")
	}
	row, err := s.Store.GetByID(ctx, id)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return admin.ImpersonationSession{}, apperr.NotFound(apperr.CodeResourceNotFound, "Impersonation session not found")
		}
		return admin.ImpersonationSession{}, apperr.Internal(apperr.CodeInternalError, "Terminate failed")
	}
	now := s.now()
	if !row.Active(now) {
		// Already ended — idempotent success view.
		return row, nil
	}
	if in.RequireActor && row.ActorAdminID != in.ActorAdminID && row.DerivedSessionID != in.ActorSessionID {
		return admin.ImpersonationSession{}, apperr.Forbidden(apperr.CodeForbidden, "Not allowed to terminate this session")
	}
	reason := strings.TrimSpace(in.Reason)
	if reason == "" {
		reason = "terminated"
	}
	if err := s.endInternal(ctx, row, in.ActorAdminID, reason, now); err != nil {
		return admin.ImpersonationSession{}, err
	}
	_ = s.writeAudit(ctx, in.ActorAdminID, admin.ActionImpersonationTerminate, "impersonation_session", row.ID, reason, in.RequestID, midOrEmpty(row.TargetMerchantID), map[string]any{
		"targetUserId":      row.TargetUserID,
		"actorAdminId":      row.ActorAdminID,
		"scope":             row.Scope,
		"derivedSessionId":  row.DerivedSessionID,
		"originalSessionId": row.OriginalSessionID,
		"status":            admin.ImpersonationStatusTerminated,
	})
	row.Status = admin.ImpersonationStatusTerminated
	row.EndedAt = &now
	eb := in.ActorAdminID
	row.EndedBy = &eb
	row.EndReason = &reason
	return row, nil
}

// ResolveDerived loads active impersonation for a derived auth session id.
// Expired sessions are marked expired and the derived auth session is revoked.
func (s *ImpersonationService) ResolveDerived(ctx context.Context, derivedSessionID string) (admin.ImpersonationSession, error) {
	row, err := s.Store.GetByDerivedSessionID(ctx, derivedSessionID)
	if err != nil {
		return admin.ImpersonationSession{}, err
	}
	now := s.now()
	if row.Status != admin.ImpersonationStatusActive || row.EndedAt != nil {
		return admin.ImpersonationSession{}, apperr.Unauthorized(apperr.CodeAuthRequired, "Impersonation session ended")
	}
	if !row.ExpiresAt.After(now) {
		_, _ = s.Store.MarkExpired(ctx, row.ID, now)
		_, _ = s.Auth.Store.RevokeSession(ctx, row.DerivedSessionID, row.TargetUserID, now)
		return admin.ImpersonationSession{}, apperr.Unauthorized(apperr.CodeAuthRequired, "Impersonation session expired")
	}
	return row, nil
}

// AssertStoreOwnedByTarget ensures SUPPORT_WRITE store presentation only for owned stores.
func (s *ImpersonationService) AssertStoreOwnedByTarget(ctx context.Context, storeID, targetUserID string) error {
	owner, err := s.Store.GetStoreOwnerUserID(ctx, storeID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return apperr.NotFound(apperr.CodeResourceNotFound, "Store not found")
		}
		return apperr.Internal(apperr.CodeInternalError, "Store ownership check failed")
	}
	if owner != targetUserID {
		return apperr.Forbidden(apperr.CodeForbidden, "Store not owned by target user")
	}
	return nil
}

func (s *ImpersonationService) endInternal(ctx context.Context, row admin.ImpersonationSession, endedBy, reason string, now time.Time) error {
	var endedByPtr *string
	if endedBy != "" {
		endedByPtr = &endedBy
	}
	n, err := s.Store.EndSession(ctx, row.ID, admin.ImpersonationStatusTerminated, now, endedByPtr, reason)
	if err != nil {
		return apperr.Internal(apperr.CodeInternalError, "Terminate failed")
	}
	if n == 0 {
		// race: already ended
		return nil
	}
	_, _ = s.Auth.Store.RevokeSession(ctx, row.DerivedSessionID, row.TargetUserID, now)
	return nil
}

func (s *ImpersonationService) writeAudit(ctx context.Context, actorID, action, resourceType, resourceID, reason, requestID, merchantID string, meta map[string]any) error {
	now := s.now()
	payload, _ := json.Marshal(map[string]any{
		"action":       action,
		"resourceType": resourceType,
		"resourceId":   resourceID,
		"reason":       reason,
		"actorUserId":  actorID,
		"merchantId":   merchantID,
		"meta":         meta,
		"at":           now.UTC().Format(time.RFC3339Nano),
	})
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
	id := s.newID("aud_")
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
		MetadataJSON:     adminOpsMarshalMeta(meta),
	})
}

func hasPerm(perms []string, code string) bool {
	for _, p := range perms {
		if p == code {
			return true
		}
	}
	return false
}

func requireReasonMin(reason string, min int) error {
	r := strings.TrimSpace(reason)
	if len(r) < min {
		return apperr.Validation(apperr.CodeValidationFailed, fmt.Sprintf("reason must be at least %d characters", min))
	}
	if len(r) > 500 {
		return apperr.Validation(apperr.CodeValidationFailed, "reason must be at most 500 characters")
	}
	return nil
}

func ptrStr(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

func midOrEmpty(p *string) string {
	return ptrStr(p)
}
