"use client";

import { Sparkles, X } from "lucide-react";

export function AiPlayground({
  prompt,
  setPrompt,
  answer,
  setAnswer,
  onClose,
}: {
  prompt: string;
  setPrompt: (value: string) => void;
  answer: string;
  setAnswer: (value: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[120] grid place-items-center bg-[#07101e]/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-[24px] bg-white p-6 text-[#131827] shadow-2xl">
        <div className="flex items-start">
          <div>
            <p className="text-[8px] font-extrabold tracking-[.16em] text-[#c84065] uppercase">
              Admin safe playground
            </p>
            <h2 className="mt-2 text-lg font-black">Test guarded generation</h2>
          </div>
          <button
            onClick={onClose}
            className="ml-auto grid size-9 place-items-center rounded-xl border border-[#dce1e9]"
          >
            <X className="size-4" />
          </button>
        </div>
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          rows={4}
          className="mt-5 w-full resize-none rounded-xl border border-[#dce1e9] p-3 text-xs"
        />
        <button
          onClick={() =>
            setAnswer("Prompt OS — Sistem AI Praktis untuk Kerja Kreatif")
          }
          className="mt-3 flex h-10 items-center gap-2 rounded-xl bg-[#261429] px-4 text-[8px] font-extrabold text-white"
        >
          <Sparkles className="size-3.5" /> Generate guarded response
        </button>
        {answer && (
          <div className="mt-4 rounded-2xl bg-[#f8edf1] p-4">
            <b className="text-[8px] text-[#8f3652]">
              Allowed • safety score 0.98
            </b>
            <p className="mt-2 text-sm font-bold">{answer}</p>
          </div>
        )}
      </div>
    </div>
  );
}
