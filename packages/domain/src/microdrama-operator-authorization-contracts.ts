import { z } from "zod";

const identifierPattern = /^[a-z0-9][a-z0-9._-]*$/u;
const backlogTaskIdPattern = /^[A-Z][A-Z0-9]+(?:-[A-Z0-9]+)*$/u;
const isoDateTimeSchema = z.iso.datetime({ offset: true });
const identifierSchema = z.string().min(1).max(160).regex(identifierPattern);
const backlogTaskIdSchema = z.string().min(1).max(160).regex(backlogTaskIdPattern);
const nonEmptyStringSchema = z.string().trim().min(1);

export const MICRODRAMA_OPERATOR_AUTHORIZATION_SCHEMA_VERSION =
  "mediaforge.microdrama-operator-authorization.v1" as const;

export const MICRODRAMA_OPERATOR_AUTHORIZATION_KINDS = [
  "NONE",
  "BOUNDED_PAID_PROVIDER_EFFECT",
  "EXACT_PUBLICATION_INTENT",
  "BOUNDED_PRODUCTION_AND_PUBLICATION_BATCH",
  "EXACT_READ_ONLY_PROVIDER_ACCESS",
] as const;
export const microdramaOperatorAuthorizationKindSchema = z.enum(
  MICRODRAMA_OPERATOR_AUTHORIZATION_KINDS
);
export type MicrodramaOperatorAuthorizationKind = z.infer<
  typeof microdramaOperatorAuthorizationKindSchema
>;

export const MICRODRAMA_OPERATOR_AUTHORIZATION_STATES = [
  "active",
  "expired",
  "revoked",
] as const;
export const microdramaOperatorAuthorizationStateSchema = z.enum(
  MICRODRAMA_OPERATOR_AUTHORIZATION_STATES
);
export type MicrodramaOperatorAuthorizationState = z.infer<
  typeof microdramaOperatorAuthorizationStateSchema
>;

export const boundedPaidProviderEffectBindingsSchema = z
  .object({
    episodeIds: z.array(identifierSchema).min(1),
    locale: nonEmptyStringSchema,
    scriptRevisionIds: z.array(identifierSchema).min(1),
    voiceRevision: identifierSchema,
    provider: identifierSchema,
    costLimitMinor: z.number().int().positive(),
  })
  .strict();
export type BoundedPaidProviderEffectBindings = z.infer<
  typeof boundedPaidProviderEffectBindingsSchema
>;

export const exactReadOnlyProviderAccessBindingsSchema = z
  .object({
    providerAppRevision: identifierSchema,
    providerAccountId: identifierSchema,
    requestedScopes: z.array(nonEmptyStringSchema).min(1),
    allowedEndpoints: z.array(nonEmptyStringSchema).min(1),
    authorizationWindow: z
      .object({
        startAt: isoDateTimeSchema,
        endAt: isoDateTimeSchema,
      })
      .strict(),
  })
  .strict();
export type ExactReadOnlyProviderAccessBindings = z.infer<
  typeof exactReadOnlyProviderAccessBindingsSchema
>;

export const microdramaOperatorAuthorizationRecordSchema = z
  .object({
    schemaVersion: z.literal(MICRODRAMA_OPERATOR_AUTHORIZATION_SCHEMA_VERSION),
    authorizationId: identifierSchema,
    taskId: backlogTaskIdSchema,
    kind: microdramaOperatorAuthorizationKindSchema,
    state: microdramaOperatorAuthorizationStateSchema,
    bindings: z.union([
      boundedPaidProviderEffectBindingsSchema,
      exactReadOnlyProviderAccessBindingsSchema,
    ]),
    authorizedAt: isoDateTimeSchema,
    expiresAt: isoDateTimeSchema.optional(),
    revokedAt: isoDateTimeSchema.optional(),
    operatorId: identifierSchema,
  })
  .strict();
export type MicrodramaOperatorAuthorizationRecord = z.infer<
  typeof microdramaOperatorAuthorizationRecordSchema
>;
