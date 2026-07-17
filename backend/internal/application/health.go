package application

// HealthService is a minimal application shell for readiness orchestration.
// Later tasks will inject DB/Redis/provider ports here.
type HealthService struct {
	// checks are named readiness probes; empty means ready.
	checks []func() error
}

// NewHealthService constructs a HealthService.
func NewHealthService(checks ...func() error) *HealthService {
	return &HealthService{checks: checks}
}

// Ready returns true when all checks pass.
func (s *HealthService) Ready() bool {
	if s == nil {
		return true
	}
	for _, c := range s.checks {
		if c == nil {
			continue
		}
		if err := c(); err != nil {
			return false
		}
	}
	return true
}
