/**
 * Transport-only OpenAPI types (INT-010).
 * Generated artefact is openapi.ts — do not edit it by hand.
 * Re-export stable aliases for pilot consumers.
 */

export type {
  components,
  operations,
  paths,
} from "./openapi";

export type {
  SchemaAuthLoginData,
  SchemaAuthLoginEnvelope,
  SchemaAuthMessageData,
  SchemaAuthMessageEnvelope,
  SchemaCatalogProduct,
  SchemaCatalogProductEnvelope,
  SchemaCatalogProductListEnvelope,
  SchemaCursorListEnvelope,
  SchemaCursorListMeta,
  SchemaFeePolicy,
  SchemaFeePolicyEnvelope,
  SchemaFieldViolation,
  SchemaHealthStatus,
  SchemaMeta,
  SchemaMoneyIdr,
  SchemaNumberedPageListEnvelope,
  SchemaNumberedPageListMeta,
  SchemaProblem,
  SchemaProblemEnvelope,
  SchemaPublicStorefront,
  SchemaPublicStorefrontEnvelope,
  SchemaRfc3339Timestamp,
  SchemaStatusData,
  SchemaStatusEnvelope,
  SchemaSuccessEnvelope,
} from "./openapi";

/** Convenience aliases without Schema prefix for feature transport modules. */
export type {
  SchemaAuthLoginData as AuthLoginDataDto,
  SchemaAuthLoginEnvelope as AuthLoginEnvelopeDto,
  SchemaCatalogProduct as CatalogProductDto,
  SchemaCatalogProductEnvelope as CatalogProductEnvelopeDto,
  SchemaCatalogProductListEnvelope as CatalogProductListEnvelopeDto,
  SchemaCursorListMeta as CursorListMetaDto,
  SchemaFeePolicy as FeePolicyDto,
  SchemaFeePolicyEnvelope as FeePolicyEnvelopeDto,
  SchemaFieldViolation as FieldViolationDto,
  SchemaHealthStatus as HealthStatusDto,
  SchemaMeta as MetaDto,
  SchemaMoneyIdr as MoneyIdrDto,
  SchemaNumberedPageListMeta as NumberedPageListMetaDto,
  SchemaProblem as ProblemDto,
  SchemaProblemEnvelope as ProblemEnvelopeDto,
  SchemaPublicStorefront as PublicStorefrontDto,
  SchemaPublicStorefrontEnvelope as PublicStorefrontEnvelopeDto,
  SchemaStatusData as StatusDataDto,
  SchemaStatusEnvelope as StatusEnvelopeDto,
  SchemaSuccessEnvelope as SuccessEnvelopeDto,
} from "./openapi";

import type { operations } from "./openapi";

/** Typed success body for a named operationId (200 application/json). */
export type OperationSuccessJson<Op extends keyof operations> =
  operations[Op] extends {
    responses: {
      200: { content: { "application/json": infer Body } };
    };
  }
    ? Body
    : never;

/** Typed problem body for a named operationId when present. */
export type OperationProblemJson<Op extends keyof operations> =
  operations[Op] extends {
    responses: {
      401: { content: { "application/json": infer Body } };
    };
  }
    ? Body
    : operations[Op] extends {
          responses: {
            404: { content: { "application/json": infer Body } };
          };
        }
      ? Body
      : never;
