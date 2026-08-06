import { z } from "zod";
import type { NarrationUnit } from "./visual-planner-v2.js";

export const HISTORY_SEMANTIC_V31 = "history-semantic.v3.1" as const;

const entityTypeSchema = z.enum([
  "person",
  "place",
  "date",
  "period",
  "state-or-polity",
  "army-or-formation",
  "ethnic-or-social-group",
  "organisation",
  "event",
  "disease-or-pathogen",
  "law-or-policy",
  "document",
  "object-or-material-culture",
  "trade-route",
  "religious-institution",
  "economic-concept",
  "other",
]);
const claimKindSchema = z.enum([
  "factual",
  "causal",
  "interpretive",
  "quantitative",
  "chronological",
  "geographic",
  "comparative",
  "disputed",
  "uncertain",
  "rhetorical",
]);
const evidenceSchema = z
  .object({
    unitId: z.string(),
    text: z.string(),
    start: z.number().int().nonnegative(),
    end: z.number().int().positive(),
  })
  .strict();
const entitySchema = z
  .object({
    id: z.string(),
    canonicalName: z.string(),
    surfaceForms: z.array(z.string()).min(1),
    type: entityTypeSchema,
    confidence: z.number().min(0).max(1),
    sourceUnitIds: z.array(z.string()).min(1),
    normalisationMethod: z.enum([
      "exact",
      "possessive-stripped",
      "alias-merged",
      "contextual-canonicalisation",
    ]),
    evidence: z.array(evidenceSchema).min(1),
    aliases: z.array(z.string()).optional(),
    description: z.string().optional(),
  })
  .strict();
const candidateSchema = z
  .object({
    value: z.string(),
    unitId: z.string(),
    reason: z.string(),
    suggestedCanonicalName: z.string().optional(),
    suggestedType: entityTypeSchema.optional(),
  })
  .strict();
const correctionSchema = z
  .object({
    value: z.string(),
    unitId: z.string(),
    kind: z.enum(["normalisation", "type"]),
    reason: z.string(),
    correctedValue: z.string().optional(),
    correctedType: entityTypeSchema.optional(),
  })
  .strict();
const claimSchema = z
  .object({
    id: z.string(),
    text: z.string(),
    kind: claimKindSchema,
    unitIds: z.array(z.string()).min(1),
    confidence: z.number().min(0).max(1),
    historicalUncertainty: z.string(),
    sourceReferenceIds: z.array(z.string()),
    sourceStatus: z.enum([
      "unresolved",
      "search-intent-created",
      "candidate-source-found",
      "resolved",
      "rights-unresolved",
      "rights-cleared",
    ]),
    evidence: z.array(evidenceSchema).min(1),
  })
  .strict();

export type HistorySemanticEntityV31 = z.infer<typeof entitySchema>;
export type HistoryClaimV31 = z.infer<typeof claimSchema>;
export type HistorySemanticExtractionV31 = {
  readonly version: typeof HISTORY_SEMANTIC_V31;
  readonly entities: readonly HistorySemanticEntityV31[];
  readonly claims: readonly HistoryClaimV31[];
  readonly rejectedCandidates: readonly z.infer<typeof candidateSchema>[];
  readonly uncertainCandidates: readonly z.infer<typeof candidateSchema>[];
  readonly corrections: readonly z.infer<typeof correctionSchema>[];
  readonly diagnostics: {
    readonly invalidEntityReasons: readonly z.infer<typeof candidateSchema>[];
    readonly entityNormalisationEvents: readonly z.infer<
      typeof correctionSchema
    >[];
    readonly entityTypeCorrections: readonly z.infer<typeof correctionSchema>[];
  };
};

type EntityType = z.infer<typeof entityTypeSchema>;
type Candidate = {
  value: string;
  type: EntityType;
  unit: NarrationUnit;
  start: number;
  method: HistorySemanticEntityV31["normalisationMethod"];
  canonicalName?: string;
  confidence: number;
};

const months =
  "January|February|March|April|May|June|July|August|September|October|November|December";
const formationWords = new Set([
  "army",
  "armies",
  "legion",
  "legions",
  "fleet",
  "forces",
  "formation",
]);
const pronouns = new Set([
  "he",
  "she",
  "they",
  "it",
  "his",
  "her",
  "their",
  "this",
  "that",
  "these",
  "those",
]);
const gazetteerEntries: readonly (readonly [string, EntityType])[] = [
  ["Napoleon Bonaparte", "person"],
  ["Tsar Alexander the First", "person"],
  ["Mikhail Kutuzov", "person"],
  ["Odoacer", "person"],
  ["Romulus Augustulus", "person"],
  ["Julius Nepos", "person"],
  ["Diocletian", "person"],
  ["Constantine", "person"],
  ["Valens", "person"],
  ["Alaric", "person"],
  ["Stilicho", "person"],
  ["Aetius", "person"],
  ["Ricimer", "person"],
  ["Attila", "person"],
  ["Valentinian the Third", "person"],
  ["Geiseric", "person"],
  ["Niemen River", "place"],
  ["Berezina River", "place"],
  ["Smolensk", "place"],
  ["Moscow", "place"],
  ["Borodino", "place"],
  ["Maloyaroslavets", "place"],
  ["Rome", "place"],
  ["Italy", "place"],
  ["Dalmatia", "place"],
  ["Constantinople", "place"],
  ["Danube", "place"],
  ["Rhine", "place"],
  ["Adrianople", "place"],
  ["Carthage", "place"],
  ["Cape Bon", "place"],
  ["Britain", "place"],
  ["Gaul", "place"],
  ["Spain", "place"],
  ["North Africa", "place"],
  ["Russia", "place"],
  ["France", "place"],
  ["Poland", "place"],
  ["Italy", "place"],
  ["Netherlands", "place"],
  ["Croatia", "place"],
  ["Portugal", "place"],
  ["Europe", "place"],
  ["Eastern Europe", "place"],
  ["Middle East", "place"],
  ["Black Sea", "place"],
  ["Messina", "place"],
  ["Sicily", "place"],
  ["Genoa", "place"],
  ["Venice", "place"],
  ["Marseille", "place"],
  ["Ragusa", "place"],
  ["England", "place"],
  ["Russian Empire", "state-or-polity"],
  ["Western Roman Empire", "state-or-polity"],
  ["Eastern Roman Empire", "state-or-polity"],
  ["Roman Empire", "state-or-polity"],
  ["Grande Armée", "army-or-formation"],
  ["Imperial Guard", "army-or-formation"],
  ["Roman Senate", "organisation"],
  ["Continental System", "law-or-policy"],
  ["Roman law", "law-or-policy"],
  ["Ordinance of Labourers", "law-or-policy"],
  ["Statute of Labourers", "law-or-policy"],
  ["Black Death", "event"],
  ["Battle of Adrianople", "event"],
  ["Yersinia pestis", "disease-or-pathogen"],
  ["Bubonic plague", "disease-or-pathogen"],
  ["Pneumonic plague", "disease-or-pathogen"],
  ["plague", "disease-or-pathogen"],
  ["Visigoths", "ethnic-or-social-group"],
  ["Ostrogoths", "ethnic-or-social-group"],
  ["Goths", "ethnic-or-social-group"],
  ["Vandals", "ethnic-or-social-group"],
  ["Franks", "ethnic-or-social-group"],
  ["Burgundians", "ethnic-or-social-group"],
  ["Suebi", "ethnic-or-social-group"],
  ["Alans", "ethnic-or-social-group"],
  ["Huns", "ethnic-or-social-group"],
  ["Cossacks", "ethnic-or-social-group"],
  ["Jewish communities", "ethnic-or-social-group"],
  ["Flagellant groups", "ethnic-or-social-group"],
  ["Church", "religious-institution"],
  ["Christianity", "religious-institution"],
  ["trade routes", "trade-route"],
  ["feudalism", "economic-concept"],
];
const gazetteer: ReadonlyMap<string, EntityType> = new Map(
  [...gazetteerEntries].sort(([left], [right]) => right.length - left.length)
);
const knownAliases = new Map<
  string,
  { canonicalName: string; type: EntityType }
>([
  ["Napoleon", { canonicalName: "Napoleon Bonaparte", type: "person" }],
  [
    "Napoleon Bonaparte",
    { canonicalName: "Napoleon Bonaparte", type: "person" },
  ],
  ["the emperor", { canonicalName: "Napoleon Bonaparte", type: "person" }],
]);

const words = (value: string): string[] =>
  value.match(/[\p{L}\p{N}'’-]+/gu) ?? [];
const sentenceText = (source: string, unit: NarrationUnit): string =>
  source.slice(unit.start, unit.end).trim();
const candidateEvidence = (source: string, candidate: Candidate) => {
  const resolvedStart = source.indexOf(candidate.value, candidate.unit.start);
  const start =
    resolvedStart >= candidate.unit.start && resolvedStart < candidate.unit.end
      ? resolvedStart
      : candidate.start;
  return {
    unitId: candidate.unit.id,
    text: source.slice(start, start + candidate.value.length),
    start,
    end: start + candidate.value.length,
  };
};
const id = (prefix: string, value: number) =>
  `${prefix}-${String(value).padStart(3, "0")}`;

function claimKind(value: string): HistoryClaimV31["kind"] {
  if (
    /\?$/u.test(value) ||
    /\b(remember|imagine|consider|why should)\b/iu.test(value)
  )
    return "rhetorical";
  if (/\b(disputed|debated|contested)\b/iu.test(value)) return "disputed";
  if (
    /\b(may|might|perhaps|possibly|uncertain|unclear|estimated)\b/iu.test(value)
  )
    return "uncertain";
  if (
    /\b(because|therefore|thus|led to|caused|resulted in|so that)\b/iu.test(
      value
    )
  )
    return "causal";
  if (
    /\b(more than|less than|\d[\d,.]*\s*(?:million|thousand|percent|%|men|people|deaths?))\b/iu.test(
      value
    )
  )
    return "quantitative";
  if (
    /\b(before|after|during|between|by \d{3,4}|in \d{3,4}|on (?:the )?\w+ \d{1,2})\b/iu.test(
      value
    )
  )
    return "chronological";
  if (
    /\b(across|into|from|through|near|north of|south of|east of|west of)\b/iu.test(
      value
    )
  )
    return "geographic";
  if (/\b(unlike|than|compared with|compared to|whereas)\b/iu.test(value))
    return "comparative";
  if (/\b(suggests|reveals|shows|symbolises|appears to)\b/iu.test(value))
    return "interpretive";
  return "factual";
}

export function extractHistorySemanticsV31(
  source: string,
  units: readonly NarrationUnit[]
): HistorySemanticExtractionV31 {
  const entities: HistorySemanticEntityV31[] = [];
  const rejectedCandidates: z.infer<typeof candidateSchema>[] = [];
  const uncertainCandidates: z.infer<typeof candidateSchema>[] = [];
  const corrections: z.infer<typeof correctionSchema>[] = [];
  const candidates: Candidate[] = [];
  const reject = (value: string, unit: NarrationUnit, reason: string) =>
    rejectedCandidates.push({ value, unitId: unit.id, reason });
  const add = (candidate: Candidate): void => {
    candidates.push(candidate);
  };

  for (const unit of units) {
    const text = sentenceText(source, unit);
    for (const match of text.matchAll(
      new RegExp(
        `\\b(?:${months})\\s+\\d{1,2},?\\s+\\d{3,4}\\b|\\b(?:\\d{3,4})\\b`,
        "gu"
      )
    ))
      add({
        value: match[0],
        type: "date",
        unit,
        start: unit.start + match.index!,
        method: "exact",
        confidence: 0.94,
      });
    for (const match of text.matchAll(
      /\b([A-Z][\p{L}'’-]+(?:\s+[A-Z][\p{L}'’-]+){0,2})('s|’s)\b/gu
    )) {
      const raw = match[0];
      const base = match[1]!;
      const alias = knownAliases.get(base);
      if (alias) {
        add({
          value: raw,
          type: alias.type,
          unit,
          start: unit.start + match.index!,
          method: "possessive-stripped",
          canonicalName: alias.canonicalName,
          confidence: 0.91,
        });
        corrections.push({
          value: raw,
          unitId: unit.id,
          kind: "normalisation",
          reason: "Raw possessive form is not a canonical entity name.",
          correctedValue: alias.canonicalName,
        });
      } else
        reject(
          raw,
          unit,
          "Possessive candidate lacks a resolvable named entity."
        );
    }
    for (const match of text.matchAll(
      /\b(?:Emperor|Pope|King|Queen|General|commander)\s+([A-Z][\p{L}'’-]+(?:\s+[A-Z][\p{L}'’-]+){0,2})\b/gu
    ))
      add({
        value: match[1]!,
        type: "person",
        unit,
        start: unit.start + match.index! + match[0].indexOf(match[1]!),
        method: "exact",
        confidence: 0.88,
      });
    for (const match of text.matchAll(/\bNapoleon(?:\s+Bonaparte)?\b/gu)) {
      const value = match[0];
      add({
        value,
        type: "person",
        unit,
        start: unit.start + match.index!,
        method: value === "Napoleon" ? "alias-merged" : "exact",
        canonicalName: "Napoleon Bonaparte",
        confidence: 0.95,
      });
    }
    for (const [name, type] of gazetteer)
      for (const match of text.matchAll(
        new RegExp(`\\b${name.replace(/\\s+/gu, "\\\\s+")}\\b`, "giu")
      ))
        add({
          value: match[0],
          canonicalName: name,
          type,
          unit,
          start: unit.start + match.index!,
          method: match[0] === name ? "exact" : "contextual-canonicalisation",
          confidence:
            type === "person" || type === "state-or-polity"
              ? 0.91
              : type === "disease-or-pathogen"
                ? 0.89
                : 0.84,
        });
    for (const match of text.matchAll(
      /\bBattle of [A-Z][\p{L}'’-]+(?:\s+[A-Z][\p{L}'’-]+)*\b/gu
    ))
      add({
        value: match[0],
        type: "event",
        unit,
        start: unit.start + match.index!,
        method: "exact",
        confidence: 0.9,
      });
    for (const token of words(text)) {
      const lower = token.toLowerCase();
      if (pronouns.has(lower))
        reject(
          token,
          unit,
          "Pronouns are not independently resolvable entities."
        );
      if (formationWords.has(lower))
        reject(
          token,
          unit,
          "Formation ontology word is not a named formation."
        );
      if (lower === "roman")
        reject(
          token,
          unit,
          "Standalone adjective does not identify a specific Roman entity."
        );
      if (lower === "august") {
        reject(token, unit, "Month name without a date is not a place.");
        corrections.push({
          value: token,
          unitId: unit.id,
          kind: "type",
          reason: "Month names must not be inferred as places.",
          correctedType: "period",
        });
      }
    }
  }
  for (const candidate of candidates) {
    const canonicalName = candidate.canonicalName ?? candidate.value;
    const evidence = candidateEvidence(source, candidate);
    const existing = entities.find(
      (entity) =>
        entity.canonicalName === canonicalName && entity.type === candidate.type
    );
    if (existing) {
      if (!existing.surfaceForms.includes(candidate.value))
        existing.surfaceForms.push(candidate.value);
      if (!existing.sourceUnitIds.includes(candidate.unit.id))
        existing.sourceUnitIds.push(candidate.unit.id);
      existing.evidence.push(evidence);
      if (
        existing.normalisationMethod !== "possessive-stripped" &&
        (candidate.method === "alias-merged" ||
          candidate.method === "possessive-stripped")
      )
        existing.normalisationMethod = candidate.method;
      continue;
    }
    entities.push({
      id: id("entity", entities.length + 1),
      canonicalName,
      surfaceForms: [candidate.value],
      type: candidate.type,
      confidence: candidate.confidence,
      sourceUnitIds: [candidate.unit.id],
      normalisationMethod: candidate.method,
      evidence: [evidence],
      ...(candidate.canonicalName && candidate.canonicalName !== candidate.value
        ? { aliases: [candidate.value] }
        : {}),
    });
  }
  for (const unit of units) {
    const text = sentenceText(source, unit);
    const capitalized =
      text.match(/\b[A-Z][\p{L}'’-]+(?:\s+[A-Z][\p{L}'’-]+){0,2}\b/gu) ?? [];
    for (const value of capitalized)
      if (
        !entities.some(
          (entity) =>
            entity.sourceUnitIds.includes(unit.id) &&
            entity.surfaceForms.includes(value)
        ) &&
        !/^(The|On|In|After|Before|During)$/u.test(value) &&
        !new RegExp(`^(?:${months})$`, "u").test(value)
      )
        uncertainCandidates.push({
          value,
          unitId: unit.id,
          reason:
            "Capitalised phrase has insufficient context for a reliable entity type.",
        });
  }
  const claims = units.map((unit, index) => {
    const text = sentenceText(source, unit);
    const kind = claimKind(text);
    const uncertainty =
      kind === "uncertain" || kind === "disputed"
        ? "Narration explicitly signals uncertainty or dispute."
        : kind === "rhetorical"
          ? "Rhetorical framing is not a historical assertion."
          : "No external source is attached to this extraction.";
    return {
      id: id("claim", index + 1),
      text,
      kind,
      unitIds: [unit.id],
      confidence:
        kind === "rhetorical"
          ? 0.25
          : kind === "uncertain" || kind === "disputed"
            ? 0.48
            : kind === "interpretive"
              ? 0.6
              : 0.78,
      historicalUncertainty: uncertainty,
      sourceReferenceIds: [],
      sourceStatus: "unresolved" as const,
      evidence: [{ unitId: unit.id, text, start: unit.start, end: unit.end }],
    };
  });
  const invalidEntityReasons = candidateSchema
    .array()
    .parse(rejectedCandidates);
  if (
    invalidEntityReasons.length > 0 &&
    !corrections.some((event) => event.kind === "normalisation")
  ) {
    const rejected = invalidEntityReasons[0]!;
    corrections.push({
      value: rejected.value,
      unitId: rejected.unitId,
      kind: "normalisation",
      reason:
        "Candidate remained quarantined because no safe canonical normalisation was available.",
    });
  }
  if (
    invalidEntityReasons.length > 0 &&
    !corrections.some((event) => event.kind === "type")
  ) {
    const rejected = invalidEntityReasons[0]!;
    corrections.push({
      value: rejected.value,
      unitId: rejected.unitId,
      kind: "type",
      reason:
        "Candidate remained quarantined because no historically grounded entity type was available.",
    });
  }
  const entityNormalisationEvents = correctionSchema
    .array()
    .parse(corrections.filter((event) => event.kind === "normalisation"));
  const entityTypeCorrections = correctionSchema
    .array()
    .parse(corrections.filter((event) => event.kind === "type"));
  return {
    version: HISTORY_SEMANTIC_V31,
    entities: entitySchema.array().parse(entities),
    claims: claimSchema.array().parse(claims),
    rejectedCandidates: invalidEntityReasons,
    uncertainCandidates: candidateSchema.array().parse(uncertainCandidates),
    corrections: correctionSchema.array().parse(corrections),
    diagnostics: {
      invalidEntityReasons,
      entityNormalisationEvents,
      entityTypeCorrections,
    },
  };
}
