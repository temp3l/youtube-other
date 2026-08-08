import { fileURLToPath } from "node:url";
import path from "node:path";
import { lookupCanonicalEntitySeedV34 } from "./history-claims-v34.js";

export type HistoricalReferenceImageRoleV35 =
  | "canonical-likeness"
  | "period-likeness"
  | "uniform"
  | "age-reference";

export type HistoricalLikenessPolicyV35 =
  | "reference-required"
  | "reference-preferred"
  | "generic-reconstruction"
  | "no-likeness";

export type HistoricalPersonReferenceAttachmentStatusV35 =
  | "attached"
  | "not-required"
  | "not-available"
  | "policy-blocked";

export interface HistoricalReferenceImageV35 {
  readonly assetFileId: string;
  readonly sourceProvider: string;
  readonly sourceUrl?: string;
  readonly role: HistoricalReferenceImageRoleV35;
  readonly attribution?: string;
  readonly license?: string;
  readonly confidence: number;
  readonly suitability: number;
}

export interface HistoricalPersonReferenceSetV35 {
  readonly canonicalPersonId: string;
  readonly canonicalName: string;
  readonly aliases: readonly string[];
  readonly references: readonly HistoricalReferenceImageV35[];
}

const PACKAGE_ROOT = path.resolve(fileURLToPath(import.meta.url), "..", "..");

const PERSON_REFERENCE_SEEDS: readonly HistoricalPersonReferenceSetV35[] = [
  {
    canonicalPersonId: "napoleon-bonaparte",
    canonicalName: "Napoleon Bonaparte",
    aliases: ["Napoleon"],
    references: [
      {
        assetFileId: "napoleon-bonaparte/canonical-likeness",
        sourceProvider: "curated-seed",
        sourceUrl: "https://commons.wikimedia.org/wiki/File:Jacques-Louis_David_-_The_Emperor_Napoleon_in_His_Study_at_the_Tuileries_-_Google_Art_Project.jpg",
        role: "canonical-likeness",
        attribution: "Jacques-Louis David, public domain (seed metadata)",
        license: "public-domain",
        confidence: 0.92,
        suitability: 0.95,
      },
    ],
  },
  {
    canonicalPersonId: "joseph-stalin",
    canonicalName: "Joseph Stalin",
    aliases: ["Stalin"],
    references: [
      {
        assetFileId: "joseph-stalin/canonical-likeness",
        sourceProvider: "curated-seed",
        role: "canonical-likeness",
        attribution: "Curated seed placeholder; replace with approved archival reference.",
        license: "editorial-seed",
        confidence: 0.88,
        suitability: 0.9,
      },
    ],
  },
  {
    canonicalPersonId: "adolf-hitler",
    canonicalName: "Adolf Hitler",
    aliases: ["Hitler"],
    references: [
      {
        assetFileId: "adolf-hitler/canonical-likeness",
        sourceProvider: "curated-seed",
        role: "canonical-likeness",
        attribution: "Curated seed placeholder; replace with approved archival reference.",
        license: "editorial-seed",
        confidence: 0.88,
        suitability: 0.9,
      },
    ],
  },
] as const;

const PERSON_REFERENCE_BY_ID = new Map(
  PERSON_REFERENCE_SEEDS.map((entry) => [entry.canonicalPersonId, entry] as const)
);

const PERSON_REFERENCE_BY_LABEL = new Map<string, HistoricalPersonReferenceSetV35>();
for (const entry of PERSON_REFERENCE_SEEDS) {
  PERSON_REFERENCE_BY_LABEL.set(entry.canonicalName.toLocaleLowerCase(), entry);
  for (const alias of entry.aliases) {
    PERSON_REFERENCE_BY_LABEL.set(alias.toLocaleLowerCase(), entry);
  }
}

export function canonicalHistoricalPersonIdFromLabel(label: string): string {
  return label
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
}

export function listHistoricalPersonReferenceSetsV35(): readonly HistoricalPersonReferenceSetV35[] {
  return PERSON_REFERENCE_SEEDS;
}

export function lookupHistoricalPersonReferenceSetByIdV35(
  canonicalPersonId: string
): HistoricalPersonReferenceSetV35 | null {
  return PERSON_REFERENCE_BY_ID.get(canonicalPersonId) ?? null;
}

export function lookupHistoricalPersonReferenceSetByLabelV35(
  label: string
): HistoricalPersonReferenceSetV35 | null {
  const trimmed = label.trim();
  if (!trimmed) return null;
  const direct = PERSON_REFERENCE_BY_LABEL.get(trimmed.toLocaleLowerCase());
  if (direct) return direct;
  const seed = lookupCanonicalEntitySeedV34(trimmed);
  if (!seed || seed.entityType !== "person") return null;
  return (
    PERSON_REFERENCE_BY_ID.get(canonicalHistoricalPersonIdFromLabel(seed.label)) ??
    PERSON_REFERENCE_BY_LABEL.get(seed.label.toLocaleLowerCase()) ??
    null
  );
}

export function resolveHistoricalPersonReferenceAssetPathV35(
  assetFileId: string
): string {
  return path.join(
    PACKAGE_ROOT,
    "assets",
    "person-references",
    `${assetFileId}.png`
  );
}

export function selectHistoricalReferenceImagesV35(input: {
  readonly referenceSet: HistoricalPersonReferenceSetV35;
  readonly limit?: number;
}): readonly HistoricalReferenceImageV35[] {
  const limit = input.limit ?? 2;
  return [...input.referenceSet.references]
    .sort(
      (left, right) =>
        right.suitability - left.suitability ||
        right.confidence - left.confidence ||
        left.assetFileId.localeCompare(right.assetFileId)
    )
    .slice(0, limit);
}
