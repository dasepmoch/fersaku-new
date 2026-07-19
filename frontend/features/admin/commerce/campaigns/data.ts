export type Campaign = {
  id: string;
  title: string;
  audience: string;
  channels: string[];
  status: string;
  sent: string;
  openRate: string;
  created: string;
};

export const campaignSeed: Campaign[] = [
  {
    id: "CMP-240712",
    title: "Xendit maintenance terjadwal",
    audience: "Semua Seller",
    channels: ["In-App", "Email"],
    status: "Live",
    sent: "1.284",
    openRate: "92,4%",
    created: "12 Jul, 14:20",
  },
  {
    id: "CMP-240705",
    title: "Panduan optimasi conversion storefront",
    audience: "Seller Aktif",
    channels: ["Email"],
    status: "Completed",
    sent: "684",
    openRate: "68,1%",
    created: "5 Jul, 09:00",
  },
  {
    id: "CMP-240701",
    title: "Pembaruan Ketentuan Layanan Juli 2026",
    audience: "Semua Seller",
    channels: ["Email", "In-App"],
    status: "Completed",
    sent: "1.271",
    openRate: "96,8%",
    created: "1 Jul, 08:00",
  },
  {
    id: "CMP-240628",
    title: "Tips frekuensi restock digital",
    audience: "Seller Aktif",
    channels: ["In-App"],
    status: "Completed",
    sent: "512",
    openRate: "74,2%",
    created: "28 Jun, 11:00",
  },
  {
    id: "CMP-240620",
    title: "QRIS fee update Juni 2026",
    audience: "Semua Seller",
    channels: ["Email"],
    status: "Completed",
    sent: "1.250",
    openRate: "88,0%",
    created: "20 Jun, 09:30",
  },
  {
    id: "CMP-240610",
    title: "Onboarding checklist seller baru",
    audience: "Seller Restricted",
    channels: ["Email", "In-App"],
    status: "Paused",
    sent: "96",
    openRate: "41,5%",
    created: "10 Jun, 16:00",
  },
];
