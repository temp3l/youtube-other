import { z } from "zod";
import {
  type ExactValue,
  type LessonVariantSpecification,
  mathLanguageSchema,
  type MathLanguage,
} from "../domain/index.js";
import { canonicalHash } from "../verification/canonical-json.js";
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

export const localizedNarrationSchema = z.strictObject({
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
  if (skillId === "M5-ZO-001") return ["place-value", "digit"];
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
  const topic = glossaryTerm(glossary, concepts[0]).preferred;
  const supporting = glossaryTerm(glossary, concepts[1]).preferred;
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
      displayText: replaceFacts(tokenizedText, resolvedById, "display"),
      spokenText: replaceFacts(tokenizedText, resolvedById, "spoken"),
      factIds: tokens,
    };
  });
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
