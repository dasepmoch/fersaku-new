package audit

import (
	"bytes"
	"encoding/json"
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

// CanonicalizeJSON produces RFC 8785 JSON Canonicalization Scheme (JCS) UTF-8 bytes.
// Field set and null-vs-absent policy: omitempty empty strings/maps are dropped
// by json.Marshal of LogicalEvent before re-canonicalization; maps are sorted.
func CanonicalizeJSON(v any) ([]byte, error) {
	// First pass: standard marshal to get a JSON tree without Go type noise.
	raw, err := json.Marshal(v)
	if err != nil {
		return nil, fmt.Errorf("audit jcs marshal: %w", err)
	}
	var tree any
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.UseNumber()
	if err := dec.Decode(&tree); err != nil {
		return nil, fmt.Errorf("audit jcs decode: %w", err)
	}
	var buf bytes.Buffer
	if err := writeJCS(&buf, tree); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// CanonicalizeLogicalEvent freezes a LogicalEvent with UTC RFC3339Nano times.
func CanonicalizeLogicalEvent(e LogicalEvent) ([]byte, error) {
	e.OccurredAt = e.OccurredAt.UTC()
	// Build a map with stable keys and omit empty optional strings.
	m := map[string]any{
		"eventId":     e.EventID,
		"action":      e.Action,
		"resourceType": e.ResourceType,
		"resourceId":  e.ResourceID,
		"occurredAt":  e.OccurredAt.Format(time.RFC3339Nano),
	}
	if e.ActorUserID != "" {
		m["actorUserId"] = e.ActorUserID
	}
	if e.ActingSessionID != "" {
		m["actingSessionId"] = e.ActingSessionID
	}
	if e.ImpersonationSession != "" {
		m["impersonationSessionId"] = e.ImpersonationSession
	}
	if e.MerchantID != "" {
		m["merchantId"] = e.MerchantID
	}
	if e.StoreID != "" {
		m["storeId"] = e.StoreID
	}
	if e.RequestID != "" {
		m["requestId"] = e.RequestID
	}
	if e.Reason != "" {
		m["reason"] = e.Reason
	}
	if e.Result != "" {
		m["result"] = e.Result
	}
	if e.PaymentMode != "" {
		m["paymentMode"] = e.PaymentMode
	}
	if e.IPHash != "" {
		m["ipHash"] = e.IPHash
	}
	if e.UAHash != "" {
		m["uaHash"] = e.UAHash
	}
	if len(e.Before) > 0 {
		m["before"] = e.Before
	}
	if len(e.After) > 0 {
		m["after"] = e.After
	}
	if len(e.Metadata) > 0 {
		m["metadata"] = e.Metadata
	}
	return CanonicalizeJSON(m)
}

func writeJCS(buf *bytes.Buffer, v any) error {
	switch t := v.(type) {
	case nil:
		buf.WriteString("null")
		return nil
	case bool:
		if t {
			buf.WriteString("true")
		} else {
			buf.WriteString("false")
		}
		return nil
	case json.Number:
		s := t.String()
		// JCS requires number formatting without leading zeros / + etc; keep as decoded.
		if strings.ContainsAny(s, "eE") {
			f, err := t.Float64()
			if err != nil {
				return err
			}
			return writeJCSNumber(buf, f)
		}
		buf.WriteString(s)
		return nil
	case float64:
		return writeJCSNumber(buf, t)
	case float32:
		return writeJCSNumber(buf, float64(t))
	case int:
		buf.WriteString(strconv.FormatInt(int64(t), 10))
		return nil
	case int64:
		buf.WriteString(strconv.FormatInt(t, 10))
		return nil
	case int32:
		buf.WriteString(strconv.FormatInt(int64(t), 10))
		return nil
	case string:
		return writeJCSString(buf, t)
	case []any:
		buf.WriteByte('[')
		for i, el := range t {
			if i > 0 {
				buf.WriteByte(',')
			}
			if err := writeJCS(buf, el); err != nil {
				return err
			}
		}
		buf.WriteByte(']')
		return nil
	case map[string]any:
		keys := make([]string, 0, len(t))
		for k := range t {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		buf.WriteByte('{')
		for i, k := range keys {
			if i > 0 {
				buf.WriteByte(',')
			}
			if err := writeJCSString(buf, k); err != nil {
				return err
			}
			buf.WriteByte(':')
			if err := writeJCS(buf, t[k]); err != nil {
				return err
			}
		}
		buf.WriteByte('}')
		return nil
	default:
		// Fallback via re-marshal for unexpected types.
		raw, err := json.Marshal(t)
		if err != nil {
			return err
		}
		var tree any
		dec := json.NewDecoder(bytes.NewReader(raw))
		dec.UseNumber()
		if err := dec.Decode(&tree); err != nil {
			return err
		}
		return writeJCS(buf, tree)
	}
}

func writeJCSNumber(buf *bytes.Buffer, f float64) error {
	if math.IsNaN(f) || math.IsInf(f, 0) {
		return fmt.Errorf("audit jcs: non-finite number")
	}
	// Integers without fraction when representable exactly.
	if f == math.Trunc(f) && f >= float64(math.MinInt64) && f <= float64(math.MaxInt64) {
		buf.WriteString(strconv.FormatInt(int64(f), 10))
		return nil
	}
	// ECMAScript NumberToString-compatible via strconv 'g' with 17 digits.
	s := strconv.FormatFloat(f, 'g', -1, 64)
	buf.WriteString(s)
	return nil
}

func writeJCSString(buf *bytes.Buffer, s string) error {
	buf.WriteByte('"')
	for i := 0; i < len(s); {
		r, size := utf8.DecodeRuneInString(s[i:])
		i += size
		switch r {
		case '"', '\\':
			buf.WriteByte('\\')
			buf.WriteRune(r)
		case '\b':
			buf.WriteString(`\b`)
		case '\f':
			buf.WriteString(`\f`)
		case '\n':
			buf.WriteString(`\n`)
		case '\r':
			buf.WriteString(`\r`)
		case '\t':
			buf.WriteString(`\t`)
		default:
			if r < 0x20 {
				fmt.Fprintf(buf, `\u%04x`, r)
			} else {
				buf.WriteRune(r)
			}
		}
	}
	buf.WriteByte('"')
	return nil
}
