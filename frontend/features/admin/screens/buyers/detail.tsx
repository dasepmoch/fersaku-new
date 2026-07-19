"use client";

import {
  adminPanel,
  AdminButton,
  PanelHead,
  Metric,
  AdminStatus,
  ControlDialog,
} from "@/features/admin/ui";
import Link from "next/link";
import { Ban, Eye, KeyRound, ShieldCheck, UserCog } from "lucide-react";
import { useRef, useState } from "react";
import {
  useAdminActionMutation,
  useAdminBuyer,
  useAdminBuyerPurchases,
  useAdminBuyerSessions,
  useAdminBuyerSupportWriteEnabled,
} from "@/features/admin/data";
import { createIdempotencyKey } from "@/shared/api/idempotency";
import { getDomainSource } from "@/shared/data/domain-source";
import { rupiah } from "@/lib/utils";

type BuyerSupportAction =
  | { kind: "magic-link"; title: string }
  | { kind: "email-change"; title: string }
  | { kind: "revoke-sessions"; title: string; sessionId?: string };

export function BuyerIdentityDetail({ id }: { id: string }) {
  const isMock = getDomainSource("adminRead") === "mock";
  const canWrite = useAdminBuyerSupportWriteEnabled();
  const { data: buyer } = useAdminBuyer(id);
  const { data: purchases } = useAdminBuyerPurchases(id);
  /** Authoritative query — do not clone into local state (async copy bug). */
  const { data: sessions } = useAdminBuyerSessions(id);
  const actionMutation = useAdminActionMutation();
  const [action, setAction] = useState<BuyerSupportAction | null>(null);
  const [lastCommand, setLastCommand] = useState<
    "magic-link" | "email-change" | null
  >(null);
  const actionIdemRef = useRef<string | null>(null);

  if (!buyer) return null;

  const sessionRows = sessions ?? [];
  const purchaseRows = purchases ?? [];
  const lifetimeSpend = rupiah(buyer.spent);
  const purchaseNote = isMock
    ? "Across 4 sellers"
    : purchaseRows.length > 0
      ? `${purchaseRows.length} listed`
      : "Server total";
  const sessionNote = isMock ? "Passwordless login" : "From server";

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        <AdminButton
          secondary
          disabled={!canWrite || actionMutation.isPending}
          onClick={() => {
            actionIdemRef.current = createIdempotencyKey();
            setAction({ kind: "magic-link", title: "Send buyer magic link" });
          }}
        >
          <KeyRound className="size-4" />
          {lastCommand === "magic-link" ? "Link queued" : "Send magic link"}
        </AdminButton>
        <AdminButton
          secondary
          disabled={!canWrite || actionMutation.isPending}
          onClick={() => {
            actionIdemRef.current = createIdempotencyKey();
            setAction({
              kind: "email-change",
              title: "Start verified buyer email change",
            });
          }}
        >
          <UserCog className="size-4" />
          {lastCommand === "email-change"
            ? "Workflow started"
            : "Start email change"}
        </AdminButton>
        <button
          type="button"
          disabled={!canWrite || actionMutation.isPending}
          onClick={() => {
            actionIdemRef.current = createIdempotencyKey();
            setAction({
              kind: "revoke-sessions",
              title: "Revoke all buyer sessions",
            });
          }}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#efc8c4] bg-[#fff5f4] px-4 text-[9px] font-extrabold text-[#c6534c] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Ban className="size-4" /> Revoke all sessions
        </button>
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.1fr_.9fr]">
        <section className={`${adminPanel} p-6`}>
          <div className="flex items-center gap-4">
            <span className="grid size-14 place-items-center rounded-full bg-[#ffb69d] text-sm font-black">
              {buyer.name
                .split(" ")
                .map((part) => part[0])
                .join("")}
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black">{buyer.name}</h2>
                <AdminStatus status={buyer.verified} />
              </div>
              <p className="mt-1 text-[9px] text-[#7d879b]">
                {buyer.email} • {buyer.id}
              </p>
            </div>
          </div>
          <div className="mt-7 grid gap-3 sm:grid-cols-3">
            <Metric
              label="Purchases"
              value={String(buyer.purchases)}
              note={purchaseNote}
            />
            <Metric
              label="Lifetime spend"
              value={lifetimeSpend}
              note="Across all purchases"
            />
            <Metric
              label="Active sessions"
              value={String(sessionRows.length)}
              note={sessionNote}
            />
          </div>
          <div className="mt-7 border-t border-[#e5e8ef] pt-6">
            <h3 className="text-[10px] font-black">
              Cross-store purchase access
            </h3>
            <p className="mt-1 text-[8px] text-[#7d879b]">
              Admins can inspect access globally. Individual sellers remain
              isolated to orders from their own store.
            </p>
            <div className="mt-4 grid gap-3">
              {purchaseRows.map((p) => (
                <div
                  key={p.orderId}
                  className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-xl border border-[#e1e5ed] p-3"
                >
                  <div>
                    <b className="block text-[9px]">{p.product}</b>
                    <span className="text-[7px] text-[#8993a6]">
                      {p.seller} • {p.orderId}
                    </span>
                  </div>
                  <AdminStatus status={p.status} />
                  <Link href={`/admin/orders/${p.orderId}`}>
                    <Eye className="size-3.5" />
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>
        <section className={`${adminPanel} overflow-hidden`}>
          <PanelHead
            title="Buyer sessions"
            desc="Magic-link sessions and device access"
          />
          <div>
            {sessionRows.length ? (
              sessionRows.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center gap-3 border-t border-[#e8eaf0] p-4"
                >
                  <span className="grid size-8 place-items-center rounded-xl bg-[#edf1ff]">
                    <ShieldCheck className="size-3.5 text-[#5b7cfa]" />
                  </span>
                  <div>
                    <b className="block text-[8px]">{s.device}</b>
                    <span className="text-[7px] text-[#8993a6]">
                      {s.ip} • {s.active}
                    </span>
                  </div>
                  {!s.current && (
                    <button
                      type="button"
                      disabled={!canWrite || actionMutation.isPending}
                      onClick={() => {
                        actionIdemRef.current = createIdempotencyKey();
                        setAction({
                          kind: "revoke-sessions",
                          title: `Revoke buyer session ${s.id}`,
                          sessionId: s.id,
                        });
                      }}
                      className="ml-auto text-[8px] font-bold text-[#c6534c] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Revoke
                    </button>
                  )}
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-[9px] text-[#7d879b]">
                All buyer sessions revoked.
              </div>
            )}
          </div>
        </section>
      </div>
      {action && (
        <ControlDialog
          title={action.title}
          target={id}
          auditHandledExternally
          requiresRecentMfa={!isMock}
          onClose={() => setAction(null)}
          onConfirm={async (reason) => {
            if (action.kind === "revoke-sessions") {
              // BE action requires sessionId; bulk = each non-current session.
              const targets = action.sessionId
                ? [action.sessionId]
                : sessionRows.filter((s) => !s.current).map((s) => s.id);
              for (const sessionId of targets) {
                const result = await actionMutation.mutateAsync({
                  action: "buyer.sessions.revoke",
                  resourceId: id,
                  sessionId,
                  reason,
                  idempotencyKey: createIdempotencyKey(),
                });
                if (
                  result &&
                  JSON.stringify(result).toLowerCase().includes("token")
                ) {
                  throw new Error(
                    "Buyer support response must not include token",
                  );
                }
              }
              actionIdemRef.current = null;
              return;
            }

            const command =
              action.kind === "magic-link"
                ? "buyer.magic_link.send"
                : "buyer.email_change.start";
            const result = await actionMutation.mutateAsync({
              action: command,
              resourceId: id,
              reason,
              idempotencyKey: actionIdemRef.current ?? createIdempotencyKey(),
            });
            // Admin never receives login token from magic-link workflow.
            if (
              result &&
              JSON.stringify(result).toLowerCase().includes("token")
            ) {
              throw new Error("Buyer support response must not include token");
            }
            setLastCommand(action.kind);
            actionIdemRef.current = null;
          }}
        />
      )}
    </>
  );
}
