const POSITIVE_STATUSES = new Set([
  "Active",
  "Paid",
  "Completed",
  "Live",
  "Success",
  "Operational",
  "Delivered",
  "Available",
  "Sold",
  "Verified",
  "Fulfilled",
  "Published",
]);

const PENDING_STATUSES = new Set([
  "Pending",
  "Processing",
  "Invited",
  "On hold",
  "Review",
  "Reserved",
]);

const SELLER_POSITIVE_STATUSES = new Set([
  "Paid",
  "Active",
  "Completed",
  "Delivered",
]);

const SELLER_PENDING_STATUSES = new Set(["Pending", "Processing"]);

export function isPositiveStatus(status: string): boolean {
  return POSITIVE_STATUSES.has(status);
}

export function isPendingStatus(status: string): boolean {
  return PENDING_STATUSES.has(status);
}

/** Narrow legacy seller tone policy; kept separate from the broader admin policy. */
export function isSellerPositiveStatus(status: string): boolean {
  return SELLER_POSITIVE_STATUSES.has(status);
}

export function isSellerPendingStatus(status: string): boolean {
  return SELLER_PENDING_STATUSES.has(status);
}
