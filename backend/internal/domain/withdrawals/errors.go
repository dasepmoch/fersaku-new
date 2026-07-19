package withdrawals

import apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"

const (
	CodeWithdrawalLocked         = "WITHDRAWAL_LOCKED"
	CodeWithdrawalInsufficient   = "WITHDRAWAL_INSUFFICIENT_BALANCE"
	CodeWithdrawalQuoteExpired   = "WITHDRAWAL_QUOTE_EXPIRED"
	CodeWithdrawalQuoteInvalid   = "WITHDRAWAL_QUOTE_INVALID"
	CodeWithdrawalQuoteConsumed  = "WITHDRAWAL_QUOTE_CONSUMED"
	CodeBankNotVerified          = "BANK_NOT_VERIFIED"
	CodeBankVersionConflict      = "BANK_VERSION_CONFLICT"
	CodeBankPrimaryRequired      = "BANK_PRIMARY_REQUIRED"
	CodeBankInUse                = "BANK_IN_USE"
	CodeWithdrawalInvalidStatus  = "WITHDRAWAL_INVALID_STATUS"
	CodeWithdrawalUnknownOutcome = "WITHDRAWAL_UNKNOWN_OUTCOME"
	CodeWithdrawalFrozen         = "WITHDRAWAL_FROZEN"
	CodeDisbursementMismatch     = "DISBURSEMENT_MISMATCH"
)

var (
	ErrLocked               = apperr.Conflict(CodeWithdrawalLocked, "Withdrawals are temporarily locked after a bank change")
	ErrInsufficient         = apperr.Conflict(CodeWithdrawalInsufficient, "Insufficient available balance for withdrawal")
	ErrQuoteExpired         = apperr.Conflict(CodeWithdrawalQuoteExpired, "Withdrawal quote has expired")
	ErrQuoteInvalid         = apperr.Conflict(CodeWithdrawalQuoteInvalid, "Withdrawal quote is invalid")
	ErrQuoteConsumed        = apperr.Conflict(CodeWithdrawalQuoteConsumed, "Withdrawal quote already consumed")
	ErrBankNotVerified      = apperr.Validation(CodeBankNotVerified, "Bank account must be verified")
	ErrBankVersionConflict  = apperr.Conflict(CodeBankVersionConflict, "Bank account version conflict")
	ErrBankPrimaryRequired  = apperr.Conflict(CodeBankPrimaryRequired, "Cannot archive the only verified primary bank account")
	ErrBankInUse            = apperr.Conflict(CodeBankInUse, "Bank account is referenced by an active quote or withdrawal")
	ErrInvalidStatus        = apperr.Conflict(CodeWithdrawalInvalidStatus, "Invalid withdrawal status transition")
	ErrFrozen               = apperr.Conflict(CodeWithdrawalFrozen, "Withdrawals frozen pending recovery")
	ErrDisbursementMismatch = apperr.Conflict(CodeDisbursementMismatch, "Disbursement evidence mismatch")
)
