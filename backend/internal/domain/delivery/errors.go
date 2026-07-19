package delivery

import apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"

// Domain sentinel errors (stable problem codes).
var (
	ErrNotFound         = apperr.NotFound(apperr.CodeResourceNotFound, "Resource not found")
	ErrUnpaid           = apperr.Forbidden(apperr.CodeDeliveryUnpaid, "Order is not paid")
	ErrRevoked          = apperr.Forbidden(apperr.CodeDeliveryRevoked, "Delivery access has been revoked")
	ErrExpired          = apperr.Forbidden(apperr.CodeDeliveryExpired, "Delivery access has expired")
	ErrAccessDenied     = apperr.Forbidden(apperr.CodeDeliveryAccessDenied, "Delivery access denied")
	ErrGrantState       = apperr.Conflict(apperr.CodeConflict, "Delivery grant state conflict")
	ErrAlreadyAllocated = apperr.Conflict(apperr.CodeConflict, "Stock already allocated for this grant")
	ErrOrderNotPaid     = apperr.Forbidden(apperr.CodeDeliveryUnpaid, "Order payment is not verified paid")
	ErrSecretToAdmin    = apperr.Forbidden(apperr.CodeForbidden, "Secrets are not returned to admin actors")
	ErrInvoiceNotFound  = apperr.NotFound(apperr.CodeResourceNotFound, "Invoice not found")
	ErrInvoiceImmutable = apperr.Conflict(apperr.CodeConflict, "Invoice snapshot is immutable")
	ErrVerifyInvalid    = apperr.NotFound(apperr.CodeResourceNotFound, "Invoice verification failed")
)
