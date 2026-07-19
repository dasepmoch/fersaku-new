package jobs

import (
	"context"
	"testing"
	"time"
)

func TestDefaultInventory_CoversINT185(t *testing.T) {
	inv := DefaultInventory()
	need := map[JobName]bool{
		JobCouponReservationExpiry:       false,
		JobInventoryReservationExpiry:    false,
		JobObjectUploadCleanup:           false,
		JobObjectMalwareScan:             false,
		JobCheckoutIntentExpiry:          false,
		JobCheckoutUnknownReconciliation: false,
		JobDomainRevalidation:            false,
		JobWithdrawalQuoteExpiry:         false,
		JobWithdrawalUnknownLookup:       false,
		JobNotificationOutbox:            false,
		JobNotificationRetention:         false,
		JobProviderCallbackOutbox:        false,
		JobSellerWebhookOutbox:           false,
		JobSettlementRelease:             false,
		JobAnalyticsRetention:            false,
		JobSessionCleanup:                false,
		JobImpersonationExpiry:           false,
		JobIdempotencyCleanup:            false,
	}
	for _, m := range inv {
		if _, ok := need[m.Name]; !ok {
			t.Fatalf("unexpected job %s", m.Name)
		}
		need[m.Name] = true
		if m.Cadence <= 0 || m.LeaseTTL <= 0 || m.BatchSize <= 0 {
			t.Fatalf("job %s missing cadence/lease/batch", m.Name)
		}
		if m.MetricsLabel == "" || m.Owner == "" {
			t.Fatalf("job %s missing metrics/owner", m.Name)
		}
	}
	for name, ok := range need {
		if !ok {
			t.Fatalf("missing inventory job %s", name)
		}
	}
}

func TestRegistry_RegisterAndGet(t *testing.T) {
	r := NewRegistry()
	var n int
	r.Register(JobMeta{Name: JobSettlementRelease, Cadence: time.Second, BatchSize: 1, Timeout: time.Second, LeaseTTL: 2 * time.Second},
		func(context.Context, int) (int, error) {
			n++
			return 1, nil
		})
	j, ok := r.Get(JobSettlementRelease)
	if !ok || j.Run == nil {
		t.Fatal("expected registered job")
	}
	got, err := j.Run(context.Background(), 1)
	if err != nil || got != 1 || n != 1 {
		t.Fatalf("run got=%d n=%d err=%v", got, n, err)
	}
	if len(r.All()) != 1 {
		t.Fatalf("all=%d", len(r.All()))
	}
}

func TestBuildRegistry_StubsWhenDepsNil(t *testing.T) {
	reg := BuildRegistry(Deps{})
	all := reg.All()
	if len(all) != len(DefaultInventory()) {
		t.Fatalf("want %d jobs, got %d", len(DefaultInventory()), len(all))
	}
	for _, j := range all {
		n, err := j.Run(context.Background(), j.Meta.BatchSize)
		if err != nil || n != 0 {
			t.Fatalf("stub %s: n=%d err=%v", j.Meta.Name, n, err)
		}
	}
}
