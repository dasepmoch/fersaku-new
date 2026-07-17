package audit

import (
	"crypto/sha256"
	"encoding/binary"
)

// GenesisPrevHash is 32 zero bytes (chain genesis).
func GenesisPrevHash() []byte {
	return make([]byte, 32)
}

// ComputeRowHash implements the BE-530 pgcrypto-compatible row_hash formula:
//
//	row_hash = SHA-256(
//	  UTF8("fersaku.audit.v1") || 0x00 ||
//	  int8send(sequence_no) || prev_hash ||
//	  int4send(length(version_bytes)) || version_bytes ||
//	  int8send(length(canonical_payload)) || canonical_payload
//	)
//
// Integer lengths are network byte order (big-endian).
func ComputeRowHash(sequenceNo int64, prevHash []byte, canonicalVersion string, canonicalPayload []byte) []byte {
	ver := []byte(canonicalVersion)
	domain := []byte(DomainPrefix)

	// Precompute size: domain + 0x00 + 8 + 32 + 4 + len(ver) + 8 + len(payload)
	size := len(domain) + 1 + 8 + 32 + 4 + len(ver) + 8 + len(canonicalPayload)
	buf := make([]byte, 0, size)
	buf = append(buf, domain...)
	buf = append(buf, 0x00)

	var i8 [8]byte
	binary.BigEndian.PutUint64(i8[:], uint64(sequenceNo))
	buf = append(buf, i8[:]...)

	if len(prevHash) != 32 {
		// Pad/truncate to 32 for defensive hashing; callers must pass 32 bytes.
		ph := make([]byte, 32)
		copy(ph, prevHash)
		buf = append(buf, ph...)
	} else {
		buf = append(buf, prevHash...)
	}

	var i4 [4]byte
	binary.BigEndian.PutUint32(i4[:], uint32(len(ver)))
	buf = append(buf, i4[:]...)
	buf = append(buf, ver...)

	binary.BigEndian.PutUint64(i8[:], uint64(len(canonicalPayload)))
	buf = append(buf, i8[:]...)
	buf = append(buf, canonicalPayload...)

	sum := sha256.Sum256(buf)
	return sum[:]
}

// CheckpointSignPayload is the bytes signed by Ed25519 for checkpoints:
// chain_scope || 0x00 || sequence_no (int8 BE) || head_hash || version || signed_at RFC3339Nano.
func CheckpointSignPayload(chainScope string, sequenceNo int64, headHash []byte, canonicalVersion string, signedAtRFC3339Nano string) []byte {
	var i8 [8]byte
	binary.BigEndian.PutUint64(i8[:], uint64(sequenceNo))
	out := make([]byte, 0, len(chainScope)+1+8+32+len(canonicalVersion)+1+len(signedAtRFC3339Nano))
	out = append(out, []byte(chainScope)...)
	out = append(out, 0x00)
	out = append(out, i8[:]...)
	if len(headHash) != 32 {
		ph := make([]byte, 32)
		copy(ph, headHash)
		out = append(out, ph...)
	} else {
		out = append(out, headHash...)
	}
	out = append(out, 0x00)
	out = append(out, []byte(canonicalVersion)...)
	out = append(out, 0x00)
	out = append(out, []byte(signedAtRFC3339Nano)...)
	return out
}
