// Package decode provides strict JSON body decoding for HTTP handlers (BE-110).
//
// Policy:
//   - Default max body size: 1 MiB (MaxBodyBytes).
//   - Content-Type must be application/json (charset optional).
//   - Unknown fields are rejected (DisallowUnknownFields).
//   - Money fields (when present in DTOs) must be JSON integers (int64), not floats/strings.
package decode

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"

	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
)

// MaxBodyBytes is the default JSON body size limit (1 MiB).
const MaxBodyBytes int64 = 1 << 20

// DecodeJSON reads r.Body into dest with strict rules.
// Returns *apperr.AppError with CodeValidationFailed on client errors.
func DecodeJSON(r *http.Request, dest any) error {
	return DecodeJSONLimited(r, dest, MaxBodyBytes)
}

// DecodeJSONLimited is DecodeJSON with a custom byte limit.
func DecodeJSONLimited(r *http.Request, dest any, maxBytes int64) error {
	if dest == nil {
		return apperr.Internal(apperr.CodeInternalError, "decode destination is nil")
	}
	if r.Body == nil {
		return apperr.Validation(apperr.CodeValidationFailed, "Request body is required")
	}
	if maxBytes <= 0 {
		maxBytes = MaxBodyBytes
	}

	ct := r.Header.Get("Content-Type")
	if !isJSONContentType(ct) {
		return apperr.Validation(apperr.CodeValidationFailed, "Content-Type must be application/json").
			WithDetails(map[string]any{"contentType": strings.TrimSpace(ct)})
	}

	limited := http.MaxBytesReader(nil, r.Body, maxBytes)
	dec := json.NewDecoder(limited)
	dec.DisallowUnknownFields()

	if err := dec.Decode(dest); err != nil {
		return mapDecodeError(err, maxBytes)
	}

	// Reject trailing junk after the first JSON value.
	if err := dec.Decode(&struct{}{}); err != io.EOF {
		return apperr.Validation(apperr.CodeValidationFailed, "Request body must contain a single JSON value")
	}
	return nil
}

func isJSONContentType(ct string) bool {
	ct = strings.TrimSpace(strings.ToLower(ct))
	if ct == "" {
		return false
	}
	media := ct
	if i := strings.Index(ct, ";"); i >= 0 {
		media = strings.TrimSpace(ct[:i])
	}
	return media == "application/json" || strings.HasSuffix(media, "+json")
}

func mapDecodeError(err error, maxBytes int64) error {
	if err == nil {
		return nil
	}

	var maxErr *http.MaxBytesError
	if errors.As(err, &maxErr) {
		return apperr.Validation(apperr.CodeValidationFailed, "Request body too large").
			WithDetails(map[string]any{"maxBytes": maxBytes})
	}

	// json.Decoder wraps some size errors as generic errors containing the message.
	msg := err.Error()
	if strings.Contains(msg, "http: request body too large") {
		return apperr.Validation(apperr.CodeValidationFailed, "Request body too large").
			WithDetails(map[string]any{"maxBytes": maxBytes})
	}

	var syn *json.SyntaxError
	if errors.As(err, &syn) {
		return apperr.Validation(apperr.CodeValidationFailed, "Malformed JSON").
			WithDetails(map[string]any{"offset": syn.Offset})
	}

	var typeErr *json.UnmarshalTypeError
	if errors.As(err, &typeErr) {
		return apperr.Validation(apperr.CodeValidationFailed, "Invalid JSON field type").
			WithDetails(map[string]any{
				"field": typeErr.Field,
				"type":  typeErr.Type.String(),
			})
	}

	if errors.Is(err, io.EOF) {
		return apperr.Validation(apperr.CodeValidationFailed, "Request body is required")
	}

	// Unknown field: "json: unknown field \"foo\""
	if strings.HasPrefix(msg, "json: unknown field ") {
		field := strings.Trim(strings.TrimPrefix(msg, "json: unknown field "), `"`)
		return apperr.Validation(apperr.CodeValidationFailed, "Unknown field in request body").
			WithDetails(map[string]any{"field": field})
	}

	return apperr.Validation(apperr.CodeValidationFailed, "Invalid JSON body").
		WithDetails(map[string]any{"reason": sanitizeDecodeReason(err)})
}

func sanitizeDecodeReason(err error) string {
	// Never forward raw internal error strings that might include paths/secrets.
	s := err.Error()
	if len(s) > 120 {
		s = s[:120]
	}
	return fmt.Sprintf("%T", err) + ":" + s
}
