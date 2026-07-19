"use client";

import { useEffect } from "react";
import { installObservabilityReporter } from "./install";

/**
 * Client bootstrap: installs real sink when mode=sink.
 * No UI chrome — does not change layout.
 */
export function ObservabilityBootstrap() {
  useEffect(() => {
    const { uninstall } = installObservabilityReporter();
    return uninstall;
  }, []);
  return null;
}
