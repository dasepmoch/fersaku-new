package application

import (
	"context"
	"time"
)

// SellerCustomerListFilter is store-scoped list query input (SEL-260).
type SellerCustomerListFilter struct {
	StoreID  string
	Q        string
	Page     int
	PageSize int
}

// SellerCustomerListRow is a denormalized list projection.
type SellerCustomerListRow struct {
	CustomerID        string
	DisplayName       string
	DisplayEmail      string
	OrderCount        int64
	SpentIDR          int64
	LastPurchaseAt    time.Time
	FirstSeenAt       time.Time
	LastProductTitle  string
	LastOrderGrossIDR int64
	LastPaymentStatus string
}

// SellerCustomerOrderRow is a bounded purchase history line.
type SellerCustomerOrderRow struct {
	OrderID       string
	OrderNumber   string
	PaymentStatus string
	GrossIDR      int64
	PaidAt        *time.Time
	CreatedAt     time.Time
	ProductTitle  string
}

// SellerCustomerNoteRow is the internal note snapshot.
type SellerCustomerNoteRow struct {
	ID           string
	StoreID      string
	CustomerID   string
	Body         string
	Version      int32
	AuthorUserID *string
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

// SellerCustomerAggregate is the detail projection without history/notes.
type SellerCustomerAggregate struct {
	CustomerID     string
	DisplayName    string
	DisplayEmail   string
	OrderCount     int64
	SpentIDR       int64
	LastPurchaseAt time.Time
	FirstSeenAt    time.Time
	ProductCount   int64
}

// SellerCustomerStoreSummary is list header tallies.
type SellerCustomerStoreSummary struct {
	TotalCustomers int64
	RepeatBuyers   int64
	AvgSpendIDR    int64
}

// SellerCustomerStore is the persistence port for seller customer reads/notes (SEL-260).
type SellerCustomerStore interface {
	UserCanAccessStore(ctx context.Context, userID, storeID string) (bool, error)
	UserIsPlatformAdmin(ctx context.Context, userID string) (bool, error)
	CountCustomers(ctx context.Context, f SellerCustomerListFilter) (int64, error)
	ListCustomers(ctx context.Context, f SellerCustomerListFilter) ([]SellerCustomerListRow, error)
	StoreSummary(ctx context.Context, storeID string) (SellerCustomerStoreSummary, error)
	GetCustomer(ctx context.Context, storeID, customerID string) (SellerCustomerAggregate, error)
	ListOrderHistory(ctx context.Context, storeID, customerID string, limit int) ([]SellerCustomerOrderRow, error)
	GetNote(ctx context.Context, storeID, customerID string) (*SellerCustomerNoteRow, error)
	InsertNote(ctx context.Context, row SellerCustomerNoteRow) (SellerCustomerNoteRow, error)
	UpdateNote(ctx context.Context, storeID, customerID, body, authorUserID string, expectedVersion int32, now time.Time) (SellerCustomerNoteRow, error)
	IsNotFound(err error) bool
}
