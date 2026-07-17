package audit

import "time"

// CanonicalVersionLaunch is the launch RFC 8785 JSON Canonicalization Scheme tag.
const CanonicalVersionLaunch = "JCS-1"

// DefaultChainScope is the single logical chain per deployment at launch.
const DefaultChainScope = "default"

// DomainPrefix is the fixed UTF-8 domain separation string for row_hash.
const DomainPrefix = "fersaku.audit.v1"

// RedactionPolicyLaunch is the export redaction policy id.
const RedactionPolicyLaunch = "LAUNCH_AUDIT_REDACTION_V1"

// LogicalEvent is the immutable logical audit payload before chain assignment.
// Search projections are extracted from the JCS canonical form of this struct.
type LogicalEvent struct {
	EventID              string         `json:"eventId"`
	Action               string         `json:"action"`
	ResourceType         string         `json:"resourceType"`
	ResourceID           string         `json:"resourceId"`
	ActorUserID          string         `json:"actorUserId,omitempty"`
	ActingSessionID      string         `json:"actingSessionId,omitempty"`
	ImpersonationSession string         `json:"impersonationSessionId,omitempty"`
	MerchantID           string         `json:"merchantId,omitempty"`
	StoreID              string         `json:"storeId,omitempty"`
	RequestID            string         `json:"requestId,omitempty"`
	Reason               string         `json:"reason,omitempty"`
	Result               string         `json:"result,omitempty"`
	PaymentMode          string         `json:"paymentMode,omitempty"`
	IPHash               string         `json:"ipHash,omitempty"`
	UAHash               string         `json:"uaHash,omitempty"`
	Before               map[string]any `json:"before,omitempty"`
	After                map[string]any `json:"after,omitempty"`
	Metadata             map[string]any `json:"metadata,omitempty"`
	// OccurredAt is UTC RFC3339 nanoseconds in canonical JSON.
	OccurredAt time.Time `json:"occurredAt"`
}

// ChainEvent is a committed audit row with integrity fields.
type ChainEvent struct {
	ID               string
	ChainScope       string
	SequenceNo       int64
	PrevHash         []byte
	RowHash          []byte
	CanonicalVersion string
	CanonicalPayload []byte
	JCSPayload       map[string]any
	ActorUserID      *string
	Action           *string
	ResourceType     *string
	ResourceID       *string
	Reason           *string
	RequestID        *string
	MerchantID       *string
	Metadata         map[string]any
	CreatedAt        time.Time
}

// Checkpoint is a signed retention-locked chain anchor.
type Checkpoint struct {
	ID               string
	ChainScope       string
	SequenceNo       int64
	HeadHash         []byte
	CanonicalVersion string
	Signature        []byte
	KeyID            string
	SignedAt         time.Time
	LockedUntil      time.Time
	CreatedAt        time.Time
}

// IntegrityReport is the streaming verifier outcome.
type IntegrityReport struct {
	ChainScope         string     `json:"chainScope"`
	EventCount         int64      `json:"eventCount"`
	HeadSequence       int64      `json:"headSequence"`
	MinSequence        int64      `json:"minSequence"`
	HeadHashHex        *string    `json:"headHash,omitempty"`
	HeadCreatedAt      *time.Time `json:"headCreatedAt,omitempty"`
	ChainMode          string     `json:"chainMode"`
	VerifierStatus     string     `json:"verifierStatus"`
	LastVerifiedSeq    int64      `json:"lastVerifiedSequence"`
	CheckpointSequence int64      `json:"checkpointSequence,omitempty"`
	UncheckpointedTail int64      `json:"uncheckpointedTail"`
	BrokenReason       string     `json:"brokenReason,omitempty"`
}

// Verifier statuses.
const (
	VerifierOK      = "OK"
	VerifierBroken  = "AUDIT_CHAIN_BROKEN"
	VerifierPending = "PENDING"
)

// ChainModeJCS is the production chain mode label.
const ChainModeJCS = "JCS-1"
