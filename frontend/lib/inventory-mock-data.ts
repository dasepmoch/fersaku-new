export type InventoryField = {
  key: string;
  label: string;
  secret: boolean;
  required: boolean;
  buyerCopyable: boolean;
};
export type StockItem = {
  id: string;
  values: Record<string, string>;
  status: "Available" | "Reserved" | "Sold" | "Invalid";
  orderId?: string;
  createdAt: string;
};

export const stockProducts = [
  {
    id: "prod_account",
    title: "Canva Pro Team — 30 Hari",
    type: "Structured credentials",
    available: 84,
    reserved: 3,
    sold: 216,
    invalid: 2,
    lowAt: 20,
    delivery: "username|password|team_link",
  },
  {
    id: "prod_code",
    title: "Steam Wallet IDR 90.000",
    type: "Single code",
    available: 14,
    reserved: 1,
    sold: 428,
    invalid: 0,
    lowAt: 25,
    delivery: "redeem_code",
  },
  {
    id: "prod_vpn",
    title: "VPN Premium — 1 Tahun",
    type: "Structured credentials",
    available: 7,
    reserved: 0,
    sold: 91,
    invalid: 1,
    lowAt: 10,
    delivery: "username|password|expires_at",
  },
];

export const canvaSchema: InventoryField[] = [
  {
    key: "username",
    label: "Username / Email",
    secret: false,
    required: true,
    buyerCopyable: true,
  },
  {
    key: "password",
    label: "Password",
    secret: true,
    required: true,
    buyerCopyable: true,
  },
  {
    key: "team_link",
    label: "Team invite link",
    secret: true,
    required: false,
    buyerCopyable: true,
  },
];

export const stockItems: StockItem[] = [
  {
    id: "stk_8K2A1",
    values: {
      username: "buyer.01@inboxkit.id",
      password: "Cnv#8K2A1",
      team_link: "https://canva.com/brand/join/8K2A1",
    },
    status: "Available",
    createdAt: "12 Jul, 13:42",
  },
  {
    id: "stk_8K2A2",
    values: {
      username: "buyer.02@inboxkit.id",
      password: "Cnv#8K2A2",
      team_link: "https://canva.com/brand/join/8K2A2",
    },
    status: "Reserved",
    createdAt: "12 Jul, 13:42",
  },
  {
    id: "stk_8K2A3",
    values: {
      username: "buyer.03@inboxkit.id",
      password: "Cnv#8K2A3",
      team_link: "https://canva.com/brand/join/8K2A3",
    },
    status: "Sold",
    orderId: "FRS-240712-1842",
    createdAt: "12 Jul, 13:42",
  },
  {
    id: "stk_8K2A4",
    values: { username: "invalid-email", password: "", team_link: "not-a-url" },
    status: "Invalid",
    createdAt: "12 Jul, 13:42",
  },
  {
    id: "stk_8K2A5",
    values: {
      username: "buyer.05@inboxkit.id",
      password: "Cnv#8K2A5",
      team_link: "https://canva.com/brand/join/8K2A5",
    },
    status: "Available",
    createdAt: "12 Jul, 12:10",
  },
  {
    id: "stk_8K2A6",
    values: {
      username: "buyer.06@inboxkit.id",
      password: "Cnv#8K2A6",
      team_link: "https://canva.com/brand/join/8K2A6",
    },
    status: "Available",
    createdAt: "12 Jul, 12:10",
  },
  {
    id: "stk_8K2A7",
    values: {
      username: "buyer.07@inboxkit.id",
      password: "Cnv#8K2A7",
      team_link: "https://canva.com/brand/join/8K2A7",
    },
    status: "Reserved",
    createdAt: "12 Jul, 11:55",
  },
  {
    id: "stk_8K2A8",
    values: {
      username: "buyer.08@inboxkit.id",
      password: "Cnv#8K2A8",
      team_link: "https://canva.com/brand/join/8K2A8",
    },
    status: "Sold",
    orderId: "FRS-240712-1839",
    createdAt: "11 Jul, 18:20",
  },
  {
    id: "stk_8K2A9",
    values: {
      username: "buyer.09@inboxkit.id",
      password: "Cnv#8K2A9",
      team_link: "https://canva.com/brand/join/8K2A9",
    },
    status: "Available",
    createdAt: "11 Jul, 16:02",
  },
  {
    id: "stk_8K2B0",
    values: {
      username: "buyer.10@inboxkit.id",
      password: "Cnv#8K2B0",
      team_link: "https://canva.com/brand/join/8K2B0",
    },
    status: "Available",
    createdAt: "11 Jul, 15:40",
  },
  {
    id: "stk_8K2B1",
    values: {
      username: "buyer.11@inboxkit.id",
      password: "Cnv#8K2B1",
      team_link: "https://canva.com/brand/join/8K2B1",
    },
    status: "Sold",
    orderId: "FRS-240712-1821",
    createdAt: "10 Jul, 21:11",
  },
  {
    id: "stk_8K2B2",
    values: {
      username: "buyer.12@inboxkit.id",
      password: "Cnv#8K2B2",
      team_link: "https://canva.com/brand/join/8K2B2",
    },
    status: "Available",
    createdAt: "10 Jul, 19:05",
  },
];
