// Command bootstrap-admin attaches SUPER_ADMIN to an existing user by email.
// It does NOT run QLT-110 persona seed and is allowed on production as a
// one-shot ops tool (unlike cmd/seed, which refuses APP_ENV=production).
//
// Usage:
//
//	export DATABASE_URL='postgres://…'
//	export BOOTSTRAP_ADMIN_EMAIL='ops@example.com'
//	# production only:
//	export BOOTSTRAP_ADMIN_CONFIRM=yes
//	go run ./cmd/bootstrap-admin
//
// Prerequisites: migrations at head; user already registered + email verified.
// After success: unset BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_CONFIRM.
package main

import (
	"context"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/observability"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/postgres"
	"github.com/dasepmoch/fersaku-new/backend/internal/application"
	"github.com/dasepmoch/fersaku-new/backend/internal/seed"
)

func main() {
	email := strings.TrimSpace(os.Getenv("BOOTSTRAP_ADMIN_EMAIL"))
	if email == "" {
		fmt.Fprintln(os.Stderr, "bootstrap-admin: BOOTSTRAP_ADMIN_EMAIL required")
		os.Exit(1)
	}

	appEnv := seed.AppEnv()
	if appEnv == "production" {
		confirm := strings.ToLower(strings.TrimSpace(os.Getenv("BOOTSTRAP_ADMIN_CONFIRM")))
		if confirm != "yes" && confirm != "true" && confirm != "1" {
			fmt.Fprintln(os.Stderr, "bootstrap-admin: APP_ENV=production requires BOOTSTRAP_ADMIN_CONFIRM=yes")
			os.Exit(2)
		}
	}

	dbURL := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	if dbURL == "" {
		fmt.Fprintln(os.Stderr, "bootstrap-admin: DATABASE_URL required")
		os.Exit(1)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	pool, err := postgres.Open(ctx, dbURL, postgres.DefaultPoolConfig())
	if err != nil {
		fmt.Fprintf(os.Stderr, "bootstrap-admin: open db: %v\n", err)
		os.Exit(1)
	}
	defer pool.Close()

	svc := &application.AuthzService{
		Store: postgres.NewAuthzRepo(pool.Pool()),
		IDs:   observability.NewULIDGenerator(),
		Clock: observability.SystemClock{},
		Log:   observability.NewSlogLogger("info", "fersaku-bootstrap-admin"),
	}

	userID, err := svc.BootstrapAdminByEmail(ctx, email)
	if err != nil {
		fmt.Fprintf(os.Stderr, "bootstrap-admin: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("bootstrap-admin: SUPER_ADMIN assigned user_id=%s email=%s app_env=%s\n", userID, email, appEnv)
	fmt.Println("bootstrap-admin: unset BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_CONFIRM from long-lived env")
}
