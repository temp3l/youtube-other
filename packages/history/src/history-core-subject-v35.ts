import { lookupCanonicalEntitySeedV34 } from "./history-claims-v34.js";
import type {
  HistoryEntityMentionV34,
  HistoryRejectedEntityV34,
} from "./history-v34-contracts.js";

export type CoreSubjectTierV35 = "core" | "supporting";

export type CoreSubjectSpecV35 = {
  readonly label: string;
  readonly tier: CoreSubjectTierV35;
  readonly source: "title" | "slug" | "keyword" | "known-entity";
};

const KEYWORD_NOISE = new Set(
  [
    "at",
    "army",
    "terrified",
    "slave",
    "worst",
    "romes",
    "when",
    "the",
    "rebellion",
    "decisive",
    "battle",
    "ancient",
    "history",
    "explained",
    "documentary",
    "beyond",
    "legend",
    "life",
    "day",
    "war",
    "crisis",
    "missile",
    "mongol",
    "machine",
    "disaster",
    "decisions",
    "medieval",
    "peasant",
    "cuban",
    "titanic",
    "year",
    "sun",
    "disappeared",
    "destroy",
    "itself",
    "breaks",
    "persia",
    "long-form",
    "tags",
  ].map((value) => value.toLocaleLowerCase())
);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function canonicalLabelForSurface(surface: string): string {
  return lookupCanonicalEntitySeedV34(surface)?.label ?? surface.trim();
}

function addSubject(
  subjects: Map<string, CoreSubjectSpecV35>,
  label: string,
  tier: CoreSubjectTierV35,
  source: CoreSubjectSpecV35["source"]
): void {
  const trimmed = label.trim();
  if (!trimmed || trimmed.length < 3) return;
  const canonical = canonicalLabelForSurface(trimmed);
  const key = canonical.toLocaleLowerCase();
  if (subjects.has(key)) return;
  subjects.set(key, { label: canonical, tier, source });
}

export function deriveCoreSubjectsV35(input: {
  readonly episodeId: string;
  readonly title: string;
  readonly keywords?: readonly string[];
  readonly knownEntities?: readonly string[];
}): readonly CoreSubjectSpecV35[] {
  const subjects = new Map<string, CoreSubjectSpecV35>();

  const titleSegment = input.title.split(/[:—–]/u)[0]?.trim() ?? input.title;
  const titleMain =
    titleSegment
      .split(/\s+(?:Beyond|at|in|How|When|Why|The|and)\s+/iu)[0]
      ?.trim() ?? titleSegment;
  const titleMatch = titleMain.match(/^([A-Z][\p{L}'-]+(?:\s+[A-Z][\p{L}'-]+)?)/u);
  if (titleMatch?.[1] && lookupCanonicalEntitySeedV34(titleMatch[1])) {
    addSubject(subjects, titleMatch[1], "core", "title");
  }

  const slugMatch = input.episodeId.match(/pack-\d{2}-(.+)$/i);
  if (slugMatch) {
    const slug = slugMatch[1]!.replace(/-v\d+(\.\d+)?$/i, "").replace(/^\d{2}-/, "");
    const lower = slug.toLocaleLowerCase();
    if (lower.includes("cleopatra")) addSubject(subjects, "Cleopatra", "core", "slug");
    else if (lower.includes("spartacus")) addSubject(subjects, "Spartacus", "core", "slug");
    else if (lower.includes("hannibal")) {
      addSubject(subjects, "Hannibal Barca", "core", "slug");
      if (lower.includes("cannae")) addSubject(subjects, "Cannae", "core", "slug");
    } else if (lower.includes("caesar")) addSubject(subjects, "Julius Caesar", "core", "slug");
    else if (lower.includes("alexander")) addSubject(subjects, "Alexander the Great", "core", "slug");
    else if (lower.includes("pompeii")) {
      addSubject(subjects, "Pompeii", "core", "slug");
      addSubject(subjects, "Mount Vesuvius", "supporting", "slug");
    } else if (lower.includes("peloponnesian")) addSubject(subjects, "Sparta", "core", "slug");
    else if (lower.includes("1066") || lower.includes("battle-that-changed-england")) {
      addSubject(subjects, "Harold Godwinson", "core", "slug");
      addSubject(subjects, "Harald Hardrada", "core", "slug");
    }
  }

  for (const keyword of input.keywords ?? []) {
    const lower = keyword.toLocaleLowerCase();
    if (KEYWORD_NOISE.has(lower) || lower.length < 3 || /^\d/u.test(keyword)) continue;
    const seed = lookupCanonicalEntitySeedV34(keyword);
    if (!seed) continue;
    const hasCore = [...subjects.values()].some((item) => item.tier === "core");
    addSubject(
      subjects,
      seed.label,
      hasCore ? "supporting" : "core",
      "keyword"
    );
  }

  for (const entity of input.knownEntities ?? []) {
    const seed = lookupCanonicalEntitySeedV34(entity);
    if (!seed) continue;
    addSubject(subjects, seed.label, "supporting", "known-entity");
  }

  return [...subjects.values()];
}

export function isCoreSubjectResolvedV35(
  subjectLabel: string,
  resolvedLabels: readonly string[]
): boolean {
  const normalized = subjectLabel.toLocaleLowerCase();
  const resolvedSet = new Set(resolvedLabels.map((label) => label.toLocaleLowerCase()));
  if (resolvedSet.has(normalized)) return true;
  const seed = lookupCanonicalEntitySeedV34(subjectLabel);
  if (!seed) return false;
  if (resolvedSet.has(seed.label.toLocaleLowerCase())) return true;
  return resolvedLabels.some((label) => {
    const resolvedSeed = lookupCanonicalEntitySeedV34(label);
    return resolvedSeed?.label.toLocaleLowerCase() === seed.label.toLocaleLowerCase();
  });
}

function searchTermsForSubject(label: string): readonly string[] {
  const seed = lookupCanonicalEntitySeedV34(label);
  return [...new Set([label, seed?.label ?? "", ...(seed?.aliases ?? [])].filter(Boolean))];
}

function appearsInNarration(label: string, narrationText: string): boolean {
  return searchTermsForSubject(label).some((term) =>
    new RegExp(`\\b${escapeRegExp(term)}\\b`, "iu").test(narrationText)
  );
}

function countNarrationMentions(label: string, narrationText: string): number {
  let count = 0;
  for (const term of searchTermsForSubject(label)) {
    const matches = narrationText.match(new RegExp(`\\b${escapeRegExp(term)}\\b`, "giu"));
    count += matches?.length ?? 0;
  }
  return count;
}

function appearsInEntityAccounting(
  label: string,
  entities: readonly HistoryEntityMentionV34[],
  rejectedEntities: readonly HistoryRejectedEntityV34[]
): boolean {
  const terms = new Set(searchTermsForSubject(label).map((term) => term.toLocaleLowerCase()));
  return (
    entities.some(
      (entity) =>
        terms.has(entity.text?.toLocaleLowerCase() ?? "") ||
        terms.has(entity.normalizedLabel.toLocaleLowerCase())
    ) ||
    rejectedEntities.some((entity) => terms.has(entity.text.toLocaleLowerCase()))
  );
}

export type CoreSubjectDiagnosticV35 = {
  readonly code: "CORE_ENTITY_UNRESOLVED" | "CORE_ENTITY_CANDIDATE_RECALL_FAILURE";
  readonly message: string;
  readonly affectedIds: readonly string[];
  readonly tier: CoreSubjectTierV35;
};

export function assessCoreSubjectCompletenessV35(input: {
  readonly coreSubjects: readonly CoreSubjectSpecV35[];
  readonly entities: readonly HistoryEntityMentionV34[];
  readonly rejectedEntities: readonly HistoryRejectedEntityV34[];
  readonly narrationText: string;
}): readonly CoreSubjectDiagnosticV35[] {
  const resolvedLabels = input.entities.map((entity) => entity.normalizedLabel);
  const diagnostics: CoreSubjectDiagnosticV35[] = [];

  for (const subject of input.coreSubjects.filter((item) => item.tier === "core")) {
    if (isCoreSubjectResolvedV35(subject.label, resolvedLabels)) continue;
    const inNarration = appearsInNarration(subject.label, input.narrationText);
    if (!inNarration && subject.source === "keyword") continue;

    const mentionCount = countNarrationMentions(subject.label, input.narrationText);
    const inAccounting = appearsInEntityAccounting(
      subject.label,
      input.entities,
      input.rejectedEntities
    );

    if (inNarration && mentionCount >= 1 && !inAccounting) {
      diagnostics.push({
        code: "CORE_ENTITY_CANDIDATE_RECALL_FAILURE",
        message: `Principal subject "${subject.label}" appears in narration but never entered entity resolution accounting.`,
        affectedIds: [subject.label],
        tier: subject.tier,
      });
      continue;
    }

    if (inNarration || subject.source === "title" || subject.source === "slug") {
      diagnostics.push({
        code: "CORE_ENTITY_UNRESOLVED",
        message: `Core episode subject "${subject.label}" is not resolved in the semantic entity graph.`,
        affectedIds: [subject.label],
        tier: subject.tier,
      });
    }
  }

  return diagnostics;
}
