/**
 * INT-120 — multi-tab logout/session signal without token payload.
 */

export const SESSION_BROADCAST_CHANNEL = "fersaku-session";

export type SessionBroadcastMessage =
  | { type: "logout" }
  | { type: "session-changed"; identity: string };

export function publishSessionBroadcast(
  message: SessionBroadcastMessage,
): void {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") {
    return;
  }
  try {
    const channel = new BroadcastChannel(SESSION_BROADCAST_CHANNEL);
    channel.postMessage(message);
    channel.close();
  } catch {
    // ignore
  }
}

export function subscribeSessionBroadcast(
  handler: (message: SessionBroadcastMessage) => void,
): () => void {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") {
    return () => {};
  }
  let channel: BroadcastChannel;
  try {
    channel = new BroadcastChannel(SESSION_BROADCAST_CHANNEL);
  } catch {
    return () => {};
  }
  const onMessage = (event: MessageEvent) => {
    const data = event.data;
    if (!data || typeof data !== "object") return;
    const type = (data as { type?: unknown }).type;
    if (type === "logout") {
      handler({ type: "logout" });
      return;
    }
    if (type === "session-changed") {
      const identity = (data as { identity?: unknown }).identity;
      if (typeof identity === "string") {
        handler({ type: "session-changed", identity });
      }
    }
  };
  channel.addEventListener("message", onMessage);
  return () => {
    channel.removeEventListener("message", onMessage);
    channel.close();
  };
}
