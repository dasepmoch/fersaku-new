// Package admin owns BE-500 admin read-model DTOs (frontend-aligned contracts).
package admin

import "time"

// Overview is GET /v1/admin/overview (safe KPIs only).
type Overview struct {
	MerchantCount           int64   `json:"merchantCount"`
	BuyerCount              int64   `json:"buyerCount"`
	OrderCount              int64   `json:"orderCount"`
	PaymentCount            int64   `json:"paymentCount"`
	PendingWithdrawalCount  int64   `json:"pendingWithdrawalCount"`
	OpenKYCCount            int64   `json:"openKycCount"`
	GrossVolumePaidIDR      int64   `json:"grossVolumePaidIdr"`
	PlatformFeePaidIDR      int64   `json:"platformFeePaidIdr"`
	PaymentSuccessRateBps   int64   `json:"paymentSuccessRateBps"`
	PlatformVolume          []int64 `json:"platformVolume,omitempty"`
}

// Merchant maps features/admin AdminMerchant.
type Merchant struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Owner     string `json:"owner"`
	Email     string `json:"email"`
	Volume    int64  `json:"volume"`
	Orders    int64  `json:"orders"`
	Risk      string `json:"risk"`
	Status    string `json:"status"`
	Joined    string `json:"joined"`
	APIAccess string `json:"apiAccess"`
}

// Buyer maps features/admin AdminBuyer.
type Buyer struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Email     string `json:"email"`
	Verified  string `json:"verified"`
	Purchases int64  `json:"purchases"`
	Spent     int64  `json:"spent"`
	Sessions  int64  `json:"sessions"`
	Last      string `json:"last"`
}

// BuyerPurchase maps AdminBuyerPurchase.
type BuyerPurchase struct {
	OrderID string `json:"orderId"`
	Product string `json:"product"`
	Seller  string `json:"seller"`
	Status  string `json:"status"`
}

// BuyerSession maps AdminBuyerSession (no secrets).
type BuyerSession struct {
	ID       string `json:"id"`
	Device   string `json:"device"`
	Location string `json:"location"`
	IP       string `json:"ip"`
	Active   string `json:"active"`
	Current  bool   `json:"current"`
}

// Order maps AdminOrder (storefront source only on FE type; backend may still filter).
type Order struct {
	ID              string `json:"id"`
	Store           string `json:"store"`
	Customer        string `json:"customer"`
	Product         string `json:"product"`
	Gross           int64  `json:"gross"`
	TotalFeeCharged int64  `json:"totalFeeCharged"`
	Status          string `json:"status"`
	Payment         string `json:"payment"`
	Created         string `json:"created"`
	Source          string `json:"source"`
}

// Payment maps AdminPaymentIntent.
type Payment struct {
	ID          string `json:"id"`
	Provider    string `json:"provider"`
	Merchant    string `json:"merchant"`
	Amount      int64  `json:"amount"`
	ProviderRef string `json:"providerRef"`
	Status      string `json:"status"`
	Latency     string `json:"latency"`
	Created     string `json:"created"`
	Source      string `json:"source"`
}

// Withdrawal maps AdminWithdrawal.
type Withdrawal struct {
	ID                    string `json:"id"`
	Merchant              string `json:"merchant"`
	Owner                 string `json:"owner"`
	Amount                int64  `json:"amount"`
	Bank                  string `json:"bank"`
	Account               string `json:"account"`
	Risk                  string `json:"risk"`
	Status                string `json:"status"`
	Requested             string `json:"requested"`
	Source                string `json:"source"`
	ProviderProcessingFee *int64 `json:"providerProcessingFee"`
	ProviderFeeStatus     string `json:"providerFeeStatus"`
	ProviderFeeReference  string `json:"providerFeeReference,omitempty"`
}

// InventorySnapshot maps AdminInventorySnapshot (redacted; no secrets).
type InventorySnapshot struct {
	Products []StockProduct     `json:"products"`
	Items    []StockItem        `json:"items"`
	Schema   []InventoryField   `json:"schema"`
}

// StockProduct maps AdminStockProduct.
type StockProduct struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	Type      string `json:"type"`
	Available int64  `json:"available"`
	Reserved  int64  `json:"reserved"`
	Sold      int64  `json:"sold"`
	Invalid   int64  `json:"invalid"`
	LowAt     int64  `json:"lowAt"`
	Delivery  string `json:"delivery"`
}

// StockItem maps AdminStockItem (field names only in schemaPreview).
type StockItem struct {
	ID            string  `json:"id"`
	SchemaPreview string  `json:"schemaPreview"`
	Status        string  `json:"status"`
	OrderID       *string `json:"orderId,omitempty"`
	CreatedAt     string  `json:"createdAt"`
}

// InventoryField maps AdminInventoryField.
type InventoryField struct {
	Key           string `json:"key"`
	Label         string `json:"label"`
	Secret        bool   `json:"secret"`
	Required      bool   `json:"required"`
	BuyerCopyable bool   `json:"buyerCopyable"`
}

// Fulfillment is a delivery grant row for /v1/admin/fulfillments.
type Fulfillment struct {
	ID       string `json:"id"`
	Order    string `json:"order"`
	Merchant string `json:"merchant"`
	Type     string `json:"type"`
	Target   string `json:"target"`
	Status   string `json:"status"`
	Attempts int64  `json:"attempts"`
	Time     string `json:"time"`
}

// Review maps AdminReview.
type Review struct {
	ID          string  `json:"id"`
	ProductID   string  `json:"productId"`
	Product     string  `json:"product"`
	Seller      string  `json:"seller"`
	Buyer       string  `json:"buyer"`
	Initials    string  `json:"initials"`
	Rating      int32   `json:"rating"`
	Title       string  `json:"title"`
	Body        string  `json:"body"`
	Verified    bool    `json:"verified"`
	Status      string  `json:"status"`
	CreatedAt   string  `json:"createdAt"`
	SellerReply *string `json:"sellerReply,omitempty"`
}

// UserLookup is the impersonation-target read model (no secrets).
type UserLookup struct {
	ID               string  `json:"id"`
	Name             string  `json:"name"`
	Email            string  `json:"email"`
	Status           string  `json:"status"`
	IsAdmin          bool    `json:"isAdmin"`
	OwnerMerchantID  *string `json:"ownerMerchantId,omitempty"`
	Impersonatable   bool    `json:"impersonatable"`
	CreatedAt        string  `json:"createdAt"`
}

// ListFilter is shared cursor/status/date filtering.
type ListFilter struct {
	Status   string
	Source   string
	Query    string
	From     *time.Time
	To       *time.Time
	Cursor   string
	Limit    int32
}

// DefaultListLimit and MaxListLimit bound admin list/export reads.
const (
	DefaultListLimit int32 = 50
	MaxListLimit     int32 = 100
	ExportMaxLimit   int32 = 500
)
