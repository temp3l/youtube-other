import { z } from "zod";

import { microdramaInteractionSettingsSchema } from "./microdrama-publication-contracts.js";
import { microdramaPerformanceObservationWindowSchema } from "./microdrama-performance-contracts.js";
import { microdramaPerformanceMetricKindSchema } from "./microdrama-performance-contracts.js";

const identifierPattern = /^[a-z0-9][a-z0-9._-]*$/u;
const backlogTaskIdPattern = /^[A-Z][A-Z0-9]+(?:-[A-Z0-9]+)*$/u;
const sha256Pattern = /^[a-f0-9]{64}$/u;
const isoDateTimeSchema = z.iso.datetime({ offset: true });
const identifierSchema = z.string().min(1).max(160).regex(identifierPattern);
const backlogTaskIdSchema = z.string().min(1).max(160).regex(backlogTaskIdPattern);
const nonEmptyStringSchema = z.string().trim().min(1);
const sha256Schema = z.string().regex(sha256Pattern);

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
    /** Optional analytics-read canary fields (MICRO-042). */
    publicationId: identifierSchema.optional(),
    observationWindow: microdramaPerformanceObservationWindowSchema.optional(),
    requestedMetricSet: z.array(microdramaPerformanceMetricKindSchema).min(1).optional(),
  })
  .strict();
export type ExactReadOnlyProviderAccessBindings = z.infer<
  typeof exactReadOnlyProviderAccessBindingsSchema
>;

export const exactPublicationIntentBindingsSchema = z
  .object({
    providerAccountId: identifierSchema,
    creatorCapabilityEvidenceRevision: identifierSchema,
    episodeRevisionId: identifierSchema,
    locale: nonEmptyStringSchema,
    renderHash: sha256Schema,
    metadataRevision: identifierSchema,
    privacy: z.enum(["private", "public"]),
    interactionSettings: microdramaInteractionSettingsSchema,
    aiDeclaration: z.boolean(),
    commercialDeclaration: z.boolean(),
    consentRevision: identifierSchema,
    exportApprovalRevision: identifierSchema,
    approvalTimestamp: isoDateTimeSchema,
  })
  .strict();
export type ExactPublicationIntentBindings = z.infer<
  typeof exactPublicationIntentBindingsSchema
>;

export const boundedProductionAndPublicationBatchBindingsSchema = z
  .object({
    episodeRange: z
      .object({
        startEpisodeId: identifierSchema,
        endEpisodeId: identifierSchema,
      })
      .strict(),
    locales: z.array(nonEmptyStringSchema).min(1),
    providers: z.array(identifierSchema).min(1),
    accounts: z.array(identifierSchema).min(1),
    revisionSet: z.array(identifierSchema).min(1),
    costLimitMinor: z.number().int().positive(),
    scheduleMode: z.enum(["manual", "scheduled"]),
  })
  .strict();
export type BoundedProductionAndPublicationBatchBindings = z.infer<
  typeof boundedProductionAndPublicationBatchBindingsSchema
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
      exactPublicationIntentBindingsSchema,
      boundedProductionAndPublicationBatchBindingsSchema,
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
