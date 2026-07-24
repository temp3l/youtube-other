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
export const MATH_LOCKED_FACT_NARRATION_VERSION = "locked-facts.v4" as const;
export const MATH_LOCKED_FACT_TASK_IMPLEMENTATION_VERSION =
  "locked-facts.v4.0" as const;
export const GERMAN_STANDARD_NARRATION_WORD_RANGE = {
  minimum: 400,
  maximum: 620,
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
    "Kurzer Fehlercheck: Stimmt die typische Fehlvorstellung?",
    "Bearbeite jetzt ein zweites Beispiel selbstständig zu",
    "Die Denkaufgabe beginnt",
    "Wir prüfen die vollständige Lösung",
    "Ohne zurückzuschauen: Wie erklärst du das Verfahren bei einer neuen Aufgabe?",
  ],
  en: [
    "Today we investigate",
    "Keep the learning objective in view",
    "We build a verified model for",
    "We solve the example step by step",
    "Quick misconception check: Is the common claim correct?",
    "Now solve a second example independently for",
    "The think challenge starts now",
    "We check the complete solution",
    "Without looking back, how would you explain the method for a new problem?",
  ],
  es: [
    "Hoy investigamos",
    "Mantén claro el objetivo de aprendizaje",
    "Construimos un modelo verificado de",
    "Resolvemos el ejemplo paso a paso",
    "Comprobación breve del error: ¿es correcta la idea frecuente?",
    "Resuelve ahora un segundo ejemplo de forma independiente sobre",
    "Comienza el reto de reflexión",
    "Comprobamos la solución completa",
    "Sin mirar atrás, ¿cómo explicarías el método para un problema nuevo?",
  ],
  fr: [
    "Aujourd'hui, nous étudions",
    "Garde l'objectif d'apprentissage en vue",
    "Nous construisons un modèle vérifié pour",
    "Nous résolvons l'exemple étape par étape",
    "Vérification rapide : l'idée fréquente est-elle correcte ?",
    "Résous maintenant un deuxième exemple de façon autonome sur",
    "Le défi de réflexion commence",
    "Nous vérifions la solution complète",
    "Sans regarder en arrière, comment expliquerais-tu la méthode pour un nouveau problème ?",
  ],
  pt: [
    "Hoje investigamos",
    "Mantenha o objetivo de aprendizagem em foco",
    "Construímos um modelo verificado de",
    "Resolvemos o exemplo passo a passo",
    "Verificação rápida do erro: a ideia comum está correta?",
    "Resolva agora um segundo exemplo de forma independente sobre",
    "O desafio de reflexão começa",
    "Conferimos a solução completa",
    "Sem olhar para trás, como você explicaria o método para um novo problema?",
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
      .join(" Danach: ");
    const transferSteps = lesson.challenge.steps
      .map((step) => step.explanation)
      .join(" Danach: ");
    const workedPrompt = reviewedNarrationInstruction(workedExample.prompt);
    const transferPrompt = reviewedNarrationInstruction(
      lesson.challenge.prompt
    );
    return lesson.scenes.map((scene, index) => {
      const facts = scene.factIds
        .map((factId) => `[[fact:${factId}]]`)
        .join("; ");
      const factSentence = facts
        ? `Auf der Tafel siehst du: ${facts}.`
        : "Noch kommt keine neue Zahl hinzu.";
      const placeValueQuest = lesson.skillId === "M5-ZO-001";
      const templates = placeValueQuest
        ? ([
            `Heute knacken wir einen Zahlencode. Dabei untersuchen wir ${topic} und ${supporting}. Unser Ziel lautet: ${objective}. Auf der Tafel entsteht gleich eine große Zahl aus einzelnen Stellen. Beobachte genau: Wo muss eine Null stehen, damit der Wert stimmt? ${factSentence} Noch musst du nichts ausrechnen. Suche zuerst das Muster und triff eine Vermutung.`,
            `Deine Mission lautet: ${promise}. Das Lernziel bleibt: ${objective}. Sprich es kurz in deinen eigenen Worten aus. ${factSentence} Am Ende sollst du den Code nicht nur nennen, sondern erklären, warum jede Ziffer genau an ihrem Platz steht. Achte besonders auf leere Stellen: Sie sind nicht unwichtig.`,
            `Hier kommt die erste Codekarte. ${workedPrompt} ${factSentence} Wir nutzen eine Stellenwerttafel und lesen von links nach rechts. ${workedExample.steps[0]?.explanation ?? workedSteps} Verbinde jeden Summanden mit seinem Fach. Wo kein Summand landet, muss die Stelle trotzdem sichtbar bleiben. So entsteht der Code Schritt für Schritt.`,
            `Jetzt lösen wir die Codekarte gemeinsam. ${workedSteps} ${factSentence} Lass jede bereits gefundene Ziffer stehen. Prüfe danach die Plätze von links nach rechts. Stimmen die Hunderttausender, Zehntausender, Tausender, Hunderter, Zehner und Einer? Dann passt die Zahl zur zerlegten Darstellung.`,
            `Kurzer Fehlercheck: ${mistake} Stimmt das? Entscheide zuerst selbst. ${factSentence} Wenn du die leeren Fächer zusammenschiebst, wandern andere Ziffern an eine falsche Stelle. Vergleiche danach den kurzen falschen Code mit der vollständigen Zahl und erkläre die Korrektur in einem Satz.`,
            `Nun folgt ein zweites, eigenständiges Beispiel mit einem anderen Nullmuster. ${transferPrompt} ${factSentence} Löse es selbstständig von links nach rechts. Lege alle Stellen an, setze die vorhandenen Ziffern ein und entscheide ohne Hinweis, welche Plätze Nullen brauchen.`,
            `Jetzt bist du der Codeprofi. ${factSentence} Sage deinen Plan leise: Welche Stellen sind besetzt, welche bleiben leer? Nach meiner Frage bleibt die Tafel acht Sekunden still: Welche sechsstellige Zahl entsteht? Nutze die Pause wirklich zum Denken und kontrolliere anschließend jede Stelle.`,
            `Zeit für die Auflösung. ${transferSteps} ${factSentence} Vergleiche nicht nur die letzte Zahl. Fahre mit dem Finger von links nach rechts über die Stellenwerttafel. Jede Ziffer braucht ihr richtiges Fach, und jede leere Stelle braucht eine Null. So kannst du deinen eigenen Lösungsweg zuverlässig prüfen.`,
            `Mission geschafft. Unser Versprechen war: ${promise}. Schließe die Tafel gedanklich und schaue nicht zurück. Erfinde eine neue sechsstellige Zahl mit anderen leeren Stellen: Wie würdest du sie zerlegen und anschließend prüfen?`,
          ] as const)
        : ([
            `Heute untersuchen wir ${topic} und ${supporting}. Unser Ziel lautet: ${objective}. Starte mit einer Vermutung: Was könnte die Darstellung bedeuten? ${factSentence} Noch musst du nichts ausrechnen. Suche nach einer bekannten Struktur und entscheide, worauf du gleich besonders achten willst.`,
            `Deine Mission lautet: ${promise}. Das Lernziel bleibt: ${objective}. Sprich die Aufgabe kurz in deinen eigenen Worten aus. ${factSentence} Markiere, was gegeben und was gesucht ist. Achte auf Stellen, Zeichen und Einheiten, die leicht übersehen werden.`,
            `Jetzt bauen wir ein passendes Modell. ${workedPrompt} ${factSentence} ${workedExample.steps[0]?.explanation ?? workedSteps} Verfolge die Darstellung von links nach rechts. Verbinde jede Angabe mit ihrer Rolle und lass wichtige Zwischenschritte sichtbar.`,
            `Wir lösen das Beispiel gemeinsam. ${workedSteps} ${factSentence} Vergleiche nach jedem Schritt Modell und Rechnung. Erkläre kurz, warum der Schritt erlaubt ist. Wenn alle Angaben erhalten bleiben und das Ergebnis zur Frage passt, ist der Weg nachvollziehbar.`,
            `Kurzer Fehlercheck: ${mistake} Stimmt das? Entscheide zuerst selbst. ${factSentence} Vergleiche danach den falschen Gedanken mit der vollständigen Darstellung. Zeige genau auf die Stelle, an der sich der Weg trennt, und erkläre die Korrektur in einem Satz.`,
            `Nun folgt ein zweites, eigenständiges Beispiel mit einem veränderten Muster. ${transferPrompt} ${factSentence} Löse es selbstständig. Nenne das Ziel, wähle die passende Darstellung und prüfe Reihenfolge, Zeichen und Einheit, ohne zum ersten Lösungsweg zurückzuschauen.`,
            `Jetzt beginnt deine Denkzeit. ${factSentence} Sage deinen Plan leise in eigenen Worten. Welche Information ist gegeben, was wird gesucht und welcher Schritt verbindet beides? Nach der Frage bleibt die Tafel acht Sekunden still. Nutze die Pause für eine echte Gegenprobe.`,
            `Wir lösen die Denkaufgabe auf. ${transferSteps} ${factSentence} Vergleiche deinen Weg Schritt für Schritt mit der geprüften Darstellung. Stimmen Ausgangsdaten, Rechenzeichen, Zwischenschritte und Ergebnis? Erkläre auch, warum die Antwort wirklich zur Frage gehört.`,
            `Unser Versprechen war: ${promise}. Schließe die Tafel gedanklich und schaue nicht zurück. Wie würdest du das Verfahren an einem selbst gewählten neuen Beispiel erklären und anschließend prüfen?`,
          ] as const);
      const template = templates[index];
      if (!template) throw new Error(`Missing de narration beat ${index}.`);
      return template;
    });
  }
  return lesson.scenes.map((scene, index) => {
    const copy = beatCopy[language][index];
    if (!copy) throw new Error(`Missing ${language} narration beat ${index}.`);
    const conceptText =
      index === 8
        ? ""
        : [0, 2, 4].includes(index)
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
  if (!segments[4]?.spokenText.includes("?"))
    throw new Error(
      "Educational narration must ask a short misconception-check question."
    );
  if (
    segments[8]?.factIds.length !== 0 ||
    !segments[8]?.spokenText.trim().endsWith("?")
  )
    throw new Error(
      "Educational narration must end with an unguided, fact-free retrieval question."
    );
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
