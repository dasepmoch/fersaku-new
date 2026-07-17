// Package observability provides logging and metrics adapters.
package observability

import "github.com/dasepmoch/fersaku-new/backend/internal/platform/metrics"

// Metrics is an alias of the process metrics registry (canonical: platform/metrics).
type Metrics = metrics.Metrics

// Global is the default process metrics registry (BE-600).
var Global = metrics.Global

// NewMetrics creates an empty registry.
func NewMetrics() *Metrics { return metrics.NewMetrics() }
