package stores

import (
	"encoding/json"
	"strings"
	"time"
)

// OnboardingState is the §5.2 state machine.
type OnboardingState string

const (
	StateNotStarted      OnboardingState = "NOT_STARTED"
	StateIdentity        OnboardingState = "IDENTITY"
	StateSlug            OnboardingState = "SLUG"
	StateVisual          OnboardingState = "VISUAL"
	StateProductOptional OnboardingState = "PRODUCT_OPTIONAL"
	StateComplete        OnboardingState = "COMPLETE"
)

// OnboardingStep mirrors the current wizard step (same enum as state for launch).
type OnboardingStep = OnboardingState

// Merchant is the onboarding-enriched tenant root.
type Merchant struct {
	ID                    string
	OwnerUserID           string
	DisplayName           string
	LegalName             string
	BusinessType          string
	Status                string
	OnboardingState       OnboardingState
	OnboardingStep        OnboardingState
	OnboardingCompletedAt *time.Time
	OnboardingProgress    json.RawMessage
	CreatedAt             time.Time
	UpdatedAt             time.Time
}

// Store is the mandatory canonical storefront anchor.
type Store struct {
	ID                    string
	MerchantID            string
	Slug                  string
	Name                  string
	Bio                   string
	Address               string
	AccentColor           string
	Status                string
	IsCanonical           bool
	OnboardingState       OnboardingState
	OnboardingStep        OnboardingState
	OnboardingCompletedAt *time.Time
	OnboardingProgress    json.RawMessage
	StorefrontRevision    int64
	PublishedRevision     int64
	CreatedAt             time.Time
	UpdatedAt             time.Time
}

// Progress is the GET /v1/onboarding projection.
type Progress struct {
	State           OnboardingState
	Step            OnboardingState
	Completed       bool
	CompletedAt     *time.Time
	MerchantID      string
	StoreID         string
	Store           *StoreSummary
	CanComplete     bool
	ProductOptional bool
	Progress        json.RawMessage
}

// StoreSummary is the store slice returned by onboarding endpoints.
type StoreSummary struct {
	ID          string `json:"storeId"`
	MerchantID  string `json:"merchantId"`
	Slug        string `json:"slug"`
	Name        string `json:"name"`
	Bio         string `json:"bio"`
	Address     string `json:"address"`
	AccentColor string `json:"accentColor"`
	Status      string `json:"status"`
	Canonical   bool   `json:"canonical"`
}

// HasIdentity reports whether store identity fields are sufficient to complete.
func HasIdentity(name, bio string) bool {
	n := strings.TrimSpace(name)
	b := strings.TrimSpace(bio)
	return len(n) > 2 && len(b) > 12
}

// CanCompleteOnboarding requires a canonical store with identity + valid slug.
// Product is optional.
func CanCompleteOnboarding(st *Store) bool {
	if st == nil || !st.IsCanonical {
		return false
	}
	if st.Status == "ARCHIVED" {
		return false
	}
	if err := ValidateNormalizedSlug(st.Slug); err != nil {
		return false
	}
	return HasIdentity(st.Name, st.Bio)
}

// NextStepAfterPatch advances the wizard based on filled fields.
func NextStepAfterPatch(st *Store) OnboardingState {
	if st == nil {
		return StateNotStarted
	}
	if !HasIdentity(st.Name, st.Bio) {
		return StateIdentity
	}
	if err := ValidateNormalizedSlug(st.Slug); err != nil {
		return StateSlug
	}
	// Visual is optional; after slug we land on visual then product optional.
	if st.AccentColor == "" && st.OnboardingStep != StateVisual && st.OnboardingStep != StateProductOptional && st.OnboardingState != StateComplete {
		// If caller already advanced past visual, keep product optional.
		if st.OnboardingState == StateProductOptional || st.OnboardingState == StateComplete {
			return st.OnboardingState
		}
	}
	if st.OnboardingState == StateComplete {
		return StateComplete
	}
	// After identity+slug, product step is optional — allow complete.
	if st.AccentColor != "" || st.OnboardingStep == StateVisual || st.OnboardingStep == StateProductOptional {
		return StateProductOptional
	}
	return StateVisual
}

// AdvanceState returns the highest valid state for filled data (non-complete).
func AdvanceState(st *Store) OnboardingState {
	if st == nil {
		return StateNotStarted
	}
	if st.OnboardingState == StateComplete {
		return StateComplete
	}
	return NextStepAfterPatch(st)
}
