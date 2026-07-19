// Package duitku contract freeze (GAP-01 P0).
// Source of truth verified against https://docs.duitku.com/api/id/ on 2026-07-20.
// MD5 signatures are obsolete per provider docs; live path uses HMAC-SHA256 only.
package duitku

import (
	"fmt"
	"net/url"
	"strings"
)

const (
	// DocVerifiedURL is the public API reference used for this contract freeze.
	DocVerifiedURL = "https://docs.duitku.com/api/id/"
	// DocVerifiedDate is the verification date (Asia/Jakarta calendar day).
	DocVerifiedDate = "2026-07-20"

	// ProductionBaseURL is the live merchant API host (passport).
	ProductionBaseURL = "https://passport.duitku.com"
	// SandboxBaseURL is the development merchant API host.
	SandboxBaseURL = "https://sandbox.duitku.com"

	pathInquiry           = "/webapi/api/merchant/v2/inquiry"
	pathTransactionStatus = "/webapi/api/merchant/transactionStatus"

	defaultPaymentMethod = "SP"
	defaultAccountScope  = "duitku-primary"
	defaultHTTPTimeout   = 15 // seconds

	// ContentTypeJSON is used for inquiry and transactionStatus requests.
	ContentTypeJSON = "application/json"
	// CallbackContentType is the provider callback body type (form-urlencoded).
	// JSON bodies are accepted only as a parser compatibility path.
	CallbackContentType = "application/x-www-form-urlencoded"

	// CallbackAckBody is the HTTP 200 response body on accepted callback.
	// Provider requires HTTP 200; SUCCESS matches active API samples/changelog practice.
	CallbackAckBody = "SUCCESS"
	// CallbackRejectBody is returned on rejected callback (non-retry-friendly).
	CallbackRejectBody = "FAILED"

	EnvSandbox    = "sandbox"
	EnvProduction = "production"
)

// AllowedHosts are the only merchant API hosts permitted for live adapter traffic.
var AllowedHosts = map[string]string{
	"sandbox.duitku.com":  EnvSandbox,
	"passport.duitku.com": EnvProduction,
}

// ResolveBaseURL returns the effective base URL for env.
// Empty baseURL selects the documented default for env (production → passport, else sandbox).
// Explicit baseURL must be HTTPS and host-allowlisted, and must match env when env is set.
func ResolveBaseURL(env, baseURL string) (string, error) {
	env = strings.ToLower(strings.TrimSpace(env))
	baseURL = strings.TrimSpace(baseURL)

	if baseURL == "" {
		switch env {
		case "", EnvSandbox:
			return SandboxBaseURL, nil
		case EnvProduction:
			return ProductionBaseURL, nil
		default:
			return "", fmt.Errorf("duitku: env must be sandbox|production, got %q", env)
		}
	}

	u, err := url.Parse(baseURL)
	if err != nil {
		return "", fmt.Errorf("duitku: invalid base URL: %w", err)
	}
	if !strings.EqualFold(u.Scheme, "https") && !isLoopbackTestHost(u.Host) {
		return "", fmt.Errorf("duitku: base URL must use https")
	}
	host := strings.ToLower(u.Hostname())
	if host == "" {
		return "", fmt.Errorf("duitku: base URL host required")
	}

	// httptest / local integration stubs use loopback; allow without env host match.
	if isLoopbackTestHost(u.Host) {
		return strings.TrimRight(baseURL, "/"), nil
	}

	hostEnv, ok := AllowedHosts[host]
	if !ok {
		return "", fmt.Errorf("duitku: base URL host %q is not allowlisted", host)
	}
	if env != "" && env != hostEnv {
		return "", fmt.Errorf("duitku: DUITKU_ENV=%s incompatible with host %s", env, host)
	}
	return strings.TrimRight(baseURL, "/"), nil
}

// ValidateAppEnvCoherence fails closed when APP_ENV and Duitku endpoints disagree.
// production APP_ENV must never select sandbox host/env; sandbox/staging must not use passport.
func ValidateAppEnvCoherence(appEnv, duitkuEnv, baseURL, callbackURL, returnURL string) error {
	appEnv = strings.ToLower(strings.TrimSpace(appEnv))
	duitkuEnv = strings.ToLower(strings.TrimSpace(duitkuEnv))
	baseURL = strings.TrimSpace(baseURL)

	effectiveEnv := duitkuEnv
	if effectiveEnv == "" {
		if appEnv == "production" {
			effectiveEnv = EnvProduction
		} else {
			effectiveEnv = EnvSandbox
		}
	}

	resolved, err := ResolveBaseURL(effectiveEnv, baseURL)
	if err != nil {
		return err
	}

	host := hostOf(resolved)
	switch appEnv {
	case "production":
		if effectiveEnv == EnvSandbox {
			return fmt.Errorf("duitku: sandbox env forbidden when APP_ENV=production")
		}
		if host == "sandbox.duitku.com" {
			return fmt.Errorf("duitku: sandbox base URL forbidden when APP_ENV=production")
		}
		if baseURL == "" && host != "passport.duitku.com" {
			return fmt.Errorf("duitku: production without explicit base URL must resolve to passport.duitku.com")
		}
	case "staging":
		if host == "passport.duitku.com" && effectiveEnv != EnvProduction {
			// staging may use production Duitku only when DUITKU_ENV=production explicitly.
			return fmt.Errorf("duitku: passport host requires DUITKU_ENV=production")
		}
	}

	if err := validatePublicURL("DUITKU_CALLBACK_URL", callbackURL, appEnv); err != nil {
		return err
	}
	if err := validatePublicURL("DUITKU_RETURN_URL", returnURL, appEnv); err != nil {
		return err
	}
	return nil
}

func validatePublicURL(name, raw, appEnv string) error {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	u, err := url.Parse(raw)
	if err != nil {
		return fmt.Errorf("duitku: %s invalid URL", name)
	}
	if appEnv == "production" || appEnv == "staging" {
		if !strings.EqualFold(u.Scheme, "https") {
			return fmt.Errorf("duitku: %s must use https on %s", name, appEnv)
		}
	}
	return nil
}

func hostOf(raw string) string {
	u, err := url.Parse(raw)
	if err != nil {
		return ""
	}
	return strings.ToLower(u.Hostname())
}

func isLoopbackTestHost(host string) bool {
	h := strings.ToLower(host)
	if i := strings.Index(h, ":"); i >= 0 {
		h = h[:i]
	}
	return h == "127.0.0.1" || h == "localhost" || h == "::1"
}
