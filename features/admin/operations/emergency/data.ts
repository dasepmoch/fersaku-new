export type EmergencyControl = {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
  danger: boolean;
  impact: string;
};
export const emergencySeed: EmergencyControl[] = [
  {
    id: "registration",
    label: "Seller registration",
    description: "Allow new seller account and store onboarding",
    enabled: true,
    danger: true,
    impact: "New seller registration and first-store onboarding",
  },
  {
    id: "qris",
    label: "QRIS checkout",
    description: "Accept new Xendit QRIS payment intents",
    enabled: true,
    danger: true,
    impact: "All hosted checkout and API payment creation",
  },
  {
    id: "withdrawals",
    label: "Seller withdrawals",
    description: "Create and approve Xendit disbursements",
    enabled: true,
    danger: true,
    impact: "Seller payout creation and admin approvals",
  },
];
