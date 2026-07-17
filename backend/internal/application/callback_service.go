package application

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/auth"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/delivery"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/invoices"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/ledger"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/orders"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/payments"
	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
	"github.com/dasepmoch/fersaku-new/backend/internal/platform/metrics"
	"github.com/dasepmoch/fersaku-new/backend/internal/ports"
)

// CallbackService implements inbound Xendit callback accept + finalization (BE-330).
type CallbackService struct {
	Store     CallbackStore
	Coupons   *CouponService
	Delivery  *DeliveryService
	Inventory *InventoryService
	// DeliveryStore for grant/invoice inserts when DeliveryService path is heavy.
	DeliveryStore DeliveryStore
	// Ledger posts full COA journals on paid (BE-340); optional for dual-write.
	Ledger *LedgerService
	// Analytics marks conversion once on verified PAID (BE-360); optional.
	Analytics *AnalyticsService
	// Webhooks enqueues outbound seller deliveries on paid (BE-420); optional.
	Webhooks *WebhookService
	IDs       ports.IDGenerator
	Clock     ports.Clock
	Log       ports.Logger
	// WebhookToken from XENDIT_WEBHOOK_TOKEN (constant-time compare).
	WebhookToken string
	// AccountScope from config (never from body).
	AccountScope string
	// DefaultPaymentMode when endpoint is not mode-split (local/test SANDBOX).
	DefaultPaymentMode string
	// TokenSecret for access token hashing on fulfillment.
	TokenSecret string
}

func (s *CallbackService) now() time.Time {
	if s.Clock != nil {
		return s.Clock.Now().UTC()
	}
	return time.Now().UTC()
}

func (s *CallbackService) accountScope() string {
	if s.AccountScope != "" {
		return s.AccountScope
	}
	return payments.AccountScopePrimary
}

func (s *CallbackService) mode() string {
	if s.DefaultPaymentMode == payments.PaymentModeLive {
		return payments.PaymentModeLive
	}
	return payments.PaymentModeSandbox
}

// IngressRequest is the raw HTTP ingress (token already extracted as header).
type IngressRequest struct {
	Body           []byte
	TokenHeader    string
	ContentType    string
	ClientIP       string
	RequestID      string
	// PaymentModeOverride when using mode-specific paths; empty → DefaultPaymentMode.
	PaymentModeOverride string
}

// IngressResult is the HTTP outcome after durable accept or rejection.
type IngressResult struct {
	HTTPStatus int
	Accepted   bool
	Duplicate  bool
	CallbackID string
	// RejectionReason set when not accepted into business queue.
	RejectionReason string
}

// HandleIngress verifies token first, then accepts or rejects. Never mutates payment on reject.
func (s *CallbackService) HandleIngress(ctx context.Context, req IngressRequest) (IngressResult, error) {
	now := s.now()
	mode := s.mode()
	if req.PaymentModeOverride == payments.PaymentModeLive || req.PaymentModeOverride == payments.PaymentModeSandbox {
		mode = req.PaymentModeOverride
	}
	scope := s.accountScope()

	// 1) Body size
	if len(req.Body) > payments.MaxCallbackBodyBytes {
		_ = s.reject(ctx, payments.RejectOversizeBody, 413, req, scope, mode, now)
		metrics.Global.IncCallback("rejected")
		return IngressResult{HTTPStatus: 413, RejectionReason: payments.RejectOversizeBody}, nil
	}
	if len(req.Body) == 0 {
		_ = s.reject(ctx, payments.RejectEmptyBody, 400, req, scope, mode, now)
		metrics.Global.IncCallback("rejected")
		return IngressResult{HTTPStatus: 400, RejectionReason: payments.RejectEmptyBody}, nil
	}

	// 2) Token first (constant-time). Missing/invalid → rejection only.
	if strings.TrimSpace(req.TokenHeader) == "" {
		_ = s.reject(ctx, payments.RejectMissingToken, 401, req, scope, mode, now)
		metrics.Global.IncCallback("rejected")
		return IngressResult{HTTPStatus: 401, RejectionReason: payments.RejectMissingToken}, nil
	}
	if !constantTimeTokenEqual(req.TokenHeader, s.WebhookToken) {
		_ = s.reject(ctx, payments.RejectInvalidToken, 401, req, scope, mode, now)
		metrics.Global.IncCallback("rejected")
		return IngressResult{HTTPStatus: 401, RejectionReason: payments.RejectInvalidToken}, nil
	}

	// 3) Content-Type soft check (JSON expected); still parse if empty for Xendit quirks.
	ct := strings.ToLower(strings.TrimSpace(req.ContentType))
	if ct != "" && !strings.Contains(ct, "application/json") && !strings.Contains(ct, "text/plain") {
		_ = s.reject(ctx, payments.RejectBadContentType, 415, req, scope, mode, now)
		metrics.Global.IncCallback("rejected")
		return IngressResult{HTTPStatus: 415, RejectionReason: payments.RejectBadContentType}, nil
	}

	// 4) Parse envelope
	norm, err := payments.ParseXenditEnvelope(req.Body)
	if err != nil {
		_ = s.reject(ctx, payments.RejectMalformedJSON, 400, req, scope, mode, now)
		metrics.Global.IncCallback("rejected")
		return IngressResult{HTTPStatus: 400, RejectionReason: payments.RejectMalformedJSON}, nil
	}

	digest := payments.DigestBody(req.Body)
	eventID := norm.ProviderEventID
	if eventID == "" {
		eventID = payments.FingerprintEventID(scope, mode, norm.ProviderReference, norm.RawEventType, digest)
	}

	callbackID := s.IDs.New()
	if !strings.HasPrefix(callbackID, "pcb_") {
		callbackID = "pcb_" + callbackID
	}

	nt := norm.NormalizedType
	rawType := norm.RawEventType
	ref := norm.ProviderReference
	ext := norm.ExternalID
	cur := norm.Currency
	amt := norm.AmountIDR
	var amtPtr *int64
	if amt > 0 {
		amtPtr = &amt
	}
	var refPtr, extPtr, curPtr *string
	if ref != "" {
		refPtr = &ref
	}
	if ext != "" {
		extPtr = &ext
	}
	if cur != "" {
		curPtr = &cur
	}

	ev := payments.ProviderEvent{
		CallbackID:        callbackID,
		Provider:          payments.ProviderXendit,
		AccountScope:      scope,
		PaymentMode:       mode,
		ProviderEventID:   eventID,
		ReceivedAt:        now,
		NormalizedType:    &nt,
		ProcessingState:   payments.CallbackAccepted,
		PayloadDigest:     &digest,
		EncryptedPayload:  req.Body, // durable spool; encryption-at-rest is infrastructure (R2 archive async)
		RawEventType:      &rawType,
		ProviderReference: refPtr,
		ExternalID:        extPtr,
		AmountIDR:         amtPtr,
		Currency:          curPtr,
		CreatedAt:         now,
		UpdatedAt:         now,
	}

	inserted := false
	var stored payments.ProviderEvent
	err = s.Store.WithTx(ctx, func(ctx context.Context) error {
		row, ok, ierr := s.Store.InsertProviderEvent(ctx, ev)
		if ierr != nil {
			return ierr
		}
		inserted = ok
		if ok {
			stored = row
			// Outbox for normalize job (canonical four-part key as dedupe).
			payload, _ := json.Marshal(map[string]any{
				"callbackId":      callbackID,
				"provider":        payments.ProviderXendit,
				"accountScope":    scope,
				"paymentMode":     mode,
				"providerEventId": eventID,
			})
			dedupe := "provider_callback.process:" + payments.CanonicalEventKey(payments.ProviderXendit, scope, mode, eventID)
			modeCopy := mode
			return s.Store.InsertOutbox(ctx, s.IDs.New(), payments.TopicProviderCallbackProcess, payload, &dedupe, &modeCopy, now)
		}
		// Duplicate: load existing (retry briefly for concurrent first-writer commit).
		var existing payments.ProviderEvent
		var gerr error
		for attempt := 0; attempt < 8; attempt++ {
			existing, gerr = s.Store.GetProviderEventByCanonical(ctx, payments.ProviderXendit, scope, mode, eventID)
			if gerr == nil {
				stored = existing
				return nil
			}
			if !s.Store.IsNotFound(gerr) {
				return gerr
			}
			// Fall through: rare race; small backoff outside tx is better — re-query after commit.
			break
		}
		return gerr
	})
	if err != nil {
		// Race: conflict seen but row not visible yet — re-read outside TX.
		if s.Store.IsNotFound(err) {
			for attempt := 0; attempt < 20; attempt++ {
				existing, gerr := s.Store.GetProviderEventByCanonical(ctx, payments.ProviderXendit, scope, mode, eventID)
				if gerr == nil {
					stored = existing
					err = nil
					break
				}
				time.Sleep(5 * time.Millisecond)
			}
		}
		if err != nil && stored.CallbackID == "" {
			if s.Log != nil {
				s.Log.Error("callback accept failed", "err", err.Error(), "request_id", req.RequestID)
			}
			return IngressResult{HTTPStatus: 500}, apperr.Internal(apperr.CodeInternalError, "Callback accept failed")
		}
	}

	// Process synchronously for durability of paid effects (worker also processes outbox).
	// Exactly-once: concurrent ProcessEvent serializes on event row lock.
	if stored.CallbackID != "" {
		if procErr := s.ProcessEvent(ctx, stored.CallbackID); procErr != nil {
			if s.Log != nil {
				s.Log.Warn("callback process deferred", "callback_id", stored.CallbackID, "err", procErr.Error())
			}
			// Still 200 — durable accept; worker retries.
		}
	}

	if !inserted {
		metrics.Global.IncCallback("duplicate")
	} else {
		metrics.Global.IncCallback("accepted")
	}
	return IngressResult{
		HTTPStatus: 200,
		Accepted:   true,
		Duplicate:  !inserted,
		CallbackID: stored.CallbackID,
	}, nil
}

func (s *CallbackService) reject(ctx context.Context, reason string, status int, req IngressRequest, scope, mode string, now time.Time) error {
	id := s.IDs.New()
	if !strings.HasPrefix(id, "rej_") {
		id = "rej_" + id
	}
	digest := payments.DigestBody(req.Body)
	ct := req.ContentType
	ip := req.ClientIP
	rid := req.RequestID
	sc := scope
	md := mode
	r := payments.CallbackRejection{
		ID:           id,
		Provider:     payments.ProviderXendit,
		AccountScope: &sc,
		PaymentMode:  &md,
		Reason:       reason,
		HTTPStatus:   int32(status),
		ContentType:  &ct,
		BodyBytes:    int32(len(req.Body)),
		BodyDigest:   &digest,
		ClientIP:     &ip,
		RequestID:    &rid,
		ReceivedAt:   now,
		CreatedAt:    now,
	}
	if err := s.Store.InsertRejection(ctx, r); err != nil {
		if s.Log != nil {
			s.Log.Warn("callback rejection insert failed", "reason", reason, "err", err.Error())
		}
		return err
	}
	if s.Log != nil {
		s.Log.Info("provider callback rejected",
			"reason", reason,
			"http_status", status,
			"body_bytes", len(req.Body),
			"body_digest", digest,
			"request_id", req.RequestID,
			// never log token or raw body
		)
	}
	return nil
}

// ProcessEvent normalizes and applies payment transitions for a durable accepted event.
func (s *CallbackService) ProcessEvent(ctx context.Context, callbackID string) (err error) {
	if callbackID == "" {
		return apperr.Validation(apperr.CodeValidationFailed, "callbackId required")
	}
	now := s.now()
	defer func() {
		if rec := recover(); rec != nil {
			err = fmt.Errorf("callback process panic: %v", rec)
			if s.Log != nil {
				s.Log.Error("callback process panic", "callback_id", callbackID, "panic", fmt.Sprint(rec))
			}
		}
	}()

	var paidIntent *payments.Intent
	txErr := s.Store.WithTx(ctx, func(ctx context.Context) error {
		ev, err := s.Store.LockProviderEvent(ctx, callbackID)
		if err != nil {
			if s.Store.IsNotFound(err) {
				return payments.ErrNotFound
			}
			return err
		}
		if ev.ProcessingState == payments.CallbackProcessed {
			// Still ensure side effects if settlement exists but grant missing.
			if ev.PaymentIntentID != nil {
				if pi, gerr := s.Store.GetPaymentIntentByID(ctx, *ev.PaymentIntentID); gerr == nil && pi.IsPaid() {
					paidIntent = &pi
				}
			}
			return nil
		}
		// Skip if another worker holds a fresh lease (best-effort; empty lease proceeds).
		if ev.ProcessingState == payments.CallbackProcessing && ev.LeaseUntil != nil && ev.LeaseUntil.After(now) {
			return nil
		}

		// Mark processing
		leaseOwner := "callback-process"
		leaseUntil := now.Add(2 * time.Minute)
		_, _ = s.Store.UpdateProviderEventState(ctx, callbackID, payments.CallbackProcessing, CallbackEventPatch{
			LeaseOwner: &leaseOwner,
			LeaseUntil: &leaseUntil,
		}, now)

		// Re-parse from stored payload
		var norm payments.NormalizedCallback
		if len(ev.EncryptedPayload) > 0 {
			norm, err = payments.ParseXenditEnvelope(ev.EncryptedPayload)
			if err != nil {
				qr := "parse_failed"
				_, _ = s.Store.UpdateProviderEventState(ctx, callbackID, payments.CallbackQuarantined, CallbackEventPatch{
					QuarantineReason: &qr,
					MismatchCode:     strPtr(payments.MismatchReference),
				}, now)
				return nil
			}
		} else {
			// Fall back to stored columns
			if ev.NormalizedType != nil {
				norm.NormalizedType = *ev.NormalizedType
			}
			if ev.ProviderReference != nil {
				norm.ProviderReference = *ev.ProviderReference
			}
			if ev.ExternalID != nil {
				norm.ExternalID = *ev.ExternalID
			}
			if ev.AmountIDR != nil {
				norm.AmountIDR = *ev.AmountIDR
			}
			if ev.Currency != nil {
				norm.Currency = *ev.Currency
			}
			norm.Status = payments.MapProviderStatus(norm.NormalizedType)
		}

		// Resolve payment by full tuple only.
		pi, resolveErr := s.resolvePayment(ctx, ev, norm)
		if resolveErr != nil {
			code := payments.MismatchNoPayment
			if resolveErr == errAmbiguousPayment {
				code = payments.MismatchAmbiguous
			}
			_, _ = s.Store.UpdateProviderEventState(ctx, callbackID, payments.CallbackQuarantined, CallbackEventPatch{
				MismatchCode:     &code,
				QuarantineReason: strPtr(resolveErr.Error()),
			}, now)
			if s.Log != nil {
				s.Log.Warn("callback quarantine", "callback_id", callbackID, "code", code)
			}
			return nil
		}

		// Validate amount/currency when present on event
		if norm.AmountIDR > 0 && norm.AmountIDR != pi.AmountIDR {
			code := payments.MismatchAmount
			_, _ = s.Store.UpdateProviderEventState(ctx, callbackID, payments.CallbackQuarantined, CallbackEventPatch{
				MismatchCode:     &code,
				PaymentIntentID:  &pi.ID,
				QuarantineReason: strPtr(fmt.Sprintf("amount event=%d intent=%d", norm.AmountIDR, pi.AmountIDR)),
			}, now)
			if s.Log != nil {
				s.Log.Warn("callback amount mismatch", "callback_id", callbackID, "intent_id", pi.ID)
			}
			return nil
		}
		if norm.Currency != "" && !strings.EqualFold(norm.Currency, pi.Currency) {
			code := payments.MismatchCurrency
			_, _ = s.Store.UpdateProviderEventState(ctx, callbackID, payments.CallbackQuarantined, CallbackEventPatch{
				MismatchCode:    &code,
				PaymentIntentID: &pi.ID,
			}, now)
			return nil
		}

		// Apply transition
		if err := s.applyNormalized(ctx, &ev, pi, norm, now); err != nil {
			fc := "apply_failed"
			_, _ = s.Store.UpdateProviderEventState(ctx, callbackID, payments.CallbackFailed, CallbackEventPatch{
				FailureCode:     &fc,
				PaymentIntentID: &pi.ID,
				NextRetryAt:     timePtr(now.Add(30 * time.Second)),
			}, now)
			return err
		}

		// Reload intent after transition for side effects.
		if pi2, gerr := s.Store.GetPaymentIntentByID(ctx, pi.ID); gerr == nil {
			pi = pi2
		}
		if pi.IsPaid() {
			paidIntent = &pi
		}

		processedAt := now
		_, _ = s.Store.UpdateProviderEventState(ctx, callbackID, payments.CallbackProcessed, CallbackEventPatch{
			ProcessedAt:     &processedAt,
			PaymentIntentID: &pi.ID,
			NormalizedType:  &norm.NormalizedType,
			ClearLease:      true,
		}, now)
		return nil
	})
	if txErr != nil {
		return txErr
	}
	// After commit: ledger journal + coupon/stock/delivery (own TXs; must not deadlock with event lock).
	if paidIntent != nil {
		s.postLedgerForPaid(ctx, *paidIntent, now)
		s.sideEffectsPaid(ctx, *paidIntent, now)
	}
	return nil
}

var errAmbiguousPayment = fmt.Errorf("ambiguous payment match")

func (s *CallbackService) resolvePayment(ctx context.Context, ev payments.ProviderEvent, norm payments.NormalizedCallback) (payments.Intent, error) {
	// Prefer provider_reference full tuple.
	if norm.ProviderReference != "" {
		pi, err := s.Store.GetPaymentIntentByProviderRefForUpdate(ctx, ev.Provider, ev.AccountScope, ev.PaymentMode, norm.ProviderReference)
		if err == nil {
			return pi, nil
		}
		if !s.Store.IsNotFound(err) {
			return payments.Intent{}, err
		}
	}
	if norm.ExternalID != "" {
		pi, err := s.Store.GetPaymentIntentByExternalIDForUpdate(ctx, ev.PaymentMode, norm.ExternalID)
		if err == nil {
			// Cross-scope / cross-mode safety: verify account_scope and provider match.
			if pi.Provider != ev.Provider || pi.AccountScope != ev.AccountScope || pi.PaymentMode != ev.PaymentMode {
				return payments.Intent{}, errAmbiguousPayment
			}
			return pi, nil
		}
		if !s.Store.IsNotFound(err) {
			return payments.Intent{}, err
		}
	}
	return payments.Intent{}, fmt.Errorf("payment not found")
}

func (s *CallbackService) applyNormalized(ctx context.Context, ev *payments.ProviderEvent, pi payments.Intent, norm payments.NormalizedCallback, now time.Time) error {
	switch norm.NormalizedType {
	case payments.NormalizedPaid:
		return s.finalizePaid(ctx, ev, pi, now)
	case payments.NormalizedReversal:
		// Verified-style containment: hold financial state; no refund API.
		if pi.IsPaid() {
			_ = s.Store.SetFinancialState(ctx, pi.ID, payments.FinancialProviderReversalHeld, now)
			alert := payments.AlertReversalHeld
			_, _ = s.Store.UpdateProviderEventState(ctx, ev.CallbackID, payments.CallbackProcessed, CallbackEventPatch{
				AlertCode:       &alert,
				PaymentIntentID: &pi.ID,
				ProcessedAt:     &now,
			}, now)
		}
		return nil
	case payments.NormalizedExpired, payments.NormalizedCancelled, payments.NormalizedFailed:
		if pi.IsPaid() {
			// Never move PAID backward.
			return nil
		}
		to := norm.Status
		if to == "" {
			to = payments.MapProviderStatus(norm.NormalizedType)
		}
		prev := pi.Status
		_, err := s.Store.MarkPaymentTerminal(ctx, pi.ID, to, &prev, now)
		if err != nil {
			if s.Store.IsNotFound(err) {
				return nil // already terminal/paid
			}
			return err
		}
		ordPay, ordSt := mapOrderTerminal(to)
		_ = s.Store.MarkOrderTerminal(ctx, pi.OrderID, ordPay, ordSt, now)
		// Release holds only for unpaid terminal.
		if pi.StockReservationID != nil && s.Inventory != nil {
			_, _ = s.Inventory.ReleaseReservation(ctx, *pi.StockReservationID)
		}
		if pi.CouponReservationID != nil && s.Coupons != nil {
			_, _ = s.Coupons.ReleaseReservation(ctx, *pi.CouponReservationID)
		}
		return nil
	case payments.NormalizedPending, payments.NormalizedUnknown:
		// Persist only; no mutation of paid. Unknown events metric/alert.
		if norm.NormalizedType == payments.NormalizedUnknown {
			alert := payments.AlertUnknownEvent
			_, _ = s.Store.UpdateProviderEventState(ctx, ev.CallbackID, payments.CallbackProcessed, CallbackEventPatch{
				AlertCode:       &alert,
				PaymentIntentID: &pi.ID,
				ProcessedAt:     &now,
			}, now)
		}
		return nil
	default:
		return nil
	}
}

func (s *CallbackService) finalizePaid(ctx context.Context, ev *payments.ProviderEvent, pi payments.Intent, now time.Time) error {
	// Already paid: ensure settlement exists once; no second fulfillment.
	if pi.IsPaid() {
		if n, _ := s.Store.CountSettlementsByIntent(ctx, pi.ID); n > 0 {
			return nil
		}
		// Repair missing settlement (should be rare).
		return s.postSettlementAndFulfill(ctx, ev, pi, false, pi.PrecedingStatus, now)
	}

	preceding := pi.Status
	paidLate := pi.IsTerminalUnpaid()
	if paidLate {
		if s.Log != nil {
			s.Log.Warn("late paid after terminal",
				"intent_id", pi.ID,
				"preceding", preceding,
				"callback_id", ev.CallbackID,
				"alert", payments.AlertLatePaid,
			)
		}
	}

	updated, err := s.Store.MarkPaymentPaid(ctx, pi.ID, paidLate, preceding, now)
	if err != nil {
		// Concurrent paid win
		cur, gerr := s.Store.GetPaymentIntentByIDForUpdate(ctx, pi.ID)
		if gerr == nil && cur.IsPaid() {
			return s.postSettlementAndFulfill(ctx, ev, cur, cur.PaidLate, cur.PrecedingStatus, now)
		}
		return err
	}
	pi = updated
	metrics.Global.IncPaymentPaid()
	_ = s.Store.MarkOrderPaid(ctx, pi.OrderID, now)

	if paidLate {
		a := payments.AlertLatePaid
		_, _ = s.Store.UpdateProviderEventState(ctx, ev.CallbackID, payments.CallbackProcessing, CallbackEventPatch{
			AlertCode: &a,
		}, now)
	}

	return s.postSettlementAndFulfill(ctx, ev, pi, paidLate, &preceding, now)
}

func (s *CallbackService) postSettlementAndFulfill(ctx context.Context, ev *payments.ProviderEvent, pi payments.Intent, paidLate bool, preceding *string, now time.Time) error {
	// Fee from order snapshot (authoritative), not callback body.
	ord, err := s.Store.GetOrderByID(ctx, pi.OrderID)
	if err != nil {
		return err
	}
	gross := ord.GrossIDR
	if gross <= 0 {
		gross = pi.AmountIDR
	}
	fee := ord.FeeIDR
	net := ord.MerchantNetIDR
	if net <= 0 && gross > fee {
		net = gross - fee
	}

	settlementID := s.IDs.New()
	if !strings.HasPrefix(settlementID, "pst_") {
		settlementID = "pst_" + settlementID
	}
	journal := payments.JournalReferencePaid(pi.ID)
	var storeID *string
	if pi.StoreID != "" {
		storeID = &pi.StoreID
	}
	var provEventID *string
	if ev.ProviderEventID != "" {
		provEventID = &ev.ProviderEventID
	}
	sett := payments.Settlement{
		ID:                settlementID,
		PaymentIntentID:   pi.ID,
		OrderID:           pi.OrderID,
		MerchantID:        pi.MerchantID,
		StoreID:           storeID,
		PaymentMode:       pi.PaymentMode,
		Source:            pi.Source,
		Provider:          pi.Provider,
		AccountScope:      pi.AccountScope,
		ProviderReference: pi.ProviderReference,
		ProviderEventID:   provEventID,
		JournalReference:  journal,
		GrossIDR:          gross,
		FeeIDR:            fee,
		MerchantNetIDR:    net,
		Currency:          payments.CurrencyIDR,
		PaidLate:          paidLate,
		PrecedingStatus:   preceding,
		Status:            "POSTED",
		PostedAt:          now,
		CreatedAt:         now,
	}
	_, inserted, err := s.Store.InsertSettlement(ctx, sett)
	if err != nil {
		return err
	}
	// Coupon / stock / delivery / ledger run after settlement is durable (after TX commit).
	_ = ord

	// Outbox: fulfillment + notify; seller webhook HTTP via BE-420 WebhookService.
	mode := pi.PaymentMode
	if inserted {
		payload, _ := json.Marshal(map[string]any{
			"paymentIntentId": pi.ID,
			"orderId":         pi.OrderID,
			"settlementId":    settlementID,
			"paidLate":        paidLate,
		})
		dedupeFulfill := "fulfillment.execute:" + pi.OrderID
		_ = s.Store.InsertOutbox(ctx, s.IDs.New(), payments.TopicFulfillmentExecute, payload, &dedupeFulfill, &mode, now)
		dedupeNotify := "payment.paid.notify:" + pi.ID
		_ = s.Store.InsertOutbox(ctx, s.IDs.New(), payments.TopicPaymentPaidNotify, payload, &dedupeNotify, &mode, now)
		if s.Webhooks != nil {
			if werr := s.Webhooks.EnqueuePaymentPaidFromIntent(ctx, pi.ID, pi.MerchantID, pi.StoreID, pi.OrderID, pi.PaymentMode, pi.AmountIDR, pi.WebhookEndpointID); werr != nil && s.Log != nil {
				s.Log.Warn("seller webhook enqueue on paid", "intent_id", pi.ID, "err", werr.Error())
			}
		}
	}

	return nil
}

// postLedgerForPaid dual-writes PAYMENT_CAPTURE journal after settlement commit (BE-340).
// Idempotent on journal_reference; failures are logged and do not un-pay the intent.
func (s *CallbackService) postLedgerForPaid(ctx context.Context, pi payments.Intent, now time.Time) {
	if s.Ledger == nil {
		return
	}
	ord, err := s.Store.GetOrderByID(ctx, pi.OrderID)
	if err != nil {
		if s.Log != nil {
			s.Log.Warn("ledger post: order load", "order_id", pi.OrderID, "err", err.Error())
		}
		return
	}
	gross := ord.GrossIDR
	if gross <= 0 {
		gross = pi.AmountIDR
	}
	fee := ord.FeeIDR
	net := ord.MerchantNetIDR
	if net <= 0 && gross > fee {
		net = gross - fee
	}
	feeP, feeF := ledger.SplitFeeComponents(fee, 0, 0)
	capIn := ledger.PaymentCaptureInput{
		MerchantID:       pi.MerchantID,
		StoreID:          pi.StoreID,
		PaymentMode:      pi.PaymentMode,
		Source:           pi.Source,
		PaymentIntentID:  pi.ID,
		OrderID:          pi.OrderID,
		GrossIDR:         gross,
		FeePercentIDR:    feeP,
		FeeFixedIDR:      feeF,
		MerchantNetIDR:   net,
		JournalReference: payments.JournalReferencePaid(pi.ID),
		IdempotencyKey:   payments.JournalReferencePaid(pi.ID),
		Description:      "Payment capture " + pi.ID,
		PostedAt:         now,
	}
	if ord.FeeSnapshotID != nil {
		capIn.FeeSnapshotID = *ord.FeeSnapshotID
	}
	if _, _, lerr := s.Ledger.PostPaymentCapture(ctx, capIn); lerr != nil && s.Log != nil {
		s.Log.Warn("ledger post payment capture", "intent_id", pi.ID, "err", lerr.Error())
	}
}

// sideEffectsPaid converts coupon, allocates stock, creates delivery grant (idempotent).
func (s *CallbackService) sideEffectsPaid(ctx context.Context, pi payments.Intent, now time.Time) {
	// BE-360: mark attribution conversion once (including late-paid recovery).
	if s.Analytics != nil {
		gross := pi.AmountIDR
		if ord, err := s.Store.GetOrderByID(ctx, pi.OrderID); err == nil && ord.GrossIDR > 0 {
			gross = ord.GrossIDR
		}
		if aerr := s.Analytics.MarkConversionOnPaid(ctx, pi.OrderID, pi.PaidLate, gross); aerr != nil && s.Log != nil {
			s.Log.Warn("analytics conversion on paid", "order_id", pi.OrderID, "err", aerr.Error())
		}
	}
	if pi.CouponReservationID != nil && s.Coupons != nil {
		if _, cerr := s.Coupons.ConvertReservationToRedemption(ctx, *pi.CouponReservationID); cerr != nil && s.Log != nil {
			s.Log.Warn("coupon convert on paid", "reservation_id", *pi.CouponReservationID, "err", cerr.Error())
		}
	}
	if pi.StockReservationID != nil && s.Inventory != nil {
		_, _, _ = s.Inventory.AllocateOnFulfillment(ctx, *pi.StockReservationID)
	}
	ord, err := s.Store.GetOrderByID(ctx, pi.OrderID)
	if err != nil {
		return
	}
	if err := s.ensureDeliveryGrant(ctx, pi, ord, now); err != nil && s.Log != nil {
		s.Log.Warn("delivery grant on paid", "order_id", pi.OrderID, "err", err.Error())
	}
}

func (s *CallbackService) ensureDeliveryGrant(ctx context.Context, pi payments.Intent, ord CheckoutOrder, now time.Time) error {
	// Prefer DeliveryStore if wired.
	ds := s.DeliveryStore
	if ds == nil && s.Delivery != nil {
		ds = s.Delivery.Store
	}
	if ds == nil {
		return nil
	}
	// Already granted?
	if existing, err := ds.GetGrantByOrderID(ctx, pi.OrderID); err == nil && existing.ID != "" {
		return nil
	} else if err != nil && !ds.IsNotFound(err) {
		return err
	}

	items, err := ds.ListOrderItems(ctx, pi.OrderID)
	if err != nil {
		return err
	}
	if len(items) == 0 {
		// Gateway QRIS_API may have no product lines — skip storefront delivery.
		return nil
	}
	item := items[0]
	// Idempotent effect key
	effectKey := fmt.Sprintf("order_item:%s", item.ID)
	if g, err := ds.GetGrantByOrderItem(ctx, item.ID); err == nil && g.ID != "" {
		return nil
	} else if err != nil && !ds.IsNotFound(err) {
		return err
	}

	rawAccess, err := auth.GenerateToken(24)
	if err != nil {
		return err
	}
	accessHash := auth.HashTokenKeyed(rawAccess, s.TokenSecret)
	accessExp := now.Add(delivery.DefaultAccessTTL)

	rawPublic, err := auth.GenerateToken(16)
	if err != nil {
		return err
	}
	publicHash := auth.HashTokenKeyed(rawPublic, s.TokenSecret)
	publicHint := ""
	if len(rawPublic) > 4 {
		publicHint = rawPublic[len(rawPublic)-4:]
	}

	kind := item.DeliveryKind
	if kind == "" {
		kind = delivery.KindDownload
	}
	grantStatus := delivery.StatusActive
	if kind == delivery.KindCode || kind == delivery.KindCredential {
		if item.StockItemID == nil {
			grantStatus = delivery.StatusPendingFulfillment
		}
	}
	var activated *time.Time
	if grantStatus == delivery.StatusActive {
		activated = &now
	}
	grantID := s.IDs.New()
	if !strings.HasPrefix(grantID, "dgr_") {
		grantID = "dgr_" + grantID
	}
	recipientSnap, _ := json.Marshal(map[string]any{"email": ord.BuyerEmail, "name": ord.BuyerName})
	productSnap, _ := json.Marshal(map[string]any{
		"productId": item.ProductID, "title": item.ProductTitle, "type": item.ProductType,
	})

	grant := delivery.Grant{
		ID:                   grantID,
		OrderID:              pi.OrderID,
		OrderItemID:          item.ID,
		StoreID:              item.StoreID,
		MerchantID:           item.MerchantID,
		ProductID:            item.ProductID,
		BuyerUserID:          ord.BuyerUserID,
		BuyerEmail:           ord.BuyerEmail,
		DeliveryKind:         kind,
		Status:               grantStatus,
		StockItemID:          item.StockItemID,
		StockReservationID:   item.StockReservationID,
		ObjectID:             item.ObjectID,
		FulfillmentEffectKey: effectKey,
		AccessTokenHash:      &accessHash,
		AccessTokenExpiresAt: &accessExp,
		MaxAccesses:          delivery.DefaultMaxAccesses,
		RecipientSnapshot:    recipientSnap,
		ProductSnapshot:      productSnap,
		ExpiresAt:            &accessExp,
		ActivatedAt:          activated,
		Version:              1,
		CreatedAt:            now,
		UpdatedAt:            now,
	}
	if err := ds.InsertGrant(ctx, grant); err != nil {
		if ds.IsUniqueViolation(err) {
			return nil
		}
		return err
	}

	// Invoice v1 if missing
	if _, err := ds.GetInvoiceByOrder(ctx, pi.OrderID); err == nil {
		return nil
	} else if !ds.IsNotFound(err) {
		return err
	}

	st, _ := ds.GetStore(ctx, pi.StoreID)
	invoiceID := s.IDs.New()
	if !strings.HasPrefix(invoiceID, "inv_") {
		invoiceID = "inv_" + invoiceID
	}
	versionID := s.IDs.New()
	invoiceNumber := "INV-" + pi.OrderID
	if len(invoiceNumber) > 40 {
		invoiceNumber = "INV-" + pi.OrderID[:16]
	}
	snap := invoices.Snapshot{
		InvoiceNumber:  invoiceNumber,
		OrderID:        pi.OrderID,
		OrderNumber:    ord.OrderNumber,
		StoreID:        pi.StoreID,
		MerchantID:     pi.MerchantID,
		Currency:       "IDR",
		SubtotalIDR:    ord.SubtotalIDR,
		DiscountIDR:    ord.DiscountIDR,
		TipIDR:         ord.TipIDR,
		FeeIDR:         ord.FeeIDR,
		GrossIDR:       ord.GrossIDR,
		MerchantNetIDR: ord.MerchantNetIDR,
		PaidAt:         &now,
		Buyer:          invoices.BuyerSnapshot{UserID: ord.BuyerUserID, Email: ord.BuyerEmail, Name: ord.BuyerName},
		Issuer:         invoices.IssuerSnapshot{StoreID: st.ID, StoreName: st.Name, MerchantID: pi.MerchantID},
		Lines: []invoices.LineSnapshot{{
			OrderItemID:  item.ID,
			ProductID:    item.ProductID,
			Title:        item.ProductTitle,
			ProductType:  item.ProductType,
			Version:      item.ProductVersion,
			UnitPriceIDR: item.UnitPriceIDR,
			Quantity:     item.Quantity,
			LineTotalIDR: item.LineTotalIDR,
			DiscountIDR:  item.DiscountAllocationIDR,
		}},
		RendererVersion: invoices.RendererV1,
	}
	snapBytes, _ := json.Marshal(snap)
	payloadHash := payments.DigestBody(snapBytes)
	inv := invoices.Invoice{
		ID:             invoiceID,
		OrderID:        pi.OrderID,
		StoreID:        pi.StoreID,
		MerchantID:     pi.MerchantID,
		InvoiceNumber:  invoiceNumber,
		PublicCodeHash: publicHash,
		PublicCodeHint: publicHint,
		Status:         invoices.StatusIssued,
		Currency:       "IDR",
		GrossIDR:       ord.GrossIDR,
		PaidAt:         &now,
		CurrentVersion: 1,
		BuyerUserID:    ord.BuyerUserID,
		CreatedAt:      now,
		UpdatedAt:      now,
	}
	ver := invoices.Version{
		ID:              versionID,
		InvoiceID:       invoiceID,
		Version:         1,
		RendererVersion: invoices.RendererV1,
		Snapshot:        snapBytes,
		PayloadHash:     payloadHash,
		RenderStatus:    invoices.RenderPending,
		CreatedAt:       now,
	}
	if err := ds.InsertInvoice(ctx, inv); err != nil {
		if ds.IsUniqueViolation(err) {
			return nil
		}
		return err
	}
	_ = ds.InsertInvoiceVersion(ctx, ver)
	_ = ds.InsertAttempt(ctx, delivery.Attempt{
		ID:        s.IDs.New(),
		GrantID:   grantID,
		OrderID:   pi.OrderID,
		StoreID:   pi.StoreID,
		Channel:   delivery.ChannelPortal,
		Result:    delivery.ResultQueued,
		ActorKind: delivery.ActorSystem,
		Reason:    "paid_finalization",
		CreatedAt: now,
	})
	return nil
}

// ReplayInbound re-processes a stored provider event (admin only). Never seller delivery IDs.
func (s *CallbackService) ReplayInbound(ctx context.Context, callbackID, reason, actorUserID string) (payments.ProviderEvent, error) {
	if callbackID == "" {
		return payments.ProviderEvent{}, apperr.Validation(apperr.CodeValidationFailed, "callbackId required")
	}
	// Reject outbound seller delivery id shapes
	if strings.HasPrefix(callbackID, "whd_") || strings.HasPrefix(callbackID, "swd_") {
		return payments.ProviderEvent{}, apperr.Validation(apperr.CodeValidationFailed, "Outbound seller delivery IDs are not valid for inbound replay")
	}
	ev, err := s.Store.GetProviderEventByID(ctx, callbackID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return payments.ProviderEvent{}, payments.ErrNotFound
		}
		return payments.ProviderEvent{}, err
	}
	now := s.now()
	// Reset to ACCEPTED for re-process only if not currently processing lease-held.
	rc := ev.ReplayCount + 1
	_, _ = s.Store.UpdateProviderEventState(ctx, callbackID, payments.CallbackAccepted, CallbackEventPatch{
		ReplayCount:      &rc,
		LastReplayAt:     &now,
		LastReplayReason: &reason,
		ClearLease:       true,
	}, now)
	if err := s.ProcessEvent(ctx, callbackID); err != nil {
		return payments.ProviderEvent{}, err
	}
	out, err := s.Store.GetProviderEventByID(ctx, callbackID)
	if err != nil {
		return payments.ProviderEvent{}, err
	}
	if s.Log != nil {
		s.Log.Info("provider callback replayed",
			"callback_id", callbackID,
			"actor", actorUserID,
			"reason", reason,
			// no payload
		)
	}
	return out, nil
}

// ListAdminEvents is the inbound callback read model (no encrypted payload in DTO layer).
func (s *CallbackService) ListAdminEvents(ctx context.Context, limit int32) ([]payments.ProviderEvent, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	return s.Store.ListAdminProviderEvents(ctx, limit)
}

// GetAdminEvent returns one inbound callback by Fersaku callback_id.
func (s *CallbackService) GetAdminEvent(ctx context.Context, callbackID string) (payments.ProviderEvent, error) {
	if strings.HasPrefix(callbackID, "whd_") || strings.HasPrefix(callbackID, "swd_") {
		return payments.ProviderEvent{}, apperr.Validation(apperr.CodeValidationFailed, "Outbound seller delivery IDs are not valid")
	}
	ev, err := s.Store.GetProviderEventByID(ctx, callbackID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return payments.ProviderEvent{}, payments.ErrNotFound
		}
		return payments.ProviderEvent{}, err
	}
	return ev, nil
}

func constantTimeTokenEqual(got, want string) bool {
	return ConstantTimeTokenEqual(got, want)
}

// ConstantTimeTokenEqual compares webhook tokens via fixed-size digests (INT-180).
// Exported for disbursement ingress parity with payment callbacks.
func ConstantTimeTokenEqual(got, want string) bool {
	if want == "" {
		// Misconfigured: reject all in production paths; local tests set token.
		return false
	}
	// subtle.ConstantTimeCompare requires equal length; compare fixed-size digests.
	a := payments.DigestBody([]byte(got))
	b := payments.DigestBody([]byte(want))
	return subtle.ConstantTimeCompare([]byte(a), []byte(b)) == 1
}

func mapOrderTerminal(paymentStatus string) (pay, order string) {
	switch paymentStatus {
	case payments.StatusExpired:
		return orders.PaymentExpired, payments.OrderExpired
	case payments.StatusCancelled:
		return orders.PaymentCancelled, payments.OrderCancelled
	case payments.StatusFailed:
		return orders.PaymentFailed, payments.OrderFailed
	default:
		return paymentStatus, paymentStatus
	}
}

func timePtr(t time.Time) *time.Time { return &t }
