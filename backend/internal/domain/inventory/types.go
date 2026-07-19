package inventory

import (
	"encoding/json"
	"time"
)

// Stock item lifecycle (BE-230).
const (
	StatusAvailable = "AVAILABLE"
	StatusReserved  = "RESERVED"
	StatusDelivered = "DELIVERED"
	StatusRevoked   = "REVOKED"
)

// Reservation lifecycle.
const (
	ReservationReserved    = "RESERVED"
	ReservationReleased    = "RELEASED"
	ReservationDelivered   = "DELIVERED"
	ReservationHeldUnknown = "HELD_UNKNOWN"
)

// FieldDef is one column in an inventory schema.
type FieldDef struct {
	Key           string `json:"key"`
	Label         string `json:"label"`
	Secret        bool   `json:"secret"`
	Required      bool   `json:"required"`
	BuyerCopyable bool   `json:"buyerCopyable"`
	Unique        bool   `json:"unique"`
}

// Schema is an immutable product inventory schema version.
type Schema struct {
	ID         string
	ProductID  string
	StoreID    string
	MerchantID string
	Version    int32
	Fields     []FieldDef
	Delimiter  string
	Checksum   string
	CreatedBy  *string
	CreatedAt  time.Time
}

// StockItem is one credential/code unit. Secrets live only in EncryptedPayload.
type StockItem struct {
	ID               string
	ProductID        string
	StoreID          string
	MerchantID       string
	SchemaVersion    int32
	Status           string
	EncryptedPayload []byte
	KeyVersion       string
	MaskedPreview    map[string]string
	UniqueKeyHash    *string
	CreatedBy        *string
	CreatedAt        time.Time
	UpdatedAt        time.Time
	ReservedAt       *time.Time
	DeliveredAt      *time.Time
	RevokedAt        *time.Time
}

// Reservation holds a stock unit for checkout/order.
type Reservation struct {
	ID             string
	StockItemID    string
	ProductID      string
	StoreID        string
	MerchantID     string
	OrderID        *string
	CheckoutID     *string
	IdempotencyKey string
	Status         string
	ExpiresAt      time.Time
	ReleasedAt     *time.Time
	DeliveredAt    *time.Time
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

// ProductSummary is aggregate stock health for a product (masked only).
// Title/Type come from catalog join (SEL-240 read model); never secrets.
type ProductSummary struct {
	ProductID           string
	StoreID             string
	Title               string
	Type                string
	ActiveSchemaVersion *int32
	Available           int64
	Reserved            int64
	Delivered           int64
	Revoked             int64
	Total               int64
}

// RevealAudit is an immutable reveal event (no secrets).
type RevealAudit struct {
	ID          string
	StockItemID string
	StoreID     string
	ProductID   string
	ActorUserID string
	Reason      string
	MFAVerified bool
	PayloadHash []byte
	CreatedAt   time.Time
}

// FieldsJSON marshals field defs for persistence.
func FieldsJSON(fields []FieldDef) (json.RawMessage, error) {
	if fields == nil {
		fields = []FieldDef{}
	}
	b, err := json.Marshal(fields)
	if err != nil {
		return nil, err
	}
	return b, nil
}

// ParseFields unmarshals field defs.
func ParseFields(raw json.RawMessage) ([]FieldDef, error) {
	if len(raw) == 0 {
		return []FieldDef{}, nil
	}
	var fields []FieldDef
	if err := json.Unmarshal(raw, &fields); err != nil {
		return nil, err
	}
	return fields, nil
}
