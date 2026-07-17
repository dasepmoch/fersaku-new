package handlers

import (
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/decode"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/presenters"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/reqctx"
	"github.com/dasepmoch/fersaku-new/backend/internal/application"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/domains"
	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
)

// DomainHandler serves seller domain CRUD and public host-resolve (BE-240).
type DomainHandler struct {
	Svc *application.DomainService
}

func (h *DomainHandler) List(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Domains unavailable"))
		return
	}
	items, err := h.Svc.ListDomains(r.Context(), p.SubjectID, chi.URLParam(r, "storeId"))
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	out := make([]map[string]any, 0, len(items))
	for _, d := range items {
		out = append(out, domainDTO(d, ""))
	}
	presenters.WriteData(w, r, http.StatusOK, out)
}

func (h *DomainHandler) Create(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Domains unavailable"))
		return
	}
	var body struct {
		Hostname string `json:"hostname"`
	}
	if err := decode.DecodeJSON(r, &body); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	res, err := h.Svc.CreateDomain(r.Context(), p.SubjectID, chi.URLParam(r, "storeId"), application.CreateDomainInput{
		Hostname: body.Hostname,
	})
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusCreated, domainDTO(res.Domain, res.VerificationToken))
}

func (h *DomainHandler) Get(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Domains unavailable"))
		return
	}
	d, err := h.Svc.GetDomain(r.Context(), p.SubjectID, chi.URLParam(r, "storeId"), chi.URLParam(r, "domainId"))
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, domainDTO(d, ""))
}

func (h *DomainHandler) Verify(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Domains unavailable"))
		return
	}
	var body struct {
		VerificationToken string `json:"verificationToken"`
		ExpectedVersion   *int32 `json:"expectedVersion"`
	}
	if err := decode.DecodeJSON(r, &body); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	d, err := h.Svc.VerifyDomain(
		r.Context(),
		p.SubjectID,
		chi.URLParam(r, "storeId"),
		chi.URLParam(r, "domainId"),
		body.VerificationToken,
		body.ExpectedVersion,
	)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, domainDTO(d, ""))
}

func (h *DomainHandler) Delete(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Domains unavailable"))
		return
	}
	var expectedVersion *int32
	if r.ContentLength != 0 && r.Body != nil && r.Header.Get("Content-Type") != "" {
		var body struct {
			ExpectedVersion *int32 `json:"expectedVersion"`
		}
		if err := decode.DecodeJSON(r, &body); err == nil {
			expectedVersion = body.ExpectedVersion
		}
	}
	d, err := h.Svc.DeleteDomain(
		r.Context(),
		p.SubjectID,
		chi.URLParam(r, "storeId"),
		chi.URLParam(r, "domainId"),
		expectedVersion,
	)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, domainDTO(d, ""))
}

// HostResolve is GET /v1/public/host-resolve?host=
func (h *DomainHandler) HostResolve(w http.ResponseWriter, r *http.Request) {
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Domains unavailable"))
		return
	}
	host := strings.TrimSpace(r.URL.Query().Get("host"))
	if host == "" {
		host = r.Host
	}
	res, err := h.Svc.ResolveHost(r.Context(), host)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, map[string]any{
		"hostname":   res.HostnameNormalized,
		"storeId":    res.StoreID,
		"merchantId": res.MerchantID,
		"domainId":   res.DomainID,
		"slug":       res.Slug,
		"storeName":  res.StoreName,
	})
}

func domainDTO(d domains.Domain, oneTimeToken string) map[string]any {
	m := map[string]any{
		"id":                 d.ID,
		"storeId":            d.StoreID,
		"merchantId":         d.MerchantID,
		"hostname":           d.HostnameDisplay,
		"hostnameNormalized": d.HostnameNormalized,
		"status":             d.Status,
		"tlsStatus":          d.TLSStatus,
		"version":            d.Version,
		"expectedDnsName":    d.ExpectedDNSName,
		"createdAt":          d.CreatedAt.UTC().Format(time.RFC3339Nano),
		"updatedAt":          d.UpdatedAt.UTC().Format(time.RFC3339Nano),
	}
	if oneTimeToken != "" {
		m["verificationToken"] = oneTimeToken
	}
	if d.FailureCode != nil {
		m["failureCode"] = *d.FailureCode
	}
	if d.LastCheckedAt != nil {
		m["lastCheckedAt"] = d.LastCheckedAt.UTC().Format(time.RFC3339Nano)
	}
	if d.VerifiedAt != nil {
		m["verifiedAt"] = d.VerifiedAt.UTC().Format(time.RFC3339Nano)
	}
	if d.CooldownUntil != nil {
		m["cooldownUntil"] = d.CooldownUntil.UTC().Format(time.RFC3339Nano)
	}
	// Never expose verification_token_hash.
	return m
}
