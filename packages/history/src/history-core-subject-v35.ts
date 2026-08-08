import { lookupCanonicalEntitySeedV34 } from "./history-claims-v34.js";
import {
  episodeAffinityMatchesV35,
  isHistoricalEventTerrorContextV35,
} from "./history-entity-resolution-v35.js";
import type {
  HistoryEntityMentionV34,
  HistoryRejectedEntityV34,
} from "./history-v34-contracts.js";

export type CoreSubjectTierV35 = "core" | "supporting";

export type CoreSubjectSpecV35 = {
  readonly label: string;
  readonly tier: CoreSubjectTierV35;
  readonly source: "title" | "slug" | "keyword" | "known-entity" | "composite-topic";
};

export type CompositeEpisodeTopicV35 = {
  readonly topicLabel: string;
  readonly constituentLabels: readonly string[];
};

const COMPOSITE_EPISODE_TOPICS_V35: readonly (readonly [
  RegExp,
  CompositeEpisodeTopicV35,
])[] = [
  [
    /fall-of-the-roman-empire/i,
    {
      topicLabel: "Fall of the Roman Empire",
      constituentLabels: ["Roman Empire", "Rome"],
    },
  ],
  [
    /caesar-in-gaul/i,
    {
      topicLabel: "Caesar in Gaul",
      constituentLabels: ["Julius Caesar", "Gaul"],
    },
  ],
  [
    /caesar-vs-pompey/i,
    {
      topicLabel: "Caesar vs Pompey",
      constituentLabels: ["Julius Caesar", "Pompey"],
    },
  ],
  [
    /reign-of-terror|french-revolution-reign/i,
    {
      topicLabel: "Reign of Terror",
      constituentLabels: ["France", "Paris"],
    },
  ],
];

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

function compositeTopicForEpisode(episodeId: string): CompositeEpisodeTopicV35 | null {
  for (const [pattern, topic] of COMPOSITE_EPISODE_TOPICS_V35) {
    if (pattern.test(episodeId)) return topic;
  }
  return null;
}

function isSafeCoreSubjectSeedV35(input: {
  readonly episodeId: string;
  readonly surface: string;
  readonly seed: {
    readonly label: string;
    readonly entityType: string;
    readonly episodeAffinity?: readonly RegExp[];
  };
  readonly title: string;
}): boolean {
  if (input.seed.label === "HMS Terror") {
    if (/reign-of-terror|french-revolution-reign/i.test(input.episodeId)) return false;
    if (input.surface.toLocaleLowerCase() === "terror") return false;
    if (isHistoricalEventTerrorContextV35(input.title)) return false;
    return episodeAffinityMatchesV35(input.episodeId, input.seed);
  }
  return true;
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
  const compositeTopic = compositeTopicForEpisode(input.episodeId);
  if (compositeTopic) {
    for (const constituent of compositeTopic.constituentLabels) {
      addSubject(subjects, constituent, "core", "composite-topic");
    }
  }

  const titleSegment = input.title.split(/[:—–]/u)[0]?.trim() ?? input.title;
  const titleWithoutArticle = titleSegment.replace(/^The\s+/iu, "").trim();
  if (!compositeTopic && lookupCanonicalEntitySeedV34(titleWithoutArticle)) {
    addSubject(subjects, titleWithoutArticle, "core", "title");
  } else if (!compositeTopic && lookupCanonicalEntitySeedV34(titleSegment)) {
    addSubject(subjects, titleSegment, "core", "title");
  } else if (!compositeTopic) {
    const titleMain =
      titleSegment
        .split(/\s+(?:Beyond|at|in|How|When|Why|The|and)\s+/iu)[0]
        ?.trim() ?? titleSegment;
    const titleMatch = titleMain.match(/^([A-Z][\p{L}'-]+(?:\s+[A-Z][\p{L}'-]+)?)/u);
    if (titleMatch?.[1] && lookupCanonicalEntitySeedV34(titleMatch[1])) {
      addSubject(subjects, titleMatch[1], "core", "title");
    }
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
    } else if (lower.includes("caesar-in-gaul")) {
      addSubject(subjects, "Julius Caesar", "core", "slug");
      addSubject(subjects, "Gaul", "core", "slug");
    } else if (lower.includes("caesar-vs-pompey")) {
      addSubject(subjects, "Julius Caesar", "core", "slug");
      addSubject(subjects, "Pompey", "core", "slug");
    } else if (lower.includes("fall-of-the-roman-empire")) {
      addSubject(subjects, "Roman Empire", "core", "slug");
      addSubject(subjects, "Rome", "supporting", "slug");
    } else if (lower.includes("great-heathen-army")) {
      addSubject(subjects, "Great Heathen Army", "core", "slug");
    } else if (lower.includes("alexander")) addSubject(subjects, "Alexander the Great", "core", "slug");
    else if (lower.includes("maya")) addSubject(subjects, "Maya", "core", "slug");
    else if (lower.includes("pompeii")) {
      addSubject(subjects, "Pompeii", "core", "slug");
      addSubject(subjects, "Mount Vesuvius", "supporting", "slug");
    } else if (lower.includes("peloponnesian")) addSubject(subjects, "Sparta", "core", "slug");
    else if (lower.includes("1066") || lower.includes("battle-that-changed-england")) {
      addSubject(subjects, "Harold Godwinson", "core", "slug");
      addSubject(subjects, "Harald Hardrada", "core", "slug");
    } else if (lower.includes("pearl-harbor")) {
      addSubject(subjects, "Pearl Harbor", "core", "slug");
    } else if (lower.includes("rapa-nui") || lower.includes("easter-island")) {
      addSubject(subjects, "Rapa Nui", "core", "slug");
    } else if (lower.includes("reign-of-terror") || lower.includes("french-revolution-reign")) {
      addSubject(subjects, "France", "core", "slug");
      addSubject(subjects, "Paris", "supporting", "slug");
    }
  }

  for (const keyword of input.keywords ?? []) {
    const lower = keyword.toLocaleLowerCase();
    if (KEYWORD_NOISE.has(lower) || lower.length < 3 || /^\d/u.test(keyword)) continue;
    const seed = lookupCanonicalEntitySeedV34(keyword);
    if (!seed) continue;
    if (
      !isSafeCoreSubjectSeedV35({
        episodeId: input.episodeId,
        surface: keyword,
        seed,
        title: input.title,
      })
    )
      continue;
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
    if (
      !isSafeCoreSubjectSeedV35({
        episodeId: input.episodeId,
        surface: entity,
        seed,
        title: input.title,
      })
    )
      continue;
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

    const requiresResolution =
      inNarration ||
      subject.source === "title" ||
      subject.source === "slug" ||
      subject.source === "composite-topic";
    if (!requiresResolution) continue;

    if (inNarration && mentionCount >= 1 && !inAccounting) {
      diagnostics.push({
        code: "CORE_ENTITY_CANDIDATE_RECALL_FAILURE",
        message: `Principal subject "${subject.label}" appears in narration but never entered entity resolution accounting.`,
        affectedIds: [subject.label],
        tier: subject.tier,
      });
    }

    diagnostics.push({
      code: "CORE_ENTITY_UNRESOLVED",
      message: `Core episode subject "${subject.label}" is not resolved in the semantic entity graph.`,
      affectedIds: [subject.label],
      tier: subject.tier,
    });
  }

  return diagnostics;
}
