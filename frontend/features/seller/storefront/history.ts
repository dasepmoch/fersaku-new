import type { BuilderConfig } from "./types";

export type HistoryState = {
  config: BuilderConfig;
  history: BuilderConfig[];
  future: BuilderConfig[];
};

/** Push current config into undo stack (max 20 entries) and clear redo. */
export function pushHistory(
  history: BuilderConfig[],
  current: BuilderConfig,
): BuilderConfig[] {
  return [...history.slice(-19), current];
}

/**
 * Apply a committed config: push current onto undo history and clear redo.
 * Pure — does not mutate inputs.
 */
export function applyCommit(
  history: BuilderConfig[],
  current: BuilderConfig,
  next: BuilderConfig,
): HistoryState {
  return {
    config: next,
    history: pushHistory(history, current),
    future: [],
  };
}

/** Pure undo: move current into future, restore last history entry. */
export function undoState(
  history: BuilderConfig[],
  current: BuilderConfig,
  future: BuilderConfig[],
): HistoryState | null {
  const previous = history.at(-1);
  if (!previous) return null;
  return {
    config: previous,
    history: history.slice(0, -1),
    future: [current, ...future],
  };
}

/** Pure redo: move current into history, restore first future entry. */
export function redoState(
  history: BuilderConfig[],
  current: BuilderConfig,
  future: BuilderConfig[],
): HistoryState | null {
  const next = future[0];
  if (!next) return null;
  return {
    config: next,
    history: [...history, current],
    future: future.slice(1),
  };
}

/** Alias for callers that prefer verb-style names. */
export const undo = undoState;
export const redo = redoState;

/** Pure section reorder. Returns null when indices are invalid or unchanged. */
export function reorderSectionsList(
  sections: BuilderConfig["sections"],
  from: number,
  to: number,
): BuilderConfig["sections"] | null {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= sections.length ||
    to >= sections.length
  ) {
    return null;
  }
  const next = [...sections];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
