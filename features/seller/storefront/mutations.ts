"use client";

import { useAppMutation } from "@/shared/query/create-mutation";
import { publishStorefrontDraft, type PublishStorefrontInput } from "./api";

export function usePublishStorefrontMutation() {
  return useAppMutation({
    mutationKey: ["seller", "storefront", "publish"],
    mutationFn: (input: PublishStorefrontInput, signal) =>
      publishStorefrontDraft(input, signal),
  });
}
