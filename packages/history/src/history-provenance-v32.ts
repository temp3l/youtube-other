import {
  historyClaimOverrideV32Schema,
  historyClaimSourceLinkV32Schema,
  historyEvidencePassageV32Schema,
  historySourceRegistryEntryV32Schema,
  type HistoryClaimConcernV32,
  type HistoryClaimOverrideV32,
  type HistoryClaimSourceLinkV32,
  type HistoryEvidencePassageV32,
  type HistorySourceRegistryEntryV32,
} from "./history-v32-contracts.js";

export const HISTORY_PROVENANCE_V32 = "history-provenance.v3.2.0" as const;

export type HistoryClaimStatusV32 =
  | "unresolved"
  | "candidate"
  | "supported"
  | "disputed"
  | "overridden";

export interface HistoryClaimProvenanceV32 {
  readonly claimId: string;
  readonly material: boolean;
  readonly concerns: readonly HistoryClaimConcernV32[];
  readonly status: HistoryClaimStatusV32;
  readonly linkIds: readonly string[];
  readonly override?: HistoryClaimOverrideV32;
}

export interface DeriveHistoryProvenanceInputV32 {
  readonly claimId: string;
  readonly material: boolean;
  readonly concerns: readonly HistoryClaimConcernV32[];
  readonly narrationSha256: string;
  readonly planHash: string;
  readonly sources: readonly HistorySourceRegistryEntryV32[];
  readonly evidence: readonly HistoryEvidencePassageV32[];
  readonly links: readonly HistoryClaimSourceLinkV32[];
  readonly override?: HistoryClaimOverrideV32;
}

const unique = (items: readonly string[]): string[] => [...new Set(items)].sort();

export function deriveHistoryClaimProvenanceV32(
  input: DeriveHistoryProvenanceInputV32
): HistoryClaimProvenanceV32 {
  input.sources.forEach((source) => historySourceRegistryEntryV32Schema.parse(source));
  input.evidence.forEach((passage) => historyEvidencePassageV32Schema.parse(passage));
  input.links.forEach((link) => historyClaimSourceLinkV32Schema.parse(link));
  const sourceIds = new Set(input.sources.map((source) => source.id));
  const evidenceIds = new Set(input.evidence.map((passage) => passage.id));
  const links = input.links.filter((link) => link.claimId === input.claimId);
  for (const link of links) {
    if (!sourceIds.has(link.sourceId) || !evidenceIds.has(link.evidencePassageId))
      throw new Error(`History provenance link ${link.id} has a dangling source or evidence reference.`);
    const evidence = input.evidence.find((value) => value.id === link.evidencePassageId)!;
    if (evidence.sourceId !== link.sourceId)
      throw new Error(`History provenance link ${link.id} does not match its evidence source.`);
    if (link.state === "verified" && !link.verification)
      throw new Error(`History provenance link ${link.id} requires a human verification record.`);
  }
  const override = input.override
    ? historyClaimOverrideV32Schema.parse(input.override)
    : undefined;
  if (
    override &&
    (override.narrationSha256 !== input.narrationSha256 ||
      override.planHash !== input.planHash)
  )
    throw new Error("History provenance override is stale for this narration or plan.");
  const verified = links.filter((link) => link.state === "verified");
  const contradicting = verified.some((link) => link.support === "contradicting");
  const supporting = verified.some((link) =>
    ["direct", "strong-entailment"].includes(link.support)
  );
  const status: HistoryClaimStatusV32 = override?.decision === "accept"
    ? "overridden"
    : contradicting
      ? "disputed"
      : supporting
        ? "supported"
        : links.length > 0
          ? "candidate"
          : "unresolved";
  return {
    claimId: input.claimId,
    material: input.material,
    concerns: [...input.concerns],
    status,
    linkIds: unique(links.map((link) => link.id)),
    ...(override ? { override } : {}),
  };
}

export function classifyHistoryClaimMaterialityV32(input: {
  readonly kind: string;
  readonly drivesMap?: boolean;
  readonly drivesDiagram?: boolean;
  readonly quotation?: boolean;
}): { material: boolean; concerns: HistoryClaimConcernV32[] } {
  const concerns: HistoryClaimConcernV32[] = [];
  const kinds: Record<string, HistoryClaimConcernV32> = {
    factual: "factual",
    chronological: "chronological",
    quantitative: "quantitative",
    causal: "causal",
    disputed: "disputed",
    geographic: "geographic",
  };
  if (kinds[input.kind]) concerns.push(kinds[input.kind]!);
  if (input.drivesMap) concerns.push("map-driving");
  if (input.drivesDiagram) concerns.push("diagram-driving");
  if (input.quotation) concerns.push("quotation");
  if (concerns.length === 0) concerns.push("editorial-connective");
  return { material: concerns[0] !== "editorial-connective", concerns: unique(concerns) as HistoryClaimConcernV32[] };
}
