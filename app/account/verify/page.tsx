import { Suspense } from "react";
import { BuyerVerify } from "@/components/buyer-verify";

export default function VerifyBuyerPage() {
  return (
    <Suspense fallback={null}>
      <BuyerVerify />
    </Suspense>
  );
}
