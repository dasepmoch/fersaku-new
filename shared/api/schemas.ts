import { z } from "zod";

export const apiRequestMetaSchema = z.object({
  requestId: z.string().min(1),
  timestamp: z.iso.datetime({ offset: true }),
});

export const apiProblemSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  details: z.record(z.string(), z.unknown()).optional(),
  requestId: z.string().min(1).optional(),
});

export function apiEnvelopeSchema<TSchema extends z.ZodType>(schema: TSchema) {
  return z.object({
    data: schema,
    meta: apiRequestMetaSchema,
  });
}

export function cursorPageSchema<TSchema extends z.ZodType>(schema: TSchema) {
  return z.object({
    items: z.array(schema),
    nextCursor: z.string().nullable(),
    previousCursor: z.string().nullable(),
    hasMore: z.boolean(),
  });
}
