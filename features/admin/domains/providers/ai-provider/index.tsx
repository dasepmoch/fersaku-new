"use client";

import { adminPanel } from "@/features/admin/ui";

import { Bot, BrainCircuit, CheckCircle2, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useClientPagination } from "@/shared/ui/use-client-pagination";
import { StatusChip } from "../pieces";
import { generations } from "./data";
import { AiPlayground } from "./playground";
import {
  CredentialsTab,
  GenerationAuditTab,
  ModelsRoutingTab,
  OverviewTab,
  SafetyPrivacyTab,
} from "./tabs";

export function AiProvider({
  test,
  testing,
  tested,
}: {
  test: () => void;
  testing: boolean;
  tested: boolean;
}) {
  const [tab, setTab] = useState("Overview");
  const [enabled, setEnabled] = useState(true);
  const [playground, setPlayground] = useState(false);
  const [prompt, setPrompt] = useState(
    "Ringkas insiden callback pembayaran untuk tim operations.",
  );
  const [answer, setAnswer] = useState("");
  const { pageRows, pagination } = useClientPagination(generations);
  return (
    <>
      <section className={`${adminPanel} overflow-hidden`}>
        <div className="relative overflow-hidden bg-[#261429] p-6 text-white sm:p-7">
          <div className="absolute -top-24 -right-10 size-64 rounded-full bg-[#f05a7e]/15 blur-2xl" />
          <div className="relative flex items-start">
            <span className="grid size-14 place-items-center rounded-[18px] bg-[#f05a7e] text-white">
              <BrainCircuit className="size-7" />
            </span>
            <div className="ml-4">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black">Fersaku AI Gateway</h2>
                <span className="rounded-full bg-[#ffd2df] px-2 py-1 text-[7px] font-black text-[#6d1733]">
                  GUARDED
                </span>
              </div>
              <p className="mt-2 text-[9px] text-white/50">
                Product copy, storefront writing, SEO, release notes, and
                campaign assistance
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <StatusChip icon={CheckCircle2} text="Operational" />
                <StatusChip icon={Bot} text="3 model routes" />
                <StatusChip icon={ShieldCheck} text="Safety filters active" />
              </div>
            </div>
            <button
              onClick={() => setEnabled(!enabled)}
              className={cn(
                "relative ml-auto h-6 w-11 rounded-full",
                enabled ? "bg-[#f05a7e]" : "bg-white/20",
              )}
            >
              <span
                className={cn(
                  "absolute top-1 size-4 rounded-full bg-white transition",
                  enabled ? "left-6" : "left-1",
                )}
              />
            </button>
          </div>
        </div>
        <div className="flex overflow-x-auto border-b border-[#e5e8ef] px-4">
          {[
            "Overview",
            "Models & routing",
            "Safety & privacy",
            "Generation audit",
            "Credentials",
          ].map((item) => (
            <button
              key={item}
              onClick={() => setTab(item)}
              className={cn(
                "shrink-0 border-b-2 px-4 py-4 text-[9px] font-extrabold",
                tab === item
                  ? "border-[#f05a7e] text-[#c84065]"
                  : "border-transparent text-[#7c879d]",
              )}
            >
              {item}
            </button>
          ))}
        </div>
        {tab === "Overview" && (
          <OverviewTab
            test={test}
            testing={testing}
            tested={tested}
            onOpenPlayground={() => setPlayground(true)}
          />
        )}
        {tab === "Models & routing" && <ModelsRoutingTab />}
        {tab === "Safety & privacy" && <SafetyPrivacyTab />}
        {tab === "Generation audit" && (
          <GenerationAuditTab pageRows={pageRows} pagination={pagination} />
        )}
        {tab === "Credentials" && <CredentialsTab />}
      </section>
      {playground && (
        <AiPlayground
          prompt={prompt}
          setPrompt={setPrompt}
          answer={answer}
          setAnswer={setAnswer}
          onClose={() => setPlayground(false)}
        />
      )}
    </>
  );
}
