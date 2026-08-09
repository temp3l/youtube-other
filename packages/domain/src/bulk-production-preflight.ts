import crypto from "node:crypto";
import { z } from "zod";

const identifier = z.string().min(1).max(160).regex(/^[a-z0-9][a-z0-9._-]*$/u);
const locale = z.enum(["en", "de", "es", "fr", "pt", "it"]);
const variant = z.enum(["full", "short"]);

export const BULK_PRODUCTION_SCHEMA_VERSION = "mediaforge.bulk-production.v1" as const;
export const BULK_PRODUCTION_MAX_ITEMS = 100;

export const bulkSelectionItemSchema = z.object({
  projectId: identifier,
  episodeId: identifier,
  expectedRevision: z.number().int().nonnegative(),
  locale,
  variant,
}).strict();
export type BulkSelectionItem = z.infer<typeof bulkSelectionItemSchema>;

export type BulkEligibilityReason = "authorized" | "selection_limit" | "duplicate_selection" | "forbidden" | "episode_missing" | "stale_revision" | "configuration_unavailable" | "quota_unavailable";

export interface BulkSelectionProbe {
  readonly item: BulkSelectionItem;
  readonly authorized: boolean;
  readonly currentRevision?: number;
  readonly configurationAvailable: boolean;
  readonly quotaAvailable: boolean;
}

export interface BulkPreflightItem {
  readonly item: BulkSelectionItem;
  readonly eligible: boolean;
  readonly reasons: readonly BulkEligibilityReason[];
  readonly fingerprint: string;
}

export interface BulkProductionPreflight {
  readonly schemaVersion: typeof BULK_PRODUCTION_SCHEMA_VERSION;
  readonly workspaceId: string;
  readonly selectionFingerprint: string;
  readonly items: readonly BulkPreflightItem[];
  readonly eligibleCount: number;
  readonly ineligibleCount: number;
}

function fingerprint(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

/** Pure, bounded preflight; execution must re-run it against authoritative reads. */
export function preflightBulkProduction(input: {
  readonly workspaceId: string;
  readonly probes: readonly BulkSelectionProbe[];
}): BulkProductionPreflight {
  const seen = new Set<string>();
  const items = input.probes.map((probe, index) => {
    const item = bulkSelectionItemSchema.parse(probe.item);
    const key = `${item.projectId}:${item.episodeId}:${item.expectedRevision}:${item.locale}:${item.variant}`;
    const reasons: BulkEligibilityReason[] = [];
    if (index >= BULK_PRODUCTION_MAX_ITEMS) reasons.push("selection_limit");
    if (seen.has(key)) reasons.push("duplicate_selection"); else seen.add(key);
    if (!probe.authorized) reasons.push("forbidden");
    if (probe.currentRevision === undefined) reasons.push("episode_missing");
    else if (probe.currentRevision !== item.expectedRevision) reasons.push("stale_revision");
    if (!probe.configurationAvailable) reasons.push("configuration_unavailable");
    if (!probe.quotaAvailable) reasons.push("quota_unavailable");
    return { item, eligible: reasons.length === 0, reasons: reasons.length ? reasons : ["authorized"], fingerprint: fingerprint({ workspaceId: input.workspaceId, item }) };
  });
  return {
    schemaVersion: BULK_PRODUCTION_SCHEMA_VERSION,
    workspaceId: identifier.parse(input.workspaceId),
    selectionFingerprint: fingerprint({ workspaceId: input.workspaceId, items: items.map(({ item, fingerprint: itemFingerprint }) => ({ item, fingerprint: itemFingerprint })) }),
    items,
    eligibleCount: items.filter((item) => item.eligible).length,
    ineligibleCount: items.filter((item) => !item.eligible).length,
  };
}

/** Successful items never re-enter a retry batch; permanent failures require a new selection. */
export function retryableBulkItems<T extends { readonly status: string }>(items: readonly T[]): readonly T[] {
  return items.filter((item) => item.status === "failed-retryable" || item.status === "cancelled");
}
