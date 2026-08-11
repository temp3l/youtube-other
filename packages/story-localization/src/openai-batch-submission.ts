import path from "node:path";
import { z } from "zod";
import {
  ensureDir,
  readJsonIfExists,
  writeJsonAtomic,
  type BatchRequestSetFingerprint,
  type BatchSubmissionKey,
} from "@mediaforge/shared";
import type { OpenAiStoryClient } from "./story-localization-openai-batch.js";

export const OPENAI_BATCH_SUBMISSION_METADATA_KEY =
  "mediaforge_submission_key";

export const openAiBatchSubmissionIntentSchema = z.object({
  schemaVersion: z.literal("openai-batch-submission-intent-v1"),
  batchSubmissionKey: z.string().regex(/^[a-f0-9]{64}$/u),
  requestSetFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
  provider: z.literal("openai"),
  endpoint: z.string().min(1),
  completionWindow: z.literal("24h"),
  submissionPolicyVersion: z.string().min(1),
  purpose: z.enum(["initial", "failed-item-retry"]),
  parentBatchSubmissionKey: z.string().regex(/^[a-f0-9]{64}$/u).optional(),
  state: z.enum([
    "prepared",
    "submission_pending",
    "reconciliation_required",
    "submitted",
    "terminal",
  ]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  inputFileId: z.string().min(1).optional(),
  providerBatchId: z.string().min(1).optional(),
  providerStatus: z.string().min(1).optional(),
  createAttemptedAt: z.string().datetime().optional(),
  submittedAt: z.string().datetime().optional(),
  reconciledAt: z.string().datetime().optional(),
  lastError: z
    .object({
      message: z.string().min(1),
      occurredAt: z.string().datetime(),
    })
    .optional(),
});

export interface OpenAiBatchSubmissionIntent {
  readonly schemaVersion: "openai-batch-submission-intent-v1";
  readonly batchSubmissionKey: BatchSubmissionKey;
  readonly requestSetFingerprint: BatchRequestSetFingerprint;
  readonly provider: "openai";
  readonly endpoint: string;
  readonly completionWindow: "24h";
  readonly submissionPolicyVersion: string;
  readonly purpose: "initial" | "failed-item-retry";
  readonly parentBatchSubmissionKey?: BatchSubmissionKey;
  readonly state:
    | "prepared"
    | "submission_pending"
    | "reconciliation_required"
    | "submitted"
    | "terminal";
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly inputFileId?: string;
  readonly providerBatchId?: string;
  readonly providerStatus?: string;
  readonly createAttemptedAt?: string;
  readonly submittedAt?: string;
  readonly reconciledAt?: string;
  readonly lastError?: {
    readonly message: string;
    readonly occurredAt: string;
  };
}

export function createOpenAiBatchSubmissionIntent(input: {
  readonly batchSubmissionKey: BatchSubmissionKey;
  readonly requestSetFingerprint: BatchRequestSetFingerprint;
  readonly endpoint: string;
  readonly submissionPolicyVersion: string;
  readonly purpose: "initial" | "failed-item-retry";
  readonly parentBatchSubmissionKey?: BatchSubmissionKey;
  readonly now?: string;
}): OpenAiBatchSubmissionIntent {
  const now = input.now ?? new Date().toISOString();
  return {
    schemaVersion: "openai-batch-submission-intent-v1",
    batchSubmissionKey: input.batchSubmissionKey,
    requestSetFingerprint: input.requestSetFingerprint,
    provider: "openai",
    endpoint: input.endpoint,
    completionWindow: "24h",
    submissionPolicyVersion: input.submissionPolicyVersion,
    purpose: input.purpose,
    ...(input.parentBatchSubmissionKey
      ? { parentBatchSubmissionKey: input.parentBatchSubmissionKey }
      : {}),
    state: "prepared",
    createdAt: now,
    updatedAt: now,
  };
}

function submissionsDirectory(storageRoot: string): string {
  return path.join(storageRoot, "submissions");
}

export function openAiBatchSubmissionIntentPath(
  storageRoot: string,
  key: BatchSubmissionKey
): string {
  return path.join(submissionsDirectory(storageRoot), `submission-${key}.json`);
}

export function openAiBatchSubmissionLockPath(
  storageRoot: string,
  key: BatchSubmissionKey
): string {
  return path.join(storageRoot, "locks", `submission-${key}.lock`);
}

export async function readOpenAiBatchSubmissionIntent(
  storageRoot: string,
  key: BatchSubmissionKey
): Promise<OpenAiBatchSubmissionIntent | undefined> {
  return (
    (await readJsonIfExists(
      openAiBatchSubmissionIntentPath(storageRoot, key),
      (value) =>
        openAiBatchSubmissionIntentSchema.parse(
          value
        ) as OpenAiBatchSubmissionIntent
    )) ?? undefined
  );
}

export async function writeOpenAiBatchSubmissionIntent(
  storageRoot: string,
  intent: OpenAiBatchSubmissionIntent
): Promise<void> {
  await ensureDir(submissionsDirectory(storageRoot));
  await writeJsonAtomic(
    openAiBatchSubmissionIntentPath(storageRoot, intent.batchSubmissionKey),
    openAiBatchSubmissionIntentSchema.parse(intent)
  );
}

export function openAiBatchSubmissionMetadata(
  key: BatchSubmissionKey,
  metadata: Readonly<Record<string, string>> = {}
): Record<string, string> {
  return {
    ...metadata,
    [OPENAI_BATCH_SUBMISSION_METADATA_KEY]: key,
  };
}

export type OpenAiBatchReconciliationResult =
  | { readonly kind: "exact"; readonly batch: OpenAiRemoteBatchSnapshot }
  | { readonly kind: "none" }
  | { readonly kind: "ambiguous"; readonly batchIds: readonly string[] }
  | { readonly kind: "incomplete"; readonly scannedPages: number };

export interface OpenAiRemoteBatchSnapshot {
  readonly id: string;
  readonly status: string;
  readonly endpoint: string;
  readonly inputFileId: string;
  readonly outputFileId?: string;
  readonly errorFileId?: string;
  readonly completedAt?: number;
}

/** Read-only, bounded reconciliation. It never creates or mutates a Batch. */
export async function reconcileOpenAiBatchSubmission(input: {
  readonly client: OpenAiStoryClient;
  readonly intent: OpenAiBatchSubmissionIntent;
  readonly maxPages?: number;
}): Promise<OpenAiBatchReconciliationResult> {
  const batches = input.client.batches;
  if (!batches?.list) {
    throw new Error("OpenAI Batch reconciliation requires batches.list support.");
  }
  const maxPages = input.maxPages ?? 3;
  const matches: OpenAiRemoteBatchSnapshot[] = [];
  let after: string | undefined;
  for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
    const page = await batches.list({
      limit: 100,
      ...(after ? { after } : {}),
    });
    for (const batch of page.data) {
      if (
        batch.metadata?.[OPENAI_BATCH_SUBMISSION_METADATA_KEY] ===
          input.intent.batchSubmissionKey &&
        batch.endpoint === input.intent.endpoint &&
        batch.input_file_id === input.intent.inputFileId
      ) {
        matches.push({
          id: batch.id,
          status: batch.status,
          endpoint: batch.endpoint,
          inputFileId: batch.input_file_id,
          ...(batch.output_file_id ? { outputFileId: batch.output_file_id } : {}),
          ...(batch.error_file_id ? { errorFileId: batch.error_file_id } : {}),
          ...(batch.completed_at ? { completedAt: batch.completed_at } : {}),
        });
      }
    }
    if (!page.has_more) {
      if (matches.length === 0) return { kind: "none" };
      if (matches.length === 1) return { kind: "exact", batch: matches[0]! };
      return {
        kind: "ambiguous",
        batchIds: matches.map((batch) => batch.id).sort(),
      };
    }
    const last = page.data.at(-1);
    if (!last) return { kind: "incomplete", scannedPages: pageNumber };
    after = last.id;
  }
  return { kind: "incomplete", scannedPages: maxPages };
}

export function isTerminalOpenAiBatchStatus(status: string): boolean {
  return ["completed", "failed", "expired", "cancelled"].includes(status);
}
