package inventory

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
)

var fieldKeyRe = regexp.MustCompile(`^[a-z][a-z0-9_]{0,63}$`)

const (
	maxFields       = 32
	maxFieldLabel   = 120
	maxFieldValue   = 2048
	maxImportBatch  = 500
	maxDelimiterLen = 8
)

// NormalizeFieldKey lowercases and trims a field key.
func NormalizeFieldKey(k string) string {
	return strings.ToLower(strings.TrimSpace(k))
}

// ValidateSchemaFields validates ordered field definitions for a new schema version.
func ValidateSchemaFields(fields []FieldDef, delimiter string) error {
	if len(fields) == 0 {
		return fmt.Errorf("%w: at least one field is required", ErrSchemaInvalid)
	}
	if len(fields) > maxFields {
		return fmt.Errorf("%w: too many fields", ErrSchemaInvalid)
	}
	delim := delimiter
	if delim == "" {
		delim = ","
	}
	if len(delim) > maxDelimiterLen {
		return fmt.Errorf("%w: delimiter too long", ErrSchemaInvalid)
	}
	seen := make(map[string]struct{}, len(fields))
	hasSecret := false
	for i, f := range fields {
		key := NormalizeFieldKey(f.Key)
		if !fieldKeyRe.MatchString(key) {
			return fmt.Errorf("%w: invalid field key at index %d", ErrSchemaInvalid, i)
		}
		if _, ok := seen[key]; ok {
			return fmt.Errorf("%w: duplicate field key %q", ErrSchemaInvalid, key)
		}
		seen[key] = struct{}{}
		label := strings.TrimSpace(f.Label)
		if label == "" || len(label) > maxFieldLabel {
			return fmt.Errorf("%w: invalid label for field %q", ErrSchemaInvalid, key)
		}
		if f.Secret {
			hasSecret = true
		}
		fields[i].Key = key
		fields[i].Label = label
	}
	if !hasSecret {
		return fmt.Errorf("%w: at least one secret field is required", ErrSchemaInvalid)
	}
	return nil
}

// SchemaChecksum is a stable hash of fields + delimiter for immutability checks.
func SchemaChecksum(fields []FieldDef, delimiter string) (string, error) {
	type wire struct {
		Fields    []FieldDef `json:"fields"`
		Delimiter string     `json:"delimiter"`
	}
	// Normalize keys for checksum.
	norm := make([]FieldDef, len(fields))
	for i, f := range fields {
		norm[i] = FieldDef{
			Key:           NormalizeFieldKey(f.Key),
			Label:         strings.TrimSpace(f.Label),
			Secret:        f.Secret,
			Required:      f.Required,
			BuyerCopyable: f.BuyerCopyable,
			Unique:        f.Unique,
		}
	}
	if delimiter == "" {
		delimiter = ","
	}
	b, err := json.Marshal(wire{Fields: norm, Delimiter: delimiter})
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:]), nil
}

// ValidateImportRow checks one row of field values against schema.
// Returns normalized map, unique-key hash (if any unique fields), and error.
func ValidateImportRow(schema Schema, values map[string]string) (normalized map[string]string, uniqueHash *string, err error) {
	if values == nil {
		values = map[string]string{}
	}
	normalized = make(map[string]string, len(schema.Fields))
	known := make(map[string]struct{}, len(schema.Fields))
	var uniqueParts []string
	for _, f := range schema.Fields {
		known[f.Key] = struct{}{}
		raw, ok := values[f.Key]
		if !ok {
			// also accept original casing variants
			for k, v := range values {
				if NormalizeFieldKey(k) == f.Key {
					raw = v
					ok = true
					break
				}
			}
		}
		v := strings.TrimSpace(raw)
		if f.Required && (!ok || v == "") {
			return nil, nil, fmt.Errorf("%w: missing required field %q", ErrImportInvalid, f.Key)
		}
		if len(v) > maxFieldValue {
			return nil, nil, fmt.Errorf("%w: field %q too long", ErrImportInvalid, f.Key)
		}
		normalized[f.Key] = v
		if f.Unique && v != "" {
			uniqueParts = append(uniqueParts, f.Key+"="+v)
		}
	}
	// Reject unknown keys (after normalize).
	for k := range values {
		nk := NormalizeFieldKey(k)
		if _, ok := known[nk]; !ok {
			return nil, nil, fmt.Errorf("%w: unknown field %q", ErrImportInvalid, k)
		}
	}
	if len(uniqueParts) > 0 {
		h := sha256.Sum256([]byte(strings.Join(uniqueParts, "|")))
		s := hex.EncodeToString(h[:])
		uniqueHash = &s
	}
	return normalized, uniqueHash, nil
}

// MaskValues builds list-safe preview: secrets → "***", non-secrets truncated.
func MaskValues(schema Schema, values map[string]string) map[string]string {
	out := make(map[string]string, len(schema.Fields))
	for _, f := range schema.Fields {
		v := values[f.Key]
		if f.Secret {
			if v == "" {
				out[f.Key] = ""
			} else {
				out[f.Key] = "***"
			}
			continue
		}
		if len(v) > 64 {
			out[f.Key] = v[:61] + "..."
		} else {
			out[f.Key] = v
		}
	}
	return out
}

// MaxImportBatch is the hard limit for one import request.
func MaxImportBatch() int { return maxImportBatch }
