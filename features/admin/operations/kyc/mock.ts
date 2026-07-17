/**
 * ADM-340 mock fixtures — snapshot-identical seed for non-api domain.
 */

import { apiKycSeed, type ApiKycApplicant } from "./data";

export function demoAdminKycQueue(): ApiKycApplicant[] {
  return apiKycSeed.map((row) => ({
    ...row,
    docs: [...row.docs],
    documentMeta: row.docs.map((label, i) => ({
      id: `mock_doc_${row.id}_${i}`,
      type: label,
      label,
      status: "READY",
      contentType: "image/jpeg",
    })),
  }));
}

export function demoAdminKycCase(caseId: string): ApiKycApplicant | null {
  const found = demoAdminKycQueue().find((c) => c.id === caseId);
  return found ? { ...found, docs: [...found.docs] } : null;
}
