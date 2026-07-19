"use client";

import { z } from "zod";
import {
  readVersionedStorage,
  writeVersionedStorage,
} from "@/shared/storage/versioned-storage";
import type { SellerWithdrawal } from "./contracts";

const storageKey = "fersaku-seller-created-withdrawals";
const storageVersion = 1;
const withdrawalSchema = z.object({
  id: z.string(),
  storeId: z.string(),
  amount: z.number().int().positive(),
  bankLabel: z.string(),
  status: z.literal("Pending"),
  requestedAt: z.string(),
  source: z.enum(["STOREFRONT", "QRIS_API", "MIXED"]),
});
const withdrawalsSchema = z.array(withdrawalSchema);

export function readMockCreatedWithdrawals(storeId: string) {
  return readVersionedStorage({
    key: storageKey,
    version: storageVersion,
    schema: withdrawalsSchema,
    fallback: () => [],
  }).filter((withdrawal) => withdrawal.storeId === storeId);
}

export function persistMockCreatedWithdrawal(withdrawal: SellerWithdrawal) {
  const parsed = withdrawalSchema.safeParse(withdrawal);
  if (!parsed.success) return false;
  const current = readVersionedStorage({
    key: storageKey,
    version: storageVersion,
    schema: withdrawalsSchema,
    fallback: () => [],
  });
  const withoutDuplicate = current.filter((item) => item.id !== withdrawal.id);
  return writeVersionedStorage({
    key: storageKey,
    version: storageVersion,
    data: [parsed.data, ...withoutDuplicate].slice(0, 25),
  });
}
