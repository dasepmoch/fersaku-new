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
    description: "Accept new Duitku QRIS payment intents",
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
  {
    id: "ai",
    label: "Admin AI tools",
    description: "Internal analysis and operations assistance",
    enabled: true,
    danger: false,
    impact: "Administrator playground and internal AI workflows",
  },
  {
    id: "backup",
    label: "Backup payment route",
    description: "Route eligible traffic to standby provider",
    enabled: false,
    danger: true,
    impact: "New payment intents after health-check approval",
  },
];
