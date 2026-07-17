package audit

import "errors"

// Sentinel errors for chain integrity (mapped to AUDIT_CHAIN_BROKEN at application layer).
var (
	ErrChainBroken       = errors.New("AUDIT_CHAIN_BROKEN")
	ErrUnsupportedVersion = errors.New("unsupported audit canonical version")
	ErrEmptyPayload      = errors.New("empty audit canonical payload")
	ErrCheckpointDenied  = errors.New("audit checkpoint overwrite denied")
)
