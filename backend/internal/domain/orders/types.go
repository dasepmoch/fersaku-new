package orders

import "time"

// Payment status values for the minimal order stub (full SM in BE-310/330).
const (
	PaymentUnpaid    = "UNPAID"
	PaymentPending   = "PENDING"
	PaymentPaid      = "PAID"
	PaymentFailed    = "FAILED"
	PaymentExpired   = "EXPIRED"
	PaymentCancelled = "CANCELLED"
)

const (
	SourceStorefront = "STOREFRONT"
	SourceQRISAPI    = "QRIS_API"
)

// Order is a minimal commerce order used by delivery/invoices before full checkout.
type Order struct {
	ID             string
	OrderNumber    string
	StoreID        string
	MerchantID     string
	BuyerUserID    *string
	BuyerEmail     string
	BuyerName      string
	PaymentStatus  string
	Source         string
	Currency       string
	SubtotalIDR    int64
	DiscountIDR    int64
	TipIDR         int64
	FeeIDR         int64
	GrossIDR       int64
	MerchantNetIDR int64
	CouponCode     *string
	CouponVersion  *int32
	PaidAt         *time.Time
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

// OrderItem is an immutable line snapshot.
type OrderItem struct {
	ID                    string
	OrderID               string
	StoreID               string
	MerchantID            string
	ProductID             string
	ProductVersion        string
	ProductTitle          string
	ProductType           string
	UnitPriceIDR          int64
	Quantity              int32
	LineSubtotalIDR       int64
	DiscountAllocationIDR int64
	LineTotalIDR          int64
	DeliveryKind          string
	StockReservationID    *string
	StockItemID           *string
	ObjectID              *string
	CreatedAt             time.Time
}

// IsPaid reports verified paid evidence.
func (o Order) IsPaid() bool {
	return o.PaymentStatus == PaymentPaid && o.PaidAt != nil
}
