// Package app is the composition root: wires config, ports, adapters, and
// constructs API/worker runtimes. Only this package (and cmd) may import adapters.
package app

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	dnsadapter "github.com/dasepmoch/fersaku-new/backend/internal/adapters/dns"
	edgeadapter "github.com/dasepmoch/fersaku-new/backend/internal/adapters/edge"
	httpadapter "github.com/dasepmoch/fersaku-new/backend/internal/adapters/http"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/middleware"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/mail"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/observability"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/postgres"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/queue"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/r2"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/redis"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/duitku"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/xendit"
	"github.com/dasepmoch/fersaku-new/backend/internal/application"
	"github.com/dasepmoch/fersaku-new/backend/internal/config"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/admin"
	domainauth "github.com/dasepmoch/fersaku-new/backend/internal/domain/auth"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/payments"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/dasepmoch/fersaku-new/backend/internal/jobs"
	"github.com/dasepmoch/fersaku-new/backend/internal/ports"
	"github.com/dasepmoch/fersaku-new/backend/internal/version"
)

// DBPinger is satisfied by postgres.Pool and postgres.Noop.
type DBPinger interface {
	Ping(ctx context.Context) error
}

// paymentAdapter is QRIS + disbursement (Fake or Real) when both share one adapter.
// PROD-A20 may wire separate adapters; Runtime still exposes a combined view when possible.
type paymentAdapter interface {
	ports.QRISProvider
	ports.DisbursementProvider
	Name() string
	IsFake() bool
}

// dualProviderAdapter composes separate QRIS and disbursement adapters (PROD-A20).
type dualProviderAdapter struct {
	ports.QRISProvider
	ports.DisbursementProvider
	kind string
	fake bool
}

func (d dualProviderAdapter) Name() string { return d.kind }
func (d dualProviderAdapter) IsFake() bool { return d.fake }

// RedisPinger is satisfied by redis.Client and redis.Noop wrappers.
type RedisPinger interface {
	Ping(ctx context.Context) error
	Kind() string
	Close() error
}

// noopRedis adapts redis.Noop to RedisPinger.
type noopRedis struct{}

func (noopRedis) Ping(context.Context) error { return nil }
func (noopRedis) Kind() string               { return "noop" }
func (noopRedis) Close() error               { return nil }

// Runtime holds shared dependencies for api and worker.
type Runtime struct {
	Config config.Config
	Log    ports.Logger
	Clock  ports.Clock
	IDs    ports.IDGenerator
	Queue  ports.Queue
	Mail   ports.Mailer
	// DB is the real pool when DATABASE_URL is set; nil otherwise.
	DB *postgres.Pool
	// DBPing is always non-nil (Pool or Noop) for readiness checks.
	DBPing DBPinger
	// Redis is real client on staging/production; noop only local/test.
	Redis RedisPinger
	// Payment is the composed QRIS+disbursement view (may be dual adapters; PROD-A20).
	Payment paymentAdapter
	// QRIS is the payment (QRIS) port; Disburse is the withdrawal port.
	QRIS     ports.QRISProvider
	Disburse ports.DisbursementProvider
	// XenditFake is non-nil only when fake adapter selected (local/test).
	XenditFake *xendit.Fake
	// Adapter kinds for truthful readiness/admin health (never secrets).
	// XenditKind remains for compat; prefer PaymentKind + DisbursementKind.
	XenditKind         string
	PaymentKind        string
	DisbursementKind   string
	MailKind           string
	RedisKind          string
	// RateLimiter is process-local on local/test; Redis-backed on staging/production.
	RateLimiter middleware.Limiter
	R2          r2.Noop
	Health      *application.HealthService
	// Auth is wired when DATABASE_URL is set (BE-120).
	Auth *application.AuthService
	// Authz is wired when DATABASE_URL is set (BE-130).
	Authz *application.AuthzService
	// Notifications is wired when DATABASE_URL is set (BE-140).
	Notifications *application.NotificationService
	// Onboarding is wired when DATABASE_URL is set (BE-200).
	Onboarding *application.OnboardingService
	// Catalog is wired when DATABASE_URL is set (BE-210).
	Catalog *application.CatalogService
	// Coupons is wired when DATABASE_URL is set (BE-215).
	Coupons *application.CouponService
	// Objects is wired when DATABASE_URL is set (BE-220); uses MinIO/R2 when configured.
	Objects *application.ObjectService
	// Inventory is wired when DATABASE_URL is set (BE-230).
	Inventory *application.InventoryService
	// Delivery is wired when DATABASE_URL is set (BE-235).
	Delivery *application.DeliveryService
	// Domains is wired when DATABASE_URL is set (BE-240).
	Domains *application.DomainService
	// Fees is always wired (pure calculator); uses DB when pool available (BE-300).
	Fees *application.FeeService
	// Checkout is wired when DATABASE_URL is set (BE-310).
	Checkout *application.CheckoutService
	// Gateway is wired when DATABASE_URL is set (BE-320).
	Gateway *application.GatewayService
	// Callbacks is wired when DATABASE_URL is set (BE-330).
	Callbacks *application.CallbackService
	// Ledger is wired when DATABASE_URL is set (BE-340).
	Ledger *application.LedgerService
	// Withdrawals is wired when DATABASE_URL is set (BE-350).
	Withdrawals *application.WithdrawalService
	// Analytics is wired when DATABASE_URL is set (BE-360).
	Analytics *application.AnalyticsService
	// KYC is wired when DATABASE_URL is set (BE-400).
	KYC *application.KYCService
	// Credentials is wired when DATABASE_URL is set (BE-410).
	Credentials *application.CredentialService
	// Webhooks is wired when DATABASE_URL is set (BE-420).
	Webhooks *application.WebhookService
	// Buyer is wired when DATABASE_URL is set (BE-430).
	Buyer *application.BuyerService
	// SellerOrders is wired when DATABASE_URL is set (SEL-250).
	SellerOrders *application.SellerOrderService
	// SellerCustomers is wired when DATABASE_URL is set (SEL-260).
	SellerCustomers *application.SellerCustomerService
	// Reviews is wired when DATABASE_URL is set (BE-430).
	Reviews *application.ReviewService
	// AdminReads is wired when DATABASE_URL is set (BE-500).
	AdminReads *application.AdminReadService
	// AdminOps is wired when DATABASE_URL is set (BE-510).
	AdminOps *application.AdminOpsService
	// Impersonation is wired when DATABASE_URL is set (BE-520).
	Impersonation *application.ImpersonationService
	// Audit is wired when DATABASE_URL is set (BE-530 JCS-1 chain).
	Audit *application.AuditService
	// ObjectStore is the S3-compatible port (MinIO local / R2 prod).
	ObjectStore ports.ObjectStore
}

// NewRuntime loads config and wires adapters. Uses real pgx pool when DATABASE_URL is set.
// INT-180: staging/production reject fake/noop payment, mail, redis, and storage authority.
func NewRuntime(serviceName string) (*Runtime, error) {
	cfg, err := config.Load(serviceName)
	if err != nil {
		return nil, err
	}
	log := observability.NewSlogLogger(cfg.LogLevel, cfg.ServiceName)
	clock := observability.SystemClock{}
	ids := observability.NewULIDGenerator()
	q := queue.NewFake()

	// --- Mail (capture/noop local only; SMTP required on live runtime) ---
	mailer, mailKind, err := wireMailer(cfg)
	if err != nil {
		return nil, err
	}

	// --- Redis (noop local/test; real required on staging/production) ---
	var rd RedisPinger = noopRedis{}
	redisKind := "noop"
	var redisClient *redis.Client
	if cfg.RedisURL != "" {
		rc, rerr := redis.NewClient(redis.Config{URL: cfg.RedisURL})
		if rerr != nil {
			if cfg.IsLiveRuntime() {
				return nil, fmt.Errorf("app: redis required on staging/production: %w", rerr)
			}
			log.Warn("redis unavailable; using noop", "err", rerr.Error())
		} else {
			redisClient = rc
			rd = rc
			redisKind = "redis"
		}
	} else if cfg.IsLiveRuntime() {
		return nil, fmt.Errorf("app: REDIS_URL required on staging/production (INT-180)")
	}

	// --- Payment (QRIS) + disbursement (PROD-A20 dual-provider) ---
	accountScope := cfg.XenditAccountScope
	if accountScope == "" {
		accountScope = "xendit-primary"
	}
	qris, disburse, xdFake, paymentKind, disbursementKind, err := wireMoneyProviders(cfg, accountScope, log)
	if err != nil {
		return nil, err
	}
	// Compat health label: fake only when both sides fake; else real if any xendit real path.
	xenditKind := "real"
	if paymentKind == "fake" && disbursementKind == "fake" {
		xenditKind = "fake"
	} else if paymentKind == "fake" || disbursementKind == "fake" {
		xenditKind = "mixed"
	}
	pay := dualProviderAdapter{
		QRISProvider:         qris,
		DisbursementProvider: disburse,
		kind:                 "payment=" + paymentKind + "+disbursement=" + disbursementKind,
		fake:                 paymentKind == "fake" && disbursementKind == "fake",
	}

	// --- Object store ---
	var objStore ports.ObjectStore = r2.Noop{}
	if cfg.R2Endpoint != "" && cfg.R2AccessKeyID != "" && cfg.R2SecretAccessKey != "" {
		client, cerr := r2.NewClient(r2.Config{
			Endpoint:        cfg.R2Endpoint,
			Region:          cfg.R2Region,
			AccessKeyID:     cfg.R2AccessKeyID,
			SecretAccessKey: cfg.R2SecretAccessKey,
			ForcePathStyle:  cfg.R2ForcePathStyle,
		})
		if cerr != nil {
			return nil, fmt.Errorf("app: r2 client: %w", cerr)
		}
		objStore = client
		if cfg.AppEnv == config.EnvLocal || cfg.AppEnv == config.EnvTest {
			bctx, bcancel := context.WithTimeout(context.Background(), 5*time.Second)
			_ = r2.EnsureBuckets(bctx, client, cfg.R2BucketPublic, cfg.R2BucketPrivate)
			bcancel()
		}
	} else if cfg.IsLiveRuntime() && cfg.AppEnv == config.EnvProduction {
		return nil, fmt.Errorf("app: object storage (R2) required when APP_ENV=production (INT-180)")
	}

	// --- Rate limiter: process-local local/test; Redis on live ---
	var rateLimiter middleware.Limiter = middleware.NewTokenBucketLimiter(120, 20)
	if cfg.RequiresDistributedLimiter() {
		if redisClient == nil {
			return nil, fmt.Errorf("app: redis rate limiter required on staging/production (INT-180)")
		}
		rateLimiter = redis.NewTokenBucketLimiter(redisClient, 120, time.Minute)
	}

	var pool *postgres.Pool
	var dbPing DBPinger = postgres.Noop{}
	adapters := paymentKind + "/" + disbursementKind + "+" + mailKind + "+" + redisKind
	if cfg.DatabaseURL != "" {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		pool, err = postgres.Open(ctx, cfg.DatabaseURL, postgres.DefaultPoolConfig())
		if err != nil {
			return nil, fmt.Errorf("app: open database: %w", err)
		}
		dbPing = pool
		adapters = "postgres+" + adapters
		if objStore.Configured() {
			adapters += "+r2"
		}
	} else if cfg.IsLiveRuntime() {
		return nil, fmt.Errorf("app: DATABASE_URL required on staging/production")
	}

	// Truthful readiness: never report OK for fake/noop on live runtime.
	healthChecks := []func() error{
		func() error {
			ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			defer cancel()
			return dbPing.Ping(ctx)
		},
	}
	if cfg.IsLiveRuntime() || redisKind == "redis" {
		healthChecks = append(healthChecks, func() error {
			ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			defer cancel()
			if rd.Kind() == "noop" && cfg.IsLiveRuntime() {
				return fmt.Errorf("redis: noop not allowed on live runtime")
			}
			return rd.Ping(ctx)
		})
	}
	if cfg.IsLiveRuntime() {
		healthChecks = append(healthChecks, func() error {
			// Staging drill may allow fake via ALLOW_FAKE_PROVIDERS; production never.
			if cfg.AppEnv == config.EnvProduction {
				if paymentKind == "fake" || disbursementKind == "fake" {
					return fmt.Errorf("providers: fake payment/disbursement not allowed on production")
				}
			} else if !cfg.AllowFakeProviders {
				if paymentKind == "fake" || disbursementKind == "fake" {
					return fmt.Errorf("providers: fake payment/disbursement not allowed on live runtime without ALLOW_FAKE_PROVIDERS")
				}
			}
			return nil
		})
		healthChecks = append(healthChecks, func() error {
			if mailKind == "noop" || mailKind == "capture" {
				return fmt.Errorf("mail: %s not allowed on live runtime", mailKind)
			}
			return nil
		})
		if cfg.AppEnv == config.EnvProduction {
			healthChecks = append(healthChecks, func() error {
				if !objStore.Configured() {
					return fmt.Errorf("object store: not configured")
				}
				return nil
			})
		}
	}
	health := application.NewHealthService(healthChecks...)

	var authSvc *application.AuthService
	var authzSvc *application.AuthzService
	var notifSvc *application.NotificationService
	var onboardSvc *application.OnboardingService
	var catalogSvc *application.CatalogService
	var couponSvc *application.CouponService
	var objectSvc *application.ObjectService
	var inventorySvc *application.InventoryService
	var deliverySvc *application.DeliveryService
	var domainSvc *application.DomainService
	var feeSvc *application.FeeService
	var checkoutSvc *application.CheckoutService
	var gatewaySvc *application.GatewayService
	var callbackSvc *application.CallbackService
	var ledgerSvc *application.LedgerService
	var withdrawalSvc *application.WithdrawalService
	var analyticsSvc *application.AnalyticsService
	var kycSvc *application.KYCService
	var credentialSvc *application.CredentialService
	var webhookSvc *application.WebhookService
	var buyerSvc *application.BuyerService
	var sellerOrderSvc *application.SellerOrderService
	var sellerCustomerSvc *application.SellerCustomerService
	var reviewSvc *application.ReviewService
	var adminReadSvc *application.AdminReadService
	var adminOpsSvc *application.AdminOpsService
	var impersonationSvc *application.ImpersonationService
	var auditSvc *application.AuditService
	if pool != nil {
		store := postgres.IdentityStore{Repo: postgres.NewIdentityRepo(pool.Pool())}
		authzSvc = &application.AuthzService{
			Store:    postgres.NewAuthzRepo(pool.Pool()),
			IDs:      ids,
			Clock:    clock,
			Log:      log,
			Mail:     mailer,
			Sessions: store,
		}
		authSvc = &application.AuthService{
			Store: store,
			IDs:   ids,
			Clock: clock,
			Mail:  mailer,
			Log:   log,
			Config: application.AuthConfig{
				SessionCookieName: cfg.SessionCookieName,
				TokenHashSecret:   cfg.SessionSecret,
				SecureCookie:      cfg.AppEnv == config.EnvProduction || cfg.AppEnv == config.EnvStaging,
				SameSiteStrict:    false, // Lax default for storefronts; Strict optional for admin deploy
			},
			Authz: authzSvc,
		}
		notifSvc = &application.NotificationService{
			Store: postgres.NewNotificationRepo(pool.Pool()),
			IDs:   ids,
			Clock: clock,
			Mail:  mailer,
			Log:   log,
		}
		onboardSvc = &application.OnboardingService{
			Store: postgres.NewOnboardingRepo(pool.Pool()),
			IDs:   ids,
			Clock: clock,
			Log:   log,
		}
		catalogSvc = &application.CatalogService{
			Store: postgres.NewCatalogRepo(pool.Pool()),
			IDs:   ids,
			Clock: clock,
			Log:   log,
		}
		couponSvc = &application.CouponService{
			Store: postgres.NewCouponRepo(pool.Pool()),
			IDs:   ids,
			Clock: clock,
			Log:   log,
		}
		objectSvc = &application.ObjectService{
			Store:                  postgres.NewObjectRepo(pool.Pool()),
			Objects:                objStore,
			IDs:                    ids,
			Clock:                  clock,
			Log:                    log,
			BucketPublic:           cfg.R2BucketPublic,
			BucketPrivate:          cfg.R2BucketPrivate,
			MerchantSoftQuotaBytes: 0, // default domain soft limit
			// Local/test allow pass-through scan; production must wire real scanner later.
			LocalScanPass: cfg.AppEnv == config.EnvLocal || cfg.AppEnv == config.EnvTest,
		}
		stockKey := cfg.EffectiveStockEncryptionKey()
		if stockKey == "" && (cfg.AppEnv == config.EnvLocal || cfg.AppEnv == config.EnvTest) {
			stockKey = "local-dev-stock-encryption-key!!!!"
		}
		inventorySvc = &application.InventoryService{
			Store:         postgres.NewInventoryRepo(pool.Pool()),
			IDs:           ids,
			Clock:         clock,
			Log:           log,
			EncryptionKey: stockKey,
		}
		deliverySvc = &application.DeliveryService{
			Store:         postgres.NewDeliveryRepo(pool.Pool()),
			IDs:           ids,
			Clock:         clock,
			Log:           log,
			EncryptionKey: stockKey,
			TokenSecret:   cfg.SessionSecret,
		}
		domainSvc = &application.DomainService{
			Store:       postgres.NewDomainRepo(pool.Pool()),
			DNS:         dnsadapter.NewFake(),
			Edge:        edgeadapter.NewFake(),
			IDs:         ids,
			Clock:       clock,
			Log:         log,
			TokenSecret: cfg.SessionSecret,
		}
		feeSvc = &application.FeeService{
			Store: postgres.NewFeeRepo(pool.Pool()),
			IDs:   ids,
			Clock: clock,
			Log:   log,
		}
		// payment_mode is financial identity (SANDBOX|LIVE), not APP_ENV.
		// Production defaults LIVE; staging/local default SANDBOX with real or fake provider.
		paymentMode := "SANDBOX"
		if cfg.AppEnv == config.EnvProduction {
			paymentMode = "LIVE"
		}
		// BE-360: attribution analytics (wired before checkout/gateway/callback).
		analyticsSvc = &application.AnalyticsService{
			Store:          postgres.NewAnalyticsRepo(pool.Pool()),
			IDs:            ids,
			Clock:          clock,
			Log:            log,
			HashSecret:     cfg.SessionSecret,
			HashKeyVersion: "v1",
		}
		// Intent provider identity for callbacks (PROD-B30): match PAYMENT_PROVIDER.
		payProvider, payScope := paymentIntentIdentity(cfg, accountScope)
		checkoutSvc = &application.CheckoutService{
			Store:               postgres.NewCheckoutRepo(pool.Pool()),
			Fees:                feeSvc,
			Coupons:             couponSvc,
			Inventory:           inventorySvc,
			Analytics:           analyticsSvc,
			QRIS:                qris,
			IDs:                 ids,
			Clock:               clock,
			Log:                 log,
			PaymentMode:         paymentMode,
			AccountScope:        accountScope,
			PaymentProvider:     payProvider,
			PaymentAccountScope: payScope,
			SimulateEnabled:     (cfg.AppEnv == config.EnvLocal || cfg.AppEnv == config.EnvTest) && xdFake != nil,
			TokenSecret:         cfg.SessionSecret,
		}
		// BE-320: QRIS gateway shares fee service + QRIS provider; mode from API key.
		gatewaySvc = &application.GatewayService{
			Store:               postgres.NewGatewayRepo(pool.Pool()),
			Fees:                feeSvc,
			Analytics:           analyticsSvc,
			QRIS:                qris,
			IDs:                 ids,
			Clock:               clock,
			Log:                 log,
			KeyHashSecret:       cfg.SessionSecret,
			AccountScope:        payScope,
			PaymentProvider:     payProvider,
			PaymentAccountScope: payScope,
		}
		// BE-340: unified ledger; local/test force immediate available (delay 0 policy via ForceImmediateRelease).
		ledgerSvc = &application.LedgerService{
			Store:                 postgres.NewLedgerRepo(pool.Pool()),
			IDs:                   ids,
			Clock:                 clock,
			Log:                   log,
			Authz:                 authzSvc,
			ForceImmediateRelease: cfg.AppEnv == config.EnvLocal || cfg.AppEnv == config.EnvTest,
			DefaultPaymentMode:    paymentMode,
		}
		// BE-420: outbound seller webhooks (before callback so paid path can enqueue).
		whEnc := cfg.KYCEncryptionKey
		if whEnc == "" {
			whEnc = cfg.EffectiveStockEncryptionKey()
		}
		if whEnc == "" && (cfg.AppEnv == config.EnvLocal || cfg.AppEnv == config.EnvTest) {
			whEnc = "local-dev-webhook-encryption-key!!"
		}
		webhookSvc = &application.WebhookService{
			Store:           postgres.NewWebhookRepo(pool.Pool()),
			Auth:            authSvc,
			IDs:             ids,
			Clock:           clock,
			Log:             log,
			EncryptionKey:   whEnc,
			ClaimHashSecret: cfg.SessionSecret,
		}
		// BE-330: inbound Xendit callbacks; token from config (empty rejects all).
		webhookToken := cfg.XenditWebhookToken
		if webhookToken == "" && (cfg.AppEnv == config.EnvLocal || cfg.AppEnv == config.EnvTest) {
			webhookToken = "local-xendit-webhook-token"
		}
		duitkuScope := strings.TrimSpace(cfg.DuitkuAccountScope)
		if duitkuScope == "" {
			duitkuScope = "duitku-primary"
		}
		callbackSvc = &application.CallbackService{
			Store:              postgres.NewCallbackRepo(pool.Pool()),
			Coupons:            couponSvc,
			Delivery:           deliverySvc,
			Inventory:          inventorySvc,
			DeliveryStore:      postgres.NewDeliveryRepo(pool.Pool()),
			Ledger:             ledgerSvc,
			Analytics:          analyticsSvc,
			Webhooks:           webhookSvc,
			IDs:                ids,
			Clock:              clock,
			Log:                log,
			WebhookToken:       webhookToken,
			AccountScope:       accountScope,
			DefaultPaymentMode: paymentMode,
			TokenSecret:        cfg.SessionSecret,
			DuitkuMerchantCode: cfg.DuitkuMerchantCode,
			DuitkuAPIKey:       cfg.DuitkuAPIKey,
			DuitkuAccountScope: duitkuScope,
		}
		// BE-350: bank accounts, quotes, reserve, disbursement.
		encKey := stockKey
		if encKey == "" {
			encKey = cfg.KYCEncryptionKey
		}
		if encKey == "" && (cfg.AppEnv == config.EnvLocal || cfg.AppEnv == config.EnvTest) {
			encKey = "local-dev-stock-encryption-key!!!!"
		}
		auto := cfg.AppEnv == config.EnvLocal || cfg.AppEnv == config.EnvTest
		withdrawalSvc = &application.WithdrawalService{
			Store:              postgres.NewWithdrawalRepo(pool.Pool()),
			Ledger:             ledgerSvc,
			Fees:               feeSvc,
			Disburse:           disburse,
			IDs:                ids,
			Clock:              clock,
			Log:                log,
			EncryptionKey:      encKey,
			AccountScope:       accountScope,
			DefaultPaymentMode: paymentMode,
			ForceAutoApprove:   &auto,
		}
		// BE-400: KYC live QRIS API workflow (server-mediated upload + capability grant).
		kycKey := cfg.KYCEncryptionKey
		if kycKey == "" && (cfg.AppEnv == config.EnvLocal || cfg.AppEnv == config.EnvTest) {
			kycKey = "local-dev-kyc-encryption-key!!!!!"
		}
		privBucket := cfg.R2BucketPrivate
		if privBucket == "" {
			privBucket = "fersaku-private"
		}
		kycSvc = &application.KYCService{
			Store:         postgres.NewKYCRepo(pool.Pool()),
			Objects:       objStore,
			BucketPrivate: privBucket,
			EncryptionKey: kycKey,
			LocalScanPass: cfg.AppEnv == config.EnvLocal || cfg.AppEnv == config.EnvTest,
			IDs:           ids,
			Clock:         clock,
			Log:           log,
		}
		// BE-410: credential lifecycle (claim/revoke; admin never raw).
		credentialSvc = &application.CredentialService{
			Store:           postgres.NewCredentialRepo(pool.Pool()),
			Auth:            authSvc,
			IDs:             ids,
			Clock:           clock,
			Log:             log,
			KeyHashSecret:   cfg.SessionSecret,
			ClaimHashSecret: cfg.SessionSecret,
		}
		// BE-430: buyer purchases + verified reviews.
		buyerSvc = &application.BuyerService{
			Purchases: postgres.NewBuyerRepo(pool.Pool()),
			Auth:      authSvc,
			IDs:       ids,
			Clock:     clock,
			Log:       log,
		}
		// SEL-250: seller store-scoped order list/detail.
		sellerOrderSvc = &application.SellerOrderService{
			Store: postgres.NewSellerOrderRepo(pool.Pool()),
			Clock: clock,
			Log:   log,
		}
		// SEL-260: seller store-scoped customer list/detail/notes.
		sellerCustomerSvc = &application.SellerCustomerService{
			Store: postgres.NewSellerCustomerRepo(pool.Pool()),
			IDs:   ids,
			Clock: clock,
			Log:   log,
		}
		reviewSvc = &application.ReviewService{
			Store: postgres.NewReviewRepo(pool.Pool()),
			IDs:   ids,
			Clock: clock,
			Log:   log,
		}
		// BE-500: permissioned admin read models.
		adminReadSvc = &application.AdminReadService{
			Store: postgres.NewAdminRepo(pool.Pool()),
			Clock: clock,
			Log:   log,
		}
		// BE-530: JCS-1 append-only audit chain.
		auditSvc = &application.AuditService{
			Store: postgres.NewAuditRepo(pool.Pool()),
			IDs:   ids,
			Clock: clock,
			Log:   log,
		}
		// BE-510: lightweight admin operations + actions dispatcher.
		adminOpsSvc = &application.AdminOpsService{
			Store:       postgres.NewAdminOpsRepo(pool.Pool()),
			Auth:        authSvc,
			Delivery:    deliverySvc,
			Withdrawals: withdrawalSvc,
			Credentials: credentialSvc,
			Fees:        feeSvc,
			Audit:       auditSvc,
			IDs:         ids,
			Clock:       clock,
			Log:         log,
			ComponentHealth: func(ctx context.Context) []admin.ComponentHealth {
				return platformComponentHealth(ctx, pool, clock, xenditKind, paymentKind, disbursementKind, mailKind, redisKind, rd, objStore, cfg)
			},
		}
		// BE-520: admin impersonation (derived session + scope gate).
		impersonationSvc = &application.ImpersonationService{
			Store: postgres.NewImpersonationRepo(pool.Pool()),
			Auth:  authSvc,
			IDs:   ids,
			Clock: clock,
			Log:   log,
		}
		authSvc.Impersonation = impersonationSvc
		// Wire emergency switches into create paths (checkout/gateway/withdrawals).
		emCheck := func(ctx context.Context, switchName string) (bool, error) {
			return adminOpsSvc.IsEmergencyDisabled(ctx, switchName)
		}
		if checkoutSvc != nil {
			checkoutSvc.EmergencyDisabled = emCheck
		}
		if gatewaySvc != nil {
			gatewaySvc.EmergencyDisabled = emCheck
		}
		if withdrawalSvc != nil {
			withdrawalSvc.EmergencyDisabled = emCheck
		}
	} else {
		// No DB: pure in-memory launch policy for calculator/preview unit paths.
		feeSvc = &application.FeeService{
			IDs:   ids,
			Clock: clock,
			Log:   log,
		}
	}

	rt := &Runtime{
		Config:        cfg,
		Log:           log,
		Clock:         clock,
		IDs:           ids,
		Queue:         q,
		Mail:          mailer,
		DB:            pool,
		DBPing:        dbPing,
		Redis:         rd,
		Payment:          pay,
		QRIS:             qris,
		Disburse:         disburse,
		XenditFake:       xdFake,
		XenditKind:       xenditKind,
		PaymentKind:      paymentKind,
		DisbursementKind: disbursementKind,
		MailKind:         mailKind,
		RedisKind:        redisKind,
		RateLimiter:   rateLimiter,
		R2:            r2.Noop{},
		ObjectStore:   objStore,
		Health:        health,
		Auth:          authSvc,
		Authz:         authzSvc,
		Notifications: notifSvc,
		Onboarding:    onboardSvc,
		Catalog:       catalogSvc,
		Coupons:       couponSvc,
		Objects:       objectSvc,
		Inventory:     inventorySvc,
		Delivery:      deliverySvc,
		Domains:       domainSvc,
		Fees:          feeSvc,
		Checkout:      checkoutSvc,
		Gateway:       gatewaySvc,
		Callbacks:     callbackSvc,
		Ledger:        ledgerSvc,
		Withdrawals:   withdrawalSvc,
		Analytics:     analyticsSvc,
		KYC:           kycSvc,
		Credentials:   credentialSvc,
		Webhooks:      webhookSvc,
		Buyer:         buyerSvc,
		SellerOrders:     sellerOrderSvc,
		SellerCustomers:  sellerCustomerSvc,
		Reviews:          reviewSvc,
		AdminReads:    adminReadSvc,
		AdminOps:      adminOpsSvc,
		Impersonation: impersonationSvc,
		Audit:         auditSvc,
	}
	// BE-600: scrape-time gauges for outbox lag + audit head (cheap SELECT).
	wireMetricsScrape(rt)

	rt.Log.Info("runtime wired",
		"app_env", string(cfg.AppEnv),
		"service", cfg.ServiceName,
		"adapters", adapters,
		"payment_provider", paymentKind,
		"disbursement_provider", disbursementKind,
		"database", cfg.DatabaseURL != "",
	)
	return rt, nil
}

// wireMetricsScrape registers process metrics scrape gauges (BE-600).
func wireMetricsScrape(rt *Runtime) {
	if rt == nil {
		return
	}
	// Import via observability re-export keeps composition root free of platform path churn.
	observability.Global.SetScrapeGauges(func() map[string]float64 {
		out := map[string]float64{
			"fersaku_outbox_pending":            0,
			"fersaku_outbox_oldest_age_seconds": 0,
			"fersaku_audit_chain_head_sequence": 0,
			"fersaku_audit_chain_ok":            1,
		}
		if rt.DB == nil {
			return out
		}
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		var pending int64
		var oldestAge float64
		_ = rt.DB.Pool().QueryRow(ctx, `
			SELECT
			  COUNT(*)::bigint,
			  COALESCE(EXTRACT(EPOCH FROM (now() - MIN(created_at))), 0)::float8
			FROM outbox_events
			WHERE status IN ('pending', 'failed')
		`).Scan(&pending, &oldestAge)
		out["fersaku_outbox_pending"] = float64(pending)
		out["fersaku_outbox_oldest_age_seconds"] = oldestAge

		var headSeq int64
		err := rt.DB.Pool().QueryRow(ctx, `
			SELECT COALESCE(head_sequence, 0)::bigint
			FROM audit_chain_heads
			WHERE chain_scope = 'default'
		`).Scan(&headSeq)
		if err == nil {
			out["fersaku_audit_chain_head_sequence"] = float64(headSeq)
		}
		return out
	})
}

// Close releases adapter resources.
func (rt *Runtime) Close() error {
	if rt.DB != nil {
		rt.DB.Close()
	}
	if rt.Redis != nil {
		_ = rt.Redis.Close()
	}
	if rt.Queue != nil {
		return rt.Queue.Close()
	}
	return nil
}

func effectiveWebhookToken(cfg config.Config) string {
	if t := strings.TrimSpace(cfg.XenditWebhookToken); t != "" {
		return t
	}
	if cfg.AppEnv == config.EnvLocal || cfg.AppEnv == config.EnvTest {
		return "local-xendit-webhook-token"
	}
	return ""
}

// paymentIntentIdentity maps PAYMENT_PROVIDER to intent Provider + AccountScope (PROD-B30 / PROD-B40).
// Fake adapter is still xendit.Fake — intents stay XENDIT / xendit-primary for local.
// When payment=duitku, create path uses Duitku QRIS only; Xendit QRIS remains on disk unwired (option A).
func paymentIntentIdentity(cfg config.Config, xenditAccountScope string) (provider, accountScope string) {
	provider = payments.ProviderXendit
	accountScope = xenditAccountScope
	if accountScope == "" {
		accountScope = payments.AccountScopePrimary
	}
	switch cfg.PaymentProvider {
	case config.PaymentProviderDuitku:
		provider = payments.ProviderDuitku
		accountScope = strings.TrimSpace(cfg.DuitkuAccountScope)
		if accountScope == "" {
			accountScope = payments.AccountScopeDuitkuPrimary
		}
	case config.PaymentProviderFake, config.PaymentProviderXendit:
		// fake uses xendit.Fake; keep XENDIT identity for local simulate/callback paths
		provider = payments.ProviderXendit
	}
	return provider, accountScope
}

// wireMoneyProviders selects QRIS payment and disbursement adapters from config
// (PROD-A20 / PROD-B10 / PROD-B40). Composition (option A):
//   payment=duitku  → Duitku QRIS only (Xendit CreateQRIS not selected)
//   payment=xendit  → legacy Xendit QRIS (local/transition)
//   payment=fake    → xendit.Fake QRIS (local)
// Disbursement is independent (fake | xendit). Xendit payment webhook may stay mounted for late events.
func wireMoneyProviders(cfg config.Config, accountScope string, log ports.Logger) (
	qris ports.QRISProvider,
	disburse ports.DisbursementProvider,
	xdFake *xendit.Fake,
	paymentKind, disbursementKind string,
	err error,
) {
	// Fail closed on fake for live runtimes (config already validates; belt-and-suspenders).
	if cfg.IsLiveRuntime() {
		if cfg.AppEnv == config.EnvProduction {
			if cfg.UseFakePayment() || cfg.UseFakeDisbursement() {
				return nil, nil, nil, "", "", fmt.Errorf("app: fake payment/disbursement forbidden on production (INT-180)")
			}
		} else if !cfg.AllowFakeProviders {
			if cfg.UseFakePayment() || cfg.UseFakeDisbursement() {
				return nil, nil, nil, "", "", fmt.Errorf("app: fake payment/disbursement forbidden on staging without ALLOW_FAKE_PROVIDERS=1 (INT-180)")
			}
		}
	}

	var needFake, needXenditReal bool
	switch cfg.PaymentProvider {
	case config.PaymentProviderFake:
		needFake = true
		paymentKind = "fake"
	case config.PaymentProviderXendit:
		needXenditReal = true
		paymentKind = "xendit"
	case config.PaymentProviderDuitku:
		paymentKind = "duitku"
	default:
		return nil, nil, nil, "", "", fmt.Errorf("app: unsupported PAYMENT_PROVIDER=%q", cfg.PaymentProvider)
	}

	switch cfg.DisbursementProvider {
	case config.DisbursementProviderFake:
		needFake = true
		disbursementKind = "fake"
	case config.DisbursementProviderXendit:
		needXenditReal = true
		disbursementKind = "xendit"
	default:
		return nil, nil, nil, "", "", fmt.Errorf("app: unsupported DISBURSEMENT_PROVIDER=%q", cfg.DisbursementProvider)
	}

	if needFake {
		xdFake = xendit.NewFake()
		xdFake.AccountScope = accountScope
	}
	var xdReal *xendit.Real
	if needXenditReal {
		baseURL := strings.TrimSpace(cfg.XenditBaseURL)
		xdReal, err = xendit.NewReal(accountScope, cfg.XenditSecretKey, baseURL)
		if err != nil {
			return nil, nil, nil, "", "", fmt.Errorf("app: xendit real adapter: %w", err)
		}
		xdReal.Log = log
	}

	switch cfg.PaymentProvider {
	case config.PaymentProviderFake:
		qris = xdFake
	case config.PaymentProviderXendit:
		qris = xdReal
	case config.PaymentProviderDuitku:
		dk, derr := duitku.NewReal(
			cfg.DuitkuMerchantCode,
			cfg.DuitkuAPIKey,
			cfg.DuitkuBaseURL,
			cfg.DuitkuCallbackURL,
			cfg.DuitkuReturnURL,
			cfg.DuitkuQRISPaymentMethod,
			cfg.DuitkuAccountScope,
		)
		if derr != nil {
			return nil, nil, nil, "", "", fmt.Errorf("app: duitku real adapter: %w", derr)
		}
		dk.Log = log
		qris = dk
	}
	switch cfg.DisbursementProvider {
	case config.DisbursementProviderFake:
		disburse = xdFake
	case config.DisbursementProviderXendit:
		disburse = xdReal
	}
	return qris, disburse, xdFake, paymentKind, disbursementKind, nil
}

// wireMailer selects capture (local/test), smtp (live), or fails closed.
func wireMailer(cfg config.Config) (ports.Mailer, string, error) {
	mode := cfg.EffectiveMailMode()
	switch mode {
	case "noop":
		if cfg.IsLiveRuntime() {
			return nil, "", fmt.Errorf("app: mail noop forbidden on staging/production (INT-180)")
		}
		return mail.Noop{}, "noop", nil
	case "capture":
		if cfg.IsLiveRuntime() {
			return nil, "", fmt.Errorf("app: mail capture forbidden on staging/production (INT-180)")
		}
		return mail.NewCapture(), "capture", nil
	case "smtp":
		s, err := mail.NewSMTP(mail.SMTPConfig{
			Host:     cfg.MailSMTPHost,
			Port:     cfg.MailSMTPPort,
			From:     cfg.MailFrom,
			Username: cfg.MailSMTPUser,
			Password: cfg.MailSMTPPassword,
		})
		if err != nil {
			return nil, "", fmt.Errorf("app: smtp mailer: %w", err)
		}
		return s, "smtp", nil
	default:
		return nil, "", fmt.Errorf("app: unknown MAIL_MODE %q", mode)
	}
}

// RunAPI starts the HTTP server and blocks until SIGINT/SIGTERM or ctx cancel.
func (rt *Runtime) RunAPI(ctx context.Context) error {
	// CSRF: enabled when auth is wired; soft-disable only when no session backend.
	csrfSoft := rt.Auth == nil
	// Local/test may soft-disable for easier manual curl; production/staging enforce.
	if rt.Config.AppEnv == config.EnvLocal || rt.Config.AppEnv == config.EnvTest {
		// Keep CSRF on when Auth is present so cookie mutations are protected.
		csrfSoft = false
		if rt.Auth == nil {
			csrfSoft = true
		}
	}
	var tokenHasher func(string) string
	if rt.Auth != nil {
		secret := rt.Config.SessionSecret
		tokenHasher = func(raw string) string {
			return authHashToken(raw, secret)
		}
	}
	handler := httpadapter.NewRouterWith(httpadapter.RouterDeps{
		Log:               rt.Log,
		IDs:               rt.IDs,
		Service:           rt.Config.ServiceName,
		Version:           version.Version,
		AppEnv:            rt.Config.AppEnv,
		Ready:             rt.Health.Ready,
		StartedAt:         time.Now().UTC(),
		SessionCookieName: rt.Config.SessionCookieName,
		CSRFSoftDisable:   csrfSoft,
		TokenHasher:       tokenHasher,
		AuthService:         rt.Auth,
		AuthzService:        rt.Authz,
		NotificationService: rt.Notifications,
		OnboardingService:   rt.Onboarding,
		CatalogService:      rt.Catalog,
		CouponService:       rt.Coupons,
		ObjectService:       rt.Objects,
		InventoryService:    rt.Inventory,
		DeliveryService:     rt.Delivery,
		DomainService:       rt.Domains,
		FeeService:          rt.Fees,
		CheckoutService:     rt.Checkout,
		GatewayService:      rt.Gateway,
		CallbackService:     rt.Callbacks,
		LedgerService:       rt.Ledger,
		WithdrawalService:   rt.Withdrawals,
		AnalyticsService:    rt.Analytics,
		KYCService:          rt.KYC,
		CredentialService:   rt.Credentials,
		WebhookService:      rt.Webhooks,
		BuyerService:        rt.Buyer,
		SellerOrderService:    rt.SellerOrders,
		SellerCustomerService: rt.SellerCustomers,
		ReviewService:         rt.Reviews,
		AdminReadService:     rt.AdminReads,
		AdminOpsService:      rt.AdminOps,
		ImpersonationService: rt.Impersonation,
		SecureCookies:        rt.Config.AppEnv == config.EnvProduction || rt.Config.AppEnv == config.EnvStaging,
		SameSiteStrict:    false, // Lax: documented default for buyer/seller storefronts
		RateLimiter:        rt.RateLimiter,
		XenditWebhookToken: effectiveWebhookToken(rt.Config),
		RequestTimeout:     30 * time.Second,
	})
	srv := &http.Server{
		Addr:              rt.Config.HTTPAddr,
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		rt.Log.Info("api listening", "addr", rt.Config.HTTPAddr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			errCh <- err
			return
		}
		errCh <- nil
	}()

	select {
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), rt.Config.ShutdownTimeout)
		defer cancel()
		rt.Log.Info("api shutting down")
		if err := srv.Shutdown(shutdownCtx); err != nil {
			_ = srv.Close()
			return fmt.Errorf("api shutdown: %w", err)
		}
		return <-errCh
	case err := <-errCh:
		return err
	}
}

// RunWorker starts the HA job registry runner (INT-185) and waits on signal/ctx.
// Multi-replica safety is via job_leases; graceful drain stops new batches and finishes in-flight.
func (rt *Runtime) RunWorker(ctx context.Context) error {
	owner := rt.Config.ServiceName
	if owner == "" {
		owner = "fersaku-worker"
	}
	var pgPool *pgxpool.Pool
	if rt.DB != nil {
		pgPool = rt.DB.Pool()
	}

	deps := jobs.Deps{
		Pool:          pgPool,
		Log:           rt.Log,
		Clock:         rt.Clock,
		Owner:         owner,
		Coupons:       rt.Coupons,
		Inventory:     rt.Inventory,
		Objects:       rt.Objects,
		Checkout:      rt.Checkout,
		Domains:       rt.Domains,
		Withdrawals:   rt.Withdrawals,
		Notifications: rt.Notifications,
		Callbacks:     rt.Callbacks,
		Webhooks:      rt.Webhooks,
		Ledger:        rt.Ledger,
		Analytics:     rt.Analytics,
		Impersonation: rt.Impersonation,
	}
	reg := jobs.BuildRegistry(deps)
	leases := &jobs.LeaseStore{Pool: pgPool, Clock: rt.Clock}
	runner := &jobs.Runner{
		Registry: reg,
		Leases:   leases,
		Log:      rt.Log,
		Clock:    rt.Clock,
		Owner:    owner,
		Tick:     time.Second,
	}
	sched := jobs.Scheduler{Log: rt.Log, Queue: rt.Queue, Runner: runner}

	if rt.Config.WorkerRunOnce {
		err := runner.RunOnce(ctx)
		rt.Log.Info("worker ready (run-once mode)", "jobs", len(reg.All()), "owner", owner)
		return err
	}
	return sched.Run(ctx)
}

// SignalContext returns a context cancelled on SIGINT/SIGTERM.
func SignalContext() (context.Context, context.CancelFunc) {
	return signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
}

func authHashToken(raw, secret string) string {
	return domainauth.HashTokenKeyed(raw, secret)
}

// platformComponentHealth probes money providers/R2/Redis/mail without exposing secrets (BE-530 / INT-180 / PROD-B40).
// Fake/noop on live runtime is reported DOWN, never OK.
// paymentKind / disbursementKind distinguish QRIS ingress vs withdrawal (ADR-0008).
func platformComponentHealth(
	ctx context.Context,
	pool *postgres.Pool,
	clock ports.Clock,
	xenditKind, paymentKind, disbursementKind, mailKind, redisKind string,
	rd RedisPinger,
	objStore ports.ObjectStore,
	cfg config.Config,
) []admin.ComponentHealth {
	now := time.Now().UTC().Format(time.RFC3339)
	if clock != nil {
		now = clock.Now().UTC().Format(time.RFC3339)
	}
	out := make([]admin.ComponentHealth, 0, 4)
	live := cfg.IsLiveRuntime()

	// Money providers (compat component name "xendit"; message splits payment vs disbursement).
	// Never include API keys.
	dualMsg := "payment=" + paymentKind + " disbursement=" + disbursementKind
	xStatus, xMsg := "OK", dualMsg
	switch xenditKind {
	case "fake":
		if live && !cfg.AllowFakeProviders {
			xStatus, xMsg = "DOWN", "fake adapters forbidden on live runtime; "+dualMsg
		} else if live && cfg.AllowFakeProviders {
			xStatus, xMsg = "OK", "fake adapters (staging drill ALLOW_FAKE_PROVIDERS); "+dualMsg
		} else {
			xStatus, xMsg = "OK", "fake adapters (local/test only); "+dualMsg
		}
	case "mixed":
		xStatus, xMsg = "OK", "dual providers; "+dualMsg
		if live && cfg.AppEnv == config.EnvProduction {
			// Production must not run mixed fake; config should have rejected.
			xStatus, xMsg = "DEGRADED", "mixed providers on production unexpected; "+dualMsg
		}
	case "real":
		xStatus, xMsg = "OK", dualMsg
	default:
		xStatus, xMsg = "DOWN", "money providers not configured; "+dualMsg
	}
	out = append(out, admin.ComponentHealth{Component: "xendit", Status: xStatus, CheckedAt: now, Message: xMsg})

	// R2 / object store
	r2Status, r2Msg := "OK", "object store configured"
	if objStore == nil || !objStore.Configured() {
		if live && cfg.AppEnv == config.EnvProduction {
			r2Status, r2Msg = "DOWN", "object store not configured"
		} else {
			r2Status, r2Msg = "DEGRADED", "object store noop/unconfigured"
		}
	}
	out = append(out, admin.ComponentHealth{Component: "r2", Status: r2Status, CheckedAt: now, Message: r2Msg})

	// Redis
	rdStatus, rdMsg := "OK", "redis kind="+redisKind
	if redisKind == "noop" || rd == nil || rd.Kind() == "noop" {
		if live {
			rdStatus, rdMsg = "DOWN", "redis noop forbidden on live runtime"
		} else {
			rdStatus, rdMsg = "OK", "redis optional/noop (local/test)"
		}
	} else {
		pctx, cancel := context.WithTimeout(ctx, 2*time.Second)
		err := rd.Ping(pctx)
		cancel()
		if err != nil {
			rdStatus, rdMsg = "DEGRADED", "redis ping failed"
		}
	}
	out = append(out, admin.ComponentHealth{Component: "redis", Status: rdStatus, CheckedAt: now, Message: rdMsg})

	// Mail
	mStatus, mMsg := "OK", "mailer kind="+mailKind
	if mailKind == "noop" || mailKind == "capture" {
		if live {
			mStatus, mMsg = "DOWN", "mail "+mailKind+" forbidden on live runtime"
		} else {
			mStatus, mMsg = "OK", "mailer "+mailKind+" (nonprod)"
		}
	} else if mailKind != "smtp" {
		mStatus, mMsg = "DOWN", "mailer not configured"
	}
	out = append(out, admin.ComponentHealth{Component: "mail", Status: mStatus, CheckedAt: now, Message: mMsg})

	_ = pool
	return out
}
