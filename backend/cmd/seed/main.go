// Command seed applies the single QLT-110 deterministic nonprod fixture set.
// Refuses APP_ENV=production. Optional BOOTSTRAP_ADMIN_EMAIL still attaches SUPER_ADMIN
// to an existing user after the persona seed (does not create a second seed command).
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"strings"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/observability"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/postgres"
	"github.com/dasepmoch/fersaku-new/backend/internal/application"
	"github.com/dasepmoch/fersaku-new/backend/internal/seed"
)

func main() {
	if err := seed.GuardNonProduction(); err != nil {
		fmt.Fprintln(os.Stderr, err.Error())
		os.Exit(2)
	}

	dbURL := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	if dbURL == "" {
		fmt.Fprintln(os.Stderr, "seed: DATABASE_URL required")
		os.Exit(1)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	// Admin-sized pool (not API default 20); seed is single-shot.
	poolCfg := postgres.DefaultPoolConfig()
	poolCfg.MaxConns = 4
	poolCfg.MinConns = 0
	poolCfg.ApplicationName = "fersaku-seed"
	pool, err := postgres.Open(ctx, dbURL, poolCfg)
	if err != nil {
		fmt.Fprintf(os.Stderr, "seed: open db: %v\n", err)
		os.Exit(1)
	}
	defer pool.Close()

	result, err := seed.Apply(ctx, pool.Pool())
	if err != nil {
		fmt.Fprintf(os.Stderr, "seed: apply: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("seed: QLT-110 applied (APP_ENV=%s clock=%s marker=%s)\n",
		result.AppEnv, result.Clock.Format(time.RFC3339), result.Marker)
	fmt.Printf("seed: personas=%d resources=%d\n", len(result.Personas), len(result.Resources))
	for _, p := range result.Personas {
		fmt.Printf("seed: persona %-20s user_id=%s email=%s\n", p.Key, p.UserID, p.Email)
	}
	keys := make([]string, 0, len(result.Resources))
	for k := range result.Resources {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		fmt.Printf("seed: id %-40s %s\n", k, result.Resources[k])
	}

	if out := strings.TrimSpace(os.Getenv("SEED_MANIFEST_PATH")); out != "" {
		b, err := json.MarshalIndent(struct {
			AppEnv    string            `json:"appEnv"`
			Clock     string            `json:"clock"`
			Marker    string            `json:"marker"`
			Password  string            `json:"sharedPasswordHint"`
			Personas  []seed.Persona    `json:"personas"`
			Resources map[string]string `json:"resources"`
		}{
			AppEnv:    result.AppEnv,
			Clock:     result.Clock.Format(time.RFC3339),
			Marker:    result.Marker,
			Password:  "TestSeed1! (nonprod only)",
			Personas:  result.Personas,
			Resources: result.Resources,
		}, "", "  ")
		if err != nil {
			fmt.Fprintf(os.Stderr, "seed: manifest encode: %v\n", err)
			os.Exit(1)
		}
		if err := os.WriteFile(out, b, 0o644); err != nil {
			fmt.Fprintf(os.Stderr, "seed: write manifest: %v\n", err)
			os.Exit(1)
		}
		fmt.Printf("seed: wrote manifest %s\n", out)
	}

	// Optional legacy BE-130 bootstrap: attach SUPER_ADMIN to an existing email.
	email := strings.TrimSpace(os.Getenv("BOOTSTRAP_ADMIN_EMAIL"))
	if email == "" {
		return
	}
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
