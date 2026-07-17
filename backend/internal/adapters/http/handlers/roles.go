package handlers

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/decode"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/presenters"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/reqctx"
	"github.com/dasepmoch/fersaku-new/backend/internal/application"
	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
)

// RolesHandler serves admin role/assignment/invitation routes (BE-135).
type RolesHandler struct {
	Authz *application.AuthzService
}

func (h *RolesHandler) actorID(r *http.Request) (string, error) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		return "", apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required")
	}
	return p.SubjectID, nil
}

func roleDTO(rp application.RoleWithPermissions) map[string]any {
	r := rp.Role
	out := map[string]any{
		"id":          r.ID,
		"code":        r.Code,
		"name":        r.Name,
		"description": r.Description,
		"isSystem":    r.IsSystem,
		"version":     r.Version,
		"permissions": rp.Permissions,
		"createdAt":   r.CreatedAt.UTC().Format(time.RFC3339),
		"updatedAt":   r.UpdatedAt.UTC().Format(time.RFC3339),
	}
	if r.ArchivedAt != nil {
		out["archivedAt"] = r.ArchivedAt.UTC().Format(time.RFC3339)
	}
	return out
}

// ListPermissions is GET /v1/admin/permissions
func (h *RolesHandler) ListPermissions(w http.ResponseWriter, r *http.Request) {
	actor, err := h.actorID(r)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	perms, err := h.Authz.ListPermissions(r.Context(), actor)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	items := make([]map[string]any, 0, len(perms))
	for _, p := range perms {
		items = append(items, map[string]any{
			"code":        p.Code,
			"description": p.Description,
			"category":    p.Category,
		})
	}
	presenters.WriteData(w, r, http.StatusOK, map[string]any{"items": items})
}

// ListRoles is GET /v1/admin/roles
func (h *RolesHandler) ListRoles(w http.ResponseWriter, r *http.Request) {
	actor, err := h.actorID(r)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	includeArchived := r.URL.Query().Get("includeArchived") == "true"
	roles, err := h.Authz.ListRoles(r.Context(), actor, includeArchived)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	items := make([]map[string]any, 0, len(roles))
	for _, role := range roles {
		items = append(items, roleDTO(role))
	}
	presenters.WriteData(w, r, http.StatusOK, map[string]any{"items": items})
}

// GetRole is GET /v1/admin/roles/{id}
func (h *RolesHandler) GetRole(w http.ResponseWriter, r *http.Request) {
	actor, err := h.actorID(r)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	rp, err := h.Authz.GetRole(r.Context(), actor, chi.URLParam(r, "id"))
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, roleDTO(rp))
}

// CreateRole is POST /v1/admin/roles
func (h *RolesHandler) CreateRole(w http.ResponseWriter, r *http.Request) {
	actor, err := h.actorID(r)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	var body struct {
		Code        string   `json:"code"`
		Name        string   `json:"name"`
		Description string   `json:"description"`
		Permissions []string `json:"permissions"`
	}
	if err := decode.DecodeJSON(r, &body); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	rp, err := h.Authz.CreateCustomRole(r.Context(), application.CreateRoleInput{
		ActorUserID: actor,
		Code:        body.Code,
		Name:        body.Name,
		Description: body.Description,
		Permissions: body.Permissions,
	})
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusCreated, roleDTO(rp))
}

// UpdateRole is PATCH /v1/admin/roles/{id}
func (h *RolesHandler) UpdateRole(w http.ResponseWriter, r *http.Request) {
	actor, err := h.actorID(r)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	var body struct {
		ExpectedVersion int64     `json:"expectedVersion"`
		Name            string    `json:"name"`
		Description     string    `json:"description"`
		Permissions     *[]string `json:"permissions"`
	}
	if err := decode.DecodeJSON(r, &body); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	in := application.UpdateRoleInput{
		ActorUserID:     actor,
		RoleID:          chi.URLParam(r, "id"),
		ExpectedVersion: body.ExpectedVersion,
		Name:            body.Name,
		Description:     body.Description,
	}
	if body.Permissions != nil {
		in.Permissions = *body.Permissions
	}
	rp, err := h.Authz.UpdateCustomRole(r.Context(), in)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, roleDTO(rp))
}

// ArchiveRole is POST /v1/admin/roles/{id}/archive
func (h *RolesHandler) ArchiveRole(w http.ResponseWriter, r *http.Request) {
	actor, err := h.actorID(r)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	var body struct {
		ExpectedVersion int64 `json:"expectedVersion"`
	}
	if err := decode.DecodeJSON(r, &body); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	role, err := h.Authz.ArchiveCustomRole(r.Context(), application.ArchiveRoleInput{
		ActorUserID:     actor,
		RoleID:          chi.URLParam(r, "id"),
		ExpectedVersion: body.ExpectedVersion,
	})
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, map[string]any{
		"id":      role.ID,
		"code":    role.Code,
		"version": role.Version,
		"archivedAt": func() any {
			if role.ArchivedAt == nil {
				return nil
			}
			return role.ArchivedAt.UTC().Format(time.RFC3339)
		}(),
	})
}

// GetRolePermissions is GET /v1/admin/roles/{id}/permissions
func (h *RolesHandler) GetRolePermissions(w http.ResponseWriter, r *http.Request) {
	actor, err := h.actorID(r)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	rp, err := h.Authz.GetRole(r.Context(), actor, chi.URLParam(r, "id"))
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, map[string]any{
		"roleId":      rp.Role.ID,
		"permissions": rp.Permissions,
		"version":     rp.Role.Version,
	})
}

// PutRolePermissions is PUT /v1/admin/roles/{id}/permissions
func (h *RolesHandler) PutRolePermissions(w http.ResponseWriter, r *http.Request) {
	actor, err := h.actorID(r)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	var body struct {
		ExpectedVersion int64    `json:"expectedVersion"`
		Permissions     []string `json:"permissions"`
	}
	if err := decode.DecodeJSON(r, &body); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	rp, err := h.Authz.UpdateCustomRole(r.Context(), application.UpdateRoleInput{
		ActorUserID:     actor,
		RoleID:          chi.URLParam(r, "id"),
		ExpectedVersion: body.ExpectedVersion,
		Permissions:     body.Permissions,
	})
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, roleDTO(rp))
}

// ListUserRoles is GET /v1/admin/users/{id}/roles
func (h *RolesHandler) ListUserRoles(w http.ResponseWriter, r *http.Request) {
	actor, err := h.actorID(r)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	rows, err := h.Authz.ListUserRoleAssignments(r.Context(), actor, chi.URLParam(r, "id"))
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	items := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		item := map[string]any{
			"userId":     row.UserID,
			"roleId":     row.RoleID,
			"roleCode":   row.RoleCode,
			"roleName":   row.RoleName,
			"isSystem":   row.IsSystem,
			"assignedAt": row.AssignedAt.UTC().Format(time.RFC3339),
		}
		if row.AssignedBy != nil {
			item["assignedBy"] = *row.AssignedBy
		}
		items = append(items, item)
	}
	presenters.WriteData(w, r, http.StatusOK, map[string]any{"items": items})
}

// AssignUserRole is POST /v1/admin/users/{id}/roles
func (h *RolesHandler) AssignUserRole(w http.ResponseWriter, r *http.Request) {
	actor, err := h.actorID(r)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	var body struct {
		RoleID string `json:"roleId"`
	}
	if err := decode.DecodeJSON(r, &body); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	if err := h.Authz.AssignUserRoleWithPolicy(r.Context(), application.AssignRoleInput{
		ActorUserID:  actor,
		TargetUserID: chi.URLParam(r, "id"),
		RoleID:       body.RoleID,
	}); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, map[string]any{"assigned": true})
}

// RemoveUserRole is DELETE /v1/admin/users/{id}/roles/{roleId}
func (h *RolesHandler) RemoveUserRole(w http.ResponseWriter, r *http.Request) {
	actor, err := h.actorID(r)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	if err := h.Authz.RemoveUserRoleWithPolicy(r.Context(), application.RemoveRoleInput{
		ActorUserID:  actor,
		TargetUserID: chi.URLParam(r, "id"),
		RoleID:       chi.URLParam(r, "roleId"),
	}); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, map[string]any{"removed": true})
}

// CreateStaffInvitation is POST /v1/admin/invitations/staff and /v1/admin/staff-invitations
func (h *RolesHandler) CreateStaffInvitation(w http.ResponseWriter, r *http.Request) {
	actor, err := h.actorID(r)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	var body struct {
		Email          string `json:"email"`
		RoleID         string `json:"roleId"`
		IdempotencyKey string `json:"idempotencyKey"`
	}
	if err := decode.DecodeJSON(r, &body); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	// Prefer Idempotency-Key header
	if k := r.Header.Get("Idempotency-Key"); k != "" && body.IdempotencyKey == "" {
		body.IdempotencyKey = k
	}
	inv, raw, err := h.Authz.CreateStaffInvitation(r.Context(), application.CreateStaffInviteInput{
		ActorUserID:    actor,
		Email:          body.Email,
		RoleID:         body.RoleID,
		IdempotencyKey: body.IdempotencyKey,
	})
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	data := map[string]any{
		"id":        inv.ID,
		"email":     inv.EmailDisplay,
		"roleId":    inv.RoleID,
		"status":    string(inv.Status),
		"expiresAt": inv.ExpiresAt.UTC().Format(time.RFC3339),
		"createdAt": inv.CreatedAt.UTC().Format(time.RFC3339),
	}
	if raw != "" {
		data["token"] = raw // delivered once; email also carries fragment form
	}
	presenters.WriteData(w, r, http.StatusCreated, data)
}

// ListStaffInvitations is GET /v1/admin/invitations/staff
func (h *RolesHandler) ListStaffInvitations(w http.ResponseWriter, r *http.Request) {
	actor, err := h.actorID(r)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	rows, err := h.Authz.ListStaffInvitations(r.Context(), actor, 50)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	items := make([]map[string]any, 0, len(rows))
	for _, inv := range rows {
		items = append(items, map[string]any{
			"id":        inv.ID,
			"email":     inv.EmailDisplay,
			"roleId":    inv.RoleID,
			"status":    string(inv.Status),
			"expiresAt": inv.ExpiresAt.UTC().Format(time.RFC3339),
			"createdAt": inv.CreatedAt.UTC().Format(time.RFC3339),
		})
	}
	presenters.WriteData(w, r, http.StatusOK, map[string]any{"items": items})
}

// RevokeStaffInvitation is POST /v1/admin/invitations/staff/{invitationId}/revoke
func (h *RolesHandler) RevokeStaffInvitation(w http.ResponseWriter, r *http.Request) {
	actor, err := h.actorID(r)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	inv, err := h.Authz.RevokeStaffInvitation(r.Context(), actor, chi.URLParam(r, "invitationId"))
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, map[string]any{
		"id":     inv.ID,
		"status": string(inv.Status),
	})
}

// CreateMerchantInvitation is POST /v1/admin/invitations/merchant
func (h *RolesHandler) CreateMerchantInvitation(w http.ResponseWriter, r *http.Request) {
	actor, err := h.actorID(r)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	var body struct {
		Email             string `json:"email"`
		MerchantID        string `json:"merchantId"`
		RoleInMerchant    string `json:"roleInMerchant"`
		OnboardingPurpose string `json:"onboardingPurpose"`
		IdempotencyKey    string `json:"idempotencyKey"`
	}
	if err := decode.DecodeJSON(r, &body); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	if k := r.Header.Get("Idempotency-Key"); k != "" && body.IdempotencyKey == "" {
		body.IdempotencyKey = k
	}
	inv, raw, err := h.Authz.CreateMerchantInvitation(r.Context(), application.CreateMerchantInviteInput{
		ActorUserID:       actor,
		Email:             body.Email,
		MerchantID:        body.MerchantID,
		RoleInMerchant:    body.RoleInMerchant,
		OnboardingPurpose: body.OnboardingPurpose,
		IdempotencyKey:    body.IdempotencyKey,
	})
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	data := map[string]any{
		"id":             inv.ID,
		"email":          inv.EmailDisplay,
		"roleInMerchant": string(inv.RoleInMerchant),
		"status":         string(inv.Status),
		"expiresAt":      inv.ExpiresAt.UTC().Format(time.RFC3339),
		"createdAt":      inv.CreatedAt.UTC().Format(time.RFC3339),
	}
	if inv.MerchantID != nil {
		data["merchantId"] = *inv.MerchantID
	}
	if raw != "" {
		data["token"] = raw
	}
	presenters.WriteData(w, r, http.StatusCreated, data)
}

// ListMerchantInvitations is GET /v1/admin/invitations/merchant
func (h *RolesHandler) ListMerchantInvitations(w http.ResponseWriter, r *http.Request) {
	actor, err := h.actorID(r)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	rows, err := h.Authz.ListMerchantInvitations(r.Context(), actor, 50)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	items := make([]map[string]any, 0, len(rows))
	for _, inv := range rows {
		item := map[string]any{
			"id":             inv.ID,
			"email":          inv.EmailDisplay,
			"roleInMerchant": string(inv.RoleInMerchant),
			"status":         string(inv.Status),
			"expiresAt":      inv.ExpiresAt.UTC().Format(time.RFC3339),
			"createdAt":      inv.CreatedAt.UTC().Format(time.RFC3339),
		}
		if inv.MerchantID != nil {
			item["merchantId"] = *inv.MerchantID
		}
		items = append(items, item)
	}
	presenters.WriteData(w, r, http.StatusOK, map[string]any{"items": items})
}

// RevokeMerchantInvitation is POST /v1/admin/invitations/merchant/{invitationId}/revoke
func (h *RolesHandler) RevokeMerchantInvitation(w http.ResponseWriter, r *http.Request) {
	actor, err := h.actorID(r)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	inv, err := h.Authz.RevokeMerchantInvitation(r.Context(), actor, chi.URLParam(r, "invitationId"))
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, map[string]any{
		"id":     inv.ID,
		"status": string(inv.Status),
	})
}

// AcceptInvitation is POST /v1/auth/invitations/accept (and aliases) — §6.5 body token only.
func (h *RolesHandler) AcceptInvitation(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Token string `json:"token"`
	}
	if err := decode.DecodeJSON(r, &body); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	sessionUserID := ""
	if p, ok := reqctx.PrincipalFrom(r.Context()); ok {
		sessionUserID = p.SubjectID
	}
	res, err := h.Authz.AcceptInvitation(r.Context(), body.Token, sessionUserID)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	data := map[string]any{
		"invitationId":   res.InvitationID,
		"kind":           res.Kind,
		"userId":         res.UserID,
		"existingUser":   res.ExistingUser,
		"requiresMfa":    res.RequiresMFA,
		"activationHeld": res.ActivationHeld,
		"message":        res.Message,
	}
	if res.RoleID != "" {
		data["roleId"] = res.RoleID
	}
	if res.MerchantID != nil {
		data["merchantId"] = *res.MerchantID
	}
	presenters.WriteData(w, r, http.StatusOK, data)
}

// AcceptStaffInvitation is POST /v1/invitations/staff/accept
func (h *RolesHandler) AcceptStaffInvitation(w http.ResponseWriter, r *http.Request) {
	h.acceptTyped(w, r, "STAFF")
}

// AcceptMerchantInvitation is POST /v1/invitations/merchant/accept
func (h *RolesHandler) AcceptMerchantInvitation(w http.ResponseWriter, r *http.Request) {
	h.acceptTyped(w, r, "MERCHANT")
}

func (h *RolesHandler) acceptTyped(w http.ResponseWriter, r *http.Request, kind string) {
	var body struct {
		Token string `json:"token"`
	}
	if err := decode.DecodeJSON(r, &body); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	sessionUserID := ""
	if p, ok := reqctx.PrincipalFrom(r.Context()); ok {
		sessionUserID = p.SubjectID
	}
	var res application.AcceptInviteResult
	var err error
	switch kind {
	case "STAFF":
		res, err = h.Authz.AcceptStaffInvitation(r.Context(), body.Token, sessionUserID)
	default:
		res, err = h.Authz.AcceptMerchantInvitation(r.Context(), body.Token, sessionUserID)
	}
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	data := map[string]any{
		"invitationId":   res.InvitationID,
		"kind":           res.Kind,
		"userId":         res.UserID,
		"existingUser":   res.ExistingUser,
		"requiresMfa":    res.RequiresMFA,
		"activationHeld": res.ActivationHeld,
		"message":        res.Message,
	}
	if res.RoleID != "" {
		data["roleId"] = res.RoleID
	}
	if res.MerchantID != nil {
		data["merchantId"] = *res.MerchantID
	}
	presenters.WriteData(w, r, http.StatusOK, data)
}
