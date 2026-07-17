package platform_test

import (
	"math"
	"testing"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/platform"
)

func TestLaunchPolicyChecksumStable(t *testing.T) {
	p := platform.LaunchFeePolicy()
	if !p.MatchesLaunchInvariant() {
		t.Fatal("launch policy must match invariant")
	}
	if p.Checksum != platform.LaunchPolicyChecksum() {
		t.Fatalf("checksum mismatch %s vs %s", p.Checksum, platform.LaunchPolicyChecksum())
	}
	// Documented seed identity (must match migration 000014).
	want := "74db3dc26f74c349ef49b7928e3b8151ed9d6e8555564bd01c46e8baba42eeeb"
	if p.Checksum != want {
		t.Fatalf("checksum %s want %s", p.Checksum, want)
	}
}

func TestCalculateTransactionFee_Table0_3(t *testing.T) {
	p := platform.LaunchFeePolicy()
	// Storefront paid Rp100.000 → fee 3.700 net 96.300
	r, err := platform.CalculateTransactionFee(100_000, p)
	if err != nil {
		t.Fatal(err)
	}
	if r.PercentComponentIDR != 3_000 || r.FixedComponentIDR != 700 || r.TotalFeeIDR != 3_700 || r.NetIDR != 96_300 {
		t.Fatalf("100k got percent=%d fixed=%d total=%d net=%d", r.PercentComponentIDR, r.FixedComponentIDR, r.TotalFeeIDR, r.NetIDR)
	}
	// QRIS API paid Rp250.000 → fee 8.200 net 241.800
	r2, err := platform.CalculateTransactionFee(250_000, p)
	if err != nil {
		t.Fatal(err)
	}
	if r2.TotalFeeIDR != 8_200 || r2.NetIDR != 241_800 {
		t.Fatalf("250k total=%d net=%d", r2.TotalFeeIDR, r2.NetIDR)
	}
	// Same rule for both sources (global only).
	if !platform.SameGlobalRuleForSources(platform.SourceStorefront, platform.SourceQRISAPI) {
		t.Fatal("sources must share global rule")
	}
	s1 := platform.BuildTransactionSnapshot(p, platform.SourceStorefront, r, p.EffectiveFrom)
	s2 := platform.BuildTransactionSnapshot(p, platform.SourceQRISAPI, r2, p.EffectiveFrom)
	if s1.PolicyVersionID != platform.PolicyVersionLaunchV1 || s2.PolicyVersionID != platform.PolicyVersionLaunchV1 {
		t.Fatal("snapshot policy version")
	}
	if s1.TotalFeeIDR != r.TotalFeeIDR || s2.NetIDR != r2.NetIDR {
		t.Fatal("snapshot mismatch")
	}
}

func TestCalculateTransactionFee_HalfUp(t *testing.T) {
	p := platform.LaunchFeePolicy()
	// 3% of 15 = 0.45 → half-up 0; fee = 700 → net negative → reject
	// Use amount where percent rounds: 1667 * 300 / 10000 = 50.01 → 50
	// (1667*300+5000)/10000 = (500100+5000)/10000 = 505100/10000 = 50
	r, err := platform.CalculateTransactionFee(1_667, p)
	if err != nil {
		t.Fatal(err)
	}
	if r.PercentComponentIDR != 50 {
		t.Fatalf("percent %d want 50", r.PercentComponentIDR)
	}
	// 1666*300 = 499800 + 5000 = 504800 / 10000 = 50 (half-up from .48? wait)
	// 499800/10000 = 49.98 → +0.5 unit via (x+5000)/10000: 504800/10000=50
	r2, err := platform.CalculateTransactionFee(1_666, p)
	if err != nil {
		t.Fatal(err)
	}
	if r2.PercentComponentIDR != 50 {
		t.Fatalf("1666 percent %d want 50", r2.PercentComponentIDR)
	}
	// Exactly half: amount*bps ends with .5 → amount*300 % 10000 == 5000
	// amount*300 = 10_000*k + 5000 → amount*3 = 100*k + 50 → amount = ...
	// 50/3 not int. 5000/300 not int. Use known: (x*300+5000)/10000
	// For .5: x*300 % 10000 == 5000 → x*3 % 100 == 50 → x*3 = 100k+50
	// x=50 works: 50*300=15000 → (15000+5000)/10000=2
	r3, err := platform.CalculateTransactionFee(50, p)
	// min payment is 1000 so 50 out of bounds
	if err != platform.ErrPaymentOutOfBounds {
		// still test formula via RoundHalfUpBps
		got, e := platform.RoundHalfUpBps(50, 300)
		if e != nil || got != 2 {
			t.Fatalf("half-up 50*3%% = %d err=%v want 2", got, e)
		}
	}
	_ = r3
}

func TestCalculateTransactionFee_Rejects(t *testing.T) {
	p := platform.LaunchFeePolicy()
	cases := []struct {
		name  string
		gross int64
		want  error
	}{
		{"zero", 0, platform.ErrInvalidAmount},
		{"negative", -1, platform.ErrInvalidAmount},
		{"below min payment", 999, platform.ErrPaymentOutOfBounds},
		{"above max payment", 100_000_001, platform.ErrPaymentOutOfBounds},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := platform.CalculateTransactionFee(tc.gross, p)
			if err != tc.want {
				t.Fatalf("err=%v want %v", err, tc.want)
			}
		})
	}
	// Non-positive net: fee >= gross (e.g. gross == fee boundary)
	// fee = round(g*3%)+700. Solve g - (0.03g+700) <= 0 → 0.97g <= 700 → g <= 721.6
	// With min payment 1000, always positive net under launch. Test with unbounded policy.
	unbounded := p
	unbounded.MinimumPaymentIDR = 0
	unbounded.MaximumPaymentIDR = 0
	_, err := platform.CalculateTransactionFee(700, unbounded) // percent 21 + 700 = 721 > 700
	if err != platform.ErrNonPositiveNet {
		t.Fatalf("fee>gross err=%v", err)
	}
	// fee == gross: need net 0 → g = percent + 700
	// g - round(g*300/10000) - 700 = 0
	// Try g=721: percent=(721*300+5000)/10000=221300/10000=22; fee=722; net=-1
	// g=722: (722*300+5000)/10000=221600/10000=22; fee=722; net=0 → non-positive
	_, err = platform.CalculateTransactionFee(722, unbounded)
	if err != platform.ErrNonPositiveNet {
		t.Fatalf("fee==gross err=%v", err)
	}
}

func TestCalculateTransactionFee_Overflow(t *testing.T) {
	p := platform.LaunchFeePolicy()
	p.MinimumPaymentIDR = 0
	p.MaximumPaymentIDR = 0
	// Max int64 will overflow on * 300
	_, err := platform.CalculateTransactionFee(math.MaxInt64, p)
	if err != platform.ErrMoneyOverflow {
		t.Fatalf("max int64 err=%v want overflow", err)
	}
	// Just under overflow for *300: MaxInt64/300
	safe := int64(math.MaxInt64 / 300)
	// still may fail net or bounds — just ensure no panic
	_, _ = platform.CalculateTransactionFee(safe, p)
}

func TestCalculateWithdrawalFee_Table0_3(t *testing.T) {
	p := platform.LaunchFeePolicy()
	// Withdrawal, provider fee Rp2.500 | Rp100.000 | fee 5.500 | net 94.500
	r, err := platform.CalculateWithdrawalFee(100_000, 2_500, p)
	if err != nil {
		t.Fatal(err)
	}
	if r.PlatformFeeIDR != 3_000 || r.ProviderFeeIDR != 2_500 || r.TotalFeeIDR != 5_500 || r.NetDisbursementIDR != 94_500 {
		t.Fatalf("got platform=%d provider=%d total=%d net=%d", r.PlatformFeeIDR, r.ProviderFeeIDR, r.TotalFeeIDR, r.NetDisbursementIDR)
	}
	// Minimum withdrawal 50_000 with provider 0
	r2, err := platform.CalculateWithdrawalFee(50_000, 0, p)
	if err != nil {
		t.Fatal(err)
	}
	// 3% of 50k = 1500; fee=1500; net=48500
	if r2.PlatformFeeIDR != 1_500 || r2.TotalFeeIDR != 1_500 || r2.NetDisbursementIDR != 48_500 {
		t.Fatalf("min wd got platform=%d total=%d net=%d", r2.PlatformFeeIDR, r2.TotalFeeIDR, r2.NetDisbursementIDR)
	}
	snap := platform.BuildWithdrawalSnapshot(p, r, p.EffectiveFrom)
	if snap.Kind != platform.SnapshotWithdrawal || snap.TotalFeeIDR != 5_500 {
		t.Fatal("withdrawal snapshot")
	}
}

func TestCalculateWithdrawalFee_Rejects(t *testing.T) {
	p := platform.LaunchFeePolicy()
	_, err := platform.CalculateWithdrawalFee(49_999, 0, p)
	if err != platform.ErrBelowMinWithdrawal {
		t.Fatalf("below min err=%v", err)
	}
	_, err = platform.CalculateWithdrawalFee(0, 0, p)
	if err != platform.ErrInvalidAmount {
		t.Fatalf("zero err=%v", err)
	}
	_, err = platform.CalculateWithdrawalFee(-1, 0, p)
	if err != platform.ErrInvalidAmount {
		t.Fatalf("neg err=%v", err)
	}
	_, err = platform.CalculateWithdrawalFee(100_000, -1, p)
	if err != platform.ErrNegativeMoney {
		t.Fatalf("neg provider err=%v", err)
	}
	// Non-positive net: amount 50000, provider fee huge
	_, err = platform.CalculateWithdrawalFee(50_000, 50_000, p)
	if err != platform.ErrNonPositiveNet {
		t.Fatalf("non-pos net err=%v", err)
	}
	// Overflow provider path
	_, err = platform.CalculateWithdrawalFee(50_000, math.MaxInt64, p)
	if err != platform.ErrMoneyOverflow {
		t.Fatalf("overflow err=%v", err)
	}
}

func TestRoundHalfUpBps(t *testing.T) {
	// (100000*300 + 5000)/10000 = 3000
	got, err := platform.RoundHalfUpBps(100_000, 300)
	if err != nil || got != 3_000 {
		t.Fatalf("got %d %v", got, err)
	}
	// classic half-up: 1 * 5000 bps = 50% of 1 = 0.5 → 1
	got, err = platform.RoundHalfUpBps(1, 5_000)
	if err != nil || got != 1 {
		t.Fatalf("0.5 half-up got %d %v", got, err)
	}
	// just under half: 1 * 4999 / 10000 = 0.4999 → 0
	got, err = platform.RoundHalfUpBps(1, 4_999)
	if err != nil || got != 0 {
		t.Fatalf("below half got %d %v", got, err)
	}
	_, err = platform.RoundHalfUpBps(math.MaxInt64, 300)
	if err != platform.ErrMoneyOverflow {
		t.Fatalf("overflow %v", err)
	}
}

func TestMoneyHelpers(t *testing.T) {
	sum, err := platform.Money(100).Add(platform.Money(50))
	if err != nil || sum != 150 {
		t.Fatalf("add %v %v", sum, err)
	}
	_, err = platform.Money(math.MaxInt64).Add(1)
	if err != platform.ErrMoneyOverflow {
		t.Fatalf("add overflow %v", err)
	}
	diff, err := platform.Money(100).Sub(30)
	if err != nil || diff != 70 {
		t.Fatalf("sub %v %v", diff, err)
	}
}
