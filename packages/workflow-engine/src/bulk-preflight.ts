import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import {
  contentLocaleSchema,
  contentProfileIdSchema,
  contentVariantSchema,
  productionUnitIdSchema,
  taskIdSchema,
  type ContentProfileId,
} from "@mediaforge/domain";
import { z } from "zod";

import {
  createDeterministicBatchId,
  createDeterministicBatchItemId,
} from "./batch.js";
import { redactStructuredMetadata } from "./attempt-observability.js";

/** Versioned, provider-independent Veronica bulk preflight evidence. */
export const VERONICA_BULK_PREFLIGHT_SCHEMA_VERSION =
  "mediaforge.veronicabenini.bulk-preflight.v1" as const;

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const nonEmptyStringSchema = z.string().trim().min(1);
const isoDateTimeSchema = z.iso.datetime({ offset: true });
const preflightIdSchema = z.string().regex(/^veronica-preflight-[a-f0-9]{40}$/u);

const limitsSchema = z
  .object({
    concurrency: z.number().int().positive().max(100),
    rateLimitPerSecond: z.number().positive().optional(),
    maxItems: z.number().int().positive().max(10_000),
    maxEstimatedCostMicros: z.number().int().nonnegative(),
  })
  .strict();

const failureEvidenceSchema = z
  .object({
    code: nonEmptyStringSchema,
    message: nonEmptyStringSchema,
    remediation: nonEmptyStringSchema,
    details: z.unknown().optional(),
  })
  .strict();

export const veronicaBulkPreflightItemSchema = z
  .object({
    key: nonEmptyStringSchema,
    taskId: taskIdSchema,
    unitId: productionUnitIdSchema,
    locale: contentLocaleSchema,
    variant: contentVariantSchema,
    revisionId: nonEmptyStringSchema,
    configurationFingerprint: sha256Schema,
    dependencyFingerprint: sha256Schema,
    provenanceFingerprint: sha256Schema,
    estimatedCostMicros: z.number().int().nonnegative(),
    cache: z.enum(["reusable", "stale", "disabled"]),
    approval: z.enum(["approved", "required", "not-required"]),
    failureEvidence: failureEvidenceSchema.optional(),
  })
  .strict();
export type VeronicaBulkPreflightItemInput = z.input<
  typeof veronicaBulkPreflightItemSchema
>;

export const veronicaBulkPreflightSchema = z
  .object({
    schemaVersion: z.literal(VERONICA_BULK_PREFLIGHT_SCHEMA_VERSION),
    id: preflightIdSchema,
    batchId: z.string().regex(/^batch-[a-f0-9]{40}$/u),
    profileId: z.literal("veronicabenini"),
    operation: z.string().regex(/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$/u),
    limits: limitsSchema,
    items: z.array(
      veronicaBulkPreflightItemSchema.extend({
        batchItemId: z.string().regex(/^item-[a-f0-9]{40}$/u),
        fingerprint: sha256Schema,
        status: z.enum(["ready", "reusable", "blocked"]),
        reuseRationale: z.enum([
          "content-hash-match",
          "language-independent-visual",
          "regenerate-stale-artifact",
          "preflight-blocked",
        ]),
        failureEvidence: failureEvidenceSchema.optional(),
      })
    ),
    totals: z
      .object({
        ready: z.number().int().nonnegative(),
        reusable: z.number().int().nonnegative(),
        blocked: z.number().int().nonnegative(),
        estimatedCostMicros: z.number().int().nonnegative(),
      })
      .strict(),
    createdAt: isoDateTimeSchema,
  })
  .strict();
export type VeronicaBulkPreflight = z.infer<typeof veronicaBulkPreflightSchema>;

export const veronicaBulkAggregateReviewSchema = z
  .object({
    schemaVersion: z.literal(VERONICA_BULK_PREFLIGHT_SCHEMA_VERSION),
    preflightId: preflightIdSchema,
    batchId: z.string().regex(/^batch-[a-f0-9]{40}$/u),
    profileId: z.literal("veronicabenini"),
    operation: z.string().regex(/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$/u),
    aggregateStatus: z.enum(["ready", "partial", "blocked"]),
    limits: limitsSchema,
    totals: veronicaBulkPreflightSchema.shape.totals,
    episodes: z.array(
      z
        .object({
          unitId: productionUnitIdSchema,
          status: z.enum(["ready", "reusable", "blocked"]),
          revisionId: nonEmptyStringSchema,
          configurationFingerprint: sha256Schema,
          dependencyFingerprint: sha256Schema,
          provenanceFingerprint: sha256Schema,
          reuseRationale: z.enum([
            "content-hash-match",
            "language-independent-visual",
            "regenerate-stale-artifact",
            "preflight-blocked",
          ]),
          failureEvidence: failureEvidenceSchema.optional(),
        })
        .strict()
    ),
    createdAt: isoDateTimeSchema,
  })
  .strict();
export type VeronicaBulkAggregateReview = z.infer<
  typeof veronicaBulkAggregateReviewSchema
>;

export interface VeronicaBulkPreflightInput {
  readonly profileId: ContentProfileId | "strategic-reinvention";
  readonly operation: string;
  readonly limits: z.input<typeof limitsSchema>;
  readonly items: readonly VeronicaBulkPreflightItemInput[];
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function hash(value: unknown): string {
  return crypto.createHash("sha256").update(stableJson(value)).digest("hex");
}

function redactFailure(
  value: z.infer<typeof failureEvidenceSchema> | undefined
): z.infer<typeof failureEvidenceSchema> | undefined {
  return value
    ? { ...value, ...(value.details === undefined ? {} : { details: redactStructuredMetadata(value.details) }) }
    : undefined;
}

function atomicJson(filePath: string, value: unknown): Promise<void> {
  return fs
    .mkdir(path.dirname(filePath), { recursive: true })
    .then(async () => {
      const temporaryPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
      await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
        encoding: "utf8",
        flag: "wx",
      });
      await fs.rename(temporaryPath, filePath);
    });
}

/**
 * Plans only. It has no provider or publication dependency, so a failed item
 * is visible and isolated before paid or irreversible work can begin.
 */
export function createVeronicaBulkPreflight(
  input: VeronicaBulkPreflightInput,
  now = new Date()
): VeronicaBulkPreflight {
  const profileId = contentProfileIdSchema.parse(input.profileId);
  if (profileId !== "veronicabenini") {
    throw new Error("Veronica bulk preflight requires the veronicabenini profile.");
  }
  const operation = z
    .string()
    .regex(/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$/u)
    .parse(input.operation);
  const limits = limitsSchema.parse(input.limits);
  if (input.items.length === 0) throw new Error("Bulk preflight requires items.");
  if (input.items.length > limits.maxItems) {
    throw new Error("Bulk preflight item count exceeds the configured maximum.");
  }
  const seen = new Set<string>();
  const items = input.items.map((raw) => {
    const item = veronicaBulkPreflightItemSchema.parse(raw);
    if (seen.has(item.key)) throw new Error(`Duplicate bulk preflight key: ${item.key}`);
    seen.add(item.key);
    const fingerprint = hash({
      revisionId: item.revisionId,
      configurationFingerprint: item.configurationFingerprint,
      dependencyFingerprint: item.dependencyFingerprint,
      provenanceFingerprint: item.provenanceFingerprint,
    });
    const batchItemId = createDeterministicBatchItemId({
      taskId: item.taskId,
      unitId: item.unitId,
      locale: item.locale,
      variant: item.variant,
      fingerprint,
    });
    // Paid/irreversible work is fail-closed: a pending approval is surfaced as
    // an item-local defect rather than silently submitted with the rest.
    const approvalBlocked = item.approval === "required";
    const blocked = item.failureEvidence !== undefined || approvalBlocked;
    const reusable = !blocked && item.cache === "reusable";
    const failureEvidence = item.failureEvidence ??
      (approvalBlocked
        ? {
            code: "APPROVAL_REQUIRED",
            message: "This episode requires approval before bulk execution.",
            remediation: "Approve this episode revision, then resume preflight.",
          }
        : undefined);
    return {
      ...item,
      batchItemId,
      fingerprint,
      status: blocked ? ("blocked" as const) : reusable ? ("reusable" as const) : ("ready" as const),
      reuseRationale: blocked
        ? ("preflight-blocked" as const)
        : reusable
          ? ("content-hash-match" as const)
          : ("regenerate-stale-artifact" as const),
      ...(failureEvidence ? { failureEvidence: redactFailure(failureEvidence) } : {}),
    };
  });
  const estimatedCostMicros = items
    .filter((item) => item.status === "ready")
    .reduce((total, item) => total + item.estimatedCostMicros, 0);
  if (estimatedCostMicros > limits.maxEstimatedCostMicros) {
    throw new Error("Bulk preflight estimated cost exceeds the configured maximum.");
  }
  const batchId = createDeterministicBatchId({
    profileId,
    provider: "preflight",
    operation,
    itemIds: items.map((item) => item.batchItemId),
  });
  return veronicaBulkPreflightSchema.parse({
    schemaVersion: VERONICA_BULK_PREFLIGHT_SCHEMA_VERSION,
    id: `veronica-preflight-${hash({ batchId, limits }).slice(0, 40)}`,
    batchId,
    profileId,
    operation,
    limits,
    items,
    totals: {
      ready: items.filter((item) => item.status === "ready").length,
      reusable: items.filter((item) => item.status === "reusable").length,
      blocked: items.filter((item) => item.status === "blocked").length,
      estimatedCostMicros,
    },
    createdAt: now.toISOString(),
  });
}

/** Deliberately keeps every per-episode defect in the aggregate approval view. */
export function buildVeronicaBulkAggregateReview(
  preflight: VeronicaBulkPreflight
): VeronicaBulkAggregateReview {
  const parsed = veronicaBulkPreflightSchema.parse(preflight);
  const aggregateStatus =
    parsed.totals.blocked === 0
      ? "ready"
      : parsed.totals.ready + parsed.totals.reusable > 0
        ? "partial"
        : "blocked";
  return veronicaBulkAggregateReviewSchema.parse({
    schemaVersion: VERONICA_BULK_PREFLIGHT_SCHEMA_VERSION,
    preflightId: parsed.id,
    batchId: parsed.batchId,
    profileId: parsed.profileId,
    operation: parsed.operation,
    aggregateStatus,
    limits: parsed.limits,
    totals: parsed.totals,
    episodes: parsed.items.map((item) => ({
      unitId: item.unitId,
      status: item.status,
      revisionId: item.revisionId,
      configurationFingerprint: item.configurationFingerprint,
      dependencyFingerprint: item.dependencyFingerprint,
      provenanceFingerprint: item.provenanceFingerprint,
      reuseRationale: item.reuseRationale,
      ...(item.failureEvidence ? { failureEvidence: item.failureEvidence } : {}),
    })),
    createdAt: parsed.createdAt,
  });
}

export class VeronicaBulkPreflightStore {
  public constructor(private readonly root: string) {}

  private directory(batchId: string): string {
    if (!/^batch-[a-f0-9]{40}$/u.test(batchId)) throw new Error("Invalid batch ID.");
    return path.join(this.root, batchId);
  }

  public async write(preflight: VeronicaBulkPreflight): Promise<VeronicaBulkPreflight> {
    const parsed = veronicaBulkPreflightSchema.parse(preflight);
    const preflightPath = path.join(this.directory(parsed.batchId), "veronica-bulk-preflight.json");
    try {
      const existing = veronicaBulkPreflightSchema.parse(
        JSON.parse(await fs.readFile(preflightPath, "utf8")) as unknown,
      );
      if (existing.id !== parsed.id) {
        throw new Error("Bulk preflight already exists with different limits or identity.");
      }
      return existing;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await atomicJson(preflightPath, parsed);
    await atomicJson(
      path.join(this.directory(parsed.batchId), "veronica-bulk-aggregate-review.json"),
      buildVeronicaBulkAggregateReview(parsed)
    );
    return parsed;
  }

  public async read(batchId: string): Promise<VeronicaBulkPreflight> {
    return veronicaBulkPreflightSchema.parse(
      JSON.parse(await fs.readFile(path.join(this.directory(batchId), "veronica-bulk-preflight.json"), "utf8")) as unknown
    );
  }

  public async readAggregateReview(batchId: string): Promise<VeronicaBulkAggregateReview> {
    return veronicaBulkAggregateReviewSchema.parse(
      JSON.parse(await fs.readFile(path.join(this.directory(batchId), "veronica-bulk-aggregate-review.json"), "utf8")) as unknown
    );
  }
}

export class VeronicaBulkPreflightCoordinator {
  public readonly store: VeronicaBulkPreflightStore;
  private readonly now: () => Date;

  public constructor(options: { readonly root: string; readonly now?: () => Date }) {
    this.store = new VeronicaBulkPreflightStore(options.root);
    this.now = options.now ?? (() => new Date());
  }

  public async plan(input: VeronicaBulkPreflightInput): Promise<VeronicaBulkPreflight> {
    return this.store.write(createVeronicaBulkPreflight(input, this.now()));
  }

  /** A resume is an authorized, idempotent re-read; it never dispatches work. */
  public async resume(input: {
    readonly batchId: string;
    readonly authorized: boolean;
    readonly idempotencyKey: string;
  }): Promise<VeronicaBulkPreflight> {
    if (!input.authorized) throw new Error("Bulk preflight resume requires authorization.");
    if (input.idempotencyKey.trim().length === 0) {
      throw new Error("Bulk preflight resume requires an idempotency key.");
    }
    return this.store.read(input.batchId);
  }
}
