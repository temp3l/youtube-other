import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import {
  structureTrustedScriptClaimsV34,
  type HistoryStructuredClaimsV34,
} from "../history-claims-v34.js";
import type { CanonicalNarrationV3_3 } from "../history-narration-v33.js";
import type { HistoryClaimKindV34 } from "../history-v34-contracts.js";
import type { HistorySourceAuthorityMode } from "../history-trusted-script-v33.js";
import { atomicConceptIdV36 } from "./atomic-claim-grounding-v36.js";
import {
  createNativeStructuredClaimEnvelopeV36,
} from "./structured-claim-enricher-v36.js";
import {
  HISTORY_STRUCTURED_CLAIM_SCHEMA_V36,
  createStructuredPropositionV36,
  structuredClaimArtifactSchemaV36,
  structuredSourceTextHashV36,
  type StructuredAssertionStatusV36,
  type StructuredClaimDiagnosticV36,
  type StructuredClaimEnvelopeV36,
  type StructuredParticipantV36,
  type StructuredPredicateV36,
  type StructuredQualifierV36,
  type StructuredSemanticRoleNameV36,
} from "./structured-claim-v36.js";
import { claimIdV36, entityIdV36, episodeIdV36 } from "./explanatory-relation-v36.js";

export const HISTORY_NATIVE_STRUCTURED_CLAIM_GENERATOR_V36 =
  "history-native-structured-claim-generator.v2" as const;
export const HISTORY_NATIVE_STRUCTURED_CLAIM_SIDECAR_V36 =
  "history-native-structured-claim-sidecar.v2" as const;

const geographicEntityTypes = new Set(["state", "place", "region", "water-body", "island"]);

export type NativeStructuredParticipantDraftV36 =
  | {
      readonly kind: "canonical-entity";
      readonly entityMentionId?: string;
      readonly canonicalLabel?: string;
    }
  | {
      readonly kind: "claim-concept";
      readonly label: string;
    };

export interface NativeStructuredPropositionDraftV36 {
  readonly sourceText: string;
  readonly participants: Readonly<Record<string, NativeStructuredParticipantDraftV36>>;
  readonly subject: string;
  readonly predicate: StructuredPredicateV36;
  readonly object?: string;
  readonly roles: readonly {
    readonly role: StructuredSemanticRoleNameV36;
    readonly participant: string;
  }[];
  readonly assertionStatus: StructuredAssertionStatusV36;
  readonly qualifiers?: readonly StructuredQualifierV36[];
  readonly processSteps?: readonly {
    readonly participant: string;
    readonly stepOrder: number;
  }[];
}

export interface NativeStructuredClaimProposalV36 {
  /** Stable canonical narration-unit authority supplied to the claim boundary. */
  readonly narrationUnitId: string;
  readonly propositions: readonly NativeStructuredPropositionDraftV36[];
}

export interface NativeStructuredClaimSourceV36 {
  readonly episodeId: string;
  readonly claims: readonly NativeCanonicalClaimV36[];
  readonly entities: readonly NativeCanonicalEntityV36[];
}

export interface NativeCanonicalClaimV36 {
  readonly id: string;
  readonly episodeId: string;
  readonly narrationUnitIds: readonly string[];
  readonly narrationSpans: readonly { readonly startUtf16: number; readonly endUtf16Exclusive: number }[];
  readonly normalizedProposition: string;
  readonly schemaVersion: string;
}

export interface NativeCanonicalEntityV36 {
  readonly id: string;
  readonly claimId: string;
  readonly normalizedLabel: string;
  readonly entityType: string;
  readonly semanticRole?: string;
}

export interface NativeStructuredClaimGenerationResultV36 {
  readonly schemaVersion: typeof HISTORY_STRUCTURED_CLAIM_SCHEMA_V36;
  readonly episodeId: string;
  readonly envelopes: readonly StructuredClaimEnvelopeV36[];
  readonly diagnostics: readonly StructuredClaimDiagnosticV36[];
}

export interface NativeStructuredClaimCacheIdentityV36 {
  readonly fingerprint: string;
  readonly structuredSchemaVersion: typeof HISTORY_STRUCTURED_CLAIM_SCHEMA_V36;
  readonly generatorVersion: typeof HISTORY_NATIVE_STRUCTURED_CLAIM_GENERATOR_V36;
  readonly providerIdentity: string | null;
  readonly modelIdentity: string | null;
}

export interface NativeStructuredClaimSidecarV36 {
  readonly sidecarVersion: typeof HISTORY_NATIVE_STRUCTURED_CLAIM_SIDECAR_V36;
  readonly episodeId: string;
  readonly cache: NativeStructuredClaimCacheIdentityV36;
  readonly structuredClaims: NativeStructuredClaimGenerationResultV36;
}

const identifierSchema = z.string().trim().min(1).max(256);
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/u);

export const nativeStructuredClaimSidecarSchemaV36 = z.object({
  sidecarVersion: z.literal(HISTORY_NATIVE_STRUCTURED_CLAIM_SIDECAR_V36),
  episodeId: identifierSchema,
  cache: z.object({
    fingerprint: hashSchema,
    structuredSchemaVersion: z.literal(HISTORY_STRUCTURED_CLAIM_SCHEMA_V36),
    generatorVersion: z.literal(HISTORY_NATIVE_STRUCTURED_CLAIM_GENERATOR_V36),
    providerIdentity: z.string().trim().min(1).nullable(),
    modelIdentity: z.string().trim().min(1).nullable(),
  }).strict(),
  structuredClaims: structuredClaimArtifactSchemaV36,
}).strict();

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function hash(value: unknown): string {
  return createHash("sha256").update(stable(value)).digest("hex");
}

function sourceClaimsForProposals(
  source: NativeStructuredClaimSourceV36,
  proposals: readonly NativeStructuredClaimProposalV36[]
): readonly NativeCanonicalClaimV36[] {
  const unitIds = new Set(proposals.map((proposal) => proposal.narrationUnitId));
  return source.claims
    .filter((claim) => claim.narrationUnitIds.some((unitId) => unitIds.has(unitId)))
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function nativeStructuredClaimCacheFingerprintV36(input: {
  readonly source: NativeStructuredClaimSourceV36;
  readonly proposals: readonly NativeStructuredClaimProposalV36[];
  readonly providerIdentity?: string | null;
  readonly modelIdentity?: string | null;
}): string {
  const claims = sourceClaimsForProposals(input.source, input.proposals);
  const claimIds = new Set(claims.map((claim) => claim.id));
  const bindings = input.source.entities
    .filter((entity) => claimIds.has(entity.claimId))
    .map((entity) => ({
      id: entity.id,
      claimId: entity.claimId,
      normalizedLabel: entity.normalizedLabel,
      entityType: entity.entityType,
      semanticRole: entity.semanticRole,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
  return hash({
    episodeId: input.source.episodeId,
    claims: claims.map((claim) => ({
      id: claim.id,
      normalizedProposition: claim.normalizedProposition,
      narrationUnitIds: claim.narrationUnitIds,
      narrationSpans: claim.narrationSpans,
      schemaVersion: claim.schemaVersion,
    })),
    bindings,
    proposals: input.proposals,
    structuredSchemaVersion: HISTORY_STRUCTURED_CLAIM_SCHEMA_V36,
    generatorVersion: HISTORY_NATIVE_STRUCTURED_CLAIM_GENERATOR_V36,
    providerIdentity: input.providerIdentity ?? null,
    modelIdentity: input.modelIdentity ?? null,
  });
}

function diagnostic(
  claimId: string,
  code: StructuredClaimDiagnosticV36["code"],
  message: string,
  affectedIds: readonly string[] = []
): StructuredClaimDiagnosticV36 {
  return { code, claimId: claimIdV36(claimId), message, affectedIds };
}

function canonicalEntityParticipant(
  claimId: string,
  draft: Extract<NativeStructuredParticipantDraftV36, { readonly kind: "canonical-entity" }>,
  entities: readonly NativeCanonicalEntityV36[]
): StructuredParticipantV36 | null {
  const local = entities.filter((entity) => entity.claimId === claimId);
  const matches = draft.entityMentionId
    ? local.filter((entity) => entity.id === draft.entityMentionId)
    : local.filter((entity) => entity.normalizedLabel === draft.canonicalLabel);
  if (matches.length !== 1) return null;
  const entity = matches[0]!;
  return {
    id: entityIdV36(entity.id),
    label: entity.normalizedLabel,
    kind: geographicEntityTypes.has(entity.entityType) ? "place" : "entity",
    binding: { kind: "canonical-entity", referenceId: entityIdV36(entity.id) },
  };
}

function participant(
  claimId: string,
  draft: NativeStructuredParticipantDraftV36,
  entities: readonly NativeCanonicalEntityV36[]
): StructuredParticipantV36 | null {
  if (draft.kind === "canonical-entity") {
    return canonicalEntityParticipant(claimId, draft, entities);
  }
  const label = draft.label.trim().replaceAll(/\s+/gu, " ");
  if (!label) return null;
  const id = atomicConceptIdV36(label);
  return {
    id,
    label,
    kind: "concept",
    binding: { kind: "claim-concept", referenceId: id },
  };
}

function sourceSpan(
  claim: NativeCanonicalClaimV36,
  exactText: string
) {
  const claimSpan = claim.narrationSpans[0];
  const offset = claim.normalizedProposition.indexOf(exactText);
  if (!claimSpan || claim.narrationSpans.length !== 1 || offset < 0) return null;
  const startUtf16 = claimSpan.startUtf16 + offset;
  const endUtf16Exclusive = startUtf16 + exactText.length;
  if (endUtf16Exclusive > claimSpan.endUtf16Exclusive) return null;
  return {
    startUtf16,
    endUtf16Exclusive,
    text: exactText,
    textHash: structuredSourceTextHashV36(exactText),
  };
}

function materializeProposition(input: {
  readonly claim: NativeCanonicalClaimV36;
  readonly entities: readonly NativeCanonicalEntityV36[];
  readonly draft: NativeStructuredPropositionDraftV36;
  readonly diagnostics: StructuredClaimDiagnosticV36[];
}) {
  if (input.draft.predicate === "process-sequence") {
    if (!input.draft.processSteps || input.draft.processSteps.length < 2) {
      input.diagnostics.push(diagnostic(
        input.claim.id,
        "STRUCTURED_PROCESS_INSUFFICIENT_STEPS",
        "Native process semantics require at least two explicit ordered steps."
      ));
      return null;
    }
    const orders = input.draft.processSteps.map((step) => step.stepOrder).sort((left, right) => left - right);
    if (orders.some((order, index) => order !== index + 1)) {
      input.diagnostics.push(diagnostic(
        input.claim.id,
        "STRUCTURED_PROCESS_ORDER_AMBIGUOUS",
        "Native process step order must be unique and contiguous from one."
      ));
      return null;
    }
  }
  const resolved = new Map<string, StructuredParticipantV36>();
  for (const [key, draft] of Object.entries(input.draft.participants)) {
    const value = participant(input.claim.id, draft, input.entities);
    if (!value) {
      input.diagnostics.push(diagnostic(
        input.claim.id,
        "STRUCTURED_CLAIM_PARTICIPANT_UNRESOLVED",
        `Native participant '${key}' did not resolve uniquely inside the canonical claim.`,
        [key]
      ));
      return null;
    }
    resolved.set(key, value);
  }
  const subject = resolved.get(input.draft.subject);
  const object = input.draft.object ? resolved.get(input.draft.object) : undefined;
  const roles = input.draft.roles.map((role) => ({
    role: role.role,
    participant: resolved.get(role.participant),
  }));
  const processSteps = input.draft.processSteps?.map((step) => ({
    participant: resolved.get(step.participant),
    stepOrder: step.stepOrder,
  }));
  if (!subject || (input.draft.object && !object) || roles.some((role) => !role.participant) || processSteps?.some((step) => !step.participant)) {
    input.diagnostics.push(diagnostic(
      input.claim.id,
      "STRUCTURED_CLAIM_PARTICIPANT_UNRESOLVED",
      "Native proposition roles referenced an undeclared participant key.",
      [...new Set([input.draft.subject, input.draft.object, ...input.draft.roles.map((role) => role.participant), ...(input.draft.processSteps?.map((step) => step.participant) ?? [])].filter((value): value is string => Boolean(value)))]
    ));
    return null;
  }
  const span = sourceSpan(input.claim, input.draft.sourceText);
  if (!span) {
    input.diagnostics.push(diagnostic(
      input.claim.id,
      "STRUCTURED_CLAIM_SOURCE_SPAN_INVALID",
      "Native proposition source text did not map exactly inside the canonical claim span."
    ));
    return null;
  }
  try {
    return createStructuredPropositionV36({
      subject,
      predicate: input.draft.predicate,
      ...(object ? { object } : {}),
      roles: roles.map((role) => ({ role: role.role, participant: role.participant! })),
      assertionStatus: input.draft.assertionStatus,
      ...(input.draft.qualifiers?.length ? { qualifiers: input.draft.qualifiers } : {}),
      ...(processSteps?.length ? {
        processSteps: processSteps.map((step) => ({ participant: step.participant!, stepOrder: step.stepOrder })),
      } : {}),
      sourceSpan: span,
      provenance: {
        structuredSchemaVersion: HISTORY_STRUCTURED_CLAIM_SCHEMA_V36,
        episodeId: episodeIdV36(input.claim.episodeId),
        claimId: claimIdV36(input.claim.id),
        generationMethod: "native-structured-claim-generation",
        generatorVersion: HISTORY_NATIVE_STRUCTURED_CLAIM_GENERATOR_V36,
        participantBindingReferences: [...new Set([...resolved.values()].flatMap((value) =>
          value.binding.referenceId ? [value.binding.referenceId] : []
        ))].sort((left, right) => left.localeCompare(right)),
      },
    });
  } catch (error) {
    const code = input.draft.predicate === "process-sequence"
      ? "STRUCTURED_PROCESS_ORDER_AMBIGUOUS"
      : input.draft.predicate === "precedes"
        ? "STRUCTURED_TEMPORAL_ORDER_AMBIGUOUS"
        : "STRUCTURED_CLAIM_UNSUPPORTED_SEMANTICS";
    input.diagnostics.push(diagnostic(
      input.claim.id,
      code,
      `Native proposition failed the accepted V3.6 runtime contract: ${(error as Error).message}`
    ));
    return null;
  }
}

/**
 * Authoritative native adapter adjacent to canonical claim generation. It consumes
 * typed semantics keyed by narration-unit authority before persistence and creates
 * only the accepted V3.6 sidecar; HistoryClaimV34 remains the sole claim authority.
 */
export function generateNativeStructuredClaimsV36(input: {
  readonly source: NativeStructuredClaimSourceV36;
  readonly proposals: readonly NativeStructuredClaimProposalV36[];
}): NativeStructuredClaimGenerationResultV36 {
  const diagnostics: StructuredClaimDiagnosticV36[] = [];
  const proposalsByUnit = new Map<string, NativeStructuredClaimProposalV36[]>();
  for (const proposal of input.proposals) {
    const current = proposalsByUnit.get(proposal.narrationUnitId) ?? [];
    current.push(proposal);
    proposalsByUnit.set(proposal.narrationUnitId, current);
  }
  const envelopes: StructuredClaimEnvelopeV36[] = [];
  for (const claim of input.source.claims) {
    const proposals = claim.narrationUnitIds.flatMap((unitId) => proposalsByUnit.get(unitId) ?? []);
    if (!proposals.length) continue;
    const propositions = proposals
      .flatMap((proposal) => proposal.propositions)
      .map((draft) => materializeProposition({ claim, entities: input.source.entities, draft, diagnostics }))
      .filter((value): value is NonNullable<typeof value> => value !== null);
    if (!propositions.length) continue;
    envelopes.push(createNativeStructuredClaimEnvelopeV36({
      episodeId: input.source.episodeId,
      claimId: claim.id,
      canonicalClaimSchemaVersion: claim.schemaVersion,
      propositions,
    }));
  }
  const knownUnitIds = new Set(input.source.claims.flatMap((claim) => claim.narrationUnitIds));
  for (const proposal of input.proposals) {
    if (!knownUnitIds.has(proposal.narrationUnitId)) {
      diagnostics.push(diagnostic(
        `missing-${hash(proposal.narrationUnitId).slice(0, 24)}`,
        "STRUCTURED_CLAIM_UNSUPPORTED_SEMANTICS",
        "Native proposal referenced a narration unit that produced no canonical claim.",
        [proposal.narrationUnitId]
      ));
    }
  }
  return {
    schemaVersion: HISTORY_STRUCTURED_CLAIM_SCHEMA_V36,
    episodeId: input.source.episodeId,
    envelopes: envelopes.sort((left, right) => left.claimId.localeCompare(right.claimId)),
    diagnostics,
  };
}

export function createNativeStructuredClaimSidecarV36(input: {
  readonly source: NativeStructuredClaimSourceV36;
  readonly proposals: readonly NativeStructuredClaimProposalV36[];
  readonly providerIdentity?: string | null;
  readonly modelIdentity?: string | null;
}): NativeStructuredClaimSidecarV36 {
  const sidecar = {
    sidecarVersion: HISTORY_NATIVE_STRUCTURED_CLAIM_SIDECAR_V36,
    episodeId: input.source.episodeId,
    cache: {
      fingerprint: nativeStructuredClaimCacheFingerprintV36(input),
      structuredSchemaVersion: HISTORY_STRUCTURED_CLAIM_SCHEMA_V36,
      generatorVersion: HISTORY_NATIVE_STRUCTURED_CLAIM_GENERATOR_V36,
      providerIdentity: input.providerIdentity ?? null,
      modelIdentity: input.modelIdentity ?? null,
    },
    structuredClaims: generateNativeStructuredClaimsV36(input),
  };
  return nativeStructuredClaimSidecarSchemaV36.parse(sidecar) as unknown as NativeStructuredClaimSidecarV36;
}

export async function persistNativeStructuredClaimSidecarV36(input: {
  readonly file: string;
  readonly sidecar: NativeStructuredClaimSidecarV36;
}): Promise<{ readonly cacheHit: boolean; readonly sidecar: NativeStructuredClaimSidecarV36 }> {
  try {
    const existing = nativeStructuredClaimSidecarSchemaV36.parse(
      JSON.parse(await fs.readFile(input.file, "utf8"))
    ) as unknown as NativeStructuredClaimSidecarV36;
    if (existing.cache.fingerprint === input.sidecar.cache.fingerprint) {
      return { cacheHit: true, sidecar: existing };
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT" && !(error instanceof z.ZodError)) throw error;
  }
  await fs.mkdir(path.dirname(input.file), { recursive: true });
  const temporary = `${input.file}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(input.sidecar, null, 2)}\n`, "utf8");
  await fs.rename(temporary, input.file);
  return { cacheHit: false, sidecar: input.sidecar };
}

export interface NativeCanonicalClaimBoundaryInputV36 {
  readonly episodeId: string;
  readonly narration: CanonicalNarrationV3_3;
  readonly authorityMode?: HistorySourceAuthorityMode;
  readonly trustAttestationId?: string | null;
  readonly knownEntities?: readonly string[];
  readonly semanticProposals?: readonly {
    readonly narrationUnitId: string;
    readonly normalizedProposition?: string;
    readonly claimKind?: HistoryClaimKindV34;
    readonly materialityRecommendation?: "material" | "non_material";
    readonly entityTexts?: readonly string[];
  }[];
  readonly nativeStructuredProposals: readonly NativeStructuredClaimProposalV36[];
  readonly providerIdentity?: string | null;
  readonly modelIdentity?: string | null;
}

export function structureTrustedScriptClaimsNativeV36(
  input: NativeCanonicalClaimBoundaryInputV36
): {
  readonly canonicalClaimsV35: HistoryStructuredClaimsV34;
  readonly structuredV36: NativeStructuredClaimSidecarV36;
} {
  const canonicalClaimsV35 = structureTrustedScriptClaimsV34({
    episodeId: input.episodeId,
    narration: input.narration,
    ...(input.authorityMode ? { authorityMode: input.authorityMode } : {}),
    ...(input.trustAttestationId !== undefined ? { trustAttestationId: input.trustAttestationId } : {}),
    ...(input.knownEntities ? { knownEntities: input.knownEntities } : {}),
    ...(input.semanticProposals ? { semanticProposals: input.semanticProposals } : {}),
  });
  return {
    canonicalClaimsV35,
    structuredV36: createNativeStructuredClaimSidecarV36({
      source: { episodeId: input.episodeId, claims: canonicalClaimsV35.claims, entities: canonicalClaimsV35.entities },
      proposals: input.nativeStructuredProposals,
      providerIdentity: input.providerIdentity ?? null,
      modelIdentity: input.modelIdentity ?? null,
    }),
  };
}

export const nativeStructuredClaimCacheContractV36 = {
  sidecarFile: "structured-claims.v36.native.json",
  includes: [
    "claim text/content hash",
    "claim ID",
    "structured schema version",
    "native generator version",
    "resolved participant binding fingerprint",
    "provider identity when provider-backed",
    "model identity when provider-backed",
  ],
  invalidatesOn: [
    "claim text or ID change",
    "participant binding change",
    "structured schema change",
    "generator or prompt implementation change",
    "provider/model identity change",
  ],
  doesNotInvalidateOn: [
    "image regeneration",
    "audio regeneration",
    "render format change",
    "approval timestamp change",
  ],
  excludes: ["timestamps", "render IDs", "media hashes", "approval artifact metadata"],
} as const;
