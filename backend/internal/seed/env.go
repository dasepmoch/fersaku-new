package seed

import (
	"fmt"
	"os"
	"strings"
)

// GuardNonProduction refuses seed when APP_ENV=production.
// Empty APP_ENV is treated as local (nonprod).
func GuardNonProduction() error {
	env := strings.ToLower(strings.TrimSpace(os.Getenv("APP_ENV")))
	if env == "production" {
		return fmt.Errorf("seed: refused: APP_ENV=production (QLT-110 nonprod seed only)")
	}
	return nil
}

// AppEnv returns normalized APP_ENV or "local".
func AppEnv() string {
	env := strings.ToLower(strings.TrimSpace(os.Getenv("APP_ENV")))
	if env == "" {
		return "local"
	}
	return env
}
