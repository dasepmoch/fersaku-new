package handlers

import (
	"net/http"
	"strings"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/decode"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/presenters"
	"github.com/dasepmoch/fersaku-new/backend/internal/application"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/platform"
	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
)

// FeesHandler serves fee policy read + pure admin preview (BE-300).
// No publish/mutate endpoints exist; those return 404/405 via router.
type FeesHandler struct {
	Svc *application.FeeService
}

// GetPlatformFees is GET /v1/platform/fees — public active policy read.
func (h *FeesHandler) GetPlatformFees(w http.ResponseWriter, r *http.Request) {
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Fees unavailable"))
		return
	}
	p, err := h.Svc.ActivePolicy(r.Context())
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, feePolicyDTO(p))
}

// GetAdminSystemFees is GET /v1/admin/system/fees — same active policy (admin read).
func (h *FeesHandler) GetAdminSystemFees(w http.ResponseWriter, r *http.Request) {
	h.GetPlatformFees(w, r)
}

type feePreviewBody struct {
	Kind           string `json:"kind"`
	Amount         any    `json:"amount"`
	Gross          any    `json:"gross"` // alias for amount on transaction
	ProviderFee    any    `json:"providerFee"`
	ProviderFeeIDR any    `json:"providerFeeIdr"`
	Source         string `json:"source"`
}

// Preview is POST /v1/admin/system/fees/preview and POST /v1/admin/fees/preview.
// Pure calculator only — never persists or activates a policy.
func (h *FeesHandler) Preview(w http.ResponseWriter, r *http.Request) {
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Fees unavailable"))
		return
	}
	var body feePreviewBody
	if err := decode.DecodeJSON(r, &body); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	kind := strings.ToLower(strings.TrimSpace(body.Kind))
	amountRaw := body.Amount
	if amountRaw == nil {
		amountRaw = body.Gross
	}
	amount, err := parseMoneyField(amountRaw, "amount")
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	var provider int64
	if body.ProviderFee != nil || body.ProviderFeeIDR != nil {
		pf := body.ProviderFee
		if pf == nil {
			pf = body.ProviderFeeIDR
		}
		provider, err = parseMoneyField(pf, "providerFee")
		if err != nil {
			presenters.WriteAppError(w, r, err)
			return
		}
	}
	var src platform.PaymentSource
	switch strings.ToUpper(strings.TrimSpace(body.Source)) {
	case "QRIS_API", "QRIS":
		src = platform.SourceQRISAPI
	case "STOREFRONT", "":
		src = platform.SourceStorefront
	default:
		presenters.WriteAppError(w, r, apperr.Validation(apperr.CodeValidationFailed, "source must be STOREFRONT or QRIS_API"))
		return
	}
	res, err := h.Svc.Preview(r.Context(), application.PreviewRequest{
		Kind:           kind,
		AmountIDR:      amount,
		ProviderFeeIDR: provider,
		Source:         src,
	})
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, feePreviewDTO(res))
}

// RejectFeeMutation returns 405 for any fee publish/mutate attempt.
func RejectFeeMutation(w http.ResponseWriter, r *http.Request) {
	presenters.WriteProblem(w, r, http.StatusMethodNotAllowed,
		apperr.CodeMethodNotAllowed,
		"Fee policy mutation is not allowed; future changes require approved ADR and versioned migration",
		map[string]any{
			"policyVersion": platform.PolicyVersionLaunchV1,
			"path":          "ADR-0003",
		})
}

func feePolicyDTO(p platform.FeePolicy) map[string]any {
	out := map[string]any{
		"policyVersion":         p.VersionID,
		"scope":                 p.Scope,
		"transactionPercentBps": p.TransactionPercentBps,
		"transactionFixedIdr":   p.TransactionFixedIDR,
		"withdrawalPercentBps":  p.WithdrawalPercentBps,
		"minimumWithdrawalIdr":  p.MinimumWithdrawalIDR,
		"minimumPaymentIdr":     p.MinimumPaymentIDR,
		"maximumPaymentIdr":     p.MaximumPaymentIDR,
		"checksum":              p.Checksum,
		"immutable":             p.Immutable,
		"sourceAdr":             p.SourceADR,
		"currency":              platform.CurrencyIDR,
		"effectiveFrom":         p.EffectiveFrom.UTC().Format("2006-01-02T15:04:05Z07:00"),
		// Explicit: STOREFRONT and QRIS_API share this global rule; no merchant override.
		"appliesTo":               []string{string(platform.SourceStorefront), string(platform.SourceQRISAPI)},
		"merchantOverrideAllowed": false,
		"buyerSurchargeAllowed":   false,
		"adminMutationAllowed":    false,
	}
	if p.EffectiveTo != nil {
		out["effectiveTo"] = p.EffectiveTo.UTC().Format("2006-01-02T15:04:05Z07:00")
	}
	return out
}

func feePreviewDTO(res application.PreviewResult) map[string]any {
	out := map[string]any{
		"policyVersion": res.PolicyVersionID,
		"kind":          res.Kind,
		"currency":      platform.CurrencyIDR,
	}
	if res.Source != "" {
		out["source"] = res.Source
	}
	if res.Transaction != nil {
		t := res.Transaction
		out["amount"] = t.GrossIDR
		out["gross"] = t.GrossIDR
		out["platformFee"] = t.PercentComponentIDR
		out["processingFee"] = t.FixedComponentIDR
		out["totalFee"] = t.TotalFeeIDR
		out["netAmount"] = t.NetIDR
		out["transactionPercentBps"] = t.PercentBps
		out["transactionFixedIdr"] = t.FixedComponentIDR
	}
	if res.Withdrawal != nil {
		w := res.Withdrawal
		out["amount"] = w.AmountIDR
		out["platformFee"] = w.PlatformFeeIDR
		out["providerProcessingFee"] = w.ProviderFeeIDR
		out["totalFee"] = w.TotalFeeIDR
		out["netDisbursement"] = w.NetDisbursementIDR
		out["netAmount"] = w.NetDisbursementIDR
		out["minimumAmount"] = w.MinimumAmountIDR
		out["withdrawalPercentBps"] = w.PercentBps
	}
	return out
}
