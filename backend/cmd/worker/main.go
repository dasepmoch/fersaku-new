// Command fersaku-worker runs background jobs (no public HTTP listener).
package main

import (
	"context"
	"errors"
	"fmt"
	"os"

	"github.com/dasepmoch/fersaku-new/backend/internal/app"
)

func main() {
	rt, err := app.NewRuntime("fersaku-worker")
	if err != nil {
		fmt.Fprintf(os.Stderr, "config error: %v\n", err)
		os.Exit(1)
	}
	defer func() { _ = rt.Close() }()

	ctx, stop := app.SignalContext()
	defer stop()

	if err := rt.RunWorker(ctx); err != nil && !errors.Is(err, context.Canceled) {
		rt.Log.Error("worker exited", "err", err)
		os.Exit(1)
	}
}
