import fs from "node:fs/promises";
import path from "node:path";
import { ensureDir, writeJsonAtomic } from "@mediaforge/shared";
import {
  batchRunPlanSchema,
} from "./story-workflow.schemas.js";
import {
  orchestrationStageTypes,
  storyFormats,
  stageFailureSchemaVersion,
  workflowLocales,
  type BatchItemState,
  type BatchItemStatus,
  type BatchRunPlan,
  type BatchSubmission,
  type BatchSubmissionStatus,
  type EpisodeProductionSummary,
  type OrchestrationStageType,
  type OrchestrationStatus,
  type ProductionStageSummary,
  type StageFailure,
  type StageStatus,
  type StoryFormat,
  type WorkflowLocale,
  type WorkflowManifest,
  type ArtifactLineage,
} from "./story-workflow.types.js";

export interface BatchReconciliationResult {
  readonly submission: BatchSubmission;
  readonly completedItemCount: number;
  readonly failedItemCount: number;
  readonly retryableItems: readonly BatchItemState[];
}

type LocalBatchManifestStatus =
  | "prepared"
  | "uploading"
  | "submitted"
  | "validating"
  | "in_progress"
  | "finalizing"
  | "completed"
  | "failed"
  | "expired"
  | "cancelling"
  | "cancelled"
  | "imported"
  | "imported_with_failures";

type LocalBatchManifestItemStatus =
  | "planned"
  | "submitted"
  | "api-succeeded"
  | "api-failed"
  | "expired"
  | "schema-invalid"
  | "content-invalid"
  | "validation-failed"
  | "repair-required"
  | "preflight-failed"
  | "persisted"
  | "skipped-cached";

type ImageBatchItemStatus =
  | "planned"
  | "submitted"
  | "api-succeeded"
  | "api-failed"
  | "expired"
  | "policy-rejected"
  | "decode-failed"
  | "validation-failed"
  | "persisted"
  | "skipped-cached"
  | "retry-required";

export type BatchProviderItemStatus =
  | LocalBatchManifestItemStatus
  | ImageBatchItemStatus;

const episodeIdPattern = /^[a-z0-9][a-z0-9-]*$/u;
const hash8Pattern = /^[a-f0-9]{8}$/u;
const hash12Pattern = /^[a-f0-9]{12}$/u;
const fingerprintPattern = /^[a-f0-9]{8,128}$/u;
const retrySuffixPattern = /^retry-r([1-9]\d*)$/u;
const legacyRetrySuffixPattern = /^r([1-9]\d*)$/u;

const textBatchOperations = [
  "canonical-english-full",
  "canonical-facts",
  "english-short",
  "localization",
  "character-analysis",
  "visual-analysis",
  "repair",
] as const;

const imageAssetRoles = [
  "full-scene",
  "short-scene",
  "character-reference",
  "location-reference",
  "object-reference",
  "continuity-asset",
  "thumbnail",
] as const;

const imageOperations = [
  "generation",
  "edit",
  "deterministic-transform",
] as const;

const imageSubjectKinds = [
  "scene",
  "shot",
  "character",
  "location",
  "object",
  "continuity",
  "thumbnail",
] as const;

export class CustomIdValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CustomIdValidationError";
  }
}

export type ParsedBatchCustomId =
  | {
      readonly kind: "orchestration";
      readonly customId: string;
      readonly originalCustomId: string;
      readonly retryNumber?: number;
      readonly stageType: OrchestrationStageType;
      readonly episodeId: string;
      readonly locale: WorkflowLocale;
      readonly format: StoryFormat;
      readonly subject: string;
      readonly fingerprint: string;
    }
  | {
      readonly kind: "legacy-text";
      readonly customId: string;
      readonly originalCustomId: string;
      readonly retryNumber?: number;
      readonly stageType: OrchestrationStageType;
      readonly episodeNumber: string;
      readonly operation: (typeof textBatchOperations)[number];
      readonly locale: WorkflowLocale;
      readonly format: StoryFormat;
      readonly sourceHashPrefix: string;
      readonly configurationHashPrefix: string;
    }
  | {
      readonly kind: "legacy-image";
      readonly customId: string;
      readonly originalCustomId: string;
      readonly retryNumber?: number;
      readonly stageType: OrchestrationStageType;
      readonly episodeId: string;
      readonly locale: WorkflowLocale;
      readonly format: StoryFormat;
      readonly assetRole: (typeof imageAssetRoles)[number];
      readonly operation: (typeof imageOperations)[number];
      readonly subjectKind: (typeof imageSubjectKinds)[number];
      readonly subjectId: string;
      readonly identityHashPrefix: string;
    };

export function mapWorkflowStageStatusToOrchestrationStatus(
  status: StageStatus
): OrchestrationStatus {
  switch (status) {
    case "planned":
      return "planned";
    case "running":
      return "running";
    case "succeeded":
      return "succeeded";
    case "failed":
      return "failed";
    case "blocked":
      return "blocked";
    case "skipped":
      return "skipped";
    case "cancelled":
      return "cancelled";
    case "cached":
      return "cached";
    default:
      return assertNever(status);
  }
}

export function mapWorkflowBatchStatusToOrchestrationStatus(
  status: BatchSubmissionStatus
): OrchestrationStatus {
  switch (status) {
    case "planned":
      return "planned";
    case "submitted":
      return "running";
    case "completed":
      return "succeeded";
    case "failed":
      return "failed";
    case "expired":
      return "expired";
    case "cancelled":
      return "cancelled";
    case "imported":
      return "imported";
    case "imported_with_failures":
      return "partial";
    default:
      return assertNever(status);
  }
}

export function mapWorkflowBatchItemStatusToOrchestrationStatus(
  status: BatchItemStatus
): OrchestrationStatus {
  switch (status) {
    case "planned":
      return "planned";
    case "submitted":
      return "running";
    case "completed":
    case "persisted":
      return "succeeded";
    case "failed":
    case "schema-invalid":
      return "failed";
    case "expired":
      return "expired";
    case "cancelled":
      return "cancelled";
    case "skipped-cached":
      return "cached";
    default:
      return assertNever(status);
  }
}

export function mapBatchManifestStatusToOrchestrationStatus(
  status: LocalBatchManifestStatus
): OrchestrationStatus {
  switch (status) {
    case "prepared":
      return "planned";
    case "uploading":
    case "submitted":
    case "validating":
    case "in_progress":
    case "finalizing":
    case "cancelling":
      return "running";
    case "completed":
      return "succeeded";
    case "failed":
      return "failed";
    case "expired":
      return "expired";
    case "cancelled":
      return "cancelled";
    case "imported":
      return "imported";
    case "imported_with_failures":
      return "partial";
    default:
      return assertNever(status);
  }
}

export function mapBatchProviderItemStatusToOrchestrationStatus(
  status: BatchProviderItemStatus
): OrchestrationStatus {
  switch (status) {
    case "planned":
      return "planned";
    case "submitted":
      return "running";
    case "api-succeeded":
    case "persisted":
      return "succeeded";
    case "skipped-cached":
      return "cached";
    case "expired":
      return "expired";
    case "api-failed":
    case "schema-invalid":
    case "content-invalid":
    case "validation-failed":
    case "repair-required":
    case "preflight-failed":
    case "policy-rejected":
    case "decode-failed":
    case "retry-required":
      return "failed";
    default:
      return assertNever(status);
  }
}

export function buildEpisodeProductionSummary(
  manifest: WorkflowManifest<ArtifactLineage>
): EpisodeProductionSummary {
  const stages: ProductionStageSummary[] = manifest.stages.map((stage) => ({
    stageType: stage.stageType,
    ...(stage.locale ? { locale: stage.locale } : {}),
    ...(stage.format ? { format: stage.format } : {}),
    status: mapWorkflowStageStatusToOrchestrationStatus(stage.status),
    sourceStageId: stage.stageId,
    ...(stage.latestCompletedAt ? { updatedAt: stage.latestCompletedAt } : {}),
  }));
  const stageCounts: Partial<Record<OrchestrationStatus, number>> = {};
  for (const stage of stages) {
    stageCounts[stage.status] = (stageCounts[stage.status] ?? 0) + 1;
  }
  return {
    schemaVersion: "production-summary-v1",
    episodeId: manifest.episodeId,
    workflowId: manifest.workflowId,
    executionId: manifest.executionId,
    status: summarizeOrchestrationStatus(stages.map((stage) => stage.status)),
    stageCounts,
    stages,
    activeCustomIds: manifest.batches.flatMap((batch) =>
      batch.items
        .filter((item) => item.status === "planned" || item.status === "submitted")
        .map((item) => item.customId)
    ),
    failedCustomIds: manifest.batches.flatMap((batch) =>
      batch.items
        .filter((item) => item.status === "failed" || item.status === "schema-invalid")
        .map((item) => item.customId)
    ),
    updatedAt: manifest.updatedAt,
  };
}

export function buildOrchestrationCustomId(args: {
  readonly stageType: OrchestrationStageType;
  readonly episodeId: string;
  readonly locale: WorkflowLocale;
  readonly format: StoryFormat;
  readonly subject: string;
  readonly fingerprint: string;
  readonly retryNumber?: number;
}): string {
  const customId = [
    "dte",
    "v1",
    args.stageType,
    args.episodeId,
    args.locale,
    args.format,
    encodeSegment(args.subject),
    args.fingerprint,
  ].join(":");
  const withRetry =
    args.retryNumber === undefined ? customId : `${customId}:retry-r${args.retryNumber}`;
  return parseBatchCustomId(withRetry).customId;
}

export function parseBatchCustomId(customId: string): ParsedBatchCustomId {
  const trimmed = customId.trim();
  if (trimmed.length === 0 || trimmed !== customId) {
    throw new CustomIdValidationError("custom_id must be non-empty and unpadded.");
  }
  const { baseParts, originalCustomId, retryNumber } = splitRetrySuffix(trimmed);
  if (baseParts[0] === "dte" && baseParts[1] === "v1") {
    return parseOrchestrationCustomId(trimmed, originalCustomId, retryNumber, baseParts);
  }
  if (baseParts[0] === "dte-img") {
    return parseLegacyImageCustomId(trimmed, originalCustomId, retryNumber, baseParts);
  }
  if (baseParts[0] === "dte") {
    return parseLegacyTextCustomId(trimmed, originalCustomId, retryNumber, baseParts);
  }
  throw new CustomIdValidationError(`Unsupported custom_id prefix: ${baseParts[0] ?? ""}`);
}

export function validateBatchCustomId(customId: string): string {
  return parseBatchCustomId(customId).customId;
}

export function assertUniqueBatchCustomIds(
  items: readonly { readonly customId: string }[]
): void {
  const seen = new Set<string>();
  for (const item of items) {
    validateBatchCustomId(item.customId);
    if (seen.has(item.customId)) {
      throw new CustomIdValidationError(`Duplicate custom_id: ${item.customId}`);
    }
    seen.add(item.customId);
  }
}

export function resolveBatchRunDirectory(args: {
  readonly workspaceRoot: string;
  readonly runId: string;
}): string {
  validateRunId(args.runId);
  return path.join(args.workspaceRoot, "batches", args.runId);
}

export function resolveBatchRunPlanPath(args: {
  readonly workspaceRoot: string;
  readonly runId: string;
}): string {
  return path.join(resolveBatchRunDirectory(args), "batch-plan.json");
}

export async function saveBatchRunPlan(args: {
  readonly workspaceRoot: string;
  readonly plan: BatchRunPlan;
}): Promise<BatchRunPlan> {
  const parsed = batchRunPlanSchema.parse(args.plan) as BatchRunPlan;
  assertUniqueBatchCustomIds(parsed.items);
  const runDir = resolveBatchRunDirectory({
    workspaceRoot: args.workspaceRoot,
    runId: parsed.runId,
  });
  await ensureDir(runDir);
  await writeJsonAtomic(path.join(runDir, "batch-plan.json"), parsed);
  return parsed;
}

export async function loadBatchRunPlan(args: {
  readonly workspaceRoot: string;
  readonly runId: string;
}): Promise<BatchRunPlan | null> {
  const planPath = resolveBatchRunPlanPath(args);
  let raw: string;
  try {
    raw = await fs.readFile(planPath, "utf8");
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
  const parsed = batchRunPlanSchema.parse(JSON.parse(raw) as unknown) as BatchRunPlan;
  assertUniqueBatchCustomIds(parsed.items);
  return parsed;
}

function itemFailure(message: string): StageFailure {
  return {
    schemaVersion: stageFailureSchemaVersion,
    category: "rewrite-provider-failure",
    retryability: "retryable",
    message,
    occurredAt: new Date().toISOString(),
  };
}

export function reconcileWorkflowBatch(
  submission: BatchSubmission
): BatchReconciliationResult {
  const items = submission.items.map((item) =>
    submission.status === "expired" ||
    submission.status === "cancelled" ||
    submission.status === "failed"
      ? {
          ...item,
          status: "failed" as const,
          failure: item.failure ?? itemFailure(`Batch ${submission.status}.`),
        }
      : item
  );
  const nextSubmission: BatchSubmission = {
    ...submission,
    items,
  };
  return {
    submission: nextSubmission,
    completedItemCount: items.filter((item) =>
      item.status === "completed" || item.status === "persisted"
    ).length,
    failedItemCount: items.filter((item) =>
      item.status === "failed" || item.status === "schema-invalid"
    ).length,
    retryableItems: items.filter(
      (item) => item.failure?.retryability === "retryable"
    ),
  };
}

function summarizeOrchestrationStatus(
  statuses: readonly OrchestrationStatus[]
): OrchestrationStatus {
  if (statuses.length === 0) {
    return "planned";
  }
  if (statuses.includes("failed")) {
    return statuses.some((status) => status === "succeeded" || status === "cached" || status === "imported")
      ? "partial"
      : "failed";
  }
  if (statuses.includes("blocked")) {
    return statuses.some((status) => status === "succeeded" || status === "cached" || status === "imported")
      ? "partial"
      : "blocked";
  }
  if (statuses.includes("expired")) {
    return "expired";
  }
  if (statuses.includes("cancelled")) {
    return "cancelled";
  }
  if (statuses.includes("partial")) {
    return "partial";
  }
  if (statuses.includes("running")) {
    return "running";
  }
  if (statuses.every((status) => status === "cached")) {
    return "cached";
  }
  if (statuses.every((status) => status === "succeeded" || status === "cached" || status === "imported")) {
    return "succeeded";
  }
  if (statuses.every((status) => status === "skipped")) {
    return "skipped";
  }
  return "planned";
}

function splitRetrySuffix(customId: string): {
  readonly baseParts: readonly string[];
  readonly originalCustomId: string;
  readonly retryNumber?: number;
} {
  const parts = customId.split(":");
  const last = parts.at(-1);
  const retryMatch = last?.match(retrySuffixPattern);
  const legacyRetryMatch = last?.match(legacyRetrySuffixPattern);
  if (retryMatch || legacyRetryMatch) {
    const match = retryMatch ?? legacyRetryMatch;
    const retryNumber = Number(match?.[1]);
    const baseParts = parts.slice(0, -1);
    return {
      baseParts,
      originalCustomId: baseParts.join(":"),
      retryNumber,
    };
  }
  return { baseParts: parts, originalCustomId: customId };
}

function parseOrchestrationCustomId(
  customId: string,
  originalCustomId: string,
  retryNumber: number | undefined,
  parts: readonly string[]
): ParsedBatchCustomId {
  if (parts.length !== 8) {
    throw new CustomIdValidationError(
      "Invalid orchestration custom_id. Expected dte:v1:<stage>:<episode>:<language>:<profile>:<subject>:<fingerprint>."
    );
  }
  const [, , stageType, episodeId, locale, format, subject, fingerprint] = parts;
  assertStageType(stageType);
  assertEpisodeId(episodeId);
  assertLocale(locale);
  assertFormat(format);
  assertFingerprint(fingerprint);
  return {
    kind: "orchestration",
    customId,
    originalCustomId,
    ...(retryNumber !== undefined ? { retryNumber } : {}),
    stageType,
    episodeId,
    locale,
    format,
    subject: decodeSegment(subject, "subject"),
    fingerprint,
  };
}

function parseLegacyTextCustomId(
  customId: string,
  originalCustomId: string,
  retryNumber: number | undefined,
  parts: readonly string[]
): ParsedBatchCustomId {
  if (parts.length !== 6) {
    throw new CustomIdValidationError(
      "Invalid legacy text custom_id. Expected dte:<episode>:<operation>:<language>:<sourceHash8>:<configurationHash8>."
    );
  }
  const [, episodeNumber, operation, locale, sourceHashPrefix, configurationHashPrefix] = parts;
  assertNonEmpty(episodeNumber, "episode number");
  assertTextOperation(operation);
  assertLocale(locale);
  assertHash8(sourceHashPrefix, "source hash");
  assertHash8(configurationHashPrefix, "configuration hash");
  return {
    kind: "legacy-text",
    customId,
    originalCustomId,
    ...(retryNumber !== undefined ? { retryNumber } : {}),
    stageType: stageTypeForTextOperation(operation),
    episodeNumber,
    operation,
    locale,
    format: formatForTextOperation(operation),
    sourceHashPrefix,
    configurationHashPrefix,
  };
}

function parseLegacyImageCustomId(
  customId: string,
  originalCustomId: string,
  retryNumber: number | undefined,
  parts: readonly string[]
): ParsedBatchCustomId {
  if (parts.length !== 10 || parts[1] !== "v2") {
    throw new CustomIdValidationError(
      "Invalid legacy image custom_id. Expected dte-img:v2:<episode>:<language>:<profile>:<assetRole>:<operation>:<subjectKind>:<subjectId>:<hash12>."
    );
  }
  const [
    ,
    ,
    episodeId,
    locale,
    format,
    assetRole,
    operation,
    subjectKind,
    subjectId,
    identityHashPrefix,
  ] = parts;
  assertEpisodeId(episodeId);
  assertLocale(locale);
  assertFormat(format);
  assertImageAssetRole(assetRole);
  assertImageOperation(operation);
  assertImageSubjectKind(subjectKind);
  assertHash12(identityHashPrefix, "identity hash");
  return {
    kind: "legacy-image",
    customId,
    originalCustomId,
    ...(retryNumber !== undefined ? { retryNumber } : {}),
    stageType: assetRole === "thumbnail" ? "thumbnail" : "image-generation",
    episodeId,
    locale,
    format,
    assetRole,
    operation,
    subjectKind,
    subjectId: decodeSegment(subjectId, "subject id"),
    identityHashPrefix,
  };
}

function formatForTextOperation(
  operation: (typeof textBatchOperations)[number]
): StoryFormat {
  return operation === "english-short" ? "short" : "full";
}

function stageTypeForTextOperation(
  operation: (typeof textBatchOperations)[number]
): OrchestrationStageType {
  switch (operation) {
    case "canonical-english-full":
    case "repair":
      return "rewrite-full";
    case "canonical-facts":
      return "ingest-source";
    case "english-short":
      return "rewrite-short";
    case "localization":
      return "localize-full";
    case "character-analysis":
    case "visual-analysis":
      return "visual-model";
    default:
      return assertNever(operation);
  }
}

function encodeSegment(value: string): string {
  assertNonEmpty(value, "custom_id segment");
  return encodeURIComponent(value);
}

function decodeSegment(value: string | undefined, label: string): string {
  assertNonEmpty(value, label);
  try {
    const decoded = decodeURIComponent(value);
    assertNonEmpty(decoded, label);
    return decoded;
  } catch (error) {
    throw new CustomIdValidationError(`Invalid encoded ${label}.`);
  }
}

function validateRunId(runId: string): void {
  if (!/^[a-z0-9][a-z0-9._-]*$/u.test(runId)) {
    throw new CustomIdValidationError(`Invalid run id: ${runId}`);
  }
}

function assertEpisodeId(value: string | undefined): asserts value is string {
  if (!value || !episodeIdPattern.test(value)) {
    throw new CustomIdValidationError(`Invalid episode id: ${value ?? ""}`);
  }
}

function assertLocale(value: string | undefined): asserts value is WorkflowLocale {
  if (!value || !workflowLocales.includes(value as WorkflowLocale)) {
    throw new CustomIdValidationError(`Unsupported language: ${value ?? ""}`);
  }
}

function assertFormat(value: string | undefined): asserts value is StoryFormat {
  if (!value || !storyFormats.includes(value as StoryFormat)) {
    throw new CustomIdValidationError(`Unsupported profile: ${value ?? ""}`);
  }
}

function assertStageType(
  value: string | undefined
): asserts value is OrchestrationStageType {
  if (!value || !orchestrationStageTypes.includes(value as OrchestrationStageType)) {
    throw new CustomIdValidationError(`Unsupported stage: ${value ?? ""}`);
  }
}

function assertTextOperation(
  value: string | undefined
): asserts value is (typeof textBatchOperations)[number] {
  if (!value || !textBatchOperations.includes(value as (typeof textBatchOperations)[number])) {
    throw new CustomIdValidationError(`Unsupported text batch operation: ${value ?? ""}`);
  }
}

function assertImageAssetRole(
  value: string | undefined
): asserts value is (typeof imageAssetRoles)[number] {
  if (!value || !imageAssetRoles.includes(value as (typeof imageAssetRoles)[number])) {
    throw new CustomIdValidationError(`Unsupported image asset role: ${value ?? ""}`);
  }
}

function assertImageOperation(
  value: string | undefined
): asserts value is (typeof imageOperations)[number] {
  if (!value || !imageOperations.includes(value as (typeof imageOperations)[number])) {
    throw new CustomIdValidationError(`Unsupported image operation: ${value ?? ""}`);
  }
}

function assertImageSubjectKind(
  value: string | undefined
): asserts value is (typeof imageSubjectKinds)[number] {
  if (!value || !imageSubjectKinds.includes(value as (typeof imageSubjectKinds)[number])) {
    throw new CustomIdValidationError(`Unsupported image subject kind: ${value ?? ""}`);
  }
}

function assertFingerprint(value: string | undefined): asserts value is string {
  if (!value || !fingerprintPattern.test(value)) {
    throw new CustomIdValidationError(`Invalid fingerprint: ${value ?? ""}`);
  }
}

function assertHash8(value: string | undefined, label: string): asserts value is string {
  if (!value || !hash8Pattern.test(value)) {
    throw new CustomIdValidationError(`Invalid ${label}: ${value ?? ""}`);
  }
}

function assertHash12(value: string | undefined, label: string): asserts value is string {
  if (!value || !hash12Pattern.test(value)) {
    throw new CustomIdValidationError(`Invalid ${label}: ${value ?? ""}`);
  }
}

function assertNonEmpty(value: string | undefined, label: string): asserts value is string {
  if (!value || value.length === 0) {
    throw new CustomIdValidationError(`Missing ${label}.`);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled value: ${String(value)}`);
}
