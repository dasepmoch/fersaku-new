import { StoreOnboarding } from "@/features/seller/onboarding/store-onboarding";
import { PrivateSurfaceShell } from "@/shared/auth/private-surface-shell";
import { CurrentStoreProvider } from "@/shared/seller/current-store";

export default function OnboardingPage() {
  return (
    <PrivateSurfaceShell surface="seller">
      <CurrentStoreProvider>
        <StoreOnboarding />
      </CurrentStoreProvider>
    </PrivateSurfaceShell>
  );
}
