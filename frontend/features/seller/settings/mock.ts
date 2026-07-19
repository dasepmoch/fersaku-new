import type {
  SellerBankAccount,
  SellerProfile,
  SellerSession,
} from "./contracts";

export function demoSellerProfile(): SellerProfile {
  return {
    displayName: "Asep Kurnia",
    email: "asep@ai.tools",
    locale: "id-ID",
    localeLabel: "Bahasa Indonesia",
    timezone: "Asia/Jakarta (GMT+7)",
    revision: 1,
    initials: "AK",
    saleSuccess: true,
    paymentPending: false,
    lowStock: true,
    payoutChange: true,
    newDeviceLogin: true,
    weeklySummary: true,
  };
}

export function demoSellerBankAccounts(
  _storeId = "demo",
): SellerBankAccount[] {
  return [
    {
      id: "bank_bca_demo",
      bank: "BCA",
      bankCode: "BCA",
      numberMasked: "•••• 4821",
      numberLast4: "4821",
      holder: "ASEP KURNIA",
      verified: true,
      primary: true,
      revision: 1,
      status: "VERIFIED",
    },
  ];
}

export function demoSellerSessions(): SellerSession[] {
  return [
    {
      id: "ses_current_demo",
      device: "Chrome · Linux",
      location: "—",
      ip: "—",
      active: "Sekarang",
      current: true,
    },
  ];
}
