package ledger

import (
	"fmt"
	"sort"
	"time"
)

// AllocateWithdrawalFIFO consumes available settlement lots oldest-first
// (available_at ASC, settlement_lot_id ASC) under a single merchant wallet.
// Source is reporting only: top-level STOREFRONT | QRIS_API | MIXED.
// Lots must already be AVAILABLE (or PARTIALLY_CONSUMED) with remaining > 0.
func AllocateWithdrawalFIFO(amountIDR int64, lots []SettlementLot) (WithdrawalAllocation, error) {
	if amountIDR <= 0 {
		return WithdrawalAllocation{}, fmt.Errorf("ledger: withdrawal amount must be positive")
	}
	// Copy + sort FIFO
	sorted := make([]SettlementLot, 0, len(lots))
	for _, lot := range lots {
		if lot.RemainingAmountIDR <= 0 {
			continue
		}
		if lot.Status != LotAvailable && lot.Status != LotPartiallyConsumed {
			continue
		}
		sorted = append(sorted, lot)
	}
	sort.SliceStable(sorted, func(i, j int) bool {
		if !sorted[i].AvailableAt.Equal(sorted[j].AvailableAt) {
			return sorted[i].AvailableAt.Before(sorted[j].AvailableAt)
		}
		return sorted[i].ID < sorted[j].ID
	})

	var slices []AllocationSlice
	remaining := amountIDR
	sourceSet := map[string]struct{}{}
	for _, lot := range sorted {
		if remaining <= 0 {
			break
		}
		take := lot.RemainingAmountIDR
		if take > remaining {
			take = remaining
		}
		if take <= 0 {
			continue
		}
		slices = append(slices, AllocationSlice{
			Source:          lot.Source,
			SettlementLotID: lot.ID,
			AmountIDR:       take,
			AvailableAt:     lot.AvailableAt,
		})
		sourceSet[lot.Source] = struct{}{}
		remaining -= take
	}
	if remaining > 0 {
		return WithdrawalAllocation{}, fmt.Errorf("ledger: insufficient available lots (short %d)", remaining)
	}

	top := SourceStorefront
	if len(sourceSet) == 1 {
		for s := range sourceSet {
			top = s
		}
	} else if len(sourceSet) > 1 {
		top = SourceMixed
	} else {
		return WithdrawalAllocation{}, fmt.Errorf("ledger: no lots allocated")
	}
	return WithdrawalAllocation{
		AmountDebited: amountIDR,
		Source:        top,
		Allocations:   slices,
	}, nil
}

// SourceTotalsSumEqual reports whether STOREFRONT+QRIS_API available/pending equal unified.
func SourceTotalsSumEqual(unified Balance, sources []SourceBalance) bool {
	var a, p, h int64
	for _, s := range sources {
		a += s.AvailableIDR
		p += s.PendingIDR
		h += s.HeldIDR
	}
	return a == unified.AvailableIDR && p == unified.PendingIDR && h == unified.HeldIDR
}

// NowUTC helper for tests.
func NowUTC() time.Time { return time.Now().UTC() }
