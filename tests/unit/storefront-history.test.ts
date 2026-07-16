import { describe, expect, it } from "vitest";
import {
  applyCommit,
  pushHistory,
  redo,
  redoState,
  reorderSectionsList,
  undo,
  undoState,
} from "@/features/seller/storefront/history";
import { initialStorefrontConfig } from "@/features/seller/storefront/config";
import type { BuilderConfig } from "@/features/seller/storefront/types";

function cfg(patch: Partial<BuilderConfig> = {}): BuilderConfig {
  return { ...initialStorefrontConfig, ...patch };
}

describe("storefront history helpers", () => {
  it("pushHistory keeps at most 20 entries", () => {
    let history: BuilderConfig[] = [];
    for (let i = 0; i < 25; i += 1) {
      history = pushHistory(history, cfg({ name: `v${i}` }));
    }
    expect(history).toHaveLength(20);
    expect(history[0].name).toBe("v5");
    expect(history.at(-1)?.name).toBe("v24");
  });

  it("applyCommit pushes current and clears redo", () => {
    const current = cfg({ name: "current" });
    const next = cfg({ name: "next" });
    const state = applyCommit([cfg({ name: "old" })], current, next);
    expect(state.config.name).toBe("next");
    expect(state.history.map((h) => h.name)).toEqual(["old", "current"]);
    expect(state.future).toEqual([]);
  });

  it("undo and redo round-trip config", () => {
    const a = cfg({ name: "a" });
    const b = cfg({ name: "b" });
    const c = cfg({ name: "c" });

    const afterCommit = applyCommit([], a, b);
    const afterSecond = applyCommit(afterCommit.history, afterCommit.config, c);

    const undone = undoState(
      afterSecond.history,
      afterSecond.config,
      afterSecond.future,
    );
    expect(undone).not.toBeNull();
    expect(undone!.config.name).toBe("b");

    const redone = redoState(undone!.history, undone!.config, undone!.future);
    expect(redone).not.toBeNull();
    expect(redone!.config.name).toBe("c");
  });

  it("exposes undo/redo aliases", () => {
    expect(undo).toBe(undoState);
    expect(redo).toBe(redoState);
  });

  it("returns null when undo/redo stacks are empty", () => {
    const current = cfg({ name: "only" });
    expect(undoState([], current, [])).toBeNull();
    expect(redoState([], current, [])).toBeNull();
  });

  it("reorders sections or returns null for invalid indices", () => {
    const sections = [
      { id: "a", label: "A", visible: true },
      { id: "b", label: "B", visible: true },
      { id: "c", label: "C", visible: false },
    ];
    expect(reorderSectionsList(sections, 0, 2)?.map((s) => s.id)).toEqual([
      "b",
      "c",
      "a",
    ]);
    expect(reorderSectionsList(sections, 1, 1)).toBeNull();
    expect(reorderSectionsList(sections, -1, 0)).toBeNull();
    expect(reorderSectionsList(sections, 0, 9)).toBeNull();
  });
});
