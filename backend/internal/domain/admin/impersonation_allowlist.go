package admin

import (
	"regexp"
	"strings"
)

// SUPPORT_WRITE launch allowlist (§11.5 / ADR-0004) — exact two commands only:
//  1. PATCH /v1/buyer/profile — buyer.profile.support_update — displayName, locale, timezone
//  2. PATCH /v1/stores/{storeId} — store.presentation.support_update — name, description
//
// All other mutations are default-denied during impersonation.

const (
	CommandBuyerProfileSupportUpdate      = "buyer.profile.support_update"
	CommandStorePresentationSupportUpdate = "store.presentation.support_update"
)

// SupportWriteCommand describes one allowlisted mutation route/command/fields.
type SupportWriteCommand struct {
	Command        string
	Method         string
	// PathPattern is a chi-style path with {param} placeholders.
	PathPattern    string
	AllowedFields  []string
	// PathParam when set is extracted for ownership checks (e.g. storeId).
	PathParam      string
}

// SupportWriteAllowlist is the complete launch allowlist (exactly two entries).
var SupportWriteAllowlist = []SupportWriteCommand{
	{
		Command:       CommandBuyerProfileSupportUpdate,
		Method:        "PATCH",
		PathPattern:   "/v1/buyer/profile",
		AllowedFields: []string{"displayName", "locale", "timezone"},
	},
	{
		Command:       CommandStorePresentationSupportUpdate,
		Method:        "PATCH",
		PathPattern:   "/v1/stores/{storeId}",
		AllowedFields: []string{"name", "description"},
		PathParam:     "storeId",
	},
}

// mutationMethods are HTTP methods treated as mutations under impersonation.
var mutationMethods = map[string]struct{}{
	"POST":   {},
	"PUT":    {},
	"PATCH":  {},
	"DELETE": {},
}

// IsMutationMethod reports whether method is a state-changing verb.
func IsMutationMethod(method string) bool {
	_, ok := mutationMethods[strings.ToUpper(method)]
	return ok
}

// MatchSupportWrite finds an allowlist entry for method+path, or nil.
func MatchSupportWrite(method, path string) *SupportWriteCommand {
	method = strings.ToUpper(strings.TrimSpace(method))
	path = normalizePath(path)
	for i := range SupportWriteAllowlist {
		e := &SupportWriteAllowlist[i]
		if e.Method != method {
			continue
		}
		if matchPathPattern(e.PathPattern, path) {
			return e
		}
	}
	return nil
}

// ValidateSupportWriteFields rejects unknown/non-allowlisted JSON fields (no silent strip).
// expectedVersion and command are transport metadata and may be present.
func ValidateSupportWriteFields(cmd *SupportWriteCommand, fields map[string]any) error {
	if cmd == nil {
		return errSupportWriteDenied("route not allowlisted")
	}
	allowed := make(map[string]struct{}, len(cmd.AllowedFields)+2)
	for _, f := range cmd.AllowedFields {
		allowed[f] = struct{}{}
	}
	// Transport/meta fields permitted alongside allowlisted body fields.
	allowed["expectedVersion"] = struct{}{}
	allowed["command"] = struct{}{}

	if len(fields) == 0 {
		return errSupportWriteDenied("empty body")
	}
	// At least one allowlisted business field must be present.
	hasBusiness := false
	for k := range fields {
		if _, ok := allowed[k]; !ok {
			return errSupportWriteDenied("field not allowlisted: " + k)
		}
		for _, af := range cmd.AllowedFields {
			if k == af {
				hasBusiness = true
			}
		}
	}
	if !hasBusiness {
		return errSupportWriteDenied("no allowlisted fields present")
	}
	// If command is supplied it must match.
	if c, ok := fields["command"].(string); ok && c != "" && c != cmd.Command {
		return errSupportWriteDenied("command mismatch")
	}
	return nil
}

// PathParamValue extracts a named path param from path using the command pattern.
func PathParamValue(cmd *SupportWriteCommand, path string) string {
	if cmd == nil || cmd.PathParam == "" {
		return ""
	}
	return extractPathParam(cmd.PathPattern, normalizePath(path), cmd.PathParam)
}

// KnownMutationRegistry is used by default-deny tests: every registered mutation
// path that is not in SupportWriteAllowlist must be denied under impersonation.
// Handlers/routes add entries here so new mutations fail closed in tests until
// security explicitly allowlists them.
var KnownMutationRegistry = []struct {
	Method string
	Path   string
}{
	// Allowlisted (exactly two)
	{"PATCH", "/v1/buyer/profile"},
	{"PATCH", "/v1/stores/{storeId}"},
	// Explicitly denied examples (finance/KYC/credentials/auth/admin/products/inventory/delivery)
	{"POST", "/v1/stores/{storeId}/products"},
	{"PATCH", "/v1/stores/{storeId}/products/{productId}"},
	{"POST", "/v1/stores/{storeId}/products/{productId}/publish"},
	{"POST", "/v1/stores/{storeId}/inventory/products/{productId}/items"},
	{"POST", "/v1/stores/{storeId}/inventory/items/{itemId}/reveal"},
	{"POST", "/v1/stores/{storeId}/orders/{orderId}/delivery/resend"},
	{"POST", "/v1/stores/{storeId}/withdrawals"},
	{"POST", "/v1/stores/{storeId}/api-credential-requests"},
	{"POST", "/v1/stores/{storeId}/webhooks"},
	{"POST", "/v1/kyc/cases"},
	{"POST", "/v1/auth/password/change"},
	{"POST", "/v1/auth/mfa/disable"},
	{"POST", "/v1/admin/merchants/{merchantId}/status"},
	{"POST", "/v1/admin/actions"},
	{"POST", "/v1/admin/system/emergency-controls"},
	{"PATCH", "/v1/me/profile"},
	{"PATCH", "/v1/onboarding/store"},
	{"POST", "/v1/checkout/sessions"},
	{"POST", "/v1/gateway/payments"},
}

// IsAllowlistedMutation reports whether method+path is one of the two SUPPORT_WRITE routes.
func IsAllowlistedMutation(method, path string) bool {
	return MatchSupportWrite(method, path) != nil
}

// SupportWriteDenied is a typed validation error message helper.
type SupportWriteDenied struct {
	Msg string
}

func (e SupportWriteDenied) Error() string { return e.Msg }

func errSupportWriteDenied(msg string) error {
	return SupportWriteDenied{Msg: msg}
}

func normalizePath(p string) string {
	p = strings.TrimSpace(p)
	if p == "" {
		return "/"
	}
	if i := strings.IndexByte(p, '?'); i >= 0 {
		p = p[:i]
	}
	if !strings.HasPrefix(p, "/") {
		p = "/" + p
	}
	if len(p) > 1 && strings.HasSuffix(p, "/") {
		p = strings.TrimSuffix(p, "/")
	}
	return p
}

var pathParamRe = regexp.MustCompile(`\{[^/]+\}`)

func matchPathPattern(pattern, path string) bool {
	pattern = normalizePath(pattern)
	path = normalizePath(path)
	// Exact match for static patterns.
	if !strings.Contains(pattern, "{") {
		return pattern == path
	}
	// Convert {param} segments to single-segment wildcards.
	reStr := "^" + pathParamRe.ReplaceAllString(regexp.QuoteMeta(pattern), `[^/]+`) + "$"
	// QuoteMeta escapes braces already removed... rebuild carefully:
	parts := strings.Split(pattern, "/")
	var b strings.Builder
	b.WriteString("^")
	for i, part := range parts {
		if i > 0 {
			b.WriteString("/")
		}
		if part == "" {
			continue
		}
		if strings.HasPrefix(part, "{") && strings.HasSuffix(part, "}") {
			b.WriteString("[^/]+")
		} else {
			b.WriteString(regexp.QuoteMeta(part))
		}
	}
	b.WriteString("$")
	reStr = b.String()
	re, err := regexp.Compile(reStr)
	if err != nil {
		return false
	}
	return re.MatchString(path)
}

func extractPathParam(pattern, path, name string) string {
	pattern = normalizePath(pattern)
	path = normalizePath(path)
	pp := strings.Split(pattern, "/")
	pv := strings.Split(path, "/")
	if len(pp) != len(pv) {
		return ""
	}
	want := "{" + name + "}"
	for i := range pp {
		if pp[i] == want {
			return pv[i]
		}
	}
	return ""
}
