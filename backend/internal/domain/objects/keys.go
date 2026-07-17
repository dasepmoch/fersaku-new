package objects

import (
	"fmt"
	"strings"
	"unicode"
)

// BuildObjectKey produces a server-only create-only key. Client never supplies authority.
// Paths follow §10.1 prefix policy without assuming R2 object versioning.
func BuildObjectKey(purpose Purpose, merchantID, storeID, objectID string) (string, error) {
	if err := validateIDSegment(objectID, "objectId"); err != nil {
		return "", err
	}
	if err := validateIDSegment(storeID, "storeId"); err != nil {
		return "", err
	}
	switch purpose {
	case PurposePublicAsset:
		return fmt.Sprintf("public-assets/%s/%s", storeID, objectID), nil
	case PurposeProductFile:
		if err := validateIDSegment(merchantID, "merchantId"); err != nil {
			return "", err
		}
		return fmt.Sprintf("private-products/%s/%s/%s", merchantID, storeID, objectID), nil
	case PurposeProfileAsset:
		// store-scoped profile/storefront assets under private prefix
		if err := validateIDSegment(merchantID, "merchantId"); err != nil {
			return "", err
		}
		return fmt.Sprintf("private-profile-assets/%s/%s/%s", merchantID, storeID, objectID), nil
	case PurposeInvoiceInput:
		if err := validateIDSegment(merchantID, "merchantId"); err != nil {
			return "", err
		}
		return fmt.Sprintf("private-invoices/%s/%s/%s", merchantID, storeID, objectID), nil
	default:
		return "", fmt.Errorf("unsupported purpose %q", purpose)
	}
}

// VisibilityForPurpose maps purpose to bucket class.
func VisibilityForPurpose(p Purpose) Visibility {
	if p == PurposePublicAsset {
		return VisibilityPublic
	}
	return VisibilityPrivate
}

// RetentionForPurpose returns default retention class (not Bucket Lock by itself).
func RetentionForPurpose(p Purpose) RetentionClass {
	switch p {
	case PurposeProductFile:
		return RetentionProduct
	default:
		return RetentionStandard
	}
}

// MaxBytesForPurpose returns per-file size cap.
func MaxBytesForPurpose(p Purpose) int64 {
	switch p {
	case PurposePublicAsset:
		return MaxUploadBytesPublic
	case PurposeProfileAsset:
		return MaxUploadBytesProfile
	case PurposeInvoiceInput:
		return MaxUploadBytesInvoice
	default:
		return MaxUploadBytesProduct
	}
}

func validateIDSegment(s, name string) error {
	s = strings.TrimSpace(s)
	if s == "" {
		return fmt.Errorf("%s is required", name)
	}
	if len(s) > 64 {
		return fmt.Errorf("%s too long", name)
	}
	if strings.Contains(s, "..") || strings.Contains(s, "/") || strings.Contains(s, "\\") {
		return fmt.Errorf("%s contains forbidden path characters", name)
	}
	for _, r := range s {
		if r < 0x20 || r == 0x7f || unicode.IsControl(r) {
			return fmt.Errorf("%s contains control characters", name)
		}
	}
	return nil
}

// NormalizeContentType lowercases media type without parameters authority from client alone.
func NormalizeContentType(ct string) string {
	ct = strings.TrimSpace(strings.ToLower(ct))
	if i := strings.IndexByte(ct, ';'); i >= 0 {
		ct = strings.TrimSpace(ct[:i])
	}
	return ct
}

// AllowedContentType reports whether MIME is accepted for purpose (browser MIME not final authority).
func AllowedContentType(purpose Purpose, ct string) bool {
	ct = NormalizeContentType(ct)
	if ct == "" {
		return false
	}
	switch purpose {
	case PurposePublicAsset, PurposeProfileAsset:
		switch ct {
		case "image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml":
			return true
		default:
			return false
		}
	case PurposeProductFile:
		// Digital product payloads: broad but reject executable/html.
		switch ct {
		case "application/x-msdownload", "application/x-executable", "text/html", "application/xhtml+xml":
			return false
		default:
			return len(ct) <= 128
		}
	case PurposeInvoiceInput:
		switch ct {
		case "application/pdf", "image/png", "image/jpeg":
			return true
		default:
			return false
		}
	default:
		return false
	}
}
