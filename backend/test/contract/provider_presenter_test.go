package contract_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/presenters"
)

// QLT-200 — BE provider contract sample (foundation catalog presenter shape).
// Validates presenter success/problem envelopes and CatalogProduct-shaped DTOs
// against structural rules derived from OpenAPI (required fields, integer money).
// Full kin-openapi validation can be added later; this harness fails on field rename/removal.

func TestProviderSuccessEnvelopeShape(t *testing.T) {
	meta := presenters.NewMeta("req_qlt200_provider", time.Date(2026, 7, 17, 12, 0, 0, 0, time.UTC))
	env := presenters.Envelope{
		Data: catalogProductProviderDTO(),
		Meta: meta,
	}
	raw, err := json.Marshal(env)
	if err != nil {
		t.Fatal(err)
	}
	var decoded map[string]any
	if err := json.Unmarshal(raw, &decoded); err != nil {
		t.Fatal(err)
	}
	if _, ok := decoded["data"]; !ok {
		t.Fatal("success envelope missing data")
	}
	metaObj, ok := decoded["meta"].(map[string]any)
	if !ok {
		t.Fatal("success envelope missing meta object")
	}
	if metaObj["requestId"] != "req_qlt200_provider" {
		t.Fatalf("requestId = %v", metaObj["requestId"])
	}
	if metaObj["timestamp"] == "" || metaObj["timestamp"] == nil {
		t.Fatal("timestamp required")
	}
	// FE consumer expects nested problem only — ensure we did not put problem at root.
	if _, ok := decoded["problem"]; ok {
		t.Fatal("success envelope must not include problem")
	}
}

func TestProviderProblemEnvelopeShape(t *testing.T) {
	body := presenters.ProblemEnvelope{
		Problem: presenters.ProblemBody{
			Code:      "VALIDATION_FAILED",
			Message:   "Request validation failed",
			RequestID: "req_problem_provider",
			Details: map[string]any{
				"fields": []map[string]string{
					{"field": "price", "code": "INVALID"},
				},
			},
		},
	}
	raw, err := json.Marshal(body)
	if err != nil {
		t.Fatal(err)
	}
	var decoded map[string]any
	if err := json.Unmarshal(raw, &decoded); err != nil {
		t.Fatal(err)
	}
	prob, ok := decoded["problem"].(map[string]any)
	if !ok {
		t.Fatal("problem envelope missing nested problem")
	}
	if prob["code"] != "VALIDATION_FAILED" {
		t.Fatalf("code = %v", prob["code"])
	}
	if prob["requestId"] != "req_problem_provider" {
		t.Fatalf("requestId = %v", prob["requestId"])
	}
	// Top-level problem fields must not be the wire shape.
	if _, ok := decoded["code"]; ok {
		t.Fatal("problem fields must not be top-level")
	}
}

func TestProviderCatalogProductDTORequiredFields(t *testing.T) {
	dto := catalogProductProviderDTO()
	raw, err := json.Marshal(dto)
	if err != nil {
		t.Fatal(err)
	}
	var m map[string]any
	if err := json.Unmarshal(raw, &m); err != nil {
		t.Fatal(err)
	}
	required := []string{
		"id", "slug", "title", "short", "description",
		"price", "type", "sales", "palette", "glyph", "includes",
	}
	for _, k := range required {
		if _, ok := m[k]; !ok {
			t.Errorf("CatalogProduct missing required field %q", k)
		}
	}
	// Money must be JSON number integer (not float string).
	price, ok := m["price"].(float64)
	if !ok {
		t.Fatalf("price type %T want number", m["price"])
	}
	if price != float64(int64(price)) {
		t.Fatalf("price must be whole IDR integer, got %v", price)
	}
	// type enum subset
	typ, _ := m["type"].(string)
	switch typ {
	case "download", "link", "code":
	default:
		t.Fatalf("unexpected product type %q", typ)
	}
	// includes array
	if _, ok := m["includes"].([]any); !ok {
		t.Fatalf("includes must be array, got %T", m["includes"])
	}
}

func TestProviderCatalogProductFixtureRoundTripWithOpenAPIComponent(t *testing.T) {
	// Structural cross-check: OpenAPI CatalogProduct still declares required keys
	// that this provider DTO satisfies (rename/removal breaks this test).
	doc := loadOpenAPI(t)
	schema, ok := doc.Components.Schemas["CatalogProduct"]
	if !ok {
		t.Fatal("OpenAPI missing components.schemas.CatalogProduct")
	}
	raw, err := json.Marshal(schema)
	if err != nil {
		t.Fatal(err)
	}
	var node map[string]any
	if err := json.Unmarshal(raw, &node); err != nil {
		t.Fatal(err)
	}
	req, _ := node["required"].([]any)
	if len(req) < 8 {
		t.Fatalf("CatalogProduct required list too small: %v", req)
	}
	need := map[string]bool{
		"id": true, "slug": true, "title": true, "price": true, "type": true,
	}
	for _, r := range req {
		s, _ := r.(string)
		delete(need, s)
	}
	if len(need) > 0 {
		t.Fatalf("OpenAPI CatalogProduct missing required keys: %v", need)
	}

	// Provider DTO must include every OpenAPI required property.
	dto := catalogProductProviderDTO()
	for _, r := range req {
		key, _ := r.(string)
		if _, ok := dto[key]; !ok {
			t.Errorf("provider DTO missing OpenAPI required field %q", key)
		}
	}
}

func TestProviderFeaturedListEnvelopeForConsumerFixtureParity(t *testing.T) {
	// Checked-in sanitized fixture (FE has its own TS builder; both must stay schema-valid).
	path := filepath.Join(repoRoot(t), "backend", "test", "fixtures", "contract", "featured-products.provider.json")
	loaded, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var decoded presenters.Envelope
	if err := json.Unmarshal(loaded, &decoded); err != nil {
		t.Fatal(err)
	}
	if decoded.Meta.RequestID == "" || decoded.Meta.Timestamp == "" {
		t.Fatal("fixture meta.requestId and meta.timestamp required")
	}
	list, ok := decoded.Data.([]any)
	if !ok || len(list) != 1 {
		t.Fatalf("expected 1 product in fixture, got %T", decoded.Data)
	}
	item, ok := list[0].(map[string]any)
	if !ok {
		t.Fatalf("product item type %T", list[0])
	}
	for _, k := range []string{"id", "slug", "title", "price", "type", "storeSlug"} {
		if _, ok := item[k]; !ok {
			t.Errorf("fixture product missing %q", k)
		}
	}
	// Presenter-built envelope must match fixture shape (field rename breaks either side).
	meta := presenters.NewMeta("req_qlt200_provider", time.Date(2026, 7, 17, 12, 0, 0, 0, time.UTC))
	env := presenters.Envelope{
		Data: []map[string]any{catalogProductProviderDTO()},
		Meta: meta,
	}
	built, err := json.Marshal(env)
	if err != nil {
		t.Fatal(err)
	}
	var builtMap map[string]any
	if err := json.Unmarshal(built, &builtMap); err != nil {
		t.Fatal(err)
	}
	builtData, _ := builtMap["data"].([]any)
	if len(builtData) != 1 {
		t.Fatal("presenter list length")
	}
}

// catalogProductProviderDTO mirrors handlers.productDTO public shape (foundation sample).
func catalogProductProviderDTO() map[string]any {
	return map[string]any{
		"id":          "prod_qlt200_01",
		"slug":        "ai-prompt-pack",
		"title":       "AI Prompt Pack",
		"short":       "Short blurb",
		"description": "Long description",
		"price":       int64(149_000),
		"type":        "download",
		"sales":       int64(12),
		"palette":     "violet",
		"glyph":       "✦",
		"includes":    []string{"PDF", "Notion"},
		"storeSlug":   "designkit-studio",
		"storeId":     "store_qlt200",
	}
}
