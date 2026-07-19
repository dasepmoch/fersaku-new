/**
 * QLT-215 Mailpit token extraction — test environment only.
 * Reads Mailpit HTTP API; never talks to production mail providers.
 */

import { assertNonProductionHarness, mailpitUrl } from "./env";

export type MailpitMessageSummary = {
  ID: string;
  From?: { Address?: string; Name?: string };
  To?: Array<{ Address?: string; Name?: string }>;
  Subject?: string;
  Created?: string;
  Snippet?: string;
};

export type MailpitMessage = MailpitMessageSummary & {
  Text?: string;
  HTML?: string;
};

function base(): string {
  assertNonProductionHarness();
  return mailpitUrl().replace(/\/+$/, "");
}

async function mpFetch(path: string, init?: RequestInit): Promise<Response> {
  assertNonProductionHarness();
  const res = await fetch(`${base()}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.headers || {}),
    },
  });
  return res;
}

export async function mailpitHealth(): Promise<boolean> {
  assertNonProductionHarness();
  try {
    const res = await mpFetch("/api/v1/info");
    if (res.ok) return true;
    const fallback = await fetch(`${base()}/`);
    return fallback.ok;
  } catch {
    return false;
  }
}

export async function listMessages(
  limit = 50,
): Promise<MailpitMessageSummary[]> {
  assertNonProductionHarness();
  const res = await mpFetch(`/api/v1/messages?limit=${limit}`);
  if (!res.ok) {
    throw new Error(`mailpit list failed: ${res.status}`);
  }
  const body = (await res.json()) as {
    messages?: MailpitMessageSummary[];
  };
  return body.messages ?? [];
}

export async function getMessage(id: string): Promise<MailpitMessage> {
  assertNonProductionHarness();
  const res = await mpFetch(`/api/v1/message/${id}`);
  if (!res.ok) {
    throw new Error(`mailpit get ${id} failed: ${res.status}`);
  }
  return (await res.json()) as MailpitMessage;
}

export async function deleteAllMessages(): Promise<void> {
  assertNonProductionHarness();
  await mpFetch("/api/v1/messages", { method: "DELETE" });
}

/**
 * Extract first auth/magic/verify token-like fragment from mail body.
 * Prefer URL query/fragment tokens; never log full raw token in callers.
 */
export function extractTokenFromBody(body: string): string | undefined {
  assertNonProductionHarness();
  if (!body) return undefined;

  const patterns = [
    /[?&#]token=([A-Za-z0-9._~\-]{16,})/,
    /[?&#]t=([A-Za-z0-9._~\-]{16,})/,
    /\/verify\/([A-Za-z0-9._~\-]{16,})/,
    /\/magic\/([A-Za-z0-9._~\-]{16,})/,
    /consume[^A-Za-z0-9]*([A-Za-z0-9._~\-]{24,})/i,
  ];

  for (const re of patterns) {
    const m = body.match(re);
    if (m?.[1]) return m[1];
  }
  return undefined;
}

export function maskToken(token: string | undefined): string {
  if (!token) return "(none)";
  if (token.length <= 8) return "***";
  return `${token.slice(0, 4)}…${token.slice(-4)} (len=${token.length})`;
}

export type WaitForMailOptions = {
  toContains?: string;
  subjectContains?: string;
  timeoutMs?: number;
  pollMs?: number;
};

/**
 * Poll Mailpit until a matching message arrives; return extracted token.
 */
export async function waitForToken(
  options: WaitForMailOptions = {},
): Promise<{ token: string; messageId: string; subject?: string }> {
  assertNonProductionHarness();
  const timeoutMs = options.timeoutMs ?? 30_000;
  const pollMs = options.pollMs ?? 500;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const messages = await listMessages(30);
    for (const summary of messages) {
      const toHit =
        !options.toContains ||
        (summary.To || []).some((t) =>
          (t.Address || "")
            .toLowerCase()
            .includes(options.toContains!.toLowerCase()),
        );
      const subHit =
        !options.subjectContains ||
        (summary.Subject || "")
          .toLowerCase()
          .includes(options.subjectContains.toLowerCase());
      if (!toHit || !subHit) continue;

      const full = await getMessage(summary.ID);
      const body = `${full.Text || ""}\n${full.HTML || ""}\n${full.Snippet || ""}`;
      const token = extractTokenFromBody(body);
      if (token) {
        return {
          token,
          messageId: summary.ID,
          subject: summary.Subject,
        };
      }
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }

  throw new Error(
    `mailpit: no token within ${timeoutMs}ms` +
      (options.toContains ? ` to~=${options.toContains}` : "") +
      (options.subjectContains ? ` subject~=${options.subjectContains}` : ""),
  );
}
