// Package security holds crypto helpers (Argon2id, TOTP, token hashing) used by adapters.
// Domain must not depend on concrete crypto packages; call through ports/application.
package security
