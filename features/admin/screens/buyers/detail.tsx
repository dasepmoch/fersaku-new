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
import { useState } from "react";
import {
  type AdminBuyerSession,
  useAdminActionMutation,
  useAdminBuyer,
  useAdminBuyerPurchases,
  useAdminBuyerSessions,
} from "@/features/admin/data";

type BuyerSupportAction =
  | { kind: "magic-link"; title: string }
  | { kind: "email-change"; title: string }
  | { kind: "revoke-sessions"; title: string; sessionId?: string };

export function BuyerIdentityDetail({ id }: { id: string }) {
  const { data: buyer } = useAdminBuyer(id);
  const { data: purchases } = useAdminBuyerPurchases(id);
  const { data: sessionData } = useAdminBuyerSessions(id);
  const actionMutation = useAdminActionMutation();
  const [action, setAction] = useState<BuyerSupportAction | null>(null);
  const [lastCommand, setLastCommand] = useState<
    "magic-link" | "email-change" | null
  >(null);
  const [sessions, setSessions] = useState<AdminBuyerSession[]>(
    sessionData ?? [],
  );
  if (!buyer) return null;
  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        <AdminButton
          secondary
          onClick={() =>
            setAction({ kind: "magic-link", title: "Send buyer magic link" })
          }
        >
          <KeyRound className="size-4" />
          {lastCommand === "magic-link" ? "Link queued" : "Send magic link"}
        </AdminButton>
        <AdminButton
          secondary
          onClick={() =>
            setAction({
              kind: "email-change",
              title: "Start verified buyer email change",
            })
          }
        >
          <UserCog className="size-4" />
          {lastCommand === "email-change"
            ? "Workflow started"
            : "Start email change"}
        </AdminButton>
        <button
          onClick={() =>
            setAction({
              kind: "revoke-sessions",
              title: "Revoke all buyer sessions",
            })
          }
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#efc8c4] bg-[#fff5f4] px-4 text-[9px] font-extrabold text-[#c6534c]"
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
                <AdminStatus status="Verified" />
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
              note="Across 4 sellers"
            />
            <Metric
              label="Lifetime spend"
              value={`Rp${buyer.spent.toLocaleString("id-ID")}`}
              note="Across all purchases"
            />
            <Metric
              label="Active sessions"
              value={String(sessions.length)}
              note="Passwordless login"
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
              {(purchases ?? []).map((p) => (
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
            {sessions.length ? (
              sessions.map((s) => (
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
                      onClick={() =>
                        setAction({
                          kind: "revoke-sessions",
                          title: `Revoke buyer session ${s.id}`,
                          sessionId: s.id,
                        })
                      }
                      className="ml-auto text-[8px] font-bold text-[#c6534c]"
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
          onClose={() => setAction(null)}
          onConfirm={async (reason) => {
            const command =
              action.kind === "magic-link"
                ? "buyer.magic_link.send"
                : action.kind === "email-change"
                  ? "buyer.email_change.start"
                  : "buyer.sessions.revoke";
            await actionMutation.mutateAsync({
              action: command,
              resourceId: id,
              sessionId:
                action.kind === "revoke-sessions"
                  ? action.sessionId
                  : undefined,
              reason,
              idempotencyKey: `${command}-${id}-${Date.now()}`,
            });
            if (action.kind === "revoke-sessions") {
              setSessions((current) =>
                action.sessionId
                  ? current.filter((session) => session.id !== action.sessionId)
                  : [],
              );
            } else {
              setLastCommand(action.kind);
            }
          }}
        />
      )}
    </>
  );
}
