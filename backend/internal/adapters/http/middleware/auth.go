package middleware

import (
	"context"
	"net/http"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/presenters"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/reqctx"
	"github.com/dasepmoch/fersaku-new/backend/internal/application"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/auth"
	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
)

// AuthMode controls session enforcement.
type AuthMode int

const (
	// AuthModeOptional loads session when cookie present; never rejects.
	AuthModeOptional AuthMode = iota
	// AuthModeRequired fails closed with AUTH_REQUIRED when no principal.
	AuthModeRequired
)

// SessionResolver loads principal from raw session cookie value.
type SessionResolver interface {
	ResolveSession(ctx context.Context, rawToken string) (auth.Principal, auth.Session, error)
}

// AuthConfig configures cookie session loading (BE-120).
type AuthConfig struct {
	Mode              AuthMode
	CookieName        string
	Resolver          SessionResolver
	// RequireAdminMFA when true and surface=ADMIN without mfa_verified → AUTH_MFA_REQUIRED
	// for non-MFA endpoints. Applied only when Mode=Required or when EnforceAdminMFAPaths match.
	RequireAdminMFA bool
}

// Auth loads session from cookie and attaches principal (optional by default).
func Auth(mode AuthMode) func(http.Handler) http.Handler {
	return AuthWith(AuthConfig{Mode: mode, CookieName: "fersaku_session"})
}

// AuthWith is the full session middleware.
func AuthWith(cfg AuthConfig) func(http.Handler) http.Handler {
	cookieName := cfg.CookieName
	if cookieName == "" {
		cookieName = "fersaku_session"
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := r.Context()
			if cfg.Resolver != nil {
				if c, err := r.Cookie(cookieName); err == nil && c.Value != "" {
					p, sess, err := cfg.Resolver.ResolveSession(ctx, c.Value)
					if err == nil {
						rp := reqctx.Principal{
							SubjectID:     p.UserID,
							SessionID:     p.SessionID,
							Surface:       string(p.Surface),
							Email:         p.Email,
							Name:          p.Name,
							Status:        string(p.Status),
							MFAEnabled:    p.MFAEnabled,
							MFAVerified:   p.MFAVerified,
							EmailVerified: p.EmailVerified,
							Permissions:   p.Permissions,
							RoleCodes:     p.RoleCodes,
						}
						if p.Impersonating {
							rp.Impersonating = true
							rp.ImpersonationID = p.ImpersonationID
							rp.ImpersonationScope = p.ImpersonationScope
							rp.ImpersonationActor = p.ImpersonationActor
							if !p.ImpersonationExpiry.IsZero() {
								rp.ImpersonationExpiry = p.ImpersonationExpiry.UTC().Format("2006-01-02T15:04:05.999999999Z07:00")
							}
						}
						ctx = reqctx.WithPrincipal(ctx, rp)
						ctx = reqctx.WithSessionMeta(ctx, reqctx.SessionMeta{
							ID:            sess.ID,
							TokenHash:     sess.TokenHash,
							CSRFTokenHash: sess.CSRFTokenHash,
							Surface:       string(sess.Surface),
							UserID:        sess.UserID,
						})
						// Raw CSRF is never loaded from DB (hash-only). Client obtains
						// raw via login/magic-link/issue body or GET /v1/auth/session rotation (INT-130).
					}
				}
			}
			if cfg.Mode == AuthModeRequired {
				if _, ok := reqctx.PrincipalFrom(ctx); !ok {
					presenters.WriteProblem(w, r, http.StatusUnauthorized,
						apperr.CodeAuthRequired, "Authentication required", nil)
					return
				}
			}
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// PrincipalFromContext returns the authenticated principal if present.
func PrincipalFromContext(ctx context.Context) (reqctx.Principal, bool) {
	return reqctx.PrincipalFrom(ctx)
}

// WithPrincipal stores a principal on the context (for tests).
func WithPrincipal(ctx context.Context, p reqctx.Principal) context.Context {
	return reqctx.WithPrincipal(ctx, p)
}

// AuthServiceResolver adapts application.AuthService.
type AuthServiceResolver struct {
	Svc *application.AuthService
}

func (a AuthServiceResolver) ResolveSession(ctx context.Context, rawToken string) (auth.Principal, auth.Session, error) {
	return a.Svc.ResolveSession(ctx, rawToken)
}
