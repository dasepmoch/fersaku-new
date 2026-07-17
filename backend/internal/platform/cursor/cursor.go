// Package cursor encodes and decodes opaque pagination cursors.
// Convention (BACKEND_PRODUCTION_TASKS §6.4): order (created_at DESC, id DESC).
// Domain and application may use this package; it has no pgx/HTTP deps.
package cursor

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
)

// Version of the cursor payload schema.
const Version = 1

// ErrInvalid is returned when a cursor cannot be decoded or validated.
var ErrInvalid = errors.New("cursor: invalid")

// Key is the stable sort key for list pagination: created_at + id (ULID text).
type Key struct {
	CreatedAt time.Time `json:"t"`
	ID        string    `json:"i"`
}

type payload struct {
	V int       `json:"v"`
	T time.Time `json:"t"`
	I string    `json:"i"`
}

// Encode returns an opaque, URL-safe cursor string for the given key.
func Encode(k Key) (string, error) {
	if k.ID == "" {
		return "", fmt.Errorf("%w: empty id", ErrInvalid)
	}
	if k.CreatedAt.IsZero() {
		return "", fmt.Errorf("%w: zero created_at", ErrInvalid)
	}
	raw, err := json.Marshal(payload{
		V: Version,
		T: k.CreatedAt.UTC(),
		I: k.ID,
	})
	if err != nil {
		return "", fmt.Errorf("cursor: marshal: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(raw), nil
}

// Decode parses an opaque cursor into a Key.
func Decode(s string) (Key, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return Key{}, fmt.Errorf("%w: empty", ErrInvalid)
	}
	raw, err := base64.RawURLEncoding.DecodeString(s)
	if err != nil {
		return Key{}, fmt.Errorf("%w: decode: %v", ErrInvalid, err)
	}
	var p payload
	if err := json.Unmarshal(raw, &p); err != nil {
		return Key{}, fmt.Errorf("%w: json: %v", ErrInvalid, err)
	}
	if p.V != Version {
		return Key{}, fmt.Errorf("%w: unsupported version %d", ErrInvalid, p.V)
	}
	if p.I == "" || p.T.IsZero() {
		return Key{}, fmt.Errorf("%w: missing fields", ErrInvalid)
	}
	return Key{CreatedAt: p.T.UTC(), ID: p.I}, nil
}

// LessDesc reports whether a is strictly before b in (created_at DESC, id DESC) order.
// Used by tests and callers that merge pages.
func LessDesc(a, b Key) bool {
	if !a.CreatedAt.Equal(b.CreatedAt) {
		return a.CreatedAt.After(b.CreatedAt)
	}
	return a.ID > b.ID
}
