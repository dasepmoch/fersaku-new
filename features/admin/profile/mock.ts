import type { AdminProfile, AdminSession } from "./contracts";

export function demoAdminProfile(): AdminProfile {
  return {
    fullName: "Dinda Kusuma",
    email: "dinda@fersaku.id",
    jobTitle: "Head of Platform Operations",
    timezone: "Asia/Jakarta",
    revision: 1,
    initials: "DK",
    mfaEnabled: true,
    kyc: true,
    withdrawals: true,
    incidents: true,
    digest: false,
  };
}

export function demoAdminSessions(): AdminSession[] {
  return [
    {
      id: "current",
      device: "Chrome on Linux",
      ip: "103.28.54.11",
      active: "Now",
      current: true,
    },
    {
      id: "mobile",
      device: "Safari on iPhone",
      ip: "180.252.91.18",
      active: "2h ago",
      current: false,
    },
  ];
}
