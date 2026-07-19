/**
 * GAP-09 — public legal surface honesty (not legal advice).
 * Final copy requires owner/legal approval evidence; see TASK/GAP/evidence/09-P1-LEGAL-PUBLIC-SURFACE.
 */

export const LEGAL_DOC_VERSION = "2026-07-20-ops";
export const LEGAL_EFFECTIVE_DATE = "20 Juli 2026";

/** Support channels already used on public surfaces (no invented addresses). */
export const LEGAL_CONTACTS = {
  privacy: "privacy@fersaku.id",
  support: "support@fersaku.id",
  general: "halo@fersaku.id",
  partners: "partners@fersaku.id",
  security: "security@fersaku.id",
} as const;

/**
 * Phrases that must not appear on live legal/public marketing pages.
 * Input placeholders (HTML attribute) are excluded by scoped file checks.
 */
export const LEGAL_BANNED_PHRASES = [
  "placeholder yang harus ditinjau",
  "placeholder ini bukan nasihat",
  "harus ditinjau penasihat hukum sebelum peluncuran",
  "harus direview sebelum produksi",
  "review before launch",
  "bukan nasihat hukum",
  "implementasi production harus menyediakan consent",
] as const;

/** Cookie / storage inventory derived from current product code (essential + first-party only). */
export const COOKIE_STORAGE_INVENTORY = [
  {
    id: "fersaku_session",
    kind: "cookie" as const,
    category: "essential" as const,
    purpose:
      "Sesi autentikasi browser (HttpOnly). Diperlukan untuk login seller, buyer, dan admin.",
  },
  {
    id: "fersaku-theme",
    kind: "localStorage" as const,
    category: "essential" as const,
    purpose: "Preferensi tampilan terang/gelap di perangkat pengguna.",
  },
  {
    id: "csrf_memory",
    kind: "memory" as const,
    category: "essential" as const,
    purpose:
      "Token CSRF di memori proses browser saja (bukan cookie/storage) untuk mutasi cookie-auth.",
  },
  {
    id: "observability_sink",
    kind: "network" as const,
    category: "operational" as const,
    purpose:
      "Pelaporan error/metrik first-party ke /api/observability/events saat mode sink aktif. Bukan cookie marketing pihak ketiga.",
  },
] as const;

/** True when product ships no third-party marketing/analytics cookies. */
export const HAS_THIRD_PARTY_MARKETING_COOKIES = false;
