package handlers

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/presenters"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/reqctx"
	"github.com/dasepmoch/fersaku-new/backend/internal/application"
	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
)

// NotificationsHandler serves canonical + shell-alias inbox routes (BE-140).
type NotificationsHandler struct {
	Svc *application.NotificationService
}

// List is GET /v1/notifications?cursor=&unreadOnly=
func (h *NotificationsHandler) List(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Notifications unavailable"))
		return
	}
	q := r.URL.Query()
	unreadOnly := false
	if v := q.Get("unreadOnly"); v == "1" || v == "true" || v == "TRUE" {
		unreadOnly = true
	}
	limit := 0
	if raw := q.Get("limit"); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil {
			limit = n
		}
	}
	rows, next, hasMore, err := h.Svc.ListInbox(r.Context(), p.SubjectID, unreadOnly, q.Get("cursor"), limit)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	items := make([]application.NotificationView, 0, len(rows))
	for _, n := range rows {
		items = append(items, application.ToNotificationView(n))
	}
	presenters.WriteList(w, r, http.StatusOK, items, next, hasMore)
}

// MarkRead is POST /v1/notifications/{notificationId}/read
func (h *NotificationsHandler) MarkRead(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Notifications unavailable"))
		return
	}
	id := chi.URLParam(r, "notificationId")
	if id == "" {
		id = chi.URLParam(r, "id")
	}
	n, err := h.Svc.MarkRead(r.Context(), p.SubjectID, id)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, application.ToNotificationView(n))
}

// MarkAllRead is POST /v1/notifications/read-all
func (h *NotificationsHandler) MarkAllRead(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Notifications unavailable"))
		return
	}
	n, err := h.Svc.MarkAllRead(r.Context(), p.SubjectID)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, map[string]any{
		"updated": n,
	})
}

// UnreadCount is GET /v1/notifications/unread-count
func (h *NotificationsHandler) UnreadCount(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Notifications unavailable"))
		return
	}
	c, err := h.Svc.UnreadCount(r.Context(), p.SubjectID)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, map[string]any{
		"count": c,
	})
}
