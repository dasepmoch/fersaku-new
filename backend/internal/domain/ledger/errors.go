package ledger

import apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"

// Domain error helpers for ledger posting / reads.
func ErrUnbalanced(msg string) error {
	return apperr.Validation(apperr.CodeValidationFailed, msg)
}

func ErrInsufficientBalance(msg string) error {
	return apperr.Validation(apperr.CodeValidationFailed, msg)
}

func ErrNotFound(msg string) error {
	return apperr.NotFound(apperr.CodeResourceNotFound, msg)
}

func ErrConflict(msg string) error {
	return apperr.Conflict(apperr.CodeConflict, msg)
}
