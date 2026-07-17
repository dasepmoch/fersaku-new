package observability

import (
	"crypto/rand"
	"sync"
	"time"
)

// ULIDGenerator produces 26-char Crockford-base32 ULIDs (time-sortable).
// Choice documented in ports.IDGenerator: ULID over UUID v4 for natural sort.
type ULIDGenerator struct {
	mu      sync.Mutex
	lastMS  uint64
	entropy [10]byte
}

// NewULIDGenerator returns a concurrency-safe ULID generator.
func NewULIDGenerator() *ULIDGenerator {
	return &ULIDGenerator{}
}

// New returns a new ULID string.
func (g *ULIDGenerator) New() string {
	g.mu.Lock()
	defer g.mu.Unlock()

	ms := uint64(time.Now().UTC().UnixMilli())
	if ms == g.lastMS {
		// increment entropy as big-endian
		for i := 9; i >= 0; i-- {
			g.entropy[i]++
			if g.entropy[i] != 0 {
				break
			}
		}
	} else {
		g.lastMS = ms
		_, _ = rand.Read(g.entropy[:])
	}

	// ULID layout: 48-bit timestamp (ms) + 80-bit entropy
	var raw [16]byte
	raw[0] = byte(ms >> 40)
	raw[1] = byte(ms >> 32)
	raw[2] = byte(ms >> 24)
	raw[3] = byte(ms >> 16)
	raw[4] = byte(ms >> 8)
	raw[5] = byte(ms)
	copy(raw[6:], g.entropy[:])

	return encodeCrockford(raw[:])
}

const crockford = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

func encodeCrockford(src []byte) string {
	// 128 bits -> 26 chars of 5 bits
	var out [26]byte
	// process as big-endian bit stream
	var acc uint64
	var bits int
	idx := 25
	for i := len(src) - 1; i >= 0; i-- {
		acc |= uint64(src[i]) << bits
		bits += 8
		for bits >= 5 {
			out[idx] = crockford[acc&0x1f]
			idx--
			acc >>= 5
			bits -= 5
		}
	}
	if bits > 0 {
		out[idx] = crockford[acc&0x1f]
	}
	return string(out[:])
}
