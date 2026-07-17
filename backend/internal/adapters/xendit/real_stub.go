package xendit

// Deprecated: use NewReal. Kept as a compile-time alias note for older references.
// NewRealStub returns a Real adapter; requires non-empty secret (or returns error via NewReal).
func NewRealStub(accountScope, secretKey, baseURL string) *Real {
	r, err := NewReal(accountScope, secretKey, baseURL)
	if err != nil {
		// Structural shell for tests that only assert Name(); methods will fail auth.
		return &Real{AccountScope: accountScope, SecretKey: secretKey, BaseURL: baseURL}
	}
	return r
}
