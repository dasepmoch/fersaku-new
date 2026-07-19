package middleware_test

import (
	"net/http"
	"testing"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/middleware"
)

func TestClassifyRequest_NilSafe(t *testing.T) {
	if got := middleware.ClassifyRequest(nil); got != middleware.RouteClassDefault {
		t.Fatalf("got %q", got)
	}
	req, _ := http.NewRequest(http.MethodGet, "/v1/auth/login", nil)
	if got := middleware.ClassifyRequest(req); got != middleware.RouteClassAuth {
		t.Fatalf("got %q", got)
	}
}
