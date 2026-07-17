package httpadapter

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/handlers"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/middleware"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/presenters"
	"github.com/dasepmoch/fersaku-new/backend/internal/application"
	"github.com/dasepmoch/fersaku-new/backend/internal/config"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/auth"
	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
	"github.com/dasepmoch/fersaku-new/backend/internal/ports"
)

// RouterDeps configures the chi HTTP stack (BE-110/BE-120).
type RouterDeps struct {
	Log     ports.Logger
	IDs     ports.IDGenerator
	Service string
	Version string
	AppEnv  config.Env
	// Ready reports readiness for /health/ready.
	Ready func() bool
	// StartedAt is process start time.
	StartedAt time.Time

	// SessionCookieName for CSRF/session (default fersaku_session).
	SessionCookieName string
	// CSRFSoftDisable soft-disables CSRF (local tests may keep true).
	// When false, cookie+unsafe method requires valid X-CSRF-Token.
	CSRFSoftDisable bool
	// TokenHasher hashes CSRF header tokens for compare (required when CSRF enabled).
	TokenHasher func(raw string) string

	// AuthService when set enables real session loading and /v1/auth routes.
	AuthService *application.AuthService
	// AuthzService when set enables RBAC sample routes (BE-130).
	AuthzService *application.AuthzService
	// NotificationService when set enables inbox routes (BE-140).
	NotificationService *application.NotificationService
	// OnboardingService when set enables §7.3 merchant/store onboarding (BE-200).
	OnboardingService *application.OnboardingService
	// CatalogService when set enables §7.4/§7.5 catalog/storefront (BE-210).
	CatalogService *application.CatalogService
	// CouponService when set enables §7.5 coupons + checkout quote/reserve (BE-215).
	CouponService *application.CouponService
	// ObjectService when set enables BE-220 R2 object upload/download.
	ObjectService *application.ObjectService
	// InventoryService when set enables BE-230 inventory schema/stock/reveal.
	InventoryService *application.InventoryService
	// DeliveryService when set enables BE-235 delivery grants/invoices.
	DeliveryService *application.DeliveryService
	// DomainService when set enables BE-240 custom-domain lifecycle.
	DomainService *application.DomainService
	// FeeService when set enables BE-300 fee policy read + admin preview.
	FeeService *application.FeeService
	// CheckoutService when set enables BE-310 hosted checkout intents.
	CheckoutService *application.CheckoutService
	// GatewayService when set enables BE-320 QRIS gateway API.
	GatewayService *application.GatewayService
	// CallbackService when set enables BE-330 inbound Xendit webhooks + admin replay.
	CallbackService *application.CallbackService
	// LedgerService when set enables BE-340 finance summary/ledger/revenue.
	LedgerService *application.LedgerService
	// WithdrawalService when set enables BE-350 bank/quotes/withdrawals.
	WithdrawalService *application.WithdrawalService
	// AnalyticsService when set enables BE-360 storefront attribution analytics.
	AnalyticsService *application.AnalyticsService
	// KYCService when set enables BE-400 live QRIS API KYC workflow.
	KYCService *application.KYCService
	// CredentialService when set enables BE-410 credential lifecycle.
	CredentialService *application.CredentialService
	// WebhookService when set enables BE-420 outbound seller webhooks.
	WebhookService *application.WebhookService
	// BuyerService when set enables BE-430 purchase list/detail.
	BuyerService *application.BuyerService
	// SellerOrderService when set enables SEL-250 store order list/detail.
	SellerOrderService *application.SellerOrderService
	// SellerCustomerService when set enables SEL-260 store customer list/detail/notes.
	SellerCustomerService *application.SellerCustomerService
	// ReviewService when set enables BE-430 reviews.
	ReviewService *application.ReviewService
	// AdminReadService when set enables BE-500 admin read models.
	AdminReadService *application.AdminReadService
	// AdminOpsService when set enables BE-510 lightweight admin operations.
	AdminOpsService *application.AdminOpsService
	// ImpersonationService when set enables BE-520 admin impersonation.
	ImpersonationService *application.ImpersonationService
	// SecureCookies sets Secure flag on session cookies.
	SecureCookies bool
	// SameSiteStrict uses SameSite=Strict; default Lax.
	SameSiteStrict bool

	// RateLimiter is optional; nil disables rate limiting.
	RateLimiter middleware.Limiter

	// XenditWebhookToken for inbound payment + disbursement callback auth (INT-180).
	// Never logged; constant-time compared at handlers.
	XenditWebhookToken string

	// RequestTimeout bounds handler context (default 30s).
	RequestTimeout time.Duration

	// TrustedProxies are CIDRs trusted for X-Forwarded-For (optional).
	TrustedProxies []string
}

// NewRouter builds the chi router with the BE-110/BE-600 middleware order:
//
//	recovery → request ID → trace → trusted proxy → logging → metrics → timeout →
//	auth (session load) → CSRF → rate limit → routes
func NewRouter(log ports.Logger, ids ports.IDGenerator, service string, ready func() bool) http.Handler {
	return NewRouterWith(RouterDeps{
		Log:             log,
		IDs:             ids,
		Service:         service,
		Version:         versionFromEnv(),
		AppEnv:          config.EnvLocal,
		Ready:           ready,
		StartedAt:       time.Now().UTC(),
		CSRFSoftDisable: true,
		RateLimiter:     middleware.NewTokenBucketLimiter(120, 20),
		RequestTimeout:  30 * time.Second,
	})
}

// NewRouterWith builds the router from explicit deps (preferred by app composition root).
func NewRouterWith(d RouterDeps) http.Handler {
	if d.StartedAt.IsZero() {
		d.StartedAt = time.Now().UTC()
	}
	if d.RequestTimeout <= 0 {
		d.RequestTimeout = 30 * time.Second
	}
	if d.SessionCookieName == "" {
		d.SessionCookieName = "fersaku_session"
	}

	r := chi.NewRouter()

	// Middleware order (outer → inner). Do not reorder without updating this comment
	// and BE-110/BE-120/BE-600 checklist.
	r.Use(middleware.Recovery(d.Log))
	r.Use(middleware.RequestID(d.IDs))
	r.Use(middleware.Trace(d.IDs))
	r.Use(middleware.TrustedProxy(middleware.TrustedProxyConfig{TrustedProxies: d.TrustedProxies}))
	r.Use(middleware.Logging(d.Log))
	r.Use(middleware.Metrics(nil)) // process-local Prometheus registry
	r.Use(middleware.Timeout(d.RequestTimeout))

	authCfg := middleware.AuthConfig{
		Mode:       middleware.AuthModeOptional,
		CookieName: d.SessionCookieName,
	}
	if d.AuthService != nil {
		authCfg.Resolver = middleware.AuthServiceResolver{Svc: d.AuthService}
	}
	r.Use(middleware.AuthWith(authCfg))
	// INT-140: MFA_PENDING fail-closed allowlist (session/verify/logout only).
	r.Use(middleware.MFAPendingGate)
	// BE-520: block mutations under READ_ONLY; SUPPORT_WRITE exact two-command allowlist.
	r.Use(middleware.ImpersonationGate(d.ImpersonationService))
	r.Use(middleware.CSRF(middleware.CSRFConfig{
		SoftDisable:       d.CSRFSoftDisable,
		SessionCookieName: d.SessionCookieName,
		TokenHasher:       d.TokenHasher,
	}))
	r.Use(middleware.RateLimit(d.RateLimiter))

	// Not found / method not allowed → problem envelope.
	r.NotFound(func(w http.ResponseWriter, req *http.Request) {
		presenters.WriteProblem(w, req, http.StatusNotFound,
			apperr.CodeResourceNotFound, "Resource not found", nil)
	})
	r.MethodNotAllowed(func(w http.ResponseWriter, req *http.Request) {
		presenters.WriteProblem(w, req, http.StatusMethodNotAllowed,
			apperr.CodeMethodNotAllowed, "Method not allowed", nil)
	})

	health := handlers.HealthDeps{
		ReadyFn:   d.Ready,
		StartedAt: d.StartedAt,
		Service:   d.Service,
	}
	r.Get("/health/live", health.Live)
	r.Get("/health/ready", health.Ready)

	// BE-600: Prometheus-compatible metrics (network-restrict in production).
	metrics := handlers.MetricsDeps{}
	r.Get("/metrics", metrics.Metrics)

	status := handlers.StatusDeps{
		Service:   d.Service,
		Version:   d.Version,
		AppEnv:    d.AppEnv,
		StartedAt: d.StartedAt,
	}
	r.Get("/v1/status", status.Status)

	// BE-300 fee policy: public active read + admin preview only (no mutation).
	if d.FeeService != nil {
		fh := &handlers.FeesHandler{Svc: d.FeeService}
		r.Get("/v1/platform/fees", fh.GetPlatformFees)
		r.Group(func(ar chi.Router) {
			ar.Use(handlers.RequireAuth)
			ar.With(middleware.RequirePermission("platform.fees.preview")).Get("/v1/admin/system/fees", fh.GetAdminSystemFees)
			ar.With(middleware.RequirePermission("platform.fees.preview")).Post("/v1/admin/system/fees/preview", fh.Preview)
			// Catalog alias from task deliverable.
			ar.With(middleware.RequirePermission("platform.fees.preview")).Post("/v1/admin/fees/preview", fh.Preview)
			// Explicit rejection of fee publish/mutate (no launch admin mutation).
			ar.Post("/v1/admin/system/fees", handlers.RejectFeeMutation)
			ar.Put("/v1/admin/system/fees", handlers.RejectFeeMutation)
			ar.Patch("/v1/admin/system/fees", handlers.RejectFeeMutation)
			ar.Delete("/v1/admin/system/fees", handlers.RejectFeeMutation)
			ar.Post("/v1/admin/fees", handlers.RejectFeeMutation)
			ar.Post("/v1/admin/fees/publish", handlers.RejectFeeMutation)
			ar.Put("/v1/admin/fees", handlers.RejectFeeMutation)
			ar.Patch("/v1/admin/fees", handlers.RejectFeeMutation)
			ar.Post("/v1/admin/system/fees/publish", handlers.RejectFeeMutation)
		})
	}

	// Scaffold echo: local/test only — never production/staging.
	if handlers.AllowScaffold(d.AppEnv) {
		scaffold := handlers.ScaffoldDeps{AppEnv: d.AppEnv}
		r.Post("/v1/_scaffold/echo", scaffold.Echo)
	}

	if d.AuthService != nil {
		ah := &handlers.AuthHandler{
			Auth:           d.AuthService,
			CookieName:     d.SessionCookieName,
			Secure:         d.SecureCookies,
			SameSiteStrict: d.SameSiteStrict,
			Domains:        d.DomainService,
		}
		mh := &handlers.MeHandler{Auth: d.AuthService}
		r.Route("/v1/auth", func(ar chi.Router) {
			// Public (anti-enumeration)
			ar.Post("/register", ah.Register)
			ar.Post("/verify-email", ah.VerifyEmail)
			ar.Post("/login", ah.Login)
			ar.Post("/logout", ah.Logout)
			ar.Post("/magic-link/request", ah.MagicLinkRequest)
			ar.Post("/magic-link/consume", ah.MagicLinkConsume)
			ar.Post("/password/forgot", ah.ForgotPassword)
			ar.Post("/password/reset", ah.ResetPassword)
			// Dual email-change confirm is public (token-bound); optional session binds owner.
			ar.Post("/email-change/confirm-current", ah.EmailChangeConfirmCurrent)
			ar.Post("/email-change/confirm-new", ah.EmailChangeConfirmNew)

			// Authenticated
			ar.Group(func(pr chi.Router) {
				pr.Use(handlers.RequireAuth)
				pr.Get("/session", ah.GetSession)
				pr.Get("/sessions", ah.ListSessions)
				pr.Post("/sessions/{sessionId}/revoke", ah.RevokeSession)
				pr.Post("/sessions/revoke-others", ah.RevokeOthers)
				pr.Post("/sessions/revoke-all", ah.RevokeAll)
				pr.Post("/password/change", ah.ChangePassword)
				pr.Post("/email-change/request", ah.EmailChangeRequest)
				pr.Post("/mfa/enroll", ah.MFAEnroll)
				pr.Post("/mfa/confirm", ah.MFAConfirm)
				pr.Post("/mfa/verify", ah.MFAVerify)
				pr.Post("/mfa/step-up", ah.MFAStepUp)
				pr.Post("/mfa/disable", ah.MFADisable)
				pr.Post("/mfa/recovery-codes/regenerate", ah.MFARegenerateRecovery)
			})
		})
		r.Route("/v1/me", func(mr chi.Router) {
			mr.Use(handlers.RequireAuth)
			mr.Get("/profile", mh.GetProfile)
			mr.Patch("/profile", mh.PatchProfile)
			mr.Get("/notification-preferences", mh.GetNotificationPreferences)
			mr.Patch("/notification-preferences", mh.PatchNotificationPreferences)
		})
	}

	// BE-130 sample authorization routes + BE-135 roles/invitations + BE-500/510/520 admin.
	if d.AuthzService != nil || d.AdminReadService != nil || d.AdminOpsService != nil || d.ImpersonationService != nil {
		var zh *handlers.AuthzHandler
		var rh *handlers.RolesHandler
		if d.AuthzService != nil {
			zh = &handlers.AuthzHandler{Authz: d.AuthzService}
			rh = &handlers.RolesHandler{Authz: d.AuthzService}
		}
		arh := &handlers.AdminReadHandler{Svc: d.AdminReadService}
		r.Route("/v1/admin", func(ar chi.Router) {
			ar.Use(handlers.RequireAuth)
			if zh != nil {
				ar.With(middleware.RequirePermission("admin.ping")).Get("/ping", zh.AdminPing)
			}

			// BE-500 admin read models (FE-aligned contracts)
			if d.AdminReadService != nil {
				ar.With(middleware.RequirePermission("admin.dashboard.read")).Get("/overview", arh.Overview)
				ar.With(middleware.RequirePermission("admin.dashboard.read")).Get("/overview/platform-volume", arh.PlatformVolume)
				ar.With(middleware.RequirePermission("merchants.read")).Get("/merchants", arh.ListMerchants)
				ar.With(middleware.RequirePermission("merchants.read")).Get("/merchants/{merchantId}", arh.GetMerchant)
				ar.With(middleware.RequirePermission("buyers.read")).Get("/buyers", arh.ListBuyers)
				ar.With(middleware.RequirePermission("buyers.read")).Get("/buyers/{buyerId}", arh.GetBuyer)
				ar.With(middleware.RequirePermission("buyers.read")).Get("/buyers/{buyerId}/purchases", arh.ListBuyerPurchases)
				ar.With(middleware.RequirePermission("buyers.read")).Get("/buyers/{buyerId}/sessions", arh.ListBuyerSessions)
				ar.With(middleware.RequirePermission("orders.read")).Get("/orders", arh.ListOrders)
				ar.With(middleware.RequirePermission("orders.read")).Get("/orders/{orderId}", arh.GetOrder)
				ar.With(middleware.RequirePermission("payments.read")).Get("/payments", arh.ListPayments)
				ar.With(middleware.RequirePermission("payments.read")).Get("/payments/{paymentIntentId}", arh.GetPayment)
				ar.With(middleware.RequirePermission("inventory.read")).Get("/inventory", arh.GetInventory)
				ar.With(middleware.RequirePermission("fulfillment.read")).Get("/fulfillments", arh.ListFulfillments)
				ar.With(middleware.RequirePermission("fulfillment.read")).Get("/fulfillments/{deliveryId}", arh.GetFulfillment)
				ar.With(middleware.RequirePermission("reviews.read")).Get("/reviews", arh.ListReviews)
				ar.With(middleware.RequirePermission("reviews.read")).Get("/reviews/{reviewId}", arh.GetReview)
				// FE withdrawal list/detail (review mutation remains on WithdrawalService mount).
				ar.With(middleware.RequirePermission("withdrawals.review")).Get("/withdrawals", arh.ListWithdrawalsFE)
				ar.With(middleware.RequirePermission("withdrawals.review")).Get("/withdrawals/{withdrawalId}", arh.GetWithdrawalFE)
				// users.read for impersonation target lookup
				ar.With(middleware.RequirePermission("users.read")).Get("/users", arh.LookupUsers)
				ar.With(middleware.RequirePermission("users.read")).Get("/users/{userId}", arh.GetUser)
			}

			// BE-520 admin impersonation start/terminate
			if d.ImpersonationService != nil {
				ih := &handlers.ImpersonationHandler{
					Svc:            d.ImpersonationService,
					CookieName:     d.SessionCookieName,
					Secure:         d.SecureCookies,
					SameSiteStrict: d.SameSiteStrict,
				}
				ar.With(middleware.RequirePermission("impersonation.start")).Post("/users/{userId}/impersonation", ih.StartForUser)
				ar.With(middleware.RequirePermission("impersonation.start")).Post("/merchants/{merchantId}/impersonation", ih.StartForMerchant)
				// Terminate: actor admin or derived session holder (permission checked in service).
				ar.Post("/impersonation/{sessionId}/terminate", ih.Terminate)
			}

			// BE-510 lightweight admin operations + actions dispatcher
			if d.AdminOpsService != nil {
				aoh := &handlers.AdminOpsHandler{Svc: d.AdminOpsService}
				ar.With(middleware.RequirePermission("merchants.write")).Post("/actions", aoh.ExecuteAction)
				ar.With(middleware.RequirePermission("merchants.write")).Post("/merchants/{merchantId}/status", aoh.UpdateMerchantStatus)
				ar.With(middleware.RequirePermission("merchants.write")).Post("/merchants/{merchantId}/api-access/status", aoh.UpdateAPIAccess)
				ar.With(middleware.RequirePermission("platform.emergency")).Get("/system", aoh.GetSystem)
				ar.With(middleware.RequirePermission("platform.emergency")).Get("/system/emergency-controls", aoh.ListEmergency)
				ar.With(middleware.RequirePermission("platform.emergency")).Post("/system/emergency-controls", aoh.SetEmergency)
				ar.With(middleware.RequirePermission("payments.read")).Get("/providers", aoh.GetProviders)
				ar.With(middleware.RequirePermission("audit.read")).Get("/audit-logs", aoh.ListAudit)
				ar.With(middleware.RequirePermission("audit.read")).Get("/audit-logs/{eventId}", aoh.GetAudit)
				ar.With(middleware.RequirePermission("audit.read")).Get("/audit-integrity", aoh.AuditIntegrity)
				ar.With(middleware.RequirePermission("audit.read")).Post("/audit-exports", aoh.CreateAuditExport)
				ar.With(middleware.RequirePermission("audit.read")).Get("/audit-exports/{exportId}", aoh.GetAuditExport)
				ar.With(middleware.RequirePermission("payments.read")).Get("/payment-mismatches", aoh.ListPaymentMismatches)
				ar.With(middleware.RequirePermission("reviews.moderate")).Post("/reviews/{reviewId}/transition", aoh.ModerateReview)
				ar.With(middleware.RequirePermission("fulfillment.force")).Post("/orders/{orderId}/delivery/resend", aoh.ResendDelivery)
				ar.With(middleware.RequirePermission("payments.read")).Post("/payments/{paymentIntentId}/provider-lookup", aoh.ProviderLookup)
			}

			if d.AdminReadService == nil && zh != nil {
				// BE-130 sample only when full admin reads not wired.
				ar.With(middleware.RequirePermission("merchants.read")).Get("/merchants", zh.AdminMerchantsList)
			}

			// Roles / permissions registry
			if rh != nil {
				ar.With(middleware.RequirePermission("roles.read")).Get("/permissions", rh.ListPermissions)
				ar.With(middleware.RequirePermission("roles.read")).Get("/roles", rh.ListRoles)
				ar.With(middleware.RequirePermission("roles.write")).Post("/roles", rh.CreateRole)
				ar.With(middleware.RequirePermission("roles.read")).Get("/roles/{id}", rh.GetRole)
				ar.With(middleware.RequirePermission("roles.write")).Patch("/roles/{id}", rh.UpdateRole)
				ar.With(middleware.RequirePermission("roles.write")).Post("/roles/{id}/archive", rh.ArchiveRole)
				ar.With(middleware.RequirePermission("roles.read")).Get("/roles/{id}/permissions", rh.GetRolePermissions)
				ar.With(middleware.RequirePermission("roles.write")).Put("/roles/{id}/permissions", rh.PutRolePermissions)

				// User role assignments (path param id; users.read detail is separate GET without /roles)
				ar.With(middleware.RequirePermission("roles.read")).Get("/users/{id}/roles", rh.ListUserRoles)
				ar.With(middleware.RequirePermission("roles.assign")).Post("/users/{id}/roles", rh.AssignUserRole)
				ar.With(middleware.RequirePermission("roles.assign")).Delete("/users/{id}/roles/{roleId}", rh.RemoveUserRole)

				// Staff invitations (canonical + catalog alias)
				ar.With(middleware.RequirePermission("roles.assign")).Get("/invitations/staff", rh.ListStaffInvitations)
				ar.With(middleware.RequirePermission("roles.assign")).Post("/invitations/staff", rh.CreateStaffInvitation)
				ar.With(middleware.RequirePermission("roles.assign")).Post("/invitations/staff/{invitationId}/revoke", rh.RevokeStaffInvitation)
				ar.With(middleware.RequirePermission("roles.assign")).Post("/staff-invitations", rh.CreateStaffInvitation)
				ar.With(middleware.RequirePermission("roles.assign")).Post("/staff-invitations/{invitationId}/revoke", rh.RevokeStaffInvitation)

				// Merchant invitations
				ar.With(middleware.RequirePermission("merchants.read")).Get("/invitations/merchant", rh.ListMerchantInvitations)
				ar.With(middleware.RequirePermission("merchants.write")).Post("/invitations/merchant", rh.CreateMerchantInvitation)
				ar.With(middleware.RequirePermission("merchants.write")).Post("/invitations/merchant/{invitationId}/revoke", rh.RevokeMerchantInvitation)
				ar.With(middleware.RequirePermission("merchants.write")).Post("/merchant-invitations", rh.CreateMerchantInvitation)
			}
		})
		// §6.5 invitation accept: POST body token only (optional session for email bind)
		if rh != nil {
			r.Post("/v1/auth/invitations/accept", rh.AcceptInvitation)
			r.Post("/v1/invitations/staff/accept", rh.AcceptStaffInvitation)
			r.Post("/v1/invitations/merchant/accept", rh.AcceptMerchantInvitation)
		}

		if zh != nil {
			r.Route("/v1/seller", func(sr chi.Router) {
				sr.Use(handlers.RequireAuth)
				sr.Get("/me/merchant", zh.SellerMeMerchant)
				sr.Put("/me/current-store", zh.SellerSetCurrentStore)
				sr.Get("/stores/{storeId}", zh.SellerStoreByID)
			})
		}
	}

	// BE-430 buyer surface (§7.11) + BE-130 ownership probe — single /v1/buyer mount.
	if d.AuthService != nil || d.AuthzService != nil || d.BuyerService != nil || d.ReviewService != nil {
		bh := &handlers.BuyerHandler{Buyer: d.BuyerService, Auth: d.AuthService}
		r.Route("/v1/buyer", func(br chi.Router) {
			br.Use(handlers.RequireAuth)
			if d.AuthzService != nil {
				zh := &handlers.AuthzHandler{Authz: d.AuthzService}
				br.Get("/resources/{ownerUserId}", zh.BuyerResourceProbe)
			}
			if d.AuthService != nil {
				br.Get("/profile", bh.GetProfile)
				br.Patch("/profile", bh.PatchProfile)
				br.Get("/sessions", bh.ListSessions)
				br.Post("/sessions/{sessionId}/revoke", bh.RevokeSession)
				br.Post("/sessions/revoke-others", bh.RevokeOthers)
				br.Post("/sessions/revoke-all", bh.RevokeAll)
			}
			if d.BuyerService != nil {
				br.Get("/purchases", bh.ListPurchases)
				// GET /purchases/{orderId} is mounted with delivery routes below
				// to avoid chi path conflicts on /v1/buyer/purchases/{orderId}.
			}
			if d.ReviewService != nil {
				rh := &handlers.ReviewsHandler{Svc: d.ReviewService}
				br.Post("/reviews", rh.Create)
				br.Patch("/reviews/{reviewId}", rh.Patch)
			}
		})
		if d.ReviewService != nil {
			rh := &handlers.ReviewsHandler{Svc: d.ReviewService}
			r.Get("/v1/public/products/{productId}/reviews", rh.PublicList)
			r.Get("/v1/public/products/{productId}/reviews/summary", rh.PublicSummary)
		}
	}

	// BE-200 merchant/store onboarding (§7.3).
	if d.OnboardingService != nil {
		oh := &handlers.OnboardingHandler{Svc: d.OnboardingService}
		r.Route("/v1/onboarding", func(or chi.Router) {
			or.Use(handlers.RequireAuth)
			or.Get("/", oh.Get)
			or.Post("/store", oh.CreateStore)
			or.Patch("/store", oh.PatchStore)
			or.Post("/complete", oh.Complete)
		})
		// Slug check is public (optional session excludes own store).
		r.Get("/v1/stores/slug-availability", oh.SlugAvailability)
	}

	// BE-210 catalog / storefront revisions (§7.4 public + §7.5 seller).
	if d.CatalogService != nil {
		ch := &handlers.CatalogHandler{Svc: d.CatalogService}
		// Public catalog (no auth)
		r.Get("/v1/public/stores/{slug}", ch.PublicStore)
		r.Get("/v1/public/products/featured", ch.PublicFeatured)
		r.Get("/v1/public/products/{idOrSlug}", ch.PublicProduct)

		r.Route("/v1/stores/{storeId}", func(sr chi.Router) {
			sr.Use(handlers.RequireAuth)
			// BE-520 SUPPORT_WRITE allowlist: store presentation (name/description).
			if d.OnboardingService != nil {
				ssh := &handlers.SupportStoreHandler{Onboarding: d.OnboardingService}
				sr.With(middleware.RequirePermission("seller.store.write")).Patch("/", ssh.PatchPresentation)
			}
			// Products
			sr.With(middleware.RequirePermission("seller.store.read")).Get("/products", ch.ListProducts)
			sr.With(middleware.RequirePermission("seller.store.write")).Post("/products", ch.CreateProduct)
			sr.With(middleware.RequirePermission("seller.store.read")).Get("/products/{productId}", ch.GetProduct)
			sr.With(middleware.RequirePermission("seller.store.write")).Patch("/products/{productId}", ch.PatchProduct)
			sr.With(middleware.RequirePermission("seller.store.write")).Post("/products/{productId}/publish", ch.PublishProduct)
			sr.With(middleware.RequirePermission("seller.store.write")).Post("/products/{productId}/archive", ch.ArchiveProduct)
			// Storefront studio
			sr.With(middleware.RequirePermission("seller.store.read")).Get("/storefront", ch.GetStorefront)
			sr.With(middleware.RequirePermission("seller.store.write")).Put("/storefront/draft", ch.PutStorefrontDraft)
			sr.With(middleware.RequirePermission("seller.store.write")).Post("/storefront/publish", ch.PublishStorefront)
		})
	}

	// BE-215 coupons (seller) + checkout quote/reserve foundation.
	if d.CouponService != nil {
		cph := &handlers.CouponHandler{Svc: d.CouponService}
		r.Route("/v1/stores/{storeId}/coupons", func(cr chi.Router) {
			cr.Use(handlers.RequireAuth)
			cr.With(middleware.RequirePermission("seller.store.read")).Get("/", cph.List)
			cr.With(middleware.RequirePermission("seller.store.write")).Post("/", cph.Create)
			cr.With(middleware.RequirePermission("seller.store.read")).Get("/{couponId}", cph.Get)
			cr.With(middleware.RequirePermission("seller.store.write")).Patch("/{couponId}", cph.Patch)
			cr.With(middleware.RequirePermission("seller.store.write")).Post("/{couponId}/activate", cph.Activate)
			cr.With(middleware.RequirePermission("seller.store.write")).Post("/{couponId}/pause", cph.Pause)
			cr.With(middleware.RequirePermission("seller.store.write")).Post("/{couponId}/archive", cph.Archive)
		})
		// Checkout-facing: no public coupon list; server prices only.
		r.Post("/v1/checkout/quote", cph.Quote)
		r.Post("/v1/checkout/apply-coupon", cph.Quote)
		r.Post("/v1/checkout/coupon-reservations", cph.Reserve)
	}

	// BE-220 R2 object/upload/delivery foundation (non-KYC only).
	if d.ObjectService != nil {
		oh := &handlers.ObjectsHandler{Svc: d.ObjectService}
		r.Route("/v1/stores/{storeId}/objects", func(or chi.Router) {
			or.Use(handlers.RequireAuth)
			or.With(middleware.RequirePermission("seller.store.write")).Post("/uploads", oh.CreateUpload)
			or.With(middleware.RequirePermission("seller.store.write")).Post("/{objectId}/complete", oh.CompleteUpload)
			or.With(middleware.RequirePermission("seller.store.read")).Get("/{objectId}", oh.GetMetadata)
			or.With(middleware.RequirePermission("seller.store.read")).Get("/{objectId}/download-url", oh.GetDownloadURL)
			or.With(middleware.RequirePermission("seller.store.write")).Post("/{objectId}/delivery-grants", oh.CreateDeliveryGrant)
		})
	}

	// BE-230 inventory / stock / reveal (no global batch reveal).
	if d.InventoryService != nil {
		ih := &handlers.InventoryHandler{Svc: d.InventoryService}
		r.Route("/v1/stores/{storeId}/inventory", func(ir chi.Router) {
			ir.Use(handlers.RequireAuth)
			ir.With(middleware.RequirePermission("seller.store.read")).Get("/products", ih.ListProducts)
			ir.With(middleware.RequirePermission("seller.store.read")).Get("/products/{productId}", ih.GetProduct)
			ir.With(middleware.RequirePermission("seller.store.read")).Get("/products/{productId}/schema", ih.GetSchema)
			ir.With(middleware.RequirePermission("seller.store.write")).Put("/products/{productId}/schema", ih.PutSchema)
			ir.With(middleware.RequirePermission("seller.store.write")).Post("/products/{productId}/items", ih.ImportItems)
			ir.With(middleware.RequirePermission("seller.store.write")).Post("/items/import", ih.ImportItemsGlobal)
			if d.AuthService != nil {
				ir.With(
					middleware.RequirePermission("inventory.reveal"),
					middleware.RequireRecentMFAProof(auth.ProofPurposeInventoryReveal, d.AuthService),
				).Post("/items/{itemId}/reveal", ih.Reveal)
			} else {
				// Fail closed: no proof validator available.
				ir.With(middleware.RequirePermission("inventory.reveal")).Post("/items/{itemId}/reveal", func(w http.ResponseWriter, r *http.Request) {
					presenters.WriteAppError(w, r, auth.ErrMFAProofRequired)
				})
			}
			ir.With(middleware.RequirePermission("seller.store.write")).Post("/items/{itemId}/revoke", ih.Revoke)
		})
		// Checkout foundation: reserve one stock unit (idempotent).
		r.Post("/v1/checkout/stock-reservations", ih.Reserve)
	}

	// BE-240 store custom-domain lifecycle.
	if d.DomainService != nil {
		dh := &handlers.DomainHandler{Svc: d.DomainService}
		r.Route("/v1/stores/{storeId}/domains", func(dr chi.Router) {
			dr.Use(handlers.RequireAuth)
			dr.With(middleware.RequirePermission("seller.store.read")).Get("/", dh.List)
			dr.With(middleware.RequirePermission("seller.store.write")).Post("/", dh.Create)
			dr.With(middleware.RequirePermission("seller.store.read")).Get("/{domainId}", dh.Get)
			dr.With(middleware.RequirePermission("seller.store.write")).Post("/{domainId}/verify", dh.Verify)
			dr.With(middleware.RequirePermission("seller.store.write")).Delete("/{domainId}", dh.Delete)
		})
		r.Get("/v1/public/host-resolve", dh.HostResolve)
	}

	// BE-310 hosted checkout / payment intents (storefront QRIS).
	if d.CheckoutService != nil {
		ch := &handlers.CheckoutHandler{Svc: d.CheckoutService}
		r.Post("/v1/checkout/intents", ch.CreateIntent)
		r.Get("/v1/checkout/intents/{intentId}", ch.GetIntent)
		r.Post("/v1/checkout/intents/{intentId}/expire", ch.ExpireIntent)
		// Buyer order state polling (payment fields only; delivery still BE-235).
		r.Get("/v1/orders/{orderId}", ch.GetOrder)
		// simulate-payment: local/test only (production must not expose).
		if d.AppEnv == config.EnvLocal || d.AppEnv == config.EnvTest {
			r.Post("/v1/checkout/simulate-payment", ch.SimulatePayment)
		}
	}

	// BE-330 Inbound Xendit callback (token verify; no session CSRF for provider ingress).
	if d.CallbackService != nil {
		cbh := &handlers.CallbackHandler{Svc: d.CallbackService}
		r.Post("/v1/webhooks/xendit", cbh.XenditWebhook)
		r.Post("/v1/webhooks/xendit/sandbox", cbh.XenditWebhook)
		r.Post("/v1/webhooks/xendit/live", cbh.XenditWebhook)
		// Admin inbound read model + replay (webhooks.read for list/detail; replay still separate).
		r.Route("/v1/admin/provider-callbacks", func(ar chi.Router) {
			ar.Use(handlers.RequireAuth)
			ar.With(middleware.RequirePermission("webhooks.read")).Get("/", cbh.AdminList)
			ar.With(middleware.RequirePermission("webhooks.read")).Get("/{callbackId}", cbh.AdminGet)
			ar.With(middleware.RequirePermission("provider_callbacks.replay")).Post("/{callbackId}/replay", cbh.AdminReplay)
		})
	}

	// BE-340 unified finance / ledger (store-scoped + seller aliases).
	if d.LedgerService != nil {
		fh := &handlers.FinanceHandler{Svc: d.LedgerService}
		r.Route("/v1/stores/{storeId}/finance", func(fr chi.Router) {
			fr.Use(handlers.RequireAuth)
			fr.With(middleware.RequirePermission("seller.store.read")).Get("/summary", fh.Summary)
			fr.With(middleware.RequirePermission("seller.store.read")).Get("/ledger", fh.Ledger)
			fr.With(middleware.RequirePermission("seller.store.read")).Get("/revenue", fh.Revenue)
		})
		// Seller aliases (task deliverable paths)
		r.Route("/v1/seller/finance", func(fr chi.Router) {
			fr.Use(handlers.RequireAuth)
			fr.With(middleware.RequirePermission("seller.store.read")).Get("/summary", fh.Summary)
			fr.With(middleware.RequirePermission("seller.store.read")).Get("/ledger", fh.Ledger)
			fr.With(middleware.RequirePermission("seller.store.read")).Get("/revenue", fh.Revenue)
		})
		// Optional minimal admin read model (not balance credit/debit).
		r.Route("/v1/admin/merchants/{merchantId}/finance", func(ar chi.Router) {
			ar.Use(handlers.RequireAuth)
			ar.With(middleware.RequirePermission("merchants.read")).Get("/summary", fh.AdminMerchantBalance)
		})
	}

	// BE-360 storefront attribution analytics (store-scoped aggregates only).
	if d.AnalyticsService != nil {
		ah := &handlers.AnalyticsHandler{Svc: d.AnalyticsService}
		r.Route("/v1/stores/{storeId}/analytics", func(ar chi.Router) {
			ar.Use(handlers.RequireAuth)
			ar.With(middleware.RequirePermission("seller.store.read")).Get("/overview", ah.Overview)
			ar.With(middleware.RequirePermission("seller.store.read")).Get("/traffic", ah.Traffic)
			ar.With(middleware.RequirePermission("seller.store.read")).Get("/traffic/export", ah.Export)
		})
	}

	// BE-400 KYC live QRIS API workflow (not storefront gating).
	if d.KYCService != nil {
		kh := &handlers.KYCHandler{Svc: d.KYCService}
		// Seller alias preferred by clients.
		r.Route("/v1/me/kyc", func(kr chi.Router) {
			kr.Use(handlers.RequireAuth)
			kr.Get("/", kh.GetStatus)
			kr.Post("/cases", kh.CreateCase)
			kr.Get("/cases/{caseId}", kh.GetCase)
			kr.Post("/cases/{caseId}/submit", kh.SubmitCase)
			kr.Post("/cases/{caseId}/resubmit", kh.Resubmit)
			kr.Post("/cases/{caseId}/documents", kh.UploadDocument)
			kr.Get("/cases/{caseId}/documents/{documentId}", kh.GetDocument)
			// Explicit: no browser-to-R2 KYC presign.
			kr.Post("/presign", handlers.RejectKYCPresign)
			kr.Post("/uploads/presign", handlers.RejectKYCPresign)
		})
		r.Route("/v1/merchants/{merchantId}/kyc", func(kr chi.Router) {
			kr.Use(handlers.RequireAuth)
			kr.Get("/", kh.GetStatus)
			kr.Post("/cases", kh.CreateCase)
			kr.Get("/cases/{caseId}", kh.GetCase)
			kr.Post("/cases/{caseId}/submit", kh.SubmitCase)
			kr.Post("/cases/{caseId}/resubmit", kh.Resubmit)
			kr.Post("/cases/{caseId}/documents", kh.UploadDocument)
			kr.Get("/cases/{caseId}/documents/{documentId}", kh.GetDocument)
			kr.Post("/presign", handlers.RejectKYCPresign)
		})
		r.Route("/v1/admin/kyc", func(ar chi.Router) {
			ar.Use(handlers.RequireAuth)
			ar.With(middleware.RequirePermission("kyc.review")).Get("/", kh.AdminList)
			ar.With(middleware.RequirePermission("kyc.review")).Get("/{caseId}", kh.AdminGet)
			ar.With(middleware.RequirePermission("kyc.review")).Post("/{caseId}/transition", kh.AdminTransition)
		})
	}

	// BE-410 Credential lifecycle (seller claim + admin authorize/suspend; never raw to admin).
	if d.CredentialService != nil {
		ch := &handlers.CredentialHandler{Svc: d.CredentialService}
		r.Route("/v1/me/credentials", func(cr chi.Router) {
			cr.Use(handlers.RequireAuth)
			cr.Get("/", ch.ListMe)
			cr.Post("/requests", ch.RequestIssuance)
			cr.Post("/claim", ch.ClaimExchange)
			cr.Post("/{keyId}/revoke", ch.Revoke)
		})
		// §7.9 store-scoped aliases
		r.Route("/v1/stores/{storeId}/api-credentials", func(cr chi.Router) {
			cr.Use(handlers.RequireAuth)
			cr.Get("/", ch.ListStore)
		})
		r.With(handlers.RequireAuth).Post("/v1/stores/{storeId}/api-credential-requests", ch.RequestIssuance)
		r.With(handlers.RequireAuth).Post("/v1/stores/{storeId}/api-credential-claims/{claimId}/exchange", ch.ClaimExchange)
		r.With(handlers.RequireAuth).Post("/v1/stores/{storeId}/api-credentials/{keyId}/revoke", ch.Revoke)
		r.Route("/v1/admin/merchants/{merchantId}/api-credentials", func(ar chi.Router) {
			ar.Use(handlers.RequireAuth)
			ar.With(middleware.RequirePermission("kyc.review")).Get("/", ch.AdminList)
			ar.With(middleware.RequirePermission("kyc.review")).Post("/authorize", ch.AdminAuthorize)
			// rotate = authorize rotation request (no raw key)
			ar.With(middleware.RequirePermission("kyc.review")).Post("/rotate", ch.AdminAuthorize)
			ar.With(middleware.RequirePermission("kyc.review")).Post("/{keyId}/suspend", ch.AdminSuspend)
			ar.With(middleware.RequirePermission("kyc.review")).Post("/{keyId}/revoke", ch.AdminRevoke)
			ar.With(middleware.RequirePermission("kyc.review")).Post("/revoke", ch.AdminRevoke)
		})
	}

	// BE-420 Outbound seller webhooks (separate from inbound provider-callbacks).
	if d.WebhookService != nil {
		wh := &handlers.WebhookHandler{Svc: d.WebhookService}
		r.Route("/v1/stores/{storeId}/webhooks", func(wr chi.Router) {
			wr.Use(handlers.RequireAuth)
			wr.With(middleware.RequirePermission("seller.store.read")).Get("/", wh.ListEndpoints)
			wr.With(middleware.RequirePermission("seller.store.write")).Post("/", wh.CreateEndpoint)
			wr.With(middleware.RequirePermission("seller.store.read")).Get("/deliveries", wh.ListSellerDeliveries)
			wr.With(middleware.RequirePermission("seller.store.write")).Patch("/{id}", wh.UpdateEndpoint)
			wr.With(middleware.RequirePermission("seller.store.write")).Post("/{id}/secret-rotation-requests", wh.SecretRotation)
			wr.With(middleware.RequirePermission("seller.store.write")).Post("/{id}/secret-claims/{claimId}/exchange", wh.ClaimSecret)
			wr.With(middleware.RequirePermission("seller.store.write")).Post("/{id}/test", wh.TestEvent)
		})
		// Outbound seller deliveries (separate from inbound provider-callbacks).
		r.Route("/v1/admin/seller-webhook-deliveries", func(ar chi.Router) {
			ar.Use(handlers.RequireAuth)
			ar.With(middleware.RequirePermission("webhooks.read")).Get("/", wh.AdminList)
			ar.With(middleware.RequirePermission("webhooks.read")).Get("/{deliveryId}", wh.AdminGet)
			ar.With(middleware.RequirePermission("seller_webhook_deliveries.retry")).Post("/{deliveryId}/retry", wh.AdminRetry)
		})
	}

	// BE-350 bank / withdrawal quotes / disbursement.
	if d.WithdrawalService != nil {
		wh := &handlers.WithdrawalHandler{
			Svc:          d.WithdrawalService,
			WebhookToken: d.XenditWebhookToken,
		}
		// Separate subpaths to avoid chi Mount conflict with catalog /v1/stores/{storeId}.
		r.Route("/v1/stores/{storeId}/bank-accounts", func(br chi.Router) {
			br.Use(handlers.RequireAuth)
			br.With(middleware.RequirePermission("seller.store.read")).Get("/", wh.ListBanks)
			br.With(middleware.RequirePermission("seller.store.write")).Post("/", wh.CreateBank)
			br.With(middleware.RequirePermission("seller.store.write")).Patch("/{id}", wh.UpdateBank)
			br.With(middleware.RequirePermission("seller.store.write")).Post("/{id}/verify", wh.VerifyBank)
			br.With(middleware.RequirePermission("seller.store.write")).Post("/{id}/make-primary", wh.MakePrimaryBank)
			br.With(middleware.RequirePermission("seller.store.write")).Delete("/{id}", wh.DeleteBank)
		})
		r.With(handlers.RequireAuth, middleware.RequirePermission("seller.store.write")).
			Post("/v1/stores/{storeId}/withdrawal-quotes", wh.CreateQuote)
		r.Route("/v1/stores/{storeId}/withdrawals", func(wr chi.Router) {
			wr.Use(handlers.RequireAuth)
			wr.With(middleware.RequirePermission("seller.store.read")).Get("/", wh.ListWithdrawals)
			wr.With(middleware.RequirePermission("seller.store.read")).Get("/lock", wh.GetLock)
			wr.With(middleware.RequirePermission("seller.store.read")).Get("/{withdrawalId}", wh.GetWithdrawal)
			wr.With(middleware.RequirePermission("seller.store.write")).Post("/", wh.CreateWithdrawal)
		})
		r.Route("/v1/admin/withdrawals", func(ar chi.Router) {
			ar.Use(handlers.RequireAuth)
			// BE-500 FE-aligned list/detail when AdminReadService wired; else BE-350 domain DTO.
			if d.AdminReadService != nil {
				arh := &handlers.AdminReadHandler{Svc: d.AdminReadService}
				ar.With(middleware.RequirePermission("withdrawals.review")).Get("/", arh.ListWithdrawalsFE)
				ar.With(middleware.RequirePermission("withdrawals.review")).Get("/{withdrawalId}", arh.GetWithdrawalFE)
			} else {
				ar.With(middleware.RequirePermission("withdrawals.review")).Get("/", wh.AdminList)
				ar.With(middleware.RequirePermission("withdrawals.review")).Get("/{withdrawalId}", wh.AdminGet)
			}
			ar.With(middleware.RequirePermission("withdrawals.review")).Post("/{withdrawalId}/review", wh.AdminReview)
		})
		r.Post("/v1/webhooks/xendit/disbursement", wh.DisbursementWebhook)
	}

	// BE-320 QRIS Payment Gateway API (API-key auth; payment-only).
	if d.GatewayService != nil {
		gh := &handlers.GatewayHandler{Svc: d.GatewayService}
		apiKey := middleware.RequireGatewayAPIKey(d.GatewayService)
		// Canonical paths
		r.Route("/v1/gateway", func(gr chi.Router) {
			gr.Use(apiKey)
			gr.Post("/payment-intents", gh.CreatePayment)
			gr.Get("/payment-intents/{paymentIntentId}", gh.GetPayment)
			gr.Post("/payment-intents/{paymentIntentId}/cancel", gh.CancelPayment)
			gr.Get("/payment-intents/{paymentIntentId}/events", gh.ListEvents)
			gr.Get("/events/{eventId}", gh.GetEvent)
			// Explicit: no product/catalog/upload under gateway.
			gr.HandleFunc("/products", handlers.RejectGatewayProduct)
			gr.HandleFunc("/products/*", handlers.RejectGatewayProduct)
			gr.HandleFunc("/catalog", handlers.RejectGatewayProduct)
			gr.HandleFunc("/catalog/*", handlers.RejectGatewayProduct)
			gr.HandleFunc("/uploads", handlers.RejectGatewayProduct)
			gr.HandleFunc("/uploads/*", handlers.RejectGatewayProduct)
		})
		// Legacy compatibility aliases (§7.7) — same use case + deprecation headers.
		r.Route("/v1/qris", func(qr chi.Router) {
			qr.Use(apiKey)
			qr.Post("/payments", gh.CreatePaymentLegacy)
			qr.Get("/payments/{paymentIntentId}", gh.GetPaymentLegacy)
			qr.Post("/payments/{paymentIntentId}/cancel", gh.CancelPaymentLegacy)
			qr.Get("/events/{eventId}", gh.GetEventLegacy)
			qr.HandleFunc("/products", handlers.RejectGatewayProduct)
			qr.HandleFunc("/products/*", handlers.RejectGatewayProduct)
		})
	}

	// BE-235 delivery grants, attempts, immutable invoices + BE-430 purchase detail.
	if d.DeliveryService != nil || d.BuyerService != nil {
		dh := &handlers.DeliveryHandler{Svc: d.DeliveryService}
		bhPurchase := &handlers.BuyerHandler{Buyer: d.BuyerService, Auth: d.AuthService}
		// Buyer purchase delivery + ownership detail
		r.Route("/v1/buyer/purchases/{orderId}", func(br chi.Router) {
			// Ownership enforced in use case; missing cross-tenant order → RESOURCE_NOT_FOUND.
			br.Use(handlers.RequireAuth)
			if d.BuyerService != nil {
				br.Get("/", bhPurchase.GetPurchase)
			}
			if d.DeliveryService != nil {
				br.Post("/delivery/access", dh.BuyerAccess)
				br.Post("/delivery/resend", dh.BuyerResend)
				br.Get("/invoice", dh.BuyerInvoice)
			}
		})
	}
	// SEL-250 seller order list/detail (store-scoped read model).
	// Registered before delivery subroutes under the same path prefix.
	if d.SellerOrderService != nil {
		soh := &handlers.SellerOrderHandler{Svc: d.SellerOrderService}
		r.Route("/v1/stores/{storeId}/orders", func(or chi.Router) {
			or.Use(handlers.RequireAuth)
			or.With(middleware.RequirePermission("seller.store.read")).Get("/", soh.ListOrders)
			or.With(middleware.RequirePermission("seller.store.read")).Get("/{orderId}", soh.GetOrder)
		})
	}
	// SEL-260 seller customer list/detail/notes (store-scoped purchase aggregate).
	if d.SellerCustomerService != nil {
		sch := &handlers.SellerCustomerHandler{Svc: d.SellerCustomerService}
		r.Route("/v1/stores/{storeId}/customers", func(cr chi.Router) {
			cr.Use(handlers.RequireAuth)
			cr.With(middleware.RequirePermission("seller.store.read")).Get("/", sch.ListCustomers)
			cr.With(middleware.RequirePermission("seller.store.read")).Get("/{customerId}", sch.GetCustomer)
			cr.With(middleware.RequirePermission("seller.store.write")).Put("/{customerId}/notes", sch.UpsertNote)
		})
	}
	if d.DeliveryService != nil {
		dh := &handlers.DeliveryHandler{Svc: d.DeliveryService}
		// Order-scoped delivery/invoice (session or token)
		r.Route("/v1/orders/{orderId}", func(or chi.Router) {
			or.Post("/delivery/access", dh.OrderAccess)
			or.Group(func(pr chi.Router) {
				pr.Use(handlers.RequireAuth)
				pr.Get("/invoice", dh.OrderInvoiceGet)
				pr.Post("/invoice", dh.OrderInvoicePost)
			})
		})
		// Seller delivery actions
		r.Route("/v1/stores/{storeId}/orders/{orderId}", func(sr chi.Router) {
			sr.Use(handlers.RequireAuth)
			sr.With(middleware.RequirePermission("seller.store.read")).Get("/delivery", dh.SellerGetGrant)
			sr.With(middleware.RequirePermission("seller.store.write")).Post("/delivery/resend", dh.SellerResend)
			sr.With(middleware.RequirePermission("seller.store.write")).Post("/delivery/retry", dh.SellerRetry)
			sr.With(middleware.RequirePermission("seller.store.write")).Post("/delivery/revoke", dh.SellerRevoke)
		})
		// Admin force-fulfill / revoke (no secrets)
		r.Route("/v1/admin/orders/{orderId}", func(ar chi.Router) {
			ar.Use(handlers.RequireAuth)
			ar.With(middleware.RequirePermission("fulfillment.force")).Post("/delivery/force-fulfill", dh.AdminForceFulfill)
			ar.With(middleware.RequirePermission("fulfillment.force")).Post("/delivery/revoke", dh.AdminRevoke)
		})
		// Invoices
		r.With(handlers.RequireAuth).Get("/v1/invoices/{invoiceId}", dh.GetInvoice)
		r.Get("/v1/invoices/verify/{code}", dh.PublicVerify)
		r.Post("/v1/public/invoices/verify", dh.PublicVerify)
		// Local/test paid-order stub (no live Xendit) — gated to non-production by handler callers in tests.
		if d.AppEnv == config.EnvLocal || d.AppEnv == config.EnvTest {
			r.With(handlers.RequireAuth).Post("/v1/_test/paid-orders", dh.CreatePaidStub)
		}
	}

	// BE-140 notification inbox (canonical + shell aliases; same recipient-scoped use case).
	if d.NotificationService != nil {
		nh := &handlers.NotificationsHandler{Svc: d.NotificationService}
		mount := func(r chi.Router) {
			r.Get("/", nh.List)
			r.Get("/unread-count", nh.UnreadCount)
			r.Post("/read-all", nh.MarkAllRead)
			r.Post("/{notificationId}/read", nh.MarkRead)
		}
		r.Route("/v1/notifications", func(nr chi.Router) {
			nr.Use(handlers.RequireAuth)
			mount(nr)
		})
		// Thin compatibility adapters — never select another recipient.
		r.Route("/v1/buyer/notifications", func(nr chi.Router) {
			nr.Use(handlers.RequireAuth)
			mount(nr)
		})
		r.Route("/v1/admin/notifications", func(nr chi.Router) {
			nr.Use(handlers.RequireAuth)
			mount(nr)
		})
		r.Route("/v1/seller/notifications", func(nr chi.Router) {
			nr.Use(handlers.RequireAuth)
			mount(nr)
		})
	}

	return r
}

func versionFromEnv() string {
	return "0.0.0-dev"
}
