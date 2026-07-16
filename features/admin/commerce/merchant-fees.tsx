"use client";

import { FeePolicyPreview } from "./fee-policy-preview";

/**
 * Kept as a merchant-scoped entry point for existing routes. Fee policy is
 * global by design: storefront and QRIS API payments cannot receive an
 * accidental per-merchant override from the browser.
 */
export function MerchantFeeConfigurator({
  merchantName,
}: {
  merchantName: string;
}) {
  return <FeePolicyPreview merchantName={merchantName} className="mt-4" />;
}
