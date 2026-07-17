package reviews

import (
	"strings"
	"unicode/utf8"
)

// ValidateCreate checks rating and content bounds for create.
func ValidateCreate(rating int32, title, body string) (string, string, error) {
	if rating < MinRating || rating > MaxRating {
		return "", "", ErrInvalidRating
	}
	t := strings.TrimSpace(title)
	b := strings.TrimSpace(body)
	if utf8.RuneCountInString(t) > MaxTitleRunes {
		return "", "", ErrInvalidContent
	}
	if utf8.RuneCountInString(b) > MaxBodyRunes {
		return "", "", ErrInvalidContent
	}
	if b == "" && t == "" {
		return "", "", ErrInvalidContent
	}
	return t, b, nil
}

// ValidatePatch validates optional fields for edit.
func ValidatePatch(rating *int32, title, body *string) (t string, b string, hasTitle, hasBody bool, err error) {
	if rating != nil && (*rating < MinRating || *rating > MaxRating) {
		return "", "", false, false, ErrInvalidRating
	}
	if title != nil {
		t = strings.TrimSpace(*title)
		if utf8.RuneCountInString(t) > MaxTitleRunes {
			return "", "", false, false, ErrInvalidContent
		}
		hasTitle = true
	}
	if body != nil {
		b = strings.TrimSpace(*body)
		if utf8.RuneCountInString(b) > MaxBodyRunes {
			return "", "", false, false, ErrInvalidContent
		}
		hasBody = true
	}
	return t, b, hasTitle, hasBody, nil
}
