package ledger_test

import (
	"testing"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/ledger"
)

func TestBuildPaymentCapture100k(t *testing.T) {
	at := time.Date(2026, 7, 17, 0, 0, 0, 0, time.UTC)
	legs, err := ledger.BuildPaymentCaptureLegs(100_000, 3_000, 700, 96_300, "lot_1", at)
	if err != nil {
		t.Fatal(err)
	}
	if err := ledger.AssertBalanced(legs); err != nil {
		t.Fatal(err)
	}
	var pending, feeP, feeF, recv int64
	for _, l := range legs {
		switch {
		case l.AccountCode == ledger.AcctXenditReceivable && l.Side == ledger.SideDebit:
			recv = l.AmountIDR
		case l.AccountCode == ledger.AcctMerchantPending && l.Side == ledger.SideCredit:
			pending = l.AmountIDR
		case l.AccountCode == ledger.AcctPlatformFeeRevenue:
			feeP = l.AmountIDR
		case l.AccountCode == ledger.AcctPaymentProcessingRevenue:
			feeF = l.AmountIDR
		}
	}
	if recv != 100_000 || pending != 96_300 || feeP != 3_000 || feeF != 700 {
		t.Fatalf("recv=%d pending=%d feeP=%d feeF=%d", recv, pending, feeP, feeF)
	}
}

func TestBuildSettlementRelease(t *testing.T) {
	at := time.Now().UTC()
	legs, err := ledger.BuildSettlementReleaseLegs(96_300, "lot_1", at)
	if err != nil {
		t.Fatal(err)
	}
	if len(legs) != 2 {
		t.Fatalf("legs %d", len(legs))
	}
}

func TestAllocateWithdrawalFIFOMixed(t *testing.T) {
	t0 := time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC)
	t1 := t0.Add(time.Hour)
	lots := []ledger.SettlementLot{
		{ID: "lot_b", Source: ledger.SourceQRISAPI, RemainingAmountIDR: 40_000, Status: ledger.LotAvailable, AvailableAt: t1},
		{ID: "lot_a", Source: ledger.SourceStorefront, RemainingAmountIDR: 60_000, Status: ledger.LotAvailable, AvailableAt: t0},
	}
	alloc, err := ledger.AllocateWithdrawalFIFO(100_000, lots)
	if err != nil {
		t.Fatal(err)
	}
	if alloc.Source != ledger.SourceMixed {
		t.Fatalf("source %s", alloc.Source)
	}
	if len(alloc.Allocations) != 2 {
		t.Fatalf("allocs %d", len(alloc.Allocations))
	}
	if alloc.Allocations[0].SettlementLotID != "lot_a" || alloc.Allocations[0].AmountIDR != 60_000 {
		t.Fatalf("first %+v", alloc.Allocations[0])
	}
	if alloc.Allocations[1].SettlementLotID != "lot_b" || alloc.Allocations[1].AmountIDR != 40_000 {
		t.Fatalf("second %+v", alloc.Allocations[1])
	}
}

func TestAllocateWithdrawalInsufficient(t *testing.T) {
	lots := []ledger.SettlementLot{
		{ID: "lot_a", Source: ledger.SourceStorefront, RemainingAmountIDR: 10_000, Status: ledger.LotAvailable, AvailableAt: time.Now().UTC()},
	}
	_, err := ledger.AllocateWithdrawalFIFO(50_000, lots)
	if err == nil {
		t.Fatal("expected insufficient")
	}
}

func TestSplitFeeComponents(t *testing.T) {
	p, f := ledger.SplitFeeComponents(3_700, 3_000, 700)
	if p != 3_000 || f != 700 {
		t.Fatalf("%d %d", p, f)
	}
	p2, f2 := ledger.SplitFeeComponents(3_700, 0, 0)
	if p2 != 3_000 || f2 != 700 {
		t.Fatalf("fallback %d %d", p2, f2)
	}
}

func TestComputeAvailableAt(t *testing.T) {
	posted := time.Date(2026, 7, 17, 12, 0, 0, 0, time.UTC)
	if !ledger.ComputeAvailableAt(posted, 0).Equal(posted) {
		t.Fatal("immediate")
	}
	want := posted.Add(24 * time.Hour)
	if !ledger.ComputeAvailableAt(posted, 86400).Equal(want) {
		t.Fatal("delay")
	}
}

func TestBuildWithdrawalComplete100k(t *testing.T) {
	// W=100000 P=3000 Q=2500 N=94500
	legs, err := ledger.BuildWithdrawalCompleteLegs(100_000, 3_000, 2_500, 94_500)
	if err != nil {
		t.Fatal(err)
	}
	if err := ledger.AssertBalanced(legs); err != nil {
		t.Fatal(err)
	}
}

func TestBuildProviderFeeVarianceTemplates(t *testing.T) {
	eq, err := ledger.BuildProviderFeeSettleEqualLegs(2_500)
	if err != nil {
		t.Fatal(err)
	}
	if err := ledger.AssertBalanced(eq); err != nil {
		t.Fatal(err)
	}
	hi, err := ledger.BuildProviderFeeSettleHigherLegs(2_500, 3_000)
	if err != nil {
		t.Fatal(err)
	}
	if err := ledger.AssertBalanced(hi); err != nil {
		t.Fatal(err)
	}
	lo, err := ledger.BuildProviderFeeSettleLowerLegs(2_500, 2_000)
	if err != nil {
		t.Fatal(err)
	}
	if err := ledger.AssertBalanced(lo); err != nil {
		t.Fatal(err)
	}
}

func TestBuildWithdrawalRecapture(t *testing.T) {
	legs, err := ledger.BuildWithdrawalRecaptureLegs(70_000, 30_000, 100_000)
	if err != nil {
		t.Fatal(err)
	}
	if err := ledger.AssertBalanced(legs); err != nil {
		t.Fatal(err)
	}
}
