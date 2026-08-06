import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { stableJsonV33 } from "./history-research-v33.js";

export interface PaidBatchCacheKeyV3_3 {
  readonly kind:
    | "claim-extraction"
    | "evidence-assessment"
    | "visual-semantics";
  readonly narrationHash?: string;
  readonly narrationUnitIds?: readonly string[];
  readonly claimHash?: string;
  readonly evidenceFragmentHash?: string;
  readonly purposeHash?: string;
  readonly model: string;
  readonly promptVersion: string;
  readonly schemaVersion: string;
}

export interface PersistedPaidBatchV3_3<T> {
  readonly cacheKey: string;
  readonly kind: PaidBatchCacheKeyV3_3["kind"];
  readonly model: string;
  readonly promptVersion: string;
  readonly schemaVersion: string;
  readonly completedAt: string;
  readonly result: T;
}

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

export function buildPaidBatchCacheKeyV33(
  input: PaidBatchCacheKeyV3_3
): string {
  return sha256(stableJsonV33(input));
}

export function paidBatchCachePathV33(
  stateRoot: string,
  cacheKey: string
): string {
  return path.join(stateRoot, "paid-batch-cache", `${cacheKey}.json`);
}

export async function readPaidBatchCacheV33<T>(
  stateRoot: string,
  cacheKey: string
): Promise<PersistedPaidBatchV3_3<T> | null> {
  try {
    const raw = await fs.readFile(
      paidBatchCachePathV33(stateRoot, cacheKey),
      "utf8"
    );
    return JSON.parse(raw) as PersistedPaidBatchV3_3<T>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function writePaidBatchCacheV33<T>(
  stateRoot: string,
  record: PersistedPaidBatchV3_3<T>
): Promise<void> {
  const file = paidBatchCachePathV33(stateRoot, record.cacheKey);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(
    file,
    `${JSON.stringify(record, null, 2)}\n`,
    "utf8"
  );
}

export interface SourceBodyCacheRecordV3_3 {
  readonly canonicalIdentity: string;
  readonly canonicalUrl: string;
  readonly contentHash: string;
  readonly retrievedAt: string;
  readonly contentType: string;
  readonly bodyPath: string;
  readonly revision: number;
}

export function sourceBodyCacheKeyV33(
  canonicalIdentity: string,
  contentHash: string
): string {
  return sha256(`${canonicalIdentity}\u0000${contentHash}`);
}

export async function readSourceBodyIndexV33(
  stateRoot: string
): Promise<Record<string, SourceBodyCacheRecordV3_3>> {
  const file = path.join(stateRoot, "source-body-cache", "index.json");
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as Record<
      string,
      SourceBodyCacheRecordV3_3
    >;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}

export async function upsertSourceBodyCacheV33(input: {
  readonly stateRoot: string;
  readonly canonicalIdentity: string;
  readonly canonicalUrl: string;
  readonly contentHash: string;
  readonly contentType: string;
  readonly body: string;
  readonly retrievedAt: string;
}): Promise<SourceBodyCacheRecordV3_3> {
  const index = await readSourceBodyIndexV33(input.stateRoot);
  const existing = Object.values(index)
    .filter((item) => item.canonicalIdentity === input.canonicalIdentity)
    .sort((left, right) => right.revision - left.revision)[0];
  if (existing && existing.contentHash === input.contentHash) return existing;
  const revision = (existing?.revision ?? 0) + 1;
  const key = sourceBodyCacheKeyV33(
    input.canonicalIdentity,
    input.contentHash
  );
  const bodyPath = path.join(
    input.stateRoot,
    "source-body-cache",
    "bodies",
    `${key}.txt`
  );
  await fs.mkdir(path.dirname(bodyPath), { recursive: true });
  await fs.writeFile(bodyPath, input.body, "utf8");
  const record: SourceBodyCacheRecordV3_3 = {
    canonicalIdentity: input.canonicalIdentity,
    canonicalUrl: input.canonicalUrl,
    contentHash: input.contentHash,
    retrievedAt: input.retrievedAt,
    contentType: input.contentType,
    bodyPath,
    revision,
  };
  index[key] = record;
  await fs.mkdir(path.dirname(path.join(input.stateRoot, "source-body-cache", "index.json")), {
    recursive: true,
  });
  await fs.writeFile(
    path.join(input.stateRoot, "source-body-cache", "index.json"),
    `${JSON.stringify(index, null, 2)}\n`,
    "utf8"
  );
  return record;
}

export type InvalidationPhaseV3_3 =
  | "claims"
  | "sources"
  | "evidence"
  | "assessments"
  | "provenance"
  | "visuals";

export function phasesInvalidatedFromV33(
  phase: InvalidationPhaseV3_3
): readonly InvalidationPhaseV3_3[] {
  const order: InvalidationPhaseV3_3[] = [
    "claims",
    "sources",
    "evidence",
    "assessments",
    "provenance",
    "visuals",
  ];
  const index = order.indexOf(phase);
  return order.slice(index);
}

export function projectBroadForceCostV33(input: {
  readonly extractionBatches: number;
  readonly assessmentBatches: number;
  readonly searchCalls: number;
  readonly hardCostBudgetUsd: number;
}): {
  readonly warning: string;
  readonly projectedMaxSearchCalls: number;
  readonly projectedExtractionBatches: number;
  readonly projectedAssessmentBatches: number;
  readonly projectedCostCeilingUsd: number;
} {
  return {
    warning:
      "Broad --force invalidates successful paid batches and may repeat costly work. Prefer --force-batch, --refresh-source, or --invalidate-from.",
    projectedMaxSearchCalls: input.searchCalls,
    projectedExtractionBatches: input.extractionBatches,
    projectedAssessmentBatches: input.assessmentBatches,
    projectedCostCeilingUsd: input.hardCostBudgetUsd,
  };
}
