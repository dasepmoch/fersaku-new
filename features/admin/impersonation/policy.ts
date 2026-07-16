import type { ImpersonationScope, ImpersonationSession } from "./session";

export const IMPERSONATION_COMMANDS = {
  profileSupportUpdate: "buyer.profile.support_update",
  storePresentationSupportUpdate: "store.presentation.support_update",
} as const;

export type ImpersonationCommand =
  (typeof IMPERSONATION_COMMANDS)[keyof typeof IMPERSONATION_COMMANDS];

const supportWriteFields: Readonly<Record<ImpersonationCommand, Set<string>>> =
  {
    [IMPERSONATION_COMMANDS.profileSupportUpdate]: new Set([
      "displayName",
      "locale",
      "timezone",
    ]),
    [IMPERSONATION_COMMANDS.storePresentationSupportUpdate]: new Set([
      "name",
      "description",
    ]),
  };

/**
 * Frontend mirror of the impersonation command allowlist.
 *
 * Production must enforce the same policy server-side. Unknown commands are
 * intentionally denied so adding a new seller mutation cannot silently widen
 * an administrator session.
 */
export function canRunImpersonationCommand(
  session: Pick<ImpersonationSession, "scope"> | null,
  command: string,
  fields: readonly string[] = [],
) {
  if (!session) return true;
  if (session.scope === "read-only") return false;
  const allowedFields = supportWriteFields[command as ImpersonationCommand];
  return Boolean(
    allowedFields &&
    fields.length > 0 &&
    fields.every((field) => allowedFields.has(field)),
  );
}

export function impersonationBlockedMessage(scope: ImpersonationScope) {
  return scope === "read-only"
    ? "Aksi diblokir: sesi impersonation ini hanya-baca."
    : "Aksi diblokir: di luar allowlist support-write.";
}
