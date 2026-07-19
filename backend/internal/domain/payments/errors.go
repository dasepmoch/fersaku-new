package payments

import (
	"errors"

	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
)

var (
	ErrNotFound            = apperr.NotFound(apperr.CodeResourceNotFound, "Payment intent not found")
	ErrInvalidTransition   = errors.New("invalid payment transition")
	ErrIdempotencyConflict = apperr.Conflict(apperr.CodeIdempotencyConflict, "Idempotency key conflict")
	ErrProductUnavailable  = apperr.NotFound(apperr.CodeResourceNotFound, "Product not available")
	ErrInvalidAmount       = apperr.Validation(apperr.CodeValidationFailed, "Invalid payment amount")
	ErrClientPriceRejected = apperr.Validation(apperr.CodeValidationFailed, "Client price is not authoritative")
	ErrCheckoutClosed      = apperr.Conflict(apperr.CodeConflict, "Checkout is no longer pending")
	ErrProviderUnknown     = apperr.New(apperr.KindUnavailable, apperr.CodeInternalError, "Payment provider outcome unknown")
	ErrSimulateDisabled    = apperr.NotFound(apperr.CodeResourceNotFound, "Not found")
)
