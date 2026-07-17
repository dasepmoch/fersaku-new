package coupons

import "testing"

func TestComputeDiscountIDR_PercentHalfUp(t *testing.T) {
	// 20% of 10000 = 2000
	if got := ComputeDiscountIDR(KindPercent, 2000, 10000); got != 2000 {
		t.Fatalf("got %d want 2000", got)
	}
	// 33.33% of 100 = round half up: (100*3333+5000)/10000 = 333800/10000 = 33
	if got := ComputeDiscountIDR(KindPercent, 3333, 100); got != 33 {
		t.Fatalf("got %d want 33", got)
	}
	// 50% of 1 = (1*5000+5000)/10000 = 1
	if got := ComputeDiscountIDR(KindPercent, 5000, 1); got != 1 {
		t.Fatalf("got %d want 1", got)
	}
}

func TestComputeDiscountIDR_FixedClamp(t *testing.T) {
	if got := ComputeDiscountIDR(KindFixedIDR, 50000, 30000); got != 30000 {
		t.Fatalf("clamp: got %d want 30000", got)
	}
	if got := ComputeDiscountIDR(KindFixedIDR, 5000, 30000); got != 5000 {
		t.Fatalf("got %d want 5000", got)
	}
}

func TestBuildPriceSnapshot_IgnoresNegativeAndTip(t *testing.T) {
	c := &Coupon{
		ID:            "c1",
		CodeDisplay:   "SAVE20",
		DiscountKind:  KindPercent,
		DiscountValue: 2000, // 20%
		PolicyVersion: 1,
	}
	// merchandise 100_000, tip 10_000, upsell 5_000 → discount only on merch
	snap := BuildPriceSnapshot("s1", "p1", 100_000, 10_000, 5_000, c, true)
	if snap.DiscountIDR != 20_000 {
		t.Fatalf("discount %d", snap.DiscountIDR)
	}
	// gross = 100000 - 20000 + 10000 + 5000 = 95000
	if snap.GrossIDR != 95_000 {
		t.Fatalf("gross %d want 95000", snap.GrossIDR)
	}
	if snap.EligibleSubtotalIDR != 100_000 {
		t.Fatalf("eligible %d", snap.EligibleSubtotalIDR)
	}
}

func TestBuildPriceSnapshot_NeverNegativeGross(t *testing.T) {
	c := &Coupon{
		DiscountKind:  KindFixedIDR,
		DiscountValue: 999_999,
		PolicyVersion: 1,
		CodeDisplay:   "BIG",
		ID:            "c2",
	}
	snap := BuildPriceSnapshot("s", "p", 1000, 0, 0, c, true)
	if snap.DiscountIDR != 1000 {
		t.Fatalf("discount %d", snap.DiscountIDR)
	}
	if snap.GrossIDR != 0 {
		t.Fatalf("gross %d", snap.GrossIDR)
	}
}

func TestNormalizeCode(t *testing.T) {
	if got := NormalizeCode("  launch_20 "); got != "LAUNCH-20" {
		t.Fatalf("got %q", got)
	}
	if err := ValidateCode(NormalizeCode("AB")); err != nil {
		t.Fatal(err)
	}
	if err := ValidateCode("A"); err == nil {
		t.Fatal("expected invalid")
	}
}

func TestPercentToBps(t *testing.T) {
	bps, err := PercentToBps(20)
	if err != nil || bps != 2000 {
		t.Fatalf("bps=%d err=%v", bps, err)
	}
	bps, err = PercentToBps(2500)
	if err != nil || bps != 2500 {
		t.Fatalf("already bps: %d", bps)
	}
}
