// Command fersaku-api is the HTTP API binary.
package main

import (
	"fmt"
	"os"

	"github.com/dasepmoch/fersaku-new/backend/internal/app"
)

func main() {
	rt, err := app.NewRuntime("fersaku-api")
	if err != nil {
		fmt.Fprintf(os.Stderr, "config error: %v\n", err)
		os.Exit(1)
	}
	defer func() { _ = rt.Close() }()

	ctx, stop := app.SignalContext()
	defer stop()

	if err := rt.RunAPI(ctx); err != nil {
		rt.Log.Error("api exited", "err", err)
		os.Exit(1)
	}
}
