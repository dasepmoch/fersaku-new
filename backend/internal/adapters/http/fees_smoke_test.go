package httpadapter_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	httpadapter "github.com/dasepmoch/fersaku-new/backend/internal/adapters/http"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/presenters"
	"github.com/dasepmoch/fersaku-new/backend/internal/application"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/platform"
)

func TestPlatformFeesAndPreviewAndRejectMutation(t *testing.T) {
	feeSvc := &application.FeeService{}
	h := testRouter(t, func(d *httpadapter.RouterDeps) {
		d.FeeService = feeSvc
	})

	// Public active policy
	req := httptest.NewRequest(http.MethodGet, "/v1/platform/fees", nil)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("platform fees status %d body %s", rr.Code, rr.Body.String())
	}
	var env presenters.Envelope
	if err := json.Unmarshal(rr.Body.Bytes(), &env); err != nil {
		t.Fatal(err)
	}
	data, ok := env.Data.(map[string]any)
	if !ok {
		t.Fatalf("data type %T", env.Data)
	}
	if data["policyVersion"] != platform.PolicyVersionLaunchV1 {
		t.Fatalf("policyVersion %v", data["policyVersion"])
	}
	if data["transactionPercentBps"] != float64(300) || data["transactionFixedIdr"] != float64(700) {
		t.Fatalf("bps/fixed %v %v", data["transactionPercentBps"], data["transactionFixedIdr"])
	}
	if data["adminMutationAllowed"] != false {
		t.Fatal("adminMutationAllowed must be false")
	}

	// Mutation rejected 405 (auth required first without session → 401)
	req2 := httptest.NewRequest(http.MethodPost, "/v1/admin/system/fees", bytes.NewReader([]byte(`{"transactionPercentBps":1}`)))
	req2.Header.Set("Content-Type", "application/json")
	rr2 := httptest.NewRecorder()
	h.ServeHTTP(rr2, req2)
	if rr2.Code != http.StatusUnauthorized {
		t.Fatalf("unauth mutate status %d", rr2.Code)
	}

	// Publish path also requires auth
	req3 := httptest.NewRequest(http.MethodPost, "/v1/admin/fees/publish", bytes.NewReader([]byte(`{}`)))
	req3.Header.Set("Content-Type", "application/json")
	rr3 := httptest.NewRecorder()
	h.ServeHTTP(rr3, req3)
	if rr3.Code != http.StatusUnauthorized {
		t.Fatalf("publish unauth %d", rr3.Code)
	}
}

func TestFeePreviewCalculatorViaService(t *testing.T) {
	svc := &application.FeeService{}
	res, err := svc.Preview(nil, application.PreviewRequest{
		Kind:      "transaction",
		AmountIDR: 100_000,
		Source:    platform.SourceStorefront,
	})
	if err != nil {
		t.Fatal(err)
	}
	if res.Transaction == nil || res.Transaction.TotalFeeIDR != 3_700 || res.Transaction.NetIDR != 96_300 {
		t.Fatalf("preview %+v", res.Transaction)
	}
	res2, err := svc.Preview(nil, application.PreviewRequest{
		Kind:           "withdrawal",
		AmountIDR:      100_000,
		ProviderFeeIDR: 2_500,
	})
	if err != nil {
		t.Fatal(err)
	}
	if res2.Withdrawal == nil || res2.Withdrawal.TotalFeeIDR != 5_500 || res2.Withdrawal.NetDisbursementIDR != 94_500 {
		t.Fatalf("wd preview %+v", res2.Withdrawal)
	}
	_, err = svc.Preview(nil, application.PreviewRequest{Kind: "withdrawal", AmountIDR: 49_999})
	if err != platform.ErrBelowMinWithdrawal {
		t.Fatalf("below min err=%v", err)
	}
}
