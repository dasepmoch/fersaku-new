package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/postgres/gen"
	"github.com/dasepmoch/fersaku-new/backend/internal/application"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/admin"
)

// AdminRepo is the Postgres adapter for BE-500 admin read models.
type AdminRepo struct {
	pool *pgxpool.Pool
	q    *gen.Queries
}

func NewAdminRepo(pool *pgxpool.Pool) *AdminRepo {
	return &AdminRepo{pool: pool, q: gen.New(pool)}
}

func (r *AdminRepo) IsNotFound(err error) bool {
	return errors.Is(err, pgx.ErrNoRows)
}

func (r *AdminRepo) OverviewCounts(ctx context.Context) (admin.Overview, error) {
	row, err := r.q.AdminOverviewCounts(ctx)
	if err != nil {
		return admin.Overview{}, err
	}
	bps := int64(0)
	if row.TerminalPaymentCount > 0 {
		bps = (row.PaidPaymentCount * 10000) / row.TerminalPaymentCount
	}
	return admin.Overview{
		MerchantCount:          row.MerchantCount,
		BuyerCount:             row.BuyerCount,
		OrderCount:             row.OrderCount,
		PaymentCount:           row.PaymentCount,
		PendingWithdrawalCount: row.PendingWithdrawalCount,
		OpenKYCCount:           row.OpenKycCount,
		GrossVolumePaidIDR:     row.GrossVolumePaidIdr,
		PlatformFeePaidIDR:     row.PlatformFeePaidIdr,
		PaymentSuccessRateBps:  bps,
	}, nil
}

func (r *AdminRepo) PlatformVolumeHours(ctx context.Context) ([]int64, error) {
	return r.q.AdminPlatformVolumeHours(ctx)
}

func (r *AdminRepo) ListMerchants(ctx context.Context, f admin.ListFilter, cursorAt *time.Time, cursorID *string) ([]application.AdminMerchantRow, error) {
	rows, err := r.q.AdminListMerchants(ctx, gen.AdminListMerchantsParams{
		Limit:           f.Limit + 1,
		Status:          emptyToNil(f.Status),
		Q:               emptyToNil(f.Query),
		CursorCreatedAt: timePtrToPg(cursorAt),
		CursorID:        cursorID,
	})
	if err != nil {
		return nil, err
	}
	out := make([]application.AdminMerchantRow, 0, len(rows))
	for _, row := range rows {
		out = append(out, application.AdminMerchantRow{
			Merchant:  mapAdminMerchant(row.ID, row.DisplayName, row.OwnerName, row.OwnerEmail, row.VolumeIdr, row.OrderCount, row.Status, row.LiveApiStatus, row.CreatedAt),
			CreatedAt: row.CreatedAt,
		})
	}
	return out, nil
}

func (r *AdminRepo) GetMerchant(ctx context.Context, id string) (application.AdminMerchantRow, error) {
	row, err := r.q.AdminGetMerchant(ctx, id)
	if err != nil {
		return application.AdminMerchantRow{}, err
	}
	return application.AdminMerchantRow{
		Merchant:  mapAdminMerchant(row.ID, row.DisplayName, row.OwnerName, row.OwnerEmail, row.VolumeIdr, row.OrderCount, row.Status, row.LiveApiStatus, row.CreatedAt),
		CreatedAt: row.CreatedAt,
	}, nil
}

func (r *AdminRepo) ListBuyers(ctx context.Context, f admin.ListFilter, cursorAt *time.Time, cursorID *string) ([]application.AdminBuyerRow, error) {
	rows, err := r.q.AdminListBuyers(ctx, gen.AdminListBuyersParams{
		Limit:           f.Limit + 1,
		Q:               emptyToNil(f.Query),
		CursorCreatedAt: timePtrToPg(cursorAt),
		CursorID:        cursorID,
	})
	if err != nil {
		return nil, err
	}
	out := make([]application.AdminBuyerRow, 0, len(rows))
	for _, row := range rows {
		lastAt := pgTimestamptzToTimePtr(row.LastLoginAt)
		out = append(out, application.AdminBuyerRow{
			Buyer:     mapAdminBuyer(row.ID, row.Name, row.EmailDisplay, row.EmailVerifiedAt.Valid, row.PurchaseCount, row.SpentIdr, row.ActiveSessionCount, lastAt, row.CreatedAt),
			CreatedAt: row.CreatedAt,
			LastAt:    lastAt,
		})
	}
	return out, nil
}

func (r *AdminRepo) GetBuyer(ctx context.Context, id string) (application.AdminBuyerRow, error) {
	row, err := r.q.AdminGetBuyer(ctx, id)
	if err != nil {
		return application.AdminBuyerRow{}, err
	}
	lastAt := pgTimestamptzToTimePtr(row.LastLoginAt)
	return application.AdminBuyerRow{
		Buyer:     mapAdminBuyer(row.ID, row.Name, row.EmailDisplay, row.EmailVerifiedAt.Valid, row.PurchaseCount, row.SpentIdr, row.ActiveSessionCount, lastAt, row.CreatedAt),
		CreatedAt: row.CreatedAt,
		LastAt:    lastAt,
	}, nil
}

func (r *AdminRepo) ListBuyerPurchases(ctx context.Context, buyerID string, limit int32) ([]admin.BuyerPurchase, error) {
	rows, err := r.q.AdminListBuyerPurchases(ctx, gen.AdminListBuyerPurchasesParams{
		BuyerUserID: &buyerID,
		Limit:       limit,
	})
	if err != nil {
		return nil, err
	}
	out := make([]admin.BuyerPurchase, 0, len(rows))
	for _, row := range rows {
		out = append(out, admin.BuyerPurchase{
			OrderID: coalesce(row.OrderNumber, row.OrderID),
			Product: row.ProductTitle,
			Seller:  row.SellerName,
			Status:  titleCasePayment(row.PaymentStatus),
		})
	}
	return out, nil
}

func (r *AdminRepo) ListBuyerSessions(ctx context.Context, buyerID string, limit int32) ([]admin.BuyerSession, error) {
	rows, err := r.q.AdminListBuyerSessions(ctx, gen.AdminListBuyerSessionsParams{
		UserID: buyerID,
		Limit:  limit,
	})
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	out := make([]admin.BuyerSession, 0, len(rows))
	for i, row := range rows {
		active := "Inactive"
		if !row.RevokedAt.Valid && row.ExpiresAt.After(now) {
			active = "Active"
		}
		device := "Unknown device"
		if row.DeviceLabel != nil && strings.TrimSpace(*row.DeviceLabel) != "" {
			device = *row.DeviceLabel
		}
		ip := "—"
		if row.IpHash != nil && *row.IpHash != "" {
			// Never expose raw IP; show redacted fingerprint prefix only.
			h := *row.IpHash
			if len(h) > 8 {
				h = h[:8]
			}
			ip = "hash:" + h
		}
		out = append(out, admin.BuyerSession{
			ID:       row.ID,
			Device:   device,
			Location: "—",
			IP:       ip,
			Active:   active,
			Current:  i == 0 && active == "Active",
		})
	}
	return out, nil
}

func (r *AdminRepo) ListOrders(ctx context.Context, f admin.ListFilter, cursorAt *time.Time, cursorID *string) ([]application.AdminOrderRow, error) {
	rows, err := r.q.AdminListOrders(ctx, gen.AdminListOrdersParams{
		Limit:           f.Limit + 1,
		Status:          emptyToNil(f.Status),
		Source:          emptyToNil(f.Source),
		FromTs:          timePtrToPg(f.From),
		ToTs:            timePtrToPg(f.To),
		CursorCreatedAt: timePtrToPg(cursorAt),
		CursorID:        cursorID,
	})
	if err != nil {
		return nil, err
	}
	out := make([]application.AdminOrderRow, 0, len(rows))
	for _, row := range rows {
		out = append(out, application.AdminOrderRow{
			Order:     mapAdminOrder(row.ID, row.OrderNumber, row.StoreName, row.BuyerName, row.ProductTitle, row.GrossIdr, row.FeeIdr, row.PaymentStatus, row.Source, row.CreatedAt),
			CreatedAt: row.CreatedAt,
		})
	}
	return out, nil
}

func (r *AdminRepo) GetOrder(ctx context.Context, id string) (application.AdminOrderRow, error) {
	row, err := r.q.AdminGetOrder(ctx, id)
	if err != nil {
		return application.AdminOrderRow{}, err
	}
	return application.AdminOrderRow{
		Order:     mapAdminOrder(row.ID, row.OrderNumber, row.StoreName, row.BuyerName, row.ProductTitle, row.GrossIdr, row.FeeIdr, row.PaymentStatus, row.Source, row.CreatedAt),
		CreatedAt: row.CreatedAt,
	}, nil
}

func (r *AdminRepo) ListPayments(ctx context.Context, f admin.ListFilter, cursorAt *time.Time, cursorID *string) ([]application.AdminPaymentRow, error) {
	rows, err := r.q.AdminListPayments(ctx, gen.AdminListPaymentsParams{
		Limit:           f.Limit + 1,
		Status:          emptyToNil(f.Status),
		Source:          emptyToNil(f.Source),
		FromTs:          timePtrToPg(f.From),
		ToTs:            timePtrToPg(f.To),
		CursorCreatedAt: timePtrToPg(cursorAt),
		CursorID:        cursorID,
	})
	if err != nil {
		return nil, err
	}
	out := make([]application.AdminPaymentRow, 0, len(rows))
	for _, row := range rows {
		out = append(out, application.AdminPaymentRow{
			Payment:   mapAdminPayment(row.ID, row.Provider, row.MerchantName, row.AmountIdr, row.ProviderReference, row.Status, row.Source, row.CreatedAt, row.UpdatedAt),
			CreatedAt: row.CreatedAt,
			UpdatedAt: row.UpdatedAt,
		})
	}
	return out, nil
}

func (r *AdminRepo) GetPayment(ctx context.Context, id string) (application.AdminPaymentRow, error) {
	row, err := r.q.AdminGetPayment(ctx, id)
	if err != nil {
		return application.AdminPaymentRow{}, err
	}
	return application.AdminPaymentRow{
		Payment:   mapAdminPayment(row.ID, row.Provider, row.MerchantName, row.AmountIdr, row.ProviderReference, row.Status, row.Source, row.CreatedAt, row.UpdatedAt),
		CreatedAt: row.CreatedAt,
		UpdatedAt: row.UpdatedAt,
	}, nil
}

func (r *AdminRepo) ListWithdrawals(ctx context.Context, f admin.ListFilter, cursorAt *time.Time, cursorID *string) ([]application.AdminWithdrawalRow, error) {
	rows, err := r.q.AdminListWithdrawalsFE(ctx, gen.AdminListWithdrawalsFEParams{
		Limit:           f.Limit + 1,
		Status:          emptyToNil(f.Status),
		Source:          emptyToNil(f.Source),
		FromTs:          timePtrToPg(f.From),
		ToTs:            timePtrToPg(f.To),
		CursorCreatedAt: timePtrToPg(cursorAt),
		CursorID:        cursorID,
	})
	if err != nil {
		return nil, err
	}
	out := make([]application.AdminWithdrawalRow, 0, len(rows))
	for _, row := range rows {
		out = append(out, application.AdminWithdrawalRow{
			Withdrawal: mapAdminWithdrawal(row.ID, row.MerchantName, row.OwnerName, row.AmountIdr, row.BankCode, row.BankName, row.AccountHolderName, row.AccountNumberMasked, row.Status, row.Source, row.ProviderFeeQuotedIdr, row.ProviderFeeActualIdr, row.ProviderDisbursementReference, row.CreatedAt),
			CreatedAt:  row.CreatedAt,
		})
	}
	return out, nil
}

func (r *AdminRepo) GetWithdrawal(ctx context.Context, id string) (application.AdminWithdrawalRow, error) {
	row, err := r.q.AdminGetWithdrawalFE(ctx, id)
	if err != nil {
		return application.AdminWithdrawalRow{}, err
	}
	return application.AdminWithdrawalRow{
		Withdrawal: mapAdminWithdrawal(row.ID, row.MerchantName, row.OwnerName, row.AmountIdr, row.BankCode, row.BankName, row.AccountHolderName, row.AccountNumberMasked, row.Status, row.Source, row.ProviderFeeQuotedIdr, row.ProviderFeeActualIdr, row.ProviderDisbursementReference, row.CreatedAt),
		CreatedAt:  row.CreatedAt,
	}, nil
}

func (r *AdminRepo) InventoryProducts(ctx context.Context, limit int32) ([]admin.StockProduct, error) {
	rows, err := r.q.AdminInventoryProducts(ctx, limit)
	if err != nil {
		return nil, err
	}
	out := make([]admin.StockProduct, 0, len(rows))
	for _, row := range rows {
		out = append(out, admin.StockProduct{
			ID:        row.ID,
			Title:     row.Title,
			Type:      row.ProductType,
			Available: row.Available,
			Reserved:  row.Reserved,
			Sold:      row.Sold,
			Invalid:   row.Invalid,
			LowAt:     10,
			Delivery:  deliveryLabelForType(row.ProductType),
		})
	}
	return out, nil
}

func (r *AdminRepo) InventoryItems(ctx context.Context, limit int32) ([]admin.StockItem, error) {
	rows, err := r.q.AdminInventoryItems(ctx, limit)
	if err != nil {
		return nil, err
	}
	out := make([]admin.StockItem, 0, len(rows))
	for _, row := range rows {
		preview := schemaPreviewFromMasked(row.MaskedPreview)
		item := admin.StockItem{
			ID:            row.ID,
			SchemaPreview: preview,
			Status:        mapStockStatus(row.Status),
			CreatedAt:     row.CreatedAt.UTC().Format(time.RFC3339),
		}
		if row.OrderID != nil && *row.OrderID != "" {
			item.OrderID = row.OrderID
		}
		out = append(out, item)
	}
	return out, nil
}

func (r *AdminRepo) InventorySchema(ctx context.Context) ([]admin.InventoryField, error) {
	fieldsJSON, err := r.q.AdminInventorySchemaJSON(ctx)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return []admin.InventoryField{}, nil
		}
		return nil, err
	}
	return parseSchemaFields(fieldsJSON), nil
}

func (r *AdminRepo) ListFulfillments(ctx context.Context, f admin.ListFilter, cursorAt *time.Time, cursorID *string) ([]application.AdminFulfillmentRow, error) {
	rows, err := r.q.AdminListFulfillments(ctx, gen.AdminListFulfillmentsParams{
		Limit:           f.Limit + 1,
		Status:          emptyToNil(f.Status),
		CursorCreatedAt: timePtrToPg(cursorAt),
		CursorID:        cursorID,
	})
	if err != nil {
		return nil, err
	}
	out := make([]application.AdminFulfillmentRow, 0, len(rows))
	for _, row := range rows {
		out = append(out, application.AdminFulfillmentRow{
			Fulfillment: admin.Fulfillment{
				ID:       row.ID,
				Order:    coalesce(row.OrderNumber, row.OrderID),
				Merchant: row.MerchantName,
				Type:     humanDeliveryKind(row.DeliveryKind),
				Target:   row.ProductTitle,
				Status:   mapFulfillmentStatus(row.Status),
				Attempts: row.AttemptCount,
				Time:     row.CreatedAt.UTC().Format("15:04:05"),
			},
			CreatedAt: row.CreatedAt,
		})
	}
	return out, nil
}

func (r *AdminRepo) GetFulfillment(ctx context.Context, id string) (application.AdminFulfillmentRow, error) {
	row, err := r.q.AdminGetFulfillment(ctx, id)
	if err != nil {
		return application.AdminFulfillmentRow{}, err
	}
	return application.AdminFulfillmentRow{
		Fulfillment: admin.Fulfillment{
			ID:       row.ID,
			Order:    coalesce(row.OrderNumber, row.OrderID),
			Merchant: row.MerchantName,
			Type:     humanDeliveryKind(row.DeliveryKind),
			Target:   row.ProductTitle,
			Status:   mapFulfillmentStatus(row.Status),
			Attempts: row.AttemptCount,
			Time:     row.CreatedAt.UTC().Format("15:04:05"),
		},
		CreatedAt: row.CreatedAt,
	}, nil
}

func (r *AdminRepo) ListReviews(ctx context.Context, f admin.ListFilter, cursorAt *time.Time, cursorID *string) ([]application.AdminReviewRow, error) {
	rows, err := r.q.AdminListReviews(ctx, gen.AdminListReviewsParams{
		Limit:           f.Limit + 1,
		Status:          emptyToNil(f.Status),
		CursorCreatedAt: timePtrToPg(cursorAt),
		CursorID:        cursorID,
	})
	if err != nil {
		return nil, err
	}
	out := make([]application.AdminReviewRow, 0, len(rows))
	for _, row := range rows {
		rev := admin.Review{
			ID:        row.ID,
			ProductID: row.ProductID,
			Product:   row.ProductTitle,
			Seller:    row.SellerName,
			Buyer:     row.BuyerName,
			Initials:  application.InitialsFromName(row.BuyerName),
			Rating:    int32(row.Rating),
			Title:     row.Title,
			Body:      row.Body,
			Verified:  row.VerifiedPurchase,
			Status:    row.Status,
			CreatedAt: row.CreatedAt.UTC().Format(time.RFC3339),
		}
		if row.SellerReply != "" {
			sr := row.SellerReply
			rev.SellerReply = &sr
		}
		out = append(out, application.AdminReviewRow{Review: rev, CreatedAt: row.CreatedAt})
	}
	return out, nil
}

func (r *AdminRepo) GetReview(ctx context.Context, id string) (admin.Review, error) {
	row, err := r.q.AdminGetReview(ctx, id)
	if err != nil {
		return admin.Review{}, err
	}
	rev := admin.Review{
		ID:        row.ID,
		ProductID: row.ProductID,
		Product:   row.ProductTitle,
		Seller:    row.SellerName,
		Buyer:     row.BuyerName,
		Initials:  application.InitialsFromName(row.BuyerName),
		Rating:    int32(row.Rating),
		Title:     row.Title,
		Body:      row.Body,
		Verified:  row.VerifiedPurchase,
		Status:    row.Status,
		CreatedAt: row.CreatedAt.UTC().Format(time.RFC3339),
	}
	if row.SellerReply != "" {
		sr := row.SellerReply
		rev.SellerReply = &sr
	}
	return rev, nil
}

func (r *AdminRepo) LookupUsers(ctx context.Context, q string, limit int32) ([]admin.UserLookup, error) {
	rows, err := r.q.AdminLookupUsers(ctx, gen.AdminLookupUsersParams{
		Limit: limit,
		Q:     emptyToNil(q),
	})
	if err != nil {
		return nil, err
	}
	out := make([]admin.UserLookup, 0, len(rows))
	for _, row := range rows {
		out = append(out, admin.UserLookup{
			ID:             row.ID,
			Name:           row.Name,
			Email:          row.EmailDisplay,
			Status:         row.Status,
			IsAdmin:        row.IsAdmin,
			Impersonatable: !row.IsAdmin && row.Status == "ACTIVE",
			CreatedAt:      row.CreatedAt.UTC().Format(time.RFC3339),
		})
	}
	return out, nil
}

func (r *AdminRepo) GetUser(ctx context.Context, id string) (admin.UserLookup, error) {
	row, err := r.q.AdminGetUser(ctx, id)
	if err != nil {
		return admin.UserLookup{}, err
	}
	u := admin.UserLookup{
		ID:             row.ID,
		Name:           row.Name,
		Email:          row.EmailDisplay,
		Status:         row.Status,
		IsAdmin:        row.IsAdmin,
		Impersonatable: !row.IsAdmin && row.Status == "ACTIVE",
		CreatedAt:      row.CreatedAt.UTC().Format(time.RFC3339),
	}
	if row.OwnerMerchantID != "" {
		mid := row.OwnerMerchantID
		u.OwnerMerchantID = &mid
	}
	return u, nil
}

// --- mappers ---

func mapAdminMerchant(id, name, owner, email string, volume, orders int64, status, liveAPI string, created time.Time) admin.Merchant {
	return admin.Merchant{
		ID:        id,
		Name:      name,
		Owner:     owner,
		Email:     email,
		Volume:    volume,
		Orders:    orders,
		Risk:      riskFromStatus(status),
		Status:    humanMerchantStatus(status),
		Joined:    created.UTC().Format("2 Jan 2006"),
		APIAccess: humanAPIAccess(liveAPI),
	}
}

func mapAdminBuyer(id, name, email string, verified bool, purchases, spent, sessions int64, lastAt *time.Time, created time.Time) admin.Buyer {
	v := "Pending"
	if verified {
		v = "Verified"
	}
	last := "—"
	if lastAt != nil {
		last = relativeTime(*lastAt)
	} else {
		last = relativeTime(created)
	}
	return admin.Buyer{
		ID:        id,
		Name:      name,
		Email:     email,
		Verified:  v,
		Purchases: purchases,
		Spent:     spent,
		Sessions:  sessions,
		Last:      last,
	}
}

func mapAdminOrder(id, orderNumber, store, customer, product string, gross, fee int64, payStatus, source string, created time.Time) admin.Order {
	displayID := orderNumber
	if displayID == "" {
		displayID = id
	}
	feeCharged := int64(0)
	if payStatus == "PAID" {
		feeCharged = fee
	}
	return admin.Order{
		ID:              displayID,
		Store:           store,
		Customer:        customer,
		Product:         product,
		Gross:           gross,
		TotalFeeCharged: feeCharged,
		Status:          titleCasePayment(payStatus),
		Payment:         "QRIS",
		Created:         created.UTC().Format("2 Jan, 15:04"),
		Source:          source,
	}
}

func mapAdminPayment(id, provider, merchant string, amount int64, providerRef *string, status, source string, created, updated time.Time) admin.Payment {
	ref := ""
	if providerRef != nil {
		ref = *providerRef
	}
	prov := provider
	if strings.EqualFold(prov, "XENDIT") {
		prov = "Xendit"
	}
	lat := "—"
	if !updated.IsZero() && updated.After(created) {
		d := updated.Sub(created)
		if d < time.Second {
			lat = fmt.Sprintf("%dms", d.Milliseconds())
		} else {
			lat = fmt.Sprintf("%.1fs", d.Seconds())
		}
	}
	return admin.Payment{
		ID:          id,
		Provider:    prov,
		Merchant:    merchant,
		Amount:      amount,
		ProviderRef: ref,
		Status:      titleCasePayment(status),
		Latency:     lat,
		Created:     created.UTC().Format("15:04:05"),
		Source:      source,
	}
}

func mapAdminWithdrawal(id, merchant, owner string, amount int64, bankCode, bankName, holder, masked, status, source string, feeQuoted int64, feeActual *int64, providerRef *string, created time.Time) admin.Withdrawal {
	bank := bankCode
	if bankName != "" {
		bank = bankName
	}
	if last4 := last4FromMasked(masked); last4 != "" {
		bank = bank + " • " + last4
	}
	fee := feeQuoted
	feeStatus := "VERIFIED"
	if feeActual != nil {
		fee = *feeActual
		feeStatus = "POSTED"
	}
	ref := ""
	if providerRef != nil {
		ref = *providerRef
	}
	return admin.Withdrawal{
		ID:                    id,
		Merchant:              merchant,
		Owner:                 owner,
		Amount:                amount,
		Bank:                  bank,
		Account:               holder,
		Risk:                  riskFromWithdrawal(status),
		Status:                humanWithdrawalStatus(status),
		Requested:             created.UTC().Format("2 Jan, 15:04"),
		Source:                source,
		ProviderProcessingFee: &fee,
		ProviderFeeStatus:     feeStatus,
		ProviderFeeReference:  ref,
	}
}

func humanMerchantStatus(s string) string {
	switch s {
	case "ACTIVE":
		return "Active"
	case "SUSPENDED":
		return "Suspended"
	case "CLOSED":
		return "Closed"
	default:
		return s
	}
}

func humanAPIAccess(live string) string {
	switch live {
	case "ACTIVE":
		return "Enabled"
	case "PENDING_KYC":
		return "Pending KYC"
	case "SUSPENDED":
		return "Suspended"
	case "INACTIVE", "EXPIRED", "REVOKED", "":
		return "Not requested"
	default:
		return live
	}
}

func riskFromStatus(s string) string {
	switch s {
	case "SUSPENDED":
		return "High"
	case "CLOSED":
		return "Review"
	default:
		return "Low"
	}
}

func riskFromWithdrawal(s string) string {
	switch s {
	case "HELD", "UNDER_REVIEW":
		return "Review"
	case "FAILED", "UNKNOWN_OUTCOME":
		return "High"
	default:
		return "Low"
	}
}

func humanWithdrawalStatus(s string) string {
	switch s {
	case "REQUESTED", "UNDER_REVIEW", "APPROVED":
		return "Pending"
	case "PROCESSING":
		return "Processing"
	case "HELD":
		return "On hold"
	case "COMPLETED":
		return "Completed"
	case "FAILED", "UNKNOWN_OUTCOME", "CANCELLED":
		return "Failed"
	case "REJECTED":
		return "Rejected"
	default:
		return s
	}
}

func titleCasePayment(s string) string {
	switch s {
	case "PAID":
		return "Paid"
	case "PENDING", "REQUIRES_PAYMENT", "CANCEL_PENDING", "EXPIRE_PENDING", "UNKNOWN_OUTCOME":
		return "Pending"
	case "FAILED":
		return "Failed"
	case "EXPIRED":
		return "Expired"
	case "CANCELLED", "UNPAID":
		return "Failed"
	default:
		if s == "" {
			return "Pending"
		}
		return s
	}
}

func mapStockStatus(s string) string {
	switch s {
	case "AVAILABLE":
		return "Available"
	case "RESERVED":
		return "Reserved"
	case "DELIVERED":
		return "Sold"
	case "REVOKED":
		return "Invalid"
	default:
		return s
	}
}

func mapFulfillmentStatus(s string) string {
	switch s {
	case "ACTIVE":
		return "Fulfilled"
	case "DELIVERY_FAILED":
		return "Failed"
	case "PENDING_FULFILLMENT":
		return "Pending"
	case "REVOKED":
		return "Revoked"
	case "EXPIRED":
		return "Failed"
	default:
		return s
	}
}

func humanDeliveryKind(k string) string {
	switch k {
	case "DOWNLOAD":
		return "Download"
	case "PROTECTED_LINK":
		return "Link"
	case "CREDENTIAL":
		return "Credentials"
	case "CODE":
		return "Stock code"
	default:
		return k
	}
}

func deliveryLabelForType(t string) string {
	switch t {
	case "download":
		return "Download"
	case "link":
		return "Protected link"
	case "code":
		return "Stock code"
	default:
		return t
	}
}

func schemaPreviewFromMasked(raw []byte) string {
	if len(raw) == 0 {
		return ""
	}
	var m map[string]any
	if err := json.Unmarshal(raw, &m); err != nil {
		return ""
	}
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	return strings.Join(keys, " | ")
}

func parseSchemaFields(raw []byte) []admin.InventoryField {
	if len(raw) == 0 {
		return []admin.InventoryField{}
	}
	var fields []struct {
		Key           string `json:"key"`
		Label         string `json:"label"`
		Secret        bool   `json:"secret"`
		Required      bool   `json:"required"`
		BuyerCopyable bool   `json:"buyerCopyable"`
	}
	if err := json.Unmarshal(raw, &fields); err != nil {
		return []admin.InventoryField{}
	}
	out := make([]admin.InventoryField, 0, len(fields))
	for _, f := range fields {
		out = append(out, admin.InventoryField{
			Key:           f.Key,
			Label:         f.Label,
			Secret:        f.Secret,
			Required:      f.Required,
			BuyerCopyable: f.BuyerCopyable,
		})
	}
	return out
}

func emptyToNil(s string) *string {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	return &s
}

func anyString(v any) string {
	if v == nil {
		return ""
	}
	switch t := v.(type) {
	case string:
		return t
	case []byte:
		return string(t)
	default:
		return fmt.Sprint(t)
	}
}

func coalesce(a, b string) string {
	if strings.TrimSpace(a) != "" {
		return a
	}
	return b
}

func last4FromMasked(masked string) string {
	// masked forms like ****4821 or ••••4821
	digits := make([]rune, 0, 4)
	for _, r := range masked {
		if r >= '0' && r <= '9' {
			digits = append(digits, r)
		}
	}
	if len(digits) < 4 {
		if len(digits) == 0 {
			return ""
		}
		return string(digits)
	}
	return string(digits[len(digits)-4:])
}

func relativeTime(t time.Time) string {
	d := time.Since(t.UTC())
	switch {
	case d < 2*time.Minute:
		return "Now"
	case d < time.Hour:
		return fmt.Sprintf("%dm ago", int(d.Minutes()))
	case d < 24*time.Hour:
		return fmt.Sprintf("%dh ago", int(d.Hours()))
	default:
		return t.UTC().Format("2 Jan 2006")
	}
}

// Compile-time check.
var _ application.AdminReadStore = (*AdminRepo)(nil)
