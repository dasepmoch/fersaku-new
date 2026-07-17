package application

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net"
	"strings"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/auth"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/domains"
	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
	"github.com/dasepmoch/fersaku-new/backend/internal/ports"
)

// DomainService owns custom-domain lifecycle (BE-240).
type DomainService struct {
	Store DomainStore
	DNS   ports.DNSLookup
	Edge  ports.EdgeProvisioner
	IDs   ports.IDGenerator
	Clock ports.Clock
	Log   ports.Logger
	// TokenSecret for hashing verification tokens (never store raw).
	TokenSecret string
	// TakeoverCooldown overrides domains.DefaultTakeoverCooldown when >0.
	TakeoverCooldown time.Duration
	// PlatformHosts are additional hostnames treated as app hosts (auth cookies allowed).
	PlatformHosts map[string]struct{}
}

// CreateDomainInput is POST /v1/stores/{storeId}/domains.
type CreateDomainInput struct {
	Hostname string
}

// CreateDomainResult includes one-time plaintext verification token.
type CreateDomainResult struct {
	Domain            domains.Domain
	VerificationToken string // one-time display only
}

// HostResolveResult is public Host → store mapping.
type HostResolveResult struct {
	HostnameNormalized string
	StoreID            string
	MerchantID         string
	DomainID           string
	Slug               string
	StoreName          string
}

func (s *DomainService) now() time.Time {
	if s.Clock != nil {
		return s.Clock.Now().UTC()
	}
	return time.Now().UTC()
}

func (s *DomainService) hashToken(raw string) string {
	return auth.HashTokenKeyed(raw, s.TokenSecret)
}

func (s *DomainService) cooldown() time.Duration {
	if s.TakeoverCooldown > 0 {
		return s.TakeoverCooldown
	}
	return domains.DefaultTakeoverCooldown
}

func (s *DomainService) requireStoreAccess(ctx context.Context, userID, storeID string) (DomainStoreRow, error) {
	if userID == "" {
		return DomainStoreRow{}, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required")
	}
	st, err := s.Store.GetStore(ctx, storeID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return DomainStoreRow{}, apperr.NotFound(apperr.CodeResourceNotFound, "Store not found")
		}
		return DomainStoreRow{}, apperr.Internal(apperr.CodeInternalError, "Store lookup failed")
	}
	ok, err := s.Store.UserCanAccessStore(ctx, userID, storeID)
	if err != nil {
		return DomainStoreRow{}, apperr.Internal(apperr.CodeInternalError, "Access check failed")
	}
	if !ok {
		admin, aerr := s.Store.UserIsPlatformAdmin(ctx, userID)
		if aerr != nil || !admin {
			return DomainStoreRow{}, apperr.NotFound(apperr.CodeResourceNotFound, "Store not found")
		}
	}
	return st, nil
}

// ListDomains returns non-tombstoned domains for a store.
func (s *DomainService) ListDomains(ctx context.Context, userID, storeID string) ([]domains.Domain, error) {
	if _, err := s.requireStoreAccess(ctx, userID, storeID); err != nil {
		return nil, err
	}
	rows, err := s.Store.ListByStore(ctx, storeID)
	if err != nil {
		return nil, apperr.Internal(apperr.CodeInternalError, "List domains failed")
	}
	return rows, nil
}

// GetDomain returns a domain scoped to store.
func (s *DomainService) GetDomain(ctx context.Context, userID, storeID, domainID string) (domains.Domain, error) {
	if _, err := s.requireStoreAccess(ctx, userID, storeID); err != nil {
		return domains.Domain{}, err
	}
	d, err := s.Store.GetDomainByIDForStore(ctx, domainID, storeID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return domains.Domain{}, domains.ErrDomainNotFound
		}
		return domains.Domain{}, apperr.Internal(apperr.CodeInternalError, "Domain lookup failed")
	}
	return d, nil
}

// CreateDomain claims a hostname and returns a one-time verification token.
func (s *DomainService) CreateDomain(ctx context.Context, userID, storeID string, in CreateDomainInput) (CreateDomainResult, error) {
	st, err := s.requireStoreAccess(ctx, userID, storeID)
	if err != nil {
		return CreateDomainResult{}, err
	}
	norm, display, err := domains.NormalizeHostname(in.Hostname)
	if err != nil {
		return CreateDomainResult{}, err
	}

	// Reject if an active claim exists (including cooldown tombstone).
	if existing, gerr := s.Store.GetClaimByHostname(ctx, norm); gerr == nil {
		// Expired tombstone may be hard-deleted first.
		if existing.Status == domains.StatusTombstoned && existing.CooldownUntil != nil &&
			!existing.CooldownUntil.After(s.now()) {
			_ = s.Store.HardDeleteTombstone(ctx, existing.ID)
		} else {
			return CreateDomainResult{}, domains.ErrHostnameTaken
		}
	} else if !s.Store.IsNotFound(gerr) {
		return CreateDomainResult{}, apperr.Internal(apperr.CodeInternalError, "Hostname claim check failed")
	}

	rawTok, err := generateDomainToken()
	if err != nil {
		return CreateDomainResult{}, apperr.Internal(apperr.CodeInternalError, "Token generation failed")
	}
	now := s.now()
	dnsName := domains.ExpectedTXTName(norm)
	// Store hash only; plaintext token is one-time in the create response.
	// Verify hashes observed TXT values (and requires client-presented token).
	d := domains.Domain{
		ID:                    s.IDs.New(),
		StoreID:               st.ID,
		MerchantID:            st.MerchantID,
		HostnameNormalized:    norm,
		HostnameDisplay:       display,
		Status:                domains.StatusPendingDNS,
		VerificationTokenHash: s.hashToken(rawTok),
		ExpectedDNSName:       dnsName,
		ExpectedDNSValue:      "",
		Version:               1,
		TLSStatus:             domains.TLSNone,
		CreatedAt:             now,
		UpdatedAt:             now,
	}

	err = s.Store.WithTx(ctx, func(txCtx context.Context) error {
		if err := s.Store.InsertDomain(txCtx, d); err != nil {
			if s.Store.IsUniqueViolation(err) {
				return domains.ErrHostnameTaken
			}
			return err
		}
		payload, _ := json.Marshal(map[string]any{
			"domainId": d.ID, "storeId": d.StoreID, "hostname": d.HostnameNormalized, "version": d.Version,
		})
		dk := "domain.created:" + d.ID
		return s.Store.InsertOutbox(txCtx, s.IDs.New(), "domain.created", payload, &dk, now)
	})
	if err != nil {
		if ae, ok := apperr.AsAppError(err); ok {
			return CreateDomainResult{}, ae
		}
		return CreateDomainResult{}, apperr.Internal(apperr.CodeInternalError, "Create domain failed")
	}
	return CreateDomainResult{Domain: d, VerificationToken: rawTok}, nil
}

// VerifyDomain checks DNS TXT proof and provisions edge/TLS on success.
// expectedToken is the one-time token from create (client must present it).
// Stale/wrong token cannot activate even if DNS has an old value.
func (s *DomainService) VerifyDomain(ctx context.Context, userID, storeID, domainID string, expectedToken string, expectedVersion *int32) (domains.Domain, error) {
	if _, err := s.requireStoreAccess(ctx, userID, storeID); err != nil {
		return domains.Domain{}, err
	}
	d, err := s.Store.GetDomainByIDForStore(ctx, domainID, storeID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return domains.Domain{}, domains.ErrDomainNotFound
		}
		return domains.Domain{}, apperr.Internal(apperr.CodeInternalError, "Domain lookup failed")
	}
	if expectedVersion != nil && d.Version != *expectedVersion {
		return domains.Domain{}, domains.ErrDomainConflict
	}
	switch d.Status {
	case domains.StatusPendingDNS, domains.StatusVerifying, domains.StatusFailed, domains.StatusSuspended:
		// ok
	case domains.StatusActive:
		return d, nil // idempotent
	default:
		return domains.Domain{}, domains.ErrNotPending
	}

	// Stale token: client must present the create-time token matching stored hash.
	if strings.TrimSpace(expectedToken) == "" || !auth.EqualHash(d.VerificationTokenHash, s.hashToken(expectedToken)) {
		return domains.Domain{}, domains.ErrStaleToken
	}

	now := s.now()
	// Mark VERIFYING with version bump (stale jobs reject).
	d.Status = domains.StatusVerifying
	d.LastCheckedAt = &now
	d.FailureCode = nil
	d.UpdatedAt = now
	d, err = s.casUpdate(ctx, d.Version, d)
	if err != nil {
		return domains.Domain{}, err
	}

	// DNS proof: exact TXT value must match the presented token (hash already checked).
	if s.DNS == nil {
		return domains.Domain{}, apperr.Internal(apperr.CodeInternalError, "DNS resolver unavailable")
	}
	dnsCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	txts, derr := s.DNS.LookupTXT(dnsCtx, d.ExpectedDNSName)
	if derr != nil {
		return s.failVerify(ctx, d, "DNS_LOOKUP_FAILED", now)
	}
	if !txtContainsExact(txts, expectedToken) {
		return s.failVerify(ctx, d, "DNS_TXT_MISMATCH", now)
	}

	// Edge provision (idempotent by domain version).
	if s.Edge == nil {
		return domains.Domain{}, apperr.Internal(apperr.CodeInternalError, "Edge provisioner unavailable")
	}
	idem := fmt.Sprintf("edge.provision:%s:v%d", d.ID, d.Version)
	pres, perr := s.Edge.ProvisionHost(ctx, ports.EdgeProvisionInput{
		Hostname:       d.HostnameNormalized,
		StoreID:        d.StoreID,
		MerchantID:     d.MerchantID,
		DomainID:       d.ID,
		DomainVersion:  d.Version,
		IdempotencyKey: idem,
	})
	if perr != nil {
		return s.failVerify(ctx, d, "EDGE_PROVISION_FAILED", now)
	}

	actNow := s.now()
	d.Status = domains.StatusActive
	d.TLSStatus = pres.TLSStatus
	if d.TLSStatus == "" {
		d.TLSStatus = domains.TLSActive
	}
	d.VerifiedAt = &actNow
	d.EdgeProvisionedAt = &pres.ProvisionedAt
	next := actNow.Add(domains.RevalidationInterval)
	d.NextCheckAt = &next
	d.LastCheckedAt = &actNow
	d.FailureCode = nil
	d.SuspendedAt = nil
	d.UpdatedAt = actNow
	return s.casUpdate(ctx, d.Version, d)
}

func (s *DomainService) failVerify(ctx context.Context, d domains.Domain, code string, now time.Time) (domains.Domain, error) {
	d.Status = domains.StatusFailed
	d.FailureCode = &code
	d.LastCheckedAt = &now
	d.UpdatedAt = now
	out, err := s.casUpdate(ctx, d.Version, d)
	if err != nil {
		return domains.Domain{}, err
	}
	return out, domains.ErrVerifyFailed
}

// DeleteDomain starts removal: edge teardown first, then tombstone + cooldown.
func (s *DomainService) DeleteDomain(ctx context.Context, userID, storeID, domainID string, expectedVersion *int32) (domains.Domain, error) {
	if _, err := s.requireStoreAccess(ctx, userID, storeID); err != nil {
		return domains.Domain{}, err
	}
	d, err := s.Store.GetDomainByIDForStore(ctx, domainID, storeID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return domains.Domain{}, domains.ErrDomainNotFound
		}
		return domains.Domain{}, apperr.Internal(apperr.CodeInternalError, "Domain lookup failed")
	}
	if expectedVersion != nil && d.Version != *expectedVersion {
		return domains.Domain{}, domains.ErrDomainConflict
	}
	switch d.Status {
	case domains.StatusTombstoned, domains.StatusRemoving:
		// continue idempotent cleanup
	case domains.StatusPendingDNS, domains.StatusVerifying, domains.StatusFailed,
		domains.StatusActive, domains.StatusSuspended:
		// ok
	default:
		return domains.Domain{}, domains.ErrNotRemovable
	}

	now := s.now()
	if d.Status != domains.StatusRemoving && d.Status != domains.StatusTombstoned {
		d.Status = domains.StatusRemoving
		d.RemovingAt = &now
		d.TLSStatus = domains.TLSRemoving
		d.UpdatedAt = now
		d, err = s.casUpdate(ctx, d.Version, d)
		if err != nil {
			return domains.Domain{}, err
		}
	}

	// Remove edge routing before releasing hostname claim.
	if s.Edge != nil && d.TLSStatus != domains.TLSRemoved {
		idem := fmt.Sprintf("edge.remove:%s:v%d", d.ID, d.Version)
		res, rerr := s.Edge.RemoveHost(ctx, ports.EdgeRemoveInput{
			Hostname:       d.HostnameNormalized,
			DomainID:       d.ID,
			DomainVersion:  d.Version,
			IdempotencyKey: idem,
		})
		if rerr != nil {
			// Stay REMOVING; revalidation job will retry.
			next := now.Add(1 * time.Minute)
			d.NextCheckAt = &next
			d.LastCheckedAt = &now
			d.UpdatedAt = now
			code := "EDGE_REMOVE_FAILED"
			d.FailureCode = &code
			return s.casUpdate(ctx, d.Version, d)
		}
		d.TLSStatus = res.TLSStatus
		if d.TLSStatus == "" {
			d.TLSStatus = domains.TLSRemoved
		}
		d.EdgeRemovedAt = &res.RemovedAt
	} else {
		d.TLSStatus = domains.TLSRemoved
		d.EdgeRemovedAt = &now
	}

	// Tombstone with takeover cooldown — still claims hostname globally.
	cool := now.Add(s.cooldown())
	d.Status = domains.StatusTombstoned
	d.TombstonedAt = &now
	d.CooldownUntil = &cool
	d.UpdatedAt = now
	d.FailureCode = nil
	return s.casUpdate(ctx, d.Version, d)
}

// ResolveHost maps a request Host to the authoritative ACTIVE store domain.
func (s *DomainService) ResolveHost(ctx context.Context, hostHeader string) (HostResolveResult, error) {
	norm, err := domains.NormalizeRequestHost(hostHeader)
	if err != nil {
		return HostResolveResult{}, domains.ErrHostUnresolved
	}
	d, err := s.Store.GetActiveByHostname(ctx, norm)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return HostResolveResult{}, domains.ErrHostUnresolved
		}
		return HostResolveResult{}, apperr.Internal(apperr.CodeInternalError, "Host resolve failed")
	}
	if !domains.IsRoutable(d) {
		return HostResolveResult{}, domains.ErrHostUnresolved
	}
	st, err := s.Store.GetStore(ctx, d.StoreID)
	if err != nil {
		return HostResolveResult{}, domains.ErrHostUnresolved
	}
	return HostResolveResult{
		HostnameNormalized: d.HostnameNormalized,
		StoreID:            d.StoreID,
		MerchantID:         d.MerchantID,
		DomainID:           d.ID,
		Slug:               st.Slug,
		StoreName:          st.Name,
	}, nil
}

// IsCustomStorefrontHost reports whether host is a verified custom storefront domain.
// Auth cookies must never be set for custom storefront hosts.
// Platform/local API hosts always allow cookies. Unknown hosts allow cookies
// (seller/admin login on API host); only ACTIVE custom domains block cookies.
func (s *DomainService) IsCustomStorefrontHost(hostHeader string) bool {
	h := strings.TrimSpace(hostHeader)
	if h == "" {
		return false
	}
	// Fast path: strip port without full hostname validation (localhost:8080).
	hostOnly := h
	if strings.HasPrefix(h, "[") {
		if end := strings.LastIndex(h, "]"); end > 0 {
			hostOnly = h[1:end]
		}
	} else if host, _, err := splitHostPortSafe(h); err == nil {
		hostOnly = host
	}
	hostOnly = strings.ToLower(strings.TrimSuffix(hostOnly, "."))
	if s.PlatformHosts != nil {
		if _, ok := s.PlatformHosts[hostOnly]; ok {
			return false
		}
	}
	if hostOnly == "localhost" || strings.HasSuffix(hostOnly, ".localhost") ||
		hostOnly == "127.0.0.1" || hostOnly == "::1" ||
		hostOnly == "fersaku.com" || hostOnly == "fersaku.id" ||
		strings.HasSuffix(hostOnly, ".fersaku.com") || strings.HasSuffix(hostOnly, ".fersaku.id") ||
		strings.HasSuffix(hostOnly, ".fersaku.app") || strings.HasSuffix(hostOnly, ".fersaku.dev") {
		return false
	}
	norm, err := domains.NormalizeRequestHost(hostHeader)
	if err != nil {
		// Malformed non-platform Host: do not set app cookies.
		return true
	}
	if s.Store == nil {
		return false
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if _, err := s.Store.GetActiveByHostname(ctx, norm); err == nil {
		return true
	}
	return false
}

func splitHostPortSafe(hostport string) (host, port string, err error) {
	return net.SplitHostPort(hostport)
}

// RevalidateDue runs periodic revalidation, removal retries, and cooldown release.
// Callable from tests and worker.
func (s *DomainService) RevalidateDue(ctx context.Context, limit int32) (processed int, err error) {
	if limit <= 0 {
		limit = 50
	}
	now := s.now()
	// Release expired tombstones first so hostname can be reclaimed.
	tombs, terr := s.Store.ListExpiredTombstones(ctx, now, limit)
	if terr != nil {
		return 0, terr
	}
	for _, t := range tombs {
		if err := s.Store.HardDeleteTombstone(ctx, t.ID); err == nil {
			processed++
		}
	}

	rows, err := s.Store.ListDueForRevalidation(ctx, now, limit)
	if err != nil {
		return processed, err
	}
	for _, d := range rows {
		if err := s.revalidateOne(ctx, d, now); err != nil && s.Log != nil {
			s.Log.Warn("domain revalidate", "domain_id", d.ID, "err", err.Error())
		} else {
			processed++
		}
	}
	return processed, nil
}

func (s *DomainService) revalidateOne(ctx context.Context, d domains.Domain, now time.Time) error {
	switch d.Status {
	case domains.StatusRemoving:
		return s.finishRemoval(ctx, d, now)
	case domains.StatusActive, domains.StatusSuspended, domains.StatusVerifying:
		return s.recheckDNS(ctx, d, now)
	default:
		return nil
	}
}

func (s *DomainService) finishRemoval(ctx context.Context, d domains.Domain, now time.Time) error {
	// Reload for fresh version.
	cur, err := s.Store.GetDomainByID(ctx, d.ID)
	if err != nil {
		return err
	}
	if cur.Status == domains.StatusTombstoned {
		return nil
	}
	if s.Edge != nil {
		idem := fmt.Sprintf("edge.remove:%s:v%d", cur.ID, cur.Version)
		res, rerr := s.Edge.RemoveHost(ctx, ports.EdgeRemoveInput{
			Hostname:       cur.HostnameNormalized,
			DomainID:       cur.ID,
			DomainVersion:  cur.Version,
			IdempotencyKey: idem,
		})
		if rerr != nil {
			next := now.Add(2 * time.Minute)
			cur.NextCheckAt = &next
			cur.LastCheckedAt = &now
			cur.UpdatedAt = now
			_, _ = s.casUpdate(ctx, cur.Version, cur)
			return rerr
		}
		cur.TLSStatus = res.TLSStatus
		if cur.TLSStatus == "" {
			cur.TLSStatus = domains.TLSRemoved
		}
		cur.EdgeRemovedAt = &res.RemovedAt
	} else {
		cur.TLSStatus = domains.TLSRemoved
		cur.EdgeRemovedAt = &now
	}
	cool := now.Add(s.cooldown())
	cur.Status = domains.StatusTombstoned
	cur.TombstonedAt = &now
	cur.CooldownUntil = &cool
	cur.UpdatedAt = now
	_, err = s.casUpdate(ctx, cur.Version, cur)
	return err
}

func (s *DomainService) recheckDNS(ctx context.Context, d domains.Domain, now time.Time) error {
	cur, err := s.Store.GetDomainByID(ctx, d.ID)
	if err != nil {
		return err
	}
	if cur.Status != domains.StatusActive && cur.Status != domains.StatusSuspended {
		return nil
	}
	// We only have the hash; revalidation requires DNS TXT that hashes to stored hash.
	if s.DNS == nil {
		return fmt.Errorf("dns unavailable")
	}
	dnsCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	txts, derr := s.DNS.LookupTXT(dnsCtx, cur.ExpectedDNSName)
	ok := false
	if derr == nil {
		for _, t := range txts {
			if auth.EqualHash(cur.VerificationTokenHash, s.hashToken(strings.TrimSpace(t))) {
				ok = true
				break
			}
		}
	}
	next := now.Add(domains.RevalidationInterval)
	cur.LastCheckedAt = &now
	cur.NextCheckAt = &next
	cur.UpdatedAt = now
	if ok {
		if cur.Status == domains.StatusSuspended {
			// Recover: re-provision edge if needed.
			if s.Edge != nil {
				idem := fmt.Sprintf("edge.provision:%s:v%d", cur.ID, cur.Version)
				pres, perr := s.Edge.ProvisionHost(ctx, ports.EdgeProvisionInput{
					Hostname:       cur.HostnameNormalized,
					StoreID:        cur.StoreID,
					MerchantID:     cur.MerchantID,
					DomainID:       cur.ID,
					DomainVersion:  cur.Version,
					IdempotencyKey: idem,
				})
				if perr == nil {
					cur.TLSStatus = pres.TLSStatus
					if cur.TLSStatus == "" {
						cur.TLSStatus = domains.TLSActive
					}
					cur.EdgeProvisionedAt = &pres.ProvisionedAt
				}
			}
			cur.Status = domains.StatusActive
			cur.SuspendedAt = nil
			cur.FailureCode = nil
		}
		_, err = s.casUpdate(ctx, cur.Version, cur)
		return err
	}
	// Failed revalidation: grace then suspend.
	graceDeadline := now.Add(-domains.RevalidationGrace)
	if cur.VerifiedAt != nil && cur.VerifiedAt.After(graceDeadline) && cur.Status == domains.StatusActive {
		// Still in grace — keep ACTIVE but schedule sooner.
		soon := now.Add(1 * time.Hour)
		cur.NextCheckAt = &soon
		code := "DNS_RECHECK_FAILED"
		cur.FailureCode = &code
		_, err = s.casUpdate(ctx, cur.Version, cur)
		return err
	}
	// Suspend routing.
	if cur.Status == domains.StatusActive && s.Edge != nil {
		idem := fmt.Sprintf("edge.suspend:%s:v%d", cur.ID, cur.Version)
		_, _ = s.Edge.RemoveHost(ctx, ports.EdgeRemoveInput{
			Hostname:       cur.HostnameNormalized,
			DomainID:       cur.ID,
			DomainVersion:  cur.Version,
			IdempotencyKey: idem,
		})
		cur.TLSStatus = domains.TLSRemoved
	}
	cur.Status = domains.StatusSuspended
	cur.SuspendedAt = &now
	code := "DNS_REVALIDATION_FAILED"
	cur.FailureCode = &code
	_, err = s.casUpdate(ctx, cur.Version, cur)
	return err
}

func (s *DomainService) casUpdate(ctx context.Context, expectedVersion int32, d domains.Domain) (domains.Domain, error) {
	out, err := s.Store.UpdateCAS(ctx, expectedVersion, d)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return domains.Domain{}, domains.ErrDomainConflict
		}
		return domains.Domain{}, apperr.Internal(apperr.CodeInternalError, "Domain update failed")
	}
	return out, nil
}

func generateDomainToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return "fdv_" + base64.RawURLEncoding.EncodeToString(b), nil
}

func txtContainsExact(txts []string, want string) bool {
	want = strings.TrimSpace(want)
	if want == "" {
		return false
	}
	// Cap answers
	n := len(txts)
	if n > 16 {
		n = 16
	}
	for i := 0; i < n; i++ {
		// TXT may be split; join is already done by adapter; compare trimmed.
		if strings.TrimSpace(txts[i]) == want {
			return true
		}
	}
	return false
}
