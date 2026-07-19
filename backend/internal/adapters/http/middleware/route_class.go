package middleware

import (
	"net/http"
	"strings"
)

// RouteClass is a rate-limit budget class. Separate Redis keys so health/auth/checkout
// do not share a single global IP bucket.
type RouteClass string

const (
	RouteClassHealth   RouteClass = "health"
	RouteClassPublic   RouteClass = "public"
	RouteClassAuth     RouteClass = "auth"
	RouteClassMutation RouteClass = "mutation"
	RouteClassAdmin    RouteClass = "admin"
	RouteClassCallback RouteClass = "callback"
	RouteClassGateway  RouteClass = "gateway"
	RouteClassDefault  RouteClass = "default"
)

// ClassifyRoute maps path to a rate-limit route class (no raw headers).
func ClassifyRoute(path string) RouteClass {
	if path == "" {
		return RouteClassDefault
	}
	// Normalize trailing slash for matching only.
	p := path
	if len(p) > 1 && strings.HasSuffix(p, "/") {
		p = strings.TrimSuffix(p, "/")
	}

	switch {
	case p == "/health/live", p == "/health/ready", p == "/metrics":
		return RouteClassHealth
	case strings.HasPrefix(p, "/v1/webhooks/"):
		return RouteClassCallback
	case strings.HasPrefix(p, "/v1/gateway/"), strings.HasPrefix(p, "/v1/qris/"):
		return RouteClassGateway
	case strings.HasPrefix(p, "/v1/admin"):
		return RouteClassAdmin
	case strings.HasPrefix(p, "/v1/auth"):
		return RouteClassAuth
	case isMutationCheckoutPath(p):
		return RouteClassMutation
	case strings.HasPrefix(p, "/v1/public/"), p == "/v1/status",
		strings.HasPrefix(p, "/v1/platform/"),
		strings.HasPrefix(p, "/v1/stores/slug-availability"),
		strings.HasPrefix(p, "/v1/invoices/verify"):
		return RouteClassPublic
	default:
		// Authenticated seller/buyer/me surfaces share a moderate default budget.
		if strings.HasPrefix(p, "/v1/") {
			return RouteClassDefault
		}
		return RouteClassPublic
	}
}

func isMutationCheckoutPath(p string) bool {
	if strings.HasPrefix(p, "/v1/checkout") {
		return true
	}
	// Money mutations that must not share health/auth buckets.
	if strings.Contains(p, "/withdrawals") || strings.Contains(p, "/withdrawal-quotes") {
		return true
	}
	if strings.HasPrefix(p, "/v1/orders/") && (strings.Contains(p, "/delivery") || strings.HasSuffix(p, "/invoice")) {
		return true
	}
	return false
}

// ClassifyRequest is a convenience wrapper.
func ClassifyRequest(r *http.Request) RouteClass {
	if r == nil || r.URL == nil {
		return RouteClassDefault
	}
	return ClassifyRoute(r.URL.Path)
}
