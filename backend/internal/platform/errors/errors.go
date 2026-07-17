// Package errors defines domain/application error taxonomy mappable to problem
// codes (BE-110 / §6.3).
package errors

import (
	"errors"
	"fmt"
)

// Kind classifies errors for HTTP/problem mapping.
type Kind string

const (
	KindValidation   Kind = "validation"
	KindNotFound     Kind = "not_found"
	KindConflict     Kind = "conflict"
	KindUnauthorized Kind = "unauthorized"
	KindForbidden    Kind = "forbidden"
	KindUnavailable  Kind = "unavailable"
	KindInternal     Kind = "internal"
	KindFailedPrecon Kind = "failed_precondition"
	KindRateLimited  Kind = "rate_limited"
)

// AppError is a typed application/domain error with a stable problem code.
type AppError struct {
	Kind      Kind
	Code      string // e.g. RESOURCE_NOT_FOUND — maps to problem.code
	Message   string // safe client message; never secrets/stack traces
	RequestID string
	Cause     error
	Details   map[string]any
}

func (e *AppError) Error() string {
	if e == nil {
		return "<nil>"
	}
	if e.Cause != nil {
		return fmt.Sprintf("%s: %s: %v", e.Code, e.Message, e.Cause)
	}
	return fmt.Sprintf("%s: %s", e.Code, e.Message)
}

func (e *AppError) Unwrap() error {
	if e == nil {
		return nil
	}
	return e.Cause
}

// WithRequestID returns a shallow copy with request ID set.
func (e *AppError) WithRequestID(requestID string) *AppError {
	if e == nil {
		return nil
	}
	cp := *e
	cp.RequestID = requestID
	return &cp
}

// WithDetails returns a shallow copy with safe details (no secrets).
func (e *AppError) WithDetails(details map[string]any) *AppError {
	if e == nil {
		return nil
	}
	cp := *e
	cp.Details = details
	return &cp
}

// New builds an AppError.
func New(kind Kind, code, message string) *AppError {
	return &AppError{Kind: kind, Code: code, Message: message}
}

// Wrap attaches a cause (cause is for logs only; never serialized to clients).
func Wrap(kind Kind, code, message string, cause error) *AppError {
	return &AppError{Kind: kind, Code: code, Message: message, Cause: cause}
}

// AsAppError extracts *AppError from an error chain.
func AsAppError(err error) (*AppError, bool) {
	var ae *AppError
	if errors.As(err, &ae) {
		return ae, true
	}
	return nil, false
}

func Validation(code, message string) *AppError {
	if code == "" {
		code = CodeValidationFailed
	}
	return New(KindValidation, code, message)
}

func NotFound(code, message string) *AppError {
	if code == "" {
		code = CodeResourceNotFound
	}
	return New(KindNotFound, code, message)
}

func Conflict(code, message string) *AppError {
	if code == "" {
		code = CodeConflict
	}
	return New(KindConflict, code, message)
}

func Unauthorized(code, message string) *AppError {
	if code == "" {
		code = CodeAuthRequired
	}
	return New(KindUnauthorized, code, message)
}

func Forbidden(code, message string) *AppError {
	if code == "" {
		code = CodeForbidden
	}
	return New(KindForbidden, code, message)
}

func Internal(code, message string) *AppError {
	if code == "" {
		code = CodeInternalError
	}
	return New(KindInternal, code, message)
}

func RateLimited(message string) *AppError {
	if message == "" {
		message = "Too many requests"
	}
	return New(KindRateLimited, CodeRateLimited, message)
}
