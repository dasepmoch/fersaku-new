"use client";

/**
 * SEL-300 — re-export publish mutation (store-scoped hooks live in hooks.ts).
 * Existing import path `./mutations` kept for compatibility.
 */
export { usePublishStorefrontMutation } from "./hooks";
