package invoices

import (
	"encoding/json"
	"time"
)

const (
	StatusIssued    = "ISSUED"
	StatusRendering = "RENDERING"
	StatusReady     = "READY"
	StatusFailed    = "FAILED"

	RenderPending = "PENDING"
	RenderReady   = "READY"
	RenderFailed  = "FAILED"
	RenderSkipped = "SKIPPED"

	RendererV1 = "v1"
)

// Invoice is the authorized invoice header.
type Invoice struct {
	ID              string
	OrderID         string
	StoreID         string
	MerchantID      string
	InvoiceNumber   string
	PublicCodeHash  string
	PublicCodeHint  string
	Status          string
	Currency        string
	GrossIDR        int64
	PaidAt          *time.Time
	CurrentVersion  int32
	BuyerUserID     *string
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

// Version is an immutable financial/document snapshot.
type Version struct {
	ID              string
	InvoiceID       string
	Version         int32
	RendererVersion string
	Snapshot        json.RawMessage
	PayloadHash     string
	RenderStatus    string
	RenderObjectID  *string
	RenderErrorCode *string
	RenderedAt      *time.Time
	CreatedAt       time.Time
}

// Snapshot is the canonical immutable invoice body stored in jsonb.
type Snapshot struct {
	InvoiceNumber   string           `json:"invoiceNumber"`
	OrderID         string           `json:"orderId"`
	OrderNumber     string           `json:"orderNumber"`
	StoreID         string           `json:"storeId"`
	MerchantID      string           `json:"merchantId"`
	Currency        string           `json:"currency"`
	SubtotalIDR     int64            `json:"subtotalIdr"`
	DiscountIDR     int64            `json:"discountIdr"`
	TipIDR          int64            `json:"tipIdr"`
	FeeIDR          int64            `json:"feeIdr"`
	GrossIDR        int64            `json:"grossIdr"`
	MerchantNetIDR  int64            `json:"merchantNetIdr"`
	CouponCode      string           `json:"couponCode,omitempty"`
	CouponVersion   *int32           `json:"couponVersion,omitempty"`
	PaidAt          *time.Time       `json:"paidAt,omitempty"`
	Buyer           BuyerSnapshot    `json:"buyer"`
	Issuer          IssuerSnapshot   `json:"issuer"`
	Lines           []LineSnapshot   `json:"lines"`
	RendererVersion string           `json:"rendererVersion"`
}

// BuyerSnapshot is privacy-safe buyer identity frozen at issue time.
type BuyerSnapshot struct {
	UserID *string `json:"userId,omitempty"`
	Email  string  `json:"email"`
	Name   string  `json:"name"`
}

// IssuerSnapshot is store/merchant safe identity.
type IssuerSnapshot struct {
	StoreID    string `json:"storeId"`
	StoreName  string `json:"storeName"`
	MerchantID string `json:"merchantId"`
}

// LineSnapshot freezes product/line pricing (not live catalog).
type LineSnapshot struct {
	OrderItemID  string `json:"orderItemId"`
	ProductID    string `json:"productId"`
	Title        string `json:"title"`
	ProductType  string `json:"productType"`
	Version      string `json:"version"`
	UnitPriceIDR int64  `json:"unitPriceIdr"`
	Quantity     int32  `json:"quantity"`
	LineTotalIDR int64  `json:"lineTotalIdr"`
	DiscountIDR  int64  `json:"discountIdr"`
}

// PublicVerify is the minimum safe public verification DTO.
type PublicVerify struct {
	Valid         bool       `json:"valid"`
	InvoiceNumber string     `json:"invoiceNumber,omitempty"`
	OrderNumber   string     `json:"orderNumber,omitempty"`
	Currency      string     `json:"currency,omitempty"`
	GrossIDR      int64      `json:"grossIdr,omitempty"`
	PaidAt        *time.Time `json:"paidAt,omitempty"`
	StoreName     string     `json:"storeName,omitempty"`
	// Never: buyer email/name, PII, secrets, provider refs, internal IDs beyond numbers.
}
