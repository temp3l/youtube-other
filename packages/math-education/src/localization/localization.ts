import { z } from "zod";
import {
  type ExactValue,
  type LessonVariantSpecification,
  mathLanguageSchema,
  type MathLanguage,
} from "../domain/index.js";
import { canonicalHash } from "../verification/canonical-json.js";
import { numberOperationsConceptIds } from "../lesson/number-operations-standard-content.js";
import { fractionsDecimalsConceptIds } from "../lesson/fractions-decimals-standard-content.js";
import { geometryMeasurementConceptIds } from "../lesson/geometry-measurement-standard-content.js";
import { dataDiagramConceptIds } from "../lesson/data-diagrams-standard-content.js";
import { buildFactLock } from "./fact-lock.js";
import {
  assertGlossaryText,
  glossaryTerm,
  loadMathGlossary,
  type MathGlossary,
} from "./glossary.js";
import {
  formatExactInteger,
  formatExpression,
  formatMeasurement,
  type FormattedMath,
} from "./locale-formatter.js";
import { localeProfiles } from "./tts-lexicon.js";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
export const MATH_LOCKED_FACT_NARRATION_VERSION = "locked-facts.v3" as const;
export const MATH_LOCKED_FACT_TASK_IMPLEMENTATION_VERSION =
  "locked-facts.v3.1" as const;
export const GERMAN_STANDARD_NARRATION_WORD_RANGE = {
  minimum: 450,
  maximum: 800,
} as const;

export function reviewedNarrationInstruction(text: string): string {
  return text.replace(
    /\[\[fact:[a-z0-9-]+\]\]/gu,
    "die eingeblendete geprüfte Darstellung"
  );
}

export const legacyLocalizedNarrationSchema = z.strictObject({
  artifactVersion: z.literal("math-narration.v1"),
  language: mathLanguageSchema,
  lessonId: z.string(),
  objectiveHash: sha256Schema,
  factLockHash: sha256Schema,
  segments: z
    .array(
      z.strictObject({
        segmentId: z.string().regex(/^segment-\d{3}$/u),
        sceneId: z.string().regex(/^scene-\d{3}$/u),
        sceneFunction: z.string().min(1),
        text: z.string().min(1),
        factIds: z.array(z.string()),
      })
    )
    .length(9),
  glossaryVersion: z.literal("math-glossary.v1"),
  contentHash: sha256Schema,
});

export const resolvedFactSchema = z.strictObject({
  factId: z.string().regex(/^[a-z0-9-]+$/u),
  semanticHash: sha256Schema,
  display: z.string().min(1),
  spoken: z.string().min(1),
  latex: z.string().min(1),
});

export const narrationSegmentSchema = z.strictObject({
  segmentId: z.string().regex(/^segment-\d{3}$/u),
  sceneId: z.string().regex(/^scene-\d{3}$/u),
  sceneFunction: z.string().min(1),
  tokenizedText: z.string().min(1),
  displayText: z.string().min(1),
  spokenText: z.string().min(1),
  factIds: z.array(z.string()),
});

const localizedNarrationFieldsSchema = z.strictObject({
  artifactVersion: z.literal("math-narration.v2"),
  language: mathLanguageSchema,
  region: z.enum(["DE", "US", "419", "FR", "BR"]),
  lessonId: z.string(),
  variant: z.enum(["foundation", "standard", "challenge"]),
  objectiveHash: sha256Schema,
  factLockHash: sha256Schema,
  glossaryVersion: z.literal("math-glossary.v1"),
  glossaryHash: sha256Schema,
  resolvedFacts: z.array(resolvedFactSchema).min(1),
  segments: z.array(narrationSegmentSchema).length(9),
  contentHash: sha256Schema,
});
export const localizedNarrationSchema =
  localizedNarrationFieldsSchema.superRefine((value, context) => {
    const { contentHash, ...content } = value;
    if (contentHash !== canonicalHash(content))
      context.addIssue({
        code: "custom",
        path: ["contentHash"],
        message: "Localized narration content hash does not match its payload.",
      });
  });
export type LocalizedNarration = z.infer<typeof localizedNarrationSchema>;

const beatCopy: Record<MathLanguage, readonly string[]> = {
  de: [
    "Heute untersuchen wir",
    "Das Lernziel bleibt klar",
    "Wir bauen ein geprüftes Modell für",
    "Wir lösen das Beispiel Schritt für Schritt",
    "Achte auf den typischen Fehler bei",
    "Jetzt wendest du das Verfahren geführt an",
    "Die Denkaufgabe beginnt",
    "Wir prüfen die vollständige Lösung",
    "Fasse das Verfahren zusammen für",
  ],
  en: [
    "Today we investigate",
    "Keep the learning objective in view",
    "We build a verified model for",
    "We solve the example step by step",
    "Watch for the common mistake in",
    "Now apply the method with guidance",
    "The think challenge starts now",
    "We check the complete solution",
    "Summarize the method for",
  ],
  es: [
    "Hoy investigamos",
    "Mantén claro el objetivo de aprendizaje",
    "Construimos un modelo verificado de",
    "Resolvemos el ejemplo paso a paso",
    "Atención al error frecuente en",
    "Ahora aplica el método con una guía",
    "Comienza el reto de reflexión",
    "Comprobamos la solución completa",
    "Resume el método para",
  ],
  fr: [
    "Aujourd'hui, nous étudions",
    "Garde l'objectif d'apprentissage en vue",
    "Nous construisons un modèle vérifié pour",
    "Nous résolvons l'exemple étape par étape",
    "Attention à l'erreur fréquente avec",
    "Applique maintenant la méthode avec un guidage",
    "Le défi de réflexion commence",
    "Nous vérifions la solution complète",
    "Résume la méthode pour",
  ],
  pt: [
    "Hoje investigamos",
    "Mantenha o objetivo de aprendizagem em foco",
    "Construímos um modelo verificado de",
    "Resolvemos o exemplo passo a passo",
    "Atenção ao erro comum em",
    "Agora aplique o método com orientação",
    "O desafio de reflexão começa",
    "Conferimos a solução completa",
    "Resuma o método para",
  ],
};

function requiredConcepts(skillId: string): readonly [string, string] {
  const numberOperations = numberOperationsConceptIds(skillId);
  if (numberOperations) return numberOperations;
  const fractionsDecimals = fractionsDecimalsConceptIds(skillId);
  if (fractionsDecimals) return fractionsDecimals;
  const geometryMeasurement = geometryMeasurementConceptIds(skillId);
  if (geometryMeasurement) return geometryMeasurement;
  const dataDiagram = dataDiagramConceptIds(skillId);
  if (dataDiagram) return dataDiagram;
  if (skillId === "M5-GM-002") return ["perimeter", "side-length"];
  if (skillId === "M5-DZ-001") return ["tally-chart", "total"];
  throw new Error(`No localized concept mapping exists for ${skillId}.`);
}

function formatExactValue(
  value: ExactValue,
  language: MathLanguage
): FormattedMath {
  if (value.kind === "scalar")
    return formatExpression(value.expression, language);
  if (value.kind === "measurement")
    return formatMeasurement(value.value, value.unit, language);
  if (value.kind === "approximation")
    return formatExpression(value.exact, language);
  const children = value.values.map((child) =>
    formatExactValue(child, language)
  );
  return {
    display: children.map((child) => child.display).join(", "),
    spoken: children.map((child) => child.spoken).join(", "),
    latex: children.map((child) => child.latex).join(","),
  };
}

function defaultTemplates(
  lesson: LessonVariantSpecification,
  language: MathLanguage,
  glossary: MathGlossary
): string[] {
  const concepts = requiredConcepts(lesson.skillId);
  const topic = `[[term:${concepts[0]}]]`;
  const supporting = `[[term:${concepts[1]}]]`;
  if (language === "de" && lesson.variant === "standard") {
    const objective = lesson.learningObjective;
    const promise = lesson.promise;
    const mistake = lesson.commonMistake.description;
    const workedExample = lesson.workedExamples[0];
    if (!workedExample) throw new Error("Reviewed worked example is missing.");
    const workedSteps = workedExample.steps
      .map((step) => step.explanation)
      .join(" Anschließend: ");
    const transferSteps = lesson.challenge.steps
      .map((step) => step.explanation)
      .join(" Anschließend: ");
    const workedPrompt = reviewedNarrationInstruction(workedExample.prompt);
    const transferPrompt = reviewedNarrationInstruction(lesson.challenge.prompt);
    return lesson.scenes.map((scene, index) => {
      const facts = scene.factIds
        .map((factId) => `[[fact:${factId}]]`)
        .join("; ");
      const factSentence = facts
        ? `Für diesen Schritt gilt die geprüfte Darstellung: ${facts}.`
        : "In diesem Schritt kommt noch keine neue Zahl hinzu.";
      const templates = [
        `Heute untersuchen wir ${topic} und ${supporting}. Unser Ziel lautet: ${objective}. Wir gehen ruhig und nachvollziehbar vor. Beobachte zuerst, welche Angaben wichtig sind und welche Frage beantwortet werden soll. ${factSentence} Noch musst du nichts ausrechnen. Ordne nur die Begriffe, achte auf ihre Bedeutung und überlege, woran du eine passende Lösung erkennen würdest.`,
        `Das Lernziel bleibt klar: ${objective}. Das Versprechen dieser Stunde lautet: ${promise}. Wir verwenden nur Angaben und Rechenschritte, die mathematisch geprüft sind. Sprich die Aufgabe in eigenen Worten nach und markiere, was gesucht ist. ${factSentence} Achte außerdem auf Einheiten, Stellen und Rechenzeichen. Diese Vorbereitung verhindert Flüchtigkeitsfehler und macht den späteren Lösungsweg verständlich.`,
        `Jetzt bauen wir ein geprüftes Modell für ${topic} auf. Die genaue Beispielaufgabe lautet: ${workedPrompt} Der erste erklärte Schritt ist: ${workedExample.steps[0]?.explanation ?? workedSteps}. Betrachte die Darstellung von links nach rechts und suche zuerst die bekannte Struktur. ${factSentence} Verbinde jede sichtbare Zahl mit ihrer Rolle in der Aufgabe und halte das Zwischenergebnis fest.`,
        `Wir lösen das geprüfte Beispiel Schritt für Schritt. Der reviewte Lösungsweg lautet: ${workedSteps}. Beginne mit den gegebenen Informationen und entscheide dann, welcher Zusammenhang gebraucht wird. ${factSentence} Lies alle Zeichen und Einheiten. Prüfe nach jedem Schritt, ob das Ergebnis zur Ausgangsfrage passt. So bleibt der Lösungsweg richtig und nachvollziehbar.`,
        `Achte jetzt auf den typischen Fehler: ${mistake} Dieser Fehler entsteht oft, wenn ein Zeichen, eine Stelle oder eine Einheit übersehen wird. ${factSentence} Vergleiche deshalb den fehlerhaften Gedanken mit der geprüften Darstellung. Benenne genau, was korrigiert werden muss. Eine gute Kontrolle erklärt nicht nur, dass etwas falsch ist, sondern auch warum.`,
        `Nun wendest du das Verfahren geführt an. Lies zuerst die Aufgabe, nenne das Ziel und wähle danach den passenden Zusammenhang. ${factSentence} Arbeite in kleinen Schritten und lass bereits geprüfte Ergebnisse sichtbar. Kontrolliere Rechenzeichen, Reihenfolge und Einheit, bevor du weitergehst. Wenn du unsicher bist, kehre zum Modell zurück und vergleiche beide Darstellungen.`,
        `Jetzt beginnt die Denkpause mit der reviewten Transferaufgabe: ${transferPrompt} Löse sie möglichst selbstständig und erkläre deinen Plan leise in eigenen Worten. ${factSentence} Frage dich: Welche Information ist gegeben, welche Größe wird gesucht und welcher Schritt verbindet beides? Nimm dir Zeit für eine Gegenprobe. Erst wenn Darstellung, Rechnung und Antwort zusammenpassen, gehst du zur gemeinsamen Lösung weiter.`,
        `Wir prüfen nun die vollständige Transferlösung. Der reviewte Lösungsweg lautet: ${transferSteps}. Vergleiche deinen Weg Schritt für Schritt mit der geprüften Darstellung. ${factSentence} Stimmen Ausgangsdaten, Rechenzeichen, Zwischenschritte und Ergebnis überein? Prüfe auch, ob die Antwort wirklich zur gestellten Frage gehört. Jeder Lösungsweg muss dieselben mathematischen Beziehungen und dasselbe Ergebnis bewahren.`,
        `Zum Abschluss fassen wir das Verfahren für ${topic} zusammen. Unser Versprechen war: ${promise}. Formuliere zuerst das Ziel, ordne dann die gegebenen Informationen und wähle den passenden geprüften Zusammenhang. ${factSentence} Rechne übersichtlich, bewahre wichtige Zwischenschritte und kontrolliere Zeichen sowie Einheiten. Erkläre schließlich, warum das Ergebnis die Aufgabe beantwortet. Damit kannst du das Verfahren auf eine neue Aufgabe übertragen.`,
      ] as const;
      const template = templates[index];
      if (!template) throw new Error(`Missing de narration beat ${index}.`);
      return template;
    });
  }
  return lesson.scenes.map((scene, index) => {
    const copy = beatCopy[language][index];
    if (!copy) throw new Error(`Missing ${language} narration beat ${index}.`);
    const conceptText = [0, 2, 4, 8].includes(index)
      ? ` ${topic}${index === 0 ? ` und ${supporting}` : ""}.`
      : ".";
    const factText = scene.factIds
      .map((factId) => `[[fact:${factId}]]`)
      .join("; ");
    return `${copy}${conceptText}${factText ? ` ${factText}.` : ""}`;
  });
}

function replaceTerms(
  text: string,
  glossary: MathGlossary,
  mode: "display" | "spoken"
): string {
  return text.replace(
    /\[\[term:([a-z0-9-]+)\]\]/gu,
    (_token, conceptId: string) => {
      const term = glossaryTerm(glossary, conceptId);
      return mode === "display" ? term.preferred : term.tts;
    }
  );
}

function factTokens(text: string): string[] {
  return [...text.matchAll(/\[\[fact:([a-z0-9-]+)\]\]/gu)]
    .map((match) => match[1])
    .filter((value): value is string => value !== undefined);
}

function replaceFacts(
  text: string,
  facts: Map<string, z.infer<typeof resolvedFactSchema>>,
  mode: "display" | "spoken"
): string {
  return text.replace(
    /\[\[fact:([a-z0-9-]+)\]\]/gu,
    (_token, factId: string) => {
      const fact = facts.get(factId);
      if (!fact) throw new Error(`Unknown localized fact token ${factId}.`);
      return fact[mode];
    }
  );
}

export interface LocalizationOptions {
  glossary?: MathGlossary;
  templates?: readonly string[];
}

export function localizeNarration(
  lesson: LessonVariantSpecification,
  language: MathLanguage,
  options: LocalizationOptions = {}
): LocalizedNarration {
  const lock = buildFactLock(lesson);
  const glossary = options.glossary ?? loadMathGlossary(language);
  if (glossary.language !== language)
    throw new Error(`Glossary language does not match ${language}.`);
  if (glossary.region !== localeProfiles[language].region)
    throw new Error(
      `Glossary region does not match ${language} locale policy.`
    );
  const resolvedFacts = lesson.facts.map((fact) => ({
    factId: fact.factId,
    semanticHash: canonicalHash(fact.semantic),
    ...formatExactValue(fact.semantic, language),
  }));
  const resolvedById = new Map(
    resolvedFacts.map((fact) => [fact.factId, fact])
  );
  const templates =
    options.templates ?? defaultTemplates(lesson, language, glossary);
  if (templates.length !== lesson.scenes.length)
    throw new Error("Localized narration must preserve all nine scenes.");
  const segments = lesson.scenes.map((scene, index) => {
    const tokenizedText = templates[index];
    if (!tokenizedText)
      throw new Error(`Missing ${language} narration scene ${scene.sceneId}.`);
    const tokens = factTokens(tokenizedText);
    if (new Set(tokens).size !== tokens.length)
      throw new Error(
        `Duplicate fact token in ${language} scene ${scene.sceneId}.`
      );
    if (tokens.join("\0") !== scene.factIds.join("\0"))
      throw new Error(
        `Missing, extra, or reordered fact token in ${language} scene ${scene.sceneId}.`
      );
    return {
      segmentId: `segment-${String(index + 1).padStart(3, "0")}`,
      sceneId: scene.sceneId,
      sceneFunction: scene.sceneFunction,
      tokenizedText,
      displayText: replaceTerms(
        replaceFacts(tokenizedText, resolvedById, "display"),
        glossary,
        "display"
      ),
      spokenText: replaceTerms(
        replaceFacts(tokenizedText, resolvedById, "spoken"),
        glossary,
        "spoken"
      ),
      factIds: tokens,
    };
  });
  if (
    options.templates === undefined &&
    language === "de" &&
    lesson.variant === "standard"
  ) {
    const words = segments.reduce(
      (total, segment) =>
        total + segment.spokenText.trim().split(/\s+/u).filter(Boolean).length,
      0
    );
    if (
      words < GERMAN_STANDARD_NARRATION_WORD_RANGE.minimum ||
      words > GERMAN_STANDARD_NARRATION_WORD_RANGE.maximum
    ) {
      throw new Error(
        `German standard narration contains ${words} words; expected ${GERMAN_STANDARD_NARRATION_WORD_RANGE.minimum}-${GERMAN_STANDARD_NARRATION_WORD_RANGE.maximum}.`
      );
    }
  }
  assertGlossaryText(
    segments.map((segment) => segment.displayText).join(" "),
    glossary,
    requiredConcepts(lesson.skillId)
  );
  const draft = {
    artifactVersion: "math-narration.v2" as const,
    language,
    region: localeProfiles[language].region,
    lessonId: lesson.lessonId,
    variant: lesson.variant,
    objectiveHash: lock.objectiveHash,
    factLockHash: lock.factLockHash,
    glossaryVersion: "math-glossary.v1" as const,
    glossaryHash: glossary.glossaryHash,
    resolvedFacts,
    segments,
  };
  return localizedNarrationSchema.parse({
    ...draft,
    contentHash: canonicalHash(draft),
  });
}

export { buildFactLock, formatExactInteger };
