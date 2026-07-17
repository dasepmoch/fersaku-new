// Package presenters writes the HTTP transport envelope (BE-110 / §6.1).
//
// Success:  { "data": ..., "meta": { "requestId", "timestamp", "nextCursor?", "hasMore?" } }
// Problem:  { "problem": { "code", "message", "details?", "requestId" } }
//
// Money fields in data (when present) MUST be JSON integers (int64 whole IDR).
package presenters

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/reqctx"
	"github.com/dasepmoch/fersaku-new/backend/internal/platform/cursor"
	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
)

// Meta is response metadata on success envelopes.
type Meta struct {
	RequestID  string  `json:"requestId"`
	Timestamp  string  `json:"timestamp"`
	NextCursor *string `json:"nextCursor,omitempty"`
	HasMore    *bool   `json:"hasMore,omitempty"`
}

// Envelope is the success response shape.
type Envelope struct {
	Data any  `json:"data"`
	Meta Meta `json:"meta"`
}

// ProblemBody is the machine-readable error object.
type ProblemBody struct {
	Code      string         `json:"code"`
	Message   string         `json:"message"`
	Details   map[string]any `json:"details,omitempty"`
	RequestID string         `json:"requestId"`
}

// ProblemEnvelope is the error response shape.
type ProblemEnvelope struct {
	Problem ProblemBody `json:"problem"`
}

// NewMeta builds meta with request ID and UTC timestamp.
func NewMeta(requestID string, now time.Time) Meta {
	if now.IsZero() {
		now = time.Now().UTC()
	}
	return Meta{
		RequestID: requestID,
		Timestamp: now.UTC().Format(time.RFC3339),
	}
}

// ListMeta builds meta for paginated collections using platform/cursor.
// nextCursor is empty when hasMore is false.
func ListMeta(requestID string, now time.Time, next *cursor.Key, hasMore bool) Meta {
	m := NewMeta(requestID, now)
	hm := hasMore
	m.HasMore = &hm
	if hasMore && next != nil {
		if enc, err := cursor.Encode(*next); err == nil && enc != "" {
			m.NextCursor = &enc
		}
	}
	return m
}

// WriteSuccess writes a 2xx envelope with data and meta.
func WriteSuccess(w http.ResponseWriter, r *http.Request, status int, data any, meta Meta) {
	if meta.RequestID == "" {
		meta.RequestID = reqctx.RequestID(r.Context())
	}
	if meta.Timestamp == "" {
		meta.Timestamp = time.Now().UTC().Format(time.RFC3339)
	}
	if status == 0 {
		status = http.StatusOK
	}
	writeJSON(w, status, Envelope{Data: data, Meta: meta})
}

// WriteData is WriteSuccess with auto meta from request context.
func WriteData(w http.ResponseWriter, r *http.Request, status int, data any) {
	rid := reqctx.RequestID(r.Context())
	WriteSuccess(w, r, status, data, NewMeta(rid, time.Now().UTC()))
}

// WriteList writes a paginated success envelope.
func WriteList(w http.ResponseWriter, r *http.Request, status int, data any, next *cursor.Key, hasMore bool) {
	rid := reqctx.RequestID(r.Context())
	WriteSuccess(w, r, status, data, ListMeta(rid, time.Now().UTC(), next, hasMore))
}

// WriteProblem writes a problem envelope. Never includes stack traces or secrets.
func WriteProblem(w http.ResponseWriter, r *http.Request, status int, code, message string, details map[string]any) {
	rid := reqctx.RequestID(r.Context())
	if rid == "" {
		rid = w.Header().Get("X-Request-ID")
	}
	if code == "" {
		code = apperr.CodeInternalError
	}
	if message == "" {
		message = "An unexpected error occurred"
	}
	if status == 0 {
		status = http.StatusInternalServerError
	}
	body := ProblemEnvelope{Problem: ProblemBody{
		Code:      code,
		Message:   message,
		Details:   details,
		RequestID: rid,
	}}
	writeJSON(w, status, body)
}

// WriteAppError maps *AppError (or unknown err) to a safe problem response.
func WriteAppError(w http.ResponseWriter, r *http.Request, err error) {
	status, code, message, details := MapError(err)
	WriteProblem(w, r, status, code, message, details)
}

// WriteRawJSON writes a non-envelope JSON body (health probes only).
func WriteRawJSON(w http.ResponseWriter, status int, body any) {
	writeJSON(w, status, body)
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(true)
	_ = enc.Encode(body)
}
