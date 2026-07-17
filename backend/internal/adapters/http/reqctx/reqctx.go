// Package reqctx stores per-request transport values on context (no presenters deps).
package reqctx

import "context"

type ctxKey int

const (
	requestIDKey ctxKey = iota + 1
	clientIPKey
	principalKey
	sessionKey
	gatewayAuthKey
	traceIDKey
	traceparentKey
)

// WithRequestID stores the correlation request ID.
func WithRequestID(ctx context.Context, id string) context.Context {
	return context.WithValue(ctx, requestIDKey, id)
}

// RequestID returns the request ID or empty string.
func RequestID(ctx context.Context) string {
	v, _ := ctx.Value(requestIDKey).(string)
	return v
}

// WithTraceID stores the W3C/trace correlation ID (32-hex, no dashes).
func WithTraceID(ctx context.Context, id string) context.Context {
	return context.WithValue(ctx, traceIDKey, id)
}

// TraceID returns the trace ID or empty string.
func TraceID(ctx context.Context) string {
	v, _ := ctx.Value(traceIDKey).(string)
	return v
}

// WithTraceparent stores the full W3C traceparent header value.
func WithTraceparent(ctx context.Context, tp string) context.Context {
	return context.WithValue(ctx, traceparentKey, tp)
}

// Traceparent returns the traceparent or empty string.
func Traceparent(ctx context.Context) string {
	v, _ := ctx.Value(traceparentKey).(string)
	return v
}

// WithClientIP stores the resolved client IP.
func WithClientIP(ctx context.Context, ip string) context.Context {
	return context.WithValue(ctx, clientIPKey, ip)
}

// ClientIP returns the client IP or empty string.
func ClientIP(ctx context.Context) string {
	v, _ := ctx.Value(clientIPKey).(string)
	return v
}

// Principal is the authenticated identity attached by session middleware (BE-120/BE-130).
type Principal struct {
	SubjectID     string
	SessionID     string
	Surface       string
	Email         string
	Name          string
	Status        string
	MFAEnabled    bool
	MFAVerified   bool
	EmailVerified bool
	CSRFToken     string // unused: raw CSRF never on principal; GET /session rotates via AuthService
	// Permissions is the effective permission set loaded at session resolve (BE-130).
	Permissions []string
	RoleCodes   []string
	// Impersonation (BE-520): derived support session fields from server state only.
	Impersonating       bool
	ImpersonationID     string
	ImpersonationScope  string
	ImpersonationActor  string
	ImpersonationExpiry string // RFC3339
}

// PermissionSet returns a set for O(1) HasPermission checks.
func (p Principal) PermissionSet() map[string]struct{} {
	out := make(map[string]struct{}, len(p.Permissions))
	for _, c := range p.Permissions {
		if c != "" {
			out[c] = struct{}{}
		}
	}
	return out
}

// HasPermission reports whether the principal holds code (deny by default).
func (p Principal) HasPermission(code string) bool {
	if code == "" {
		return false
	}
	for _, c := range p.Permissions {
		if c == code {
			return true
		}
	}
	return false
}

// WithPrincipal stores a principal.
func WithPrincipal(ctx context.Context, p Principal) context.Context {
	return context.WithValue(ctx, principalKey, p)
}

// PrincipalFrom returns the principal if present.
func PrincipalFrom(ctx context.Context) (Principal, bool) {
	p, ok := ctx.Value(principalKey).(Principal)
	return p, ok
}

// SessionMeta holds session fields needed for CSRF validation without re-query.
type SessionMeta struct {
	ID            string
	TokenHash     string
	CSRFTokenHash string
	Surface       string
	UserID        string
}

// WithSessionMeta stores session meta for CSRF middleware.
func WithSessionMeta(ctx context.Context, s SessionMeta) context.Context {
	return context.WithValue(ctx, sessionKey, s)
}

// SessionMetaFrom returns session meta if present.
func SessionMetaFrom(ctx context.Context) (SessionMeta, bool) {
	s, ok := ctx.Value(sessionKey).(SessionMeta)
	return s, ok
}

// GatewayAuth is merchant API-key identity for QRIS gateway (BE-320).
type GatewayAuth struct {
	KeyID       string
	MerchantID  string
	PaymentMode string
	KeyPrefix   string
}

// WithGatewayAuth stores gateway API-key auth context.
func WithGatewayAuth(ctx context.Context, a GatewayAuth) context.Context {
	return context.WithValue(ctx, gatewayAuthKey, a)
}

// GatewayAuthFrom returns gateway auth if present.
func GatewayAuthFrom(ctx context.Context) (GatewayAuth, bool) {
	a, ok := ctx.Value(gatewayAuthKey).(GatewayAuth)
	return a, ok
}
