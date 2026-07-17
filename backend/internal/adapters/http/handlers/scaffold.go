package handlers

import (
	"net/http"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/decode"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/presenters"
	"github.com/dasepmoch/fersaku-new/backend/internal/config"
)

// ScaffoldEchoRequest is the demo POST body for strict decoder tests.
// Only registered when APP_ENV is local or test (never production/staging).
type ScaffoldEchoRequest struct {
	Message string `json:"message"`
	// AmountIdr demonstrates money as int64 JSON integer when present.
	AmountIdr *int64 `json:"amountIdr,omitempty"`
}

// ScaffoldEchoResponse echoes validated fields.
type ScaffoldEchoResponse struct {
	Message   string `json:"message"`
	AmountIdr *int64 `json:"amountIdr,omitempty"`
}

// ScaffoldDeps gates demo routes by environment.
type ScaffoldDeps struct {
	AppEnv config.Env
}

// Echo handles POST /v1/_scaffold/echo — strict JSON decode demo for tests.
// Must not be mounted when AppEnv is production or staging.
func (d ScaffoldDeps) Echo(w http.ResponseWriter, r *http.Request) {
	var req ScaffoldEchoRequest
	if err := decode.DecodeJSON(r, &req); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	if req.Message == "" {
		presenters.WriteProblem(w, r, http.StatusBadRequest,
			"VALIDATION_FAILED", "message is required",
			map[string]any{"field": "message"})
		return
	}
	presenters.WriteData(w, r, http.StatusOK, ScaffoldEchoResponse{
		Message:   req.Message,
		AmountIdr: req.AmountIdr,
	})
}

// AllowScaffold reports whether scaffold routes may be registered.
func AllowScaffold(env config.Env) bool {
	return env == config.EnvLocal || env == config.EnvTest
}
