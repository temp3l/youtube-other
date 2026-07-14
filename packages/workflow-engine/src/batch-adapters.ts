import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import {
  BATCH_SCHEMA_VERSION,
  attemptIdSchema,
  batchItemSchema,
  batchManifestSchema,
  type BatchManifest,
  type BatchItemStatus,
  type ContentProfileId,
} from "@mediaforge/domain";

import {
  createDeterministicBatchId,
  createDeterministicBatchItemId,
  type BatchExecutionConfiguration,
} from "./batch.js";
import { redactStructuredMetadata } from "./attempt-observability.js";

export const LEGACY_BATCH_ADAPTER_VERSION =
  "mediaforge.legacy-batch-adapter.v1" as const;

type RecordValue = Record<string, unknown>;

function record(value: unknown): RecordValue {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Legacy batch value must be an object.");
  }
  return value as RecordValue;
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function integer(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : fallback;
}

function sha256(value: unknown): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

function fingerprint(value: unknown): string {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value)
    ? value
    : sha256(value);
}

function identifier(value: unknown, fallback: string): string {
  const normalized = text(value, fallback)
    .toLowerCase()
    .replaceAll(/[^a-z0-9._-]+/gu, "-")
    .replaceAll(/^-+|-+$/gu, "")
    .slice(0, 150);
  return normalized.length > 0 && /^[a-z0-9]/u.test(normalized)
    ? normalized
    : fallback;
}

function locale(value: unknown): "en" | "de" | "es" | "fr" | "pt" {
  const prefix = text(value, "en").toLowerCase().slice(0, 2);
  return (["en", "de", "es", "fr", "pt"] as const).includes(prefix as never)
    ? (prefix as "en" | "de" | "es" | "fr" | "pt")
    : "en";
}

function operationId(family: string, operation: unknown): string {
  return `${identifier(family, "legacy")}.${identifier(operation, "batch")}`;
}

function taskId(family: string, operation: unknown): string {
  return `${identifier(family, "legacy")}.${identifier(operation, "item")}`;
}

function itemStatus(value: unknown): BatchItemStatus {
  const status = text(value);
  if (
    [
      "persisted",
      "skipped-cached",
      "succeeded",
      "completed",
      "imported",
    ].includes(status)
  ) {
    return "succeeded";
  }
  if (["cancelled", "cancelling"].includes(status)) return "cancelled";
  if (
    ["api-failed", "expired", "retry-required", "failed-retryable"].includes(
      status
    )
  ) {
    return "failed-retryable";
  }
  if (
    [
      "policy-rejected",
      "decode-failed",
      "validation-failed",
      "failed",
      "blocked",
      "failed-permanent",
    ].includes(status)
  ) {
    return "failed-permanent";
  }
  if (
    [
      "submitted",
      "api-succeeded",
      "running",
      "in_progress",
      "finalizing",
    ].includes(status)
  ) {
    return "running";
  }
  return "pending";
}

function status(
  items: BatchManifest["items"],
  sourceStatus: unknown
): BatchManifest["status"] {
  const source = text(sourceStatus);
  if (source === "cancelling") return "cancelling";
  if (source === "cancelled") return "cancelled";
  if (items.every((item) => item.status === "succeeded")) return "succeeded";
  if (
    items.some((item) => item.status === "succeeded") &&
    items.some((item) => item.status.startsWith("failed"))
  )
    return "partial";
  if (
    items.every(
      (item) =>
        item.status === "failed-permanent" || item.status === "failed-retryable"
    )
  )
    return "failed";
  if (
    [
      "submitted",
      "validating",
      "in_progress",
      "finalizing",
      "uploading",
      "running",
    ].includes(source)
  )
    return "running";
  return "planned";
}

function attempts(batchId: string, itemId: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) =>
    attemptIdSchema.parse(
      `attempt-${sha256({ batchId, itemId, index }).slice(0, 40)}`
    )
  );
}

function totals(items: BatchManifest["items"]): BatchManifest["totals"] {
  return {
    succeeded: items.filter((item) => item.status === "succeeded").length,
    failedRetryable: items.filter((item) => item.status === "failed-retryable")
      .length,
    failedPermanent: items.filter((item) => item.status === "failed-permanent")
      .length,
    cancelled: items.filter((item) => item.status === "cancelled").length,
    estimatedCostMicros: items.reduce(
      (sum, item) => sum + (item.cost?.estimatedMicros ?? 0),
      0
    ),
    actualCostMicros: items.reduce(
      (sum, item) => sum + (item.cost?.actualMicros ?? 0),
      0
    ),
  };
}

export function adaptLegacyBatchManifest(input: {
  readonly family: "story" | "image" | "math";
  readonly manifest: unknown;
  readonly configuration?: BatchExecutionConfiguration;
}): BatchManifest {
  const source = record(redactStructuredMetadata(input.manifest));
  const profileId: ContentProfileId =
    input.family === "math" ? "mathematics-education" : "dark-truth";
  const legacyBatchId = text(
    source["localBatchId"] ?? source["batchId"],
    `${input.family}-batch`
  );
  const providerBatchId = text(source["openAIBatchId"]);
  const sourceItems = Array.isArray(source["items"])
    ? source["items"].map(record)
    : [];
  if (sourceItems.length === 0)
    throw new Error("Legacy batch manifest has no items.");
  const canonicalItems = sourceItems.map((item, index) => {
    const identity = item["identity"] ? record(item["identity"]) : {};
    const operation =
      item["operation"] ??
      identity["operation"] ??
      source["operation"] ??
      "batch-item";
    const unitId = identifier(
      item["episodeNumber"] ?? identity["episodeId"] ?? item["skillId"],
      `${input.family}-${index + 1}`
    );
    const itemLocale = locale(item["language"] ?? identity["language"]);
    const variant =
      text(identity["variant"] ?? item["variant"]) === "short"
        ? ("short" as const)
        : ("full" as const);
    const itemFingerprint = fingerprint(
      item["configurationHash"] ??
        identity["identityHash"] ??
        item["sourceHash"] ??
        item
    );
    const id = createDeterministicBatchItemId({
      taskId: taskId(input.family, operation),
      unitId,
      locale: itemLocale,
      variant,
      fingerprint: itemFingerprint,
    });
    const resolvedStatus = itemStatus(item["status"]);
    const error = item["error"] ? record(item["error"]) : undefined;
    const usage = item["usage"] ? record(item["usage"]) : undefined;
    const estimatedUsd =
      typeof item["estimatedCostUsd"] === "number"
        ? item["estimatedCostUsd"]
        : typeof usage?.["estimatedCostUsd"] === "number"
          ? usage["estimatedCostUsd"]
          : undefined;
    const attemptCount = Math.max(
      integer(item["attempts"]),
      integer(item["retryCount"]) + (resolvedStatus === "pending" ? 0 : 1)
    );
    return batchItemSchema.parse({
      id,
      legacyItemId: text(
        item["customId"] ?? item["skillId"],
        `${legacyBatchId}:${index}`
      ),
      taskId: taskId(input.family, operation),
      unitId,
      locale: itemLocale,
      variant,
      fingerprint: itemFingerprint,
      groupKey: [
        text(source["model"], "none"),
        itemLocale,
        variant,
        text(operation, "item"),
      ].join(":"),
      status: resolvedStatus,
      attemptIds: attempts(legacyBatchId, id, attemptCount),
      ...(providerBatchId ? { providerRequestId: providerBatchId } : {}),
      ...(error?.["code"] ? { errorCode: text(error["code"]) } : {}),
      ...(error?.["message"] ? { errorMessage: text(error["message"]) } : {}),
      ...(resolvedStatus.startsWith("failed")
        ? { retryable: resolvedStatus === "failed-retryable" }
        : {}),
      cacheStatus:
        text(item["status"]) === "skipped-cached"
          ? ("hit" as const)
          : ("miss" as const),
      outputManifestIds: [],
      warnings: [],
      ...(usage
        ? {
            usage: {
              ...(typeof usage["inputTokens"] === "number"
                ? { inputTokens: usage["inputTokens"] }
                : {}),
              ...(typeof usage["cachedInputTokens"] === "number"
                ? { cachedInputTokens: usage["cachedInputTokens"] }
                : {}),
              ...(typeof usage["outputTokens"] === "number"
                ? { outputTokens: usage["outputTokens"] }
                : {}),
              ...(typeof usage["reasoningTokens"] === "number"
                ? { reasoningTokens: usage["reasoningTokens"] }
                : {}),
            },
          }
        : {}),
      ...(estimatedUsd !== undefined
        ? {
            cost: {
              estimatedMicros: Math.round(estimatedUsd * 1_000_000),
              currency: "USD" as const,
            },
          }
        : {}),
    });
  });
  const operation = operationId(
    input.family,
    sourceItems[0]?.["operation"] ?? source["category"] ?? "batch"
  );
  const id = createDeterministicBatchId({
    profileId,
    provider: text(
      source["provider"],
      input.family === "math" ? "local" : "openai"
    ),
    ...(text(source["model"]) ? { model: text(source["model"]) } : {}),
    operation,
    itemIds: canonicalItems.map((item) => item.id),
  });
  const createdAt = text(
    source["createdAt"] ?? source["updatedAt"],
    new Date(0).toISOString()
  );
  const updatedAt = text(source["updatedAt"], createdAt);
  return batchManifestSchema.parse({
    schemaVersion: BATCH_SCHEMA_VERSION,
    id,
    legacyBatchId,
    ...(providerBatchId ? { providerBatchId } : {}),
    profileId,
    provider: text(
      source["provider"],
      input.family === "math" ? "local" : "openai"
    ),
    ...(text(source["model"]) ? { model: text(source["model"]) } : {}),
    operation,
    executionMode: input.family === "math" ? "sync" : "provider-batch",
    status: status(canonicalItems, source["status"]),
    configuration: input.configuration ?? { concurrency: 1, retryLimit: 1 },
    items: canonicalItems,
    totals: totals(canonicalItems),
    ...(source["cancellationReason"]
      ? { cancellationReason: text(source["cancellationReason"]) }
      : {}),
    createdAt,
    updatedAt,
  });
}

export function canonicalBatchSidecarPath(legacyManifestPath: string): string {
  return `${legacyManifestPath}.workflow.json`;
}

export async function writeLegacyBatchSidecar(input: {
  readonly family: "story" | "image" | "math";
  readonly legacyManifestPath: string;
  readonly manifest: unknown;
  readonly configuration?: BatchExecutionConfiguration;
}): Promise<BatchManifest | undefined> {
  const source = record(input.manifest);
  if (!Array.isArray(source["items"]) || source["items"].length === 0) {
    return undefined;
  }
  const canonical = adaptLegacyBatchManifest(input);
  const target = canonicalBatchSidecarPath(input.legacyManifestPath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(
    temporary,
    `${JSON.stringify(canonical, null, 2)}\n`,
    "utf8"
  );
  await fs.rename(temporary, target);
  return canonical;
}
