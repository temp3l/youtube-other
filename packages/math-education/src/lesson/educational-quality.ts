import { z } from "zod";

import type { LessonVariantSpecification } from "../domain/index.js";
import type { LocalizedNarration } from "../localization/localization.js";
import { educationalGradeProfile } from "./grade-profiles.js";

export const EDUCATIONAL_QUALITY_REPORT_VERSION =
  "math-educational-quality.v1" as const;

export const educationalQualityIssueCodeSchema = z.enum([
  "MATH_INTERNAL_LANGUAGE_LEAK",
  "MATH_DIGIT_BY_DIGIT_NUMBER",
  "MATH_OBJECTIVE_COVERAGE_MISSING",
  "MATH_PRACTICE_PROMPT_MISSING",
  "MATH_SOLUTION_TASK_MISMATCH",
  "MATH_MISCONCEPTION_NOT_CONCRETE",
  "MATH_NARRATED_VALUE_UNBOUND",
  "MATH_SCENE_SYNC_MISMATCH",
  "MATH_SUMMARY_RULE_MISSING",
  "MATH_GRADE_VOCABULARY_VIOLATION",
  "MATH_GERMAN_TRANSLITERATION",
  "MATH_IRRELEVANT_GENERIC_DIRECTIVE",
  "MATH_EXCESSIVE_REPETITION",
  "MATH_HIDDEN_CONTEXT_REQUIRED",
  "MATH_LONG_SENTENCE",
  "MATH_SCENE_OVERLOADED",
  "MATH_WEAK_CONTEXTUALIZATION",
  "MATH_LATE_MATHEMATICAL_ACTION",
]);
export type EducationalQualityIssueCode = z.infer<
  typeof educationalQualityIssueCodeSchema
>;

export const educationalQualityIssueSchema = z.strictObject({
  code: educationalQualityIssueCodeSchema,
  severity: z.enum(["blocking", "warning"]),
  message: z.string().min(1),
  sceneId: z.string().regex(/^scene-\d{3}$/u).optional(),
  evidence: z.array(z.string().min(1)).min(1),
});
export type EducationalQualityIssue = z.infer<
  typeof educationalQualityIssueSchema
>;

const scoreSchema = z.number().int().min(0).max(100);
export const educationalQualityReportSchema = z.strictObject({
  artifactVersion: z.literal(EDUCATIONAL_QUALITY_REPORT_VERSION),
  lessonId: z.string().min(1),
  gradeBand: z.enum(["grades-5-6", "grades-7-8", "grades-9-10"]),
  factualCorrectness: scoreSchema,
  objectiveAlignment: scoreSchema,
  gradeAppropriateness: scoreSchema,
  explanationClarity: scoreSchema,
  taskClarity: scoreSchema,
  narrationNaturalness: scoreSchema,
  visualNarrationAlignment: scoreSchema,
  cognitiveLoad: scoreSchema,
  overall: scoreSchema,
  passed: z.boolean(),
  blockingIssues: z.array(educationalQualityIssueSchema),
  warnings: z.array(educationalQualityIssueSchema),
});
export type EducationalQualityReport = z.infer<
  typeof educationalQualityReportSchema
>;

const internalLanguagePatterns = [
  /\breview(?:t|ter|te|ed)\b/iu,
  /\b(?:mathematisch\s+geprüft|geprüft(?:e|er|es|en|em)?\s+(?:Modell|Darstellung|Beispiel|Lösungsweg|Ergebnis|Transferlösung|Übergang))\b/iu,
  /\bstrukturierte[rsn]?\s+Datensatz\b/iu,
  /\b(?:Compiler|Validator|Provenienz|Prompt|Schema|Payload)\b/iu,
  /\bBinde\s+Kategorien,?\s+Zellen\s+und\s+Werte\b/iu,
  /\bLeite\s+Totale,?\s+Maximum\s+und\s+Skala\b/iu,
] as const;

const gradeFiveProcessJargon =
  /\b(?:Kategorietotal|Datensatz|mathematische Beziehungen|Ausgangsdaten)\b/iu;
const digitByDigitGerman =
  /\b(?:eins|zwei|drei|vier|fünf|sechs|sieben|acht|neun)\s+(?:eins|zwei|drei|vier|fünf|sechs|sieben|acht|neun)\b/iu;
const germanTransliteration = /\b(?:fuenf|fuss|gruen|buecher)\b/iu;

function issue(
  code: EducationalQualityIssueCode,
  severity: "blocking" | "warning",
  message: string,
  evidence: readonly string[],
  sceneId?: string
): EducationalQualityIssue {
  return educationalQualityIssueSchema.parse({
    code,
    severity,
    message,
    evidence: [...evidence],
    ...(sceneId ? { sceneId } : {}),
  });
}

function sentenceWordCounts(text: string): readonly number[] {
  return text
    .split(/(?<=[.!?])\s+/u)
    .map((sentence) => sentence.trim().split(/\s+/u).filter(Boolean).length)
    .filter((count) => count > 0);
}

function repeatedSentences(text: string): readonly string[] {
  const sentences = text
    .split(/(?<=[.!?])\s+/u)
    .map((sentence) =>
      sentence
        .toLocaleLowerCase("de")
        .replace(/[^\p{L}\p{N}\s]/gu, "")
        .replace(/\s+/gu, " ")
        .trim()
    )
    .filter((sentence) => sentence.split(" ").length >= 5);
  const counts = new Map<string, number>();
  for (const sentence of sentences)
    counts.set(sentence, (counts.get(sentence) ?? 0) + 1);
  return [...counts.entries()]
    .filter(([, count]) => count >= 3)
    .map(([sentence]) => sentence);
}

function score(base: number, issues: readonly EducationalQualityIssue[]): number {
  return Math.max(
    0,
    Math.round(
      base -
        issues.reduce(
          (total, candidate) =>
            total + (candidate.severity === "blocking" ? 24 : 6),
          0
        )
    )
  );
}

function gradeFromSkillId(skillId: string): number {
  const match = /^M(10|[5-9])-/u.exec(skillId);
  if (!match?.[1])
    throw new Error(`Cannot derive a supported grade from ${skillId}.`);
  return Number.parseInt(match[1], 10);
}

function tallyCoverageIssues(
  text: string,
  segments: LocalizedNarration["segments"]
): EducationalQualityIssue[] {
  const missing = [
    ["Urliste", /Urliste/iu],
    ["Strichliste", /Strichliste/iu],
    ["Reihenfolge", /Reihenfolge/iu],
    ["Fünfergruppe", /Fünfergruppe/iu],
    ["fünfter Querstrich", /fünfte[nr]?\s+Strich.*quer|quer.*erste[n]?\s+vier/iu],
    ["benannte Häufigkeiten", /Apfel.*vier|vier.*Apfel/iu],
    ["Gesamtzahl zwölf", /Vier plus drei plus fünf sind zwölf/iu],
    ["häufigste Kategorie", /Banane.*am häufigsten/iu],
  ].filter(([, pattern]) => !(pattern as RegExp).test(text));
  const result: EducationalQualityIssue[] = [];
  if (missing.length > 0)
    result.push(
      issue(
        "MATH_OBJECTIVE_COVERAGE_MISSING",
        "blocking",
        "The Urliste/Strichliste objective is not fully taught.",
        missing.map(([label]) => String(label))
      )
    );
  if (!segments[6]?.spokenText.includes("?"))
    result.push(
      issue(
        "MATH_PRACTICE_PROMPT_MISSING",
        "blocking",
        "The independent transfer scene has no concrete spoken question.",
        [segments[6]?.spokenText ?? "missing scene"],
        segments[6]?.sceneId
      )
    );
  if (!/Sechs plus vier plus fünf sind fünfzehn/iu.test(segments[7]?.spokenText ?? ""))
    result.push(
      issue(
        "MATH_SOLUTION_TASK_MISMATCH",
        "blocking",
        "The transfer solution does not answer the displayed school-route task.",
        [segments[7]?.spokenText ?? "missing scene"],
        segments[7]?.sceneId
      )
    );
  if (
    !segments[4]?.spokenText.includes("?") ||
    !/(?:stimmt nicht|falsch)/iu.test(segments[4]?.spokenText ?? "") ||
    !/(?:Querstrich|fünfte[nr]?\s+Strich)/iu.test(segments[4]?.spokenText ?? "")
  )
    result.push(
      issue(
        "MATH_MISCONCEPTION_NOT_CONCRETE",
        "blocking",
        "The misconception scene must show and correct a concrete false tally claim.",
        [segments[4]?.spokenText ?? "missing scene"],
        segments[4]?.sceneId
      )
    );
  if (!/(?:Urliste|Strichliste).*(?:Fünfergruppe|fünf)/iu.test(segments[8]?.spokenText ?? ""))
    result.push(
      issue(
        "MATH_SUMMARY_RULE_MISSING",
        "blocking",
        "The summary does not state the core mathematical rules.",
        [segments[8]?.spokenText ?? "missing scene"],
        segments[8]?.sceneId
      )
    );
  return result;
}

export function assessEducationalQuality(input: {
  readonly lesson: LessonVariantSpecification;
  readonly narration: LocalizedNarration;
}): EducationalQualityReport {
  const { lesson, narration } = input;
  const gradeProfile = educationalGradeProfile(gradeFromSkillId(lesson.skillId));
  const blockingIssues: EducationalQualityIssue[] = [];
  const warnings: EducationalQualityIssue[] = [];
  const spoken = narration.segments.map((segment) => segment.spokenText).join(" ");
  const learnerCopy = `${spoken} ${narration.segments.map((segment) => segment.displayText).join(" ")}`;
  const displayCopy = narration.segments
    .map((segment) => segment.displayText)
    .join(" ");

  const internalMatches = internalLanguagePatterns
    .filter((pattern) => pattern.test(learnerCopy))
    .map((pattern) => pattern.source);
  if (internalMatches.length > 0)
    blockingIssues.push(
      issue(
        "MATH_INTERNAL_LANGUAGE_LEAK",
        "blocking",
        "Internal planning or review language reached learner-facing copy.",
        internalMatches
      )
    );
  if (digitByDigitGerman.test(spoken))
    blockingIssues.push(
      issue(
        "MATH_DIGIT_BY_DIGIT_NUMBER",
        "blocking",
        "A multi-digit cardinal appears to be spoken as isolated digits.",
        [spoken.match(digitByDigitGerman)?.[0] ?? "digit sequence"]
      )
    );
  if (germanTransliteration.test(learnerCopy))
    blockingIssues.push(
      issue(
        "MATH_GERMAN_TRANSLITERATION",
        "blocking",
        "Avoidable ASCII transliteration appears in final German content.",
        [learnerCopy.match(germanTransliteration)?.[0] ?? "transliteration"]
      )
    );
  if (
    lesson.skillId === "M5-DZ-001" &&
    /\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)/u.test(displayCopy)
  )
    blockingIssues.push(
      issue(
        "MATH_NARRATED_VALUE_UNBOUND",
        "blocking",
        "The tally-list display exposes an unlabeled raw frequency tuple.",
        [
          displayCopy.match(/\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)/u)?.[0] ??
            "raw tuple",
        ]
      )
    );
  if (gradeProfile.band === "grades-5-6" && gradeFiveProcessJargon.test(spoken))
    blockingIssues.push(
      issue(
        "MATH_GRADE_VOCABULARY_VIOLATION",
        "blocking",
        "Grade 5–6 narration uses unexplained process jargon.",
        [spoken.match(gradeFiveProcessJargon)?.[0] ?? "process jargon"]
      )
    );
  if (/\b(?:Einheiten|Vorzeichen|Skala|Dezimalstellen)\b/iu.test(spoken) && lesson.skillId === "M5-DZ-001")
    blockingIssues.push(
      issue(
        "MATH_IRRELEVANT_GENERIC_DIRECTIVE",
        "blocking",
        "The tally lesson refers to concepts absent from its math model.",
        [spoken.match(/\b(?:Einheiten|Vorzeichen|Skala|Dezimalstellen)\b/iu)?.[0] ?? "irrelevant directive"]
      )
    );

  const knownFacts = new Set(lesson.facts.map((fact) => fact.factId));
  for (const [index, segment] of narration.segments.entries()) {
    const scene = lesson.scenes[index];
    if (
      !scene ||
      segment.sceneId !== scene.sceneId ||
      segment.factIds.join("\0") !== scene.factIds.join("\0")
    )
      blockingIssues.push(
        issue(
          "MATH_SCENE_SYNC_MISMATCH",
          "blocking",
          "Narration and board scene identities or ordered fact bindings disagree.",
          [segment.sceneId, scene?.sceneId ?? "missing board scene"],
          segment.sceneId
        )
      );
    if (segment.factIds.some((factId) => !knownFacts.has(factId)))
      blockingIssues.push(
        issue(
          "MATH_NARRATED_VALUE_UNBOUND",
          "blocking",
          "Narration references a value that is absent from the canonical lesson facts.",
          segment.factIds.filter((factId) => !knownFacts.has(factId)),
          segment.sceneId
        )
      );
    const longestSentence = Math.max(...sentenceWordCounts(segment.spokenText));
    if (longestSentence > gradeProfile.maximumSentenceWords)
      warnings.push(
        issue(
          "MATH_LONG_SENTENCE",
          "warning",
          `A sentence exceeds the ${gradeProfile.maximumSentenceWords}-word grade-band target.`,
          [String(longestSentence)],
          segment.sceneId
        )
      );
    if (segment.factIds.length > gradeProfile.maximumNewConceptsPerScene + 4)
      warnings.push(
        issue(
          "MATH_SCENE_OVERLOADED",
          "warning",
          "A scene exposes too many semantic facts at once.",
          [String(segment.factIds.length)],
          segment.sceneId
        )
      );
  }
  if (/\[\[|\]\]|\b(?:TODO|TBD)\b/iu.test(learnerCopy))
    blockingIssues.push(
      issue(
        "MATH_HIDDEN_CONTEXT_REQUIRED",
        "blocking",
        "Learner-facing output contains unresolved hidden-context markers.",
        [learnerCopy.match(/\[\[|\]\]|\b(?:TODO|TBD)\b/iu)?.[0] ?? "marker"]
      )
    );

  const repetition = repeatedSentences(spoken);
  if (repetition.length > 0)
    blockingIssues.push(
      issue(
        "MATH_EXCESSIVE_REPETITION",
        "blocking",
        "Near-identical process directions repeat beyond the configured limit.",
        repetition
      )
    );
  const openingWordCount = narration.segments
    .slice(0, 2)
    .reduce(
      (count, segment) =>
        count + segment.spokenText.split(/\s+/u).filter(Boolean).length,
      0
    );
  if (openingWordCount > 120)
    warnings.push(
      issue(
        "MATH_LATE_MATHEMATICAL_ACTION",
        "warning",
        "Too much narration occurs before the first mathematical action.",
        [String(openingWordCount)]
      )
    );
  if (lesson.skillId === "M5-DZ-001" && narration.language === "de")
    blockingIssues.push(...tallyCoverageIssues(spoken, narration.segments));
  else if (!lesson.learningObjective.split(/\s+/u).some((word) => word.length > 5 && new RegExp(word, "iu").test(spoken)))
    warnings.push(
      issue(
        "MATH_WEAK_CONTEXTUALIZATION",
        "warning",
        "Narration weakly reflects the declared objective vocabulary.",
        [lesson.learningObjective]
      )
    );

  const allIssues = [...blockingIssues, ...warnings];
  const dimensions = {
    factualCorrectness: score(100, blockingIssues.filter((candidate) => ["MATH_SOLUTION_TASK_MISMATCH", "MATH_NARRATED_VALUE_UNBOUND"].includes(candidate.code))),
    objectiveAlignment: score(100, allIssues.filter((candidate) => candidate.code === "MATH_OBJECTIVE_COVERAGE_MISSING")),
    gradeAppropriateness: score(100, allIssues.filter((candidate) => ["MATH_GRADE_VOCABULARY_VIOLATION", "MATH_LONG_SENTENCE", "MATH_GERMAN_TRANSLITERATION"].includes(candidate.code))),
    explanationClarity: score(100, allIssues.filter((candidate) => ["MATH_SUMMARY_RULE_MISSING", "MATH_WEAK_CONTEXTUALIZATION", "MATH_MISCONCEPTION_NOT_CONCRETE"].includes(candidate.code))),
    taskClarity: score(100, allIssues.filter((candidate) => ["MATH_PRACTICE_PROMPT_MISSING", "MATH_SOLUTION_TASK_MISMATCH"].includes(candidate.code))),
    narrationNaturalness: score(100, allIssues.filter((candidate) => ["MATH_INTERNAL_LANGUAGE_LEAK", "MATH_DIGIT_BY_DIGIT_NUMBER", "MATH_EXCESSIVE_REPETITION", "MATH_IRRELEVANT_GENERIC_DIRECTIVE"].includes(candidate.code))),
    visualNarrationAlignment: score(100, blockingIssues.filter((candidate) => ["MATH_SCENE_SYNC_MISMATCH", "MATH_NARRATED_VALUE_UNBOUND"].includes(candidate.code))),
    cognitiveLoad: score(100, warnings.filter((candidate) => ["MATH_SCENE_OVERLOADED", "MATH_LATE_MATHEMATICAL_ACTION", "MATH_LONG_SENTENCE"].includes(candidate.code))),
  };
  const overall = Math.round(
    Object.values(dimensions).reduce((sum, value) => sum + value, 0) /
      Object.keys(dimensions).length
  );
  return educationalQualityReportSchema.parse({
    artifactVersion: EDUCATIONAL_QUALITY_REPORT_VERSION,
    lessonId: lesson.lessonId,
    gradeBand: gradeProfile.band,
    ...dimensions,
    overall,
    passed: blockingIssues.length === 0,
    blockingIssues,
    warnings,
  });
}

export function assertEducationalQuality(report: EducationalQualityReport): void {
  const parsed = educationalQualityReportSchema.parse(report);
  if (!parsed.passed)
    throw new Error(
      `Educational quality blocked: ${parsed.blockingIssues.map((candidate) => candidate.code).join(", ")}.`
    );
}
