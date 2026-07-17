package application

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/admin"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/auth"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/authz"
	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
)

type memImpStore struct {
	sessions  map[string]admin.ImpersonationSession
	byDerived map[string]string
	users     map[string]auth.User
	admins    map[string]bool
	owners    map[string]string
	stores    map[string]string
	audits    int
}

func newMemImp() *memImpStore {
	return &memImpStore{
		sessions:  map[string]admin.ImpersonationSession{},
		byDerived: map[string]string{},
		users:     map[string]auth.User{},
		admins:    map[string]bool{},
		owners:    map[string]string{},
		stores:    map[string]string{},
	}
}

func (m *memImpStore) WithTx(ctx context.Context, fn func(ctx context.Context) error) error {
	return fn(ctx)
}
func (m *memImpStore) IsNotFound(err error) bool { return errors.Is(err, errMemNF) }

var errMemNF = errors.New("not found")

func (m *memImpStore) InsertSession(_ context.Context, s admin.ImpersonationSession) error {
	m.sessions[s.ID] = s
	m.byDerived[s.DerivedSessionID] = s.ID
	return nil
}
func (m *memImpStore) GetByID(_ context.Context, id string) (admin.ImpersonationSession, error) {
	s, ok := m.sessions[id]
	if !ok {
		return admin.ImpersonationSession{}, errMemNF
	}
	return s, nil
}
func (m *memImpStore) GetByDerivedSessionID(_ context.Context, d string) (admin.ImpersonationSession, error) {
	id, ok := m.byDerived[d]
	if !ok {
		return admin.ImpersonationSession{}, errMemNF
	}
	return m.GetByID(context.Background(), id)
}
func (m *memImpStore) GetByTokenHash(context.Context, string) (admin.ImpersonationSession, error) {
	return admin.ImpersonationSession{}, errMemNF
}
func (m *memImpStore) GetActiveByActor(_ context.Context, actor string, now time.Time) (admin.ImpersonationSession, error) {
	for _, s := range m.sessions {
		if s.ActorAdminID == actor && s.Active(now) {
			return s, nil
		}
	}
	return admin.ImpersonationSession{}, errMemNF
}
func (m *memImpStore) EndSession(_ context.Context, id, status string, endedAt time.Time, endedBy *string, endReason string) (int64, error) {
	s, ok := m.sessions[id]
	if !ok || s.Status != admin.ImpersonationStatusActive {
		return 0, nil
	}
	s.Status = status
	s.EndedAt = &endedAt
	s.EndedBy = endedBy
	s.EndReason = &endReason
	m.sessions[id] = s
	return 1, nil
}
func (m *memImpStore) MarkExpired(_ context.Context, id string, now time.Time) (int64, error) {
	return m.EndSession(context.Background(), id, admin.ImpersonationStatusExpired, now, nil, "expired")
}
func (m *memImpStore) IsAdminUser(_ context.Context, userID string) (bool, error) {
	return m.admins[userID], nil
}
func (m *memImpStore) GetMerchantOwner(_ context.Context, merchantID string) (string, error) {
	o, ok := m.owners[merchantID]
	if !ok {
		return "", errMemNF
	}
	return o, nil
}
func (m *memImpStore) GetUser(_ context.Context, userID string) (auth.User, error) {
	u, ok := m.users[userID]
	if !ok {
		return auth.User{}, errMemNF
	}
	return u, nil
}
func (m *memImpStore) GetStoreOwnerUserID(_ context.Context, storeID string) (string, error) {
	o, ok := m.stores[storeID]
	if !ok {
		return "", errMemNF
	}
	return o, nil
}
func (m *memImpStore) InsertAudit(context.Context, AdminOpsAuditInsert) error {
	m.audits++
	return nil
}

type fixedClock struct{ t time.Time }

func (c fixedClock) Now() time.Time { return c.t }

type seqIDs struct{ n int }

func (s *seqIDs) New() string {
	s.n++
	return "id_" + string(rune('0'+s.n%10))
}

func TestStartImpersonation_RejectsPrivilegedScope(t *testing.T) {
	st := newMemImp()
	svc := &ImpersonationService{Store: st, IDs: &seqIDs{}, Clock: fixedClock{t: time.Now().UTC()}}
	_, err := svc.StartImpersonation(context.Background(), StartImpersonationInput{
		ActorAdminID: "admin1", ActorSessionID: "sess_a", TargetUserID: "target1",
		Scope: "FULL", Reason: "support investigation ticket", Ticket: "T-1", TTLMinutes: 15,
		ActorPermissions: []string{authz.PermImpersonationStart},
	})
	if err == nil {
		t.Fatal("FULL scope must fail")
	}
	ae, ok := apperr.AsAppError(err)
	if !ok || ae.Code != apperr.CodeValidationFailed {
		t.Fatalf("want VALIDATION_FAILED got %v", err)
	}
}

func TestStartImpersonation_SupportWriteRequiresPerm(t *testing.T) {
	st := newMemImp()
	svc := &ImpersonationService{Store: st, IDs: &seqIDs{}, Clock: fixedClock{t: time.Now().UTC()}}
	_, err := svc.StartImpersonation(context.Background(), StartImpersonationInput{
		ActorAdminID: "a", ActorSessionID: "s", TargetUserID: "t",
		Scope: admin.ImpersonationScopeSupportWrite, Reason: "need support write access", Ticket: "T-2", TTLMinutes: 30,
		ActorPermissions: []string{authz.PermImpersonationStart},
	})
	if err == nil {
		t.Fatal("SUPPORT_WRITE without perm must fail")
	}
	ae, ok := apperr.AsAppError(err)
	if !ok || ae.Code != apperr.CodeForbidden {
		t.Fatalf("code want FORBIDDEN got %v", err)
	}
}

func TestStartImpersonation_MissingStartPerm(t *testing.T) {
	st := newMemImp()
	svc := &ImpersonationService{Store: st, IDs: &seqIDs{}, Clock: fixedClock{t: time.Now().UTC()}}
	_, err := svc.StartImpersonation(context.Background(), StartImpersonationInput{
		ActorAdminID: "a", ActorSessionID: "s", TargetUserID: "t",
		Scope: admin.ImpersonationScopeReadOnly, Reason: "need support write access", Ticket: "T-2", TTLMinutes: 15,
		ActorPermissions: nil,
	})
	if err == nil {
		t.Fatal("missing start perm")
	}
}

func TestTerminate_IdempotentWhenAlreadyEnded(t *testing.T) {
	now := time.Now().UTC()
	st := newMemImp()
	ended := now.Add(-time.Minute)
	st.sessions["imp1"] = admin.ImpersonationSession{
		ID: "imp1", ActorAdminID: "a", TargetUserID: "t",
		Status: admin.ImpersonationStatusTerminated, EndedAt: &ended,
		DerivedSessionID: "der1", ExpiresAt: now.Add(time.Hour),
	}
	svc := &ImpersonationService{Store: st, Auth: &AuthService{}, Clock: fixedClock{t: now}}
	row, err := svc.Terminate(context.Background(), TerminateInput{
		ActorAdminID: "a", ImpersonationID: "imp1", RequireActor: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	if row.Status != admin.ImpersonationStatusTerminated {
		t.Fatalf("status=%s", row.Status)
	}
}

func TestAssertStoreOwnedByTarget(t *testing.T) {
	st := newMemImp()
	st.stores["store1"] = "user1"
	svc := &ImpersonationService{Store: st}
	if err := svc.AssertStoreOwnedByTarget(context.Background(), "store1", "user1"); err != nil {
		t.Fatal(err)
	}
	if err := svc.AssertStoreOwnedByTarget(context.Background(), "store1", "other"); err == nil {
		t.Fatal("cross-owner must fail")
	}
}

func TestResolveDerived_EndedBlocks(t *testing.T) {
	now := time.Now().UTC()
	st := newMemImp()
	ended := now
	st.sessions["imp1"] = admin.ImpersonationSession{
		ID: "imp1", ActorAdminID: "a", TargetUserID: "t", Scope: admin.ImpersonationScopeReadOnly,
		Status: admin.ImpersonationStatusTerminated, EndedAt: &ended, DerivedSessionID: "der1",
		ExpiresAt: now.Add(time.Hour),
	}
	st.byDerived["der1"] = "imp1"
	svc := &ImpersonationService{Store: st, Clock: fixedClock{t: now}}
	_, err := svc.ResolveDerived(context.Background(), "der1")
	if err == nil {
		t.Fatal("ended must block")
	}
}
