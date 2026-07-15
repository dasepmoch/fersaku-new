export type OrderStatus = "Paid" | "Pending" | "Failed" | "Delivered";

export type SellerOrder = {
  id: string;
  storeId: string;
  customer: string;
  email: string;
  product: string;
  amount: number;
  status: OrderStatus;
  date: string;
  avatar: string;
};
