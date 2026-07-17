package presenters_test

import (
	"errors"
	"net/http"
	"testing"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/presenters"
	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
)

func TestMapErrorStableCodes(t *testing.T) {
	cases := []struct {
		err    error
		status int
		code   string
	}{
		{apperr.Unauthorized(apperr.CodeAuthRequired, "need login"), http.StatusUnauthorized, apperr.CodeAuthRequired},
		{apperr.Validation(apperr.CodeValidationFailed, "bad"), http.StatusBadRequest, apperr.CodeValidationFailed},
		{apperr.NotFound(apperr.CodeResourceNotFound, "gone"), http.StatusNotFound, apperr.CodeResourceNotFound},
		{apperr.Conflict(apperr.CodeConflict, "dup"), http.StatusConflict, apperr.CodeConflict},
		{apperr.Conflict(apperr.CodeIdempotencyConflict, "idem"), http.StatusConflict, apperr.CodeIdempotencyConflict},
		{apperr.Forbidden(apperr.CodeForbidden, "nope"), http.StatusForbidden, apperr.CodeForbidden},
		{apperr.RateLimited(""), http.StatusTooManyRequests, apperr.CodeRateLimited},
		{apperr.Internal(apperr.CodeInternalError, "x"), http.StatusInternalServerError, apperr.CodeInternalError},
		{errors.New("raw"), http.StatusInternalServerError, apperr.CodeInternalError},
	}
	for _, tc := range cases {
		st, code, msg, _ := presenters.MapError(tc.err)
		if st != tc.status || code != tc.code {
			t.Fatalf("%v => %d %s want %d %s", tc.err, st, code, tc.status, tc.code)
		}
		if msg == "" {
			t.Fatalf("empty message for %v", tc.err)
		}
		// Cause/raw secrets must not appear for unknown errors
		if tc.code == apperr.CodeInternalError && msg == "raw" {
			t.Fatal("leaked raw error message")
		}
	}
}
