/**
 * QLT-200 — FE consumer reads BE provider fixture (foundation sample).
 * Proves provider JSON shape maps through Zod + mapper (rename/removal breaks CI).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { featuredCatalogProductListEnvelopeSchema } from "@/shared/api/schemas";
import { mapFeaturedCatalogProductListDto } from "@/features/catalog/mappers";
import { assertConsumerMapsToView } from "./helpers/consumer";

const fixturePath = join(
  process.cwd().replace(/[\\/]frontend$/, ""),
  "backend/test/fixtures/contract/featured-products.provider.json",
);

describe("QLT-200 provider fixture → FE consumer parity", () => {
  it("loads BE featured-products.provider.json and maps to view", () => {
    const raw = JSON.parse(readFileSync(fixturePath, "utf8"));
    assertConsumerMapsToView({
      name: "provider.featured-products",
      schema: featuredCatalogProductListEnvelopeSchema,
      fixture: raw,
      map: (env) => mapFeaturedCatalogProductListDto(env.data),
      expected: (view) => {
        expect(view).toHaveLength(1);
        expect(view[0]).toMatchObject({
          id: "prod_qlt200_01",
          slug: "ai-prompt-pack",
          price: 149_000,
          type: "download",
          storeSlug: "designkit-studio",
        });
      },
    });
  });
});
