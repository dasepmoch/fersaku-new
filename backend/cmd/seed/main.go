// Command seed applies optional post-migration bootstrap (BE-130).
// System roles/permissions are already in migration 000004_rbac.
// When BOOTSTRAP_ADMIN_EMAIL is set, attaches SUPER_ADMIN to that existing user.
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
)

func main() {
	dbURL := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	if dbURL == "" {
		fmt.Fprintln(os.Stderr, "seed: DATABASE_URL required")
		os.Exit(1)
	}
	email := strings.TrimSpace(os.Getenv("BOOTSTRAP_ADMIN_EMAIL"))
	if email == "" {
		fmt.Println("seed: nothing to do (BOOTSTRAP_ADMIN_EMAIL empty)")
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	pool, err := postgres.Open(ctx, dbURL, postgres.DefaultPoolConfig())
	if err != nil {
		fmt.Fprintf(os.Stderr, "seed: open db: %v\n", err)
		os.Exit(1)
	}
	defer pool.Close()

	svc := &application.AuthzService{
		Store: postgres.NewAuthzRepo(pool.Pool()),
		IDs:   observability.NewULIDGenerator(),
		Clock: observability.SystemClock{},
		Log:   observability.NewSlogLogger("info", "fersaku-seed"),
	}
	userID, err := svc.BootstrapAdminByEmail(ctx, email)
	if err != nil {
		fmt.Fprintf(os.Stderr, "seed: bootstrap admin: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("seed: SUPER_ADMIN assigned to user %s (%s)\n", userID, email)
}
