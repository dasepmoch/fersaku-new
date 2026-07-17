package contract_test

import (
	"bufio"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strings"
	"testing"

	"gopkg.in/yaml.v3"
)

// INT-000: OpenAPI is the wire contract; production router mounts must not drift.

type openAPIDoc struct {
	OpenAPI    string                            `yaml:"openapi"`
	Paths      map[string]map[string]interface{} `yaml:"paths"`
	Components struct {
		Schemas         map[string]interface{} `yaml:"schemas"`
		SecuritySchemes map[string]interface{} `yaml:"securitySchemes"`
		Parameters      map[string]interface{} `yaml:"parameters"`
		Headers         map[string]interface{} `yaml:"headers"`
	} `yaml:"components"`
}

func repoRoot(t *testing.T) string {
	t.Helper()
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller failed")
	}
	// backend/test/contract -> backend -> repo
	return filepath.Clean(filepath.Join(filepath.Dir(file), "..", "..", ".."))
}

func loadOpenAPI(t *testing.T) openAPIDoc {
	t.Helper()
	path := filepath.Join(repoRoot(t), "backend", "api", "openapi.yaml")
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read openapi: %v", err)
	}
	var doc openAPIDoc
	if err := yaml.Unmarshal(raw, &doc); err != nil {
		t.Fatalf("parse openapi yaml: %v", err)
	}
	return doc
}

func canonPath(p string) string {
	if p != "/" && strings.HasSuffix(p, "/") {
		return strings.TrimRight(p, "/")
	}
	return p
}

func isHTTPMethod(m string) bool {
	switch strings.ToLower(m) {
	case "get", "post", "put", "patch", "delete", "head", "options", "trace":
		return true
	default:
		return false
	}
}

func openAPIOps(doc openAPIDoc) map[string]struct{} {
	out := make(map[string]struct{})
	for p, methods := range doc.Paths {
		for m, raw := range methods {
			if !isHTTPMethod(m) {
				continue
			}
			op, _ := raw.(map[string]interface{})
			if op == nil {
				continue
			}
			// x-internal still counted for mounted local routes; production drift uses inventory
			key := strings.ToUpper(m) + " " + canonPath(p)
			out[key] = struct{}{}
		}
	}
	return out
}

func loadRouterInventory(t *testing.T) map[string]struct{} {
	t.Helper()
	path := filepath.Join(filepath.Dir(mustCallerFile(t)), "router_inventory.txt")
	f, err := os.Open(path)
	if err != nil {
		t.Fatalf("open inventory: %v", err)
	}
	defer f.Close()
	out := make(map[string]struct{})
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, " ", 2)
		if len(parts) != 2 {
			t.Fatalf("bad inventory line: %q", line)
		}
		key := parts[0] + " " + canonPath(parts[1])
		out[key] = struct{}{}
	}
	if err := sc.Err(); err != nil {
		t.Fatal(err)
	}
	return out
}

func mustCallerFile(t *testing.T) string {
	t.Helper()
	return filepath.Join(repoRoot(t), "backend", "test", "contract", "openapi_contract_test.go")
}

func TestOpenAPIVersion303(t *testing.T) {
	doc := loadOpenAPI(t)
	if doc.OpenAPI != "3.0.3" {
		t.Fatalf("openapi version = %q, want 3.0.3 (no silent 3.1 upgrade)", doc.OpenAPI)
	}
}

func TestOperationIDsUniqueAndPresent(t *testing.T) {
	doc := loadOpenAPI(t)
	seen := map[string]string{}
	var missing []string
	for p, methods := range doc.Paths {
		for m, raw := range methods {
			if !isHTTPMethod(m) {
				continue
			}
			op, _ := raw.(map[string]interface{})
			if op == nil {
				continue
			}
			oid, _ := op["operationId"].(string)
			loc := strings.ToUpper(m) + " " + p
			if oid == "" {
				missing = append(missing, loc)
				continue
			}
			if prev, ok := seen[oid]; ok {
				t.Errorf("duplicate operationId %q: %s and %s", oid, prev, loc)
			}
			seen[oid] = loc
		}
	}
	if len(missing) > 0 {
		sort.Strings(missing)
		t.Fatalf("missing operationId on %d ops, e.g. %v", len(missing), missing[:min(5, len(missing))])
	}
	if len(seen) < 50 {
		t.Fatalf("suspiciously few operationIds: %d", len(seen))
	}
}

func TestEnvelopeAndSecuritySchemasPresent(t *testing.T) {
	doc := loadOpenAPI(t)
	needSchemas := []string{
		"SuccessEnvelope",
		"ProblemEnvelope",
		"CursorListMeta",
		"NumberedPageListMeta",
		"Meta",
		"FieldViolation",
		"MoneyIdr",
		"Rfc3339Timestamp",
	}
	for _, s := range needSchemas {
		if _, ok := doc.Components.Schemas[s]; !ok {
			t.Errorf("missing schema %s", s)
		}
	}
	needSec := []string{"sessionCookie", "merchantApiKey", "xenditCallbackToken", "capabilityToken"}
	for _, s := range needSec {
		if _, ok := doc.Components.SecuritySchemes[s]; !ok {
			t.Errorf("missing securityScheme %s", s)
		}
	}
	needParams := []string{
		"XRequestID", "XCSRFToken", "IdempotencyKey", "XAuditReason",
		"XRecentMFAProof", "IfMatch", "XCallbackToken",
	}
	for _, s := range needParams {
		if _, ok := doc.Components.Parameters[s]; !ok {
			t.Errorf("missing parameter %s", s)
		}
	}
	if _, ok := doc.Components.Headers["XRequestID"]; !ok {
		t.Error("missing header XRequestID")
	}
	if _, ok := doc.Components.Headers["RetryAfter"]; !ok {
		t.Error("missing header RetryAfter")
	}
}

func TestNoCookieAuthAlias(t *testing.T) {
	path := filepath.Join(repoRoot(t), "backend", "api", "openapi.yaml")
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(raw), "cookieAuth") {
		t.Fatal("openapi still references cookieAuth; standardize on sessionCookie")
	}
}

func TestRouterOpenAPIDrift(t *testing.T) {
	doc := loadOpenAPI(t)
	oa := openAPIOps(doc)
	router := loadRouterInventory(t)

	// Production routes that must appear in OpenAPI (all inventory entries that are real mounts).
	// Gateway HandleFunc wildcards are documented as base reject paths only.
	var missingInOA []string
	for key := range router {
		if _, ok := oa[key]; ok {
			continue
		}
		// Allow router trailing-slash-only if non-slash present in OA (already canon)
		missingInOA = append(missingInOA, key)
	}
	sort.Strings(missingInOA)

	// OpenAPI production claims not mounted: exclude x-internal explicit-rejection extras if not in inventory.
	var missingInRouter []string
	for p, methods := range doc.Paths {
		for m, raw := range methods {
			if !isHTTPMethod(m) {
				continue
			}
			op, _ := raw.(map[string]interface{})
			if op == nil {
				continue
			}
			// Explicit rejection / test-only may be documented without multi-method HandleFunc inventory parity.
			if internal, _ := op["x-internal"].(bool); internal {
				disp, _ := op["x-fersaku-disposition"].(string)
				if disp == "explicit-rejection" || disp == "test-only" {
					continue
				}
			}
			key := strings.ToUpper(m) + " " + canonPath(p)
			if _, ok := router[key]; !ok {
				missingInRouter = append(missingInRouter, key)
			}
		}
	}
	sort.Strings(missingInRouter)

	if len(missingInOA) > 0 {
		t.Errorf("production router routes missing from OpenAPI (%d):\n  %s",
			len(missingInOA), strings.Join(missingInOA[:min(40, len(missingInOA))], "\n  "))
	}
	if len(missingInRouter) > 0 {
		t.Errorf("OpenAPI production ops not in router inventory (%d):\n  %s",
			len(missingInRouter), strings.Join(missingInRouter[:min(40, len(missingInRouter))], "\n  "))
	}
}

func TestGoldenEnvelopeShapes(t *testing.T) {
	doc := loadOpenAPI(t)
	// SuccessEnvelope requires data + meta
	se, _ := doc.Components.Schemas["SuccessEnvelope"].(map[string]interface{})
	if se == nil {
		t.Fatal("SuccessEnvelope missing")
	}
	req, _ := se["required"].([]interface{})
	if !hasAll(req, "data", "meta") {
		t.Errorf("SuccessEnvelope.required = %v, want data+meta", req)
	}
	pe, _ := doc.Components.Schemas["ProblemEnvelope"].(map[string]interface{})
	if pe == nil {
		t.Fatal("ProblemEnvelope missing")
	}
	req, _ = pe["required"].([]interface{})
	if !hasAll(req, "problem") {
		t.Errorf("ProblemEnvelope.required = %v, want problem", req)
	}
	cm, _ := doc.Components.Schemas["CursorListMeta"].(map[string]interface{})
	if cm == nil {
		t.Fatal("CursorListMeta missing")
	}
	req, _ = cm["required"].([]interface{})
	if !hasAll(req, "requestId", "timestamp", "hasMore") {
		t.Errorf("CursorListMeta.required incomplete: %v", req)
	}
	nm, _ := doc.Components.Schemas["NumberedPageListMeta"].(map[string]interface{})
	if nm == nil {
		t.Fatal("NumberedPageListMeta missing")
	}
	req, _ = nm["required"].([]interface{})
	if !hasAll(req, "page", "pageSize", "totalCount", "pageCount") {
		t.Errorf("NumberedPageListMeta.required incomplete: %v", req)
	}
}

func hasAll(req []interface{}, names ...string) bool {
	set := map[string]bool{}
	for _, r := range req {
		if s, ok := r.(string); ok {
			set[s] = true
		}
	}
	for _, n := range names {
		if !set[n] {
			return false
		}
	}
	return true
}

func TestOpenAPIDeclaresGatewayAndXenditSurface(t *testing.T) {
	doc := loadOpenAPI(t)
	need := []string{
		"/v1/gateway/payment-intents",
		"/v1/qris/payments",
		"/v1/webhooks/xendit",
		"/v1/webhooks/xendit/sandbox",
		"/v1/webhooks/xendit/live",
		"/v1/webhooks/xendit/disbursement",
		"/v1/checkout/simulate-payment",
		"/v1/_scaffold/echo",
	}
	for _, p := range need {
		if _, ok := doc.Paths[p]; !ok {
			t.Errorf("missing path %s", p)
		}
	}
	// simulate-payment must be marked internal
	op, _ := doc.Paths["/v1/checkout/simulate-payment"]["post"].(map[string]interface{})
	if op == nil {
		t.Fatal("simulate-payment post missing")
	}
	if internal, _ := op["x-internal"].(bool); !internal {
		t.Error("simulate-payment must set x-internal: true")
	}
}

// Ensure inventory file stays in sync with a lightweight router.go scan for absolute /v1 mounts.
func TestInventoryCoversAbsoluteRouterMounts(t *testing.T) {
	routerPath := filepath.Join(repoRoot(t), "backend", "internal", "adapters", "http", "router.go")
	raw, err := os.ReadFile(routerPath)
	if err != nil {
		t.Fatal(err)
	}
	// Flatten multi-line .Post( after ).
	flat := regexp.MustCompile(`\)\s*\.\s*\n\s*`).ReplaceAllString(string(raw), ").")
	re := regexp.MustCompile(`\.(Get|Post|Put|Patch|Delete)\("(/(?:v1|health|metrics)[^"]*)"`)
	inv := loadRouterInventory(t)
	var missing []string
	for _, m := range re.FindAllStringSubmatch(flat, -1) {
		key := strings.ToUpper(m[1]) + " " + canonPath(m[2])
		if _, ok := inv[key]; !ok {
			missing = append(missing, key)
		}
	}
	if len(missing) > 0 {
		sort.Strings(missing)
		t.Fatalf("router_inventory.txt missing absolute mounts (%d): %v", len(missing), missing)
	}
}
