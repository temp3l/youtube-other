import { z } from "zod";
import {
  type LessonVariantSpecification,
  mathLanguageSchema,
  type MathLanguage,
} from "../domain/index.js";
import { canonicalHash } from "../verification/canonical-json.js";

export const narrationSegmentSchema = z.strictObject({
  segmentId: z.string().regex(/^segment-\d{3}$/u),
  sceneId: z.string().regex(/^scene-\d{3}$/u),
  sceneFunction: z.string().min(1),
  text: z.string().min(1),
  factIds: z.array(z.string()),
});
export const localizedNarrationSchema = z.strictObject({
  artifactVersion: z.literal("math-narration.v1"),
  language: mathLanguageSchema,
  lessonId: z.string(),
  objectiveHash: z.string(),
  factLockHash: z.string(),
  segments: z.array(narrationSegmentSchema).length(9),
  glossaryVersion: z.literal("math-glossary.v1"),
  contentHash: z.string(),
});
export type LocalizedNarration = z.infer<typeof localizedNarrationSchema>;

const phrases: Record<MathLanguage, readonly string[]> = {
  de: [
    "Heute entschlüsseln wir große Zahlen.",
    "Du liest und zerlegst eine Zahl nach Stellenwerten.",
    "Die Stellenwerttafel zeigt jede Ziffer an ihrem Platz.",
    "Unser Beispiel ist [[fact:example-number]]. Es zerfällt in [[fact:expanded-number]].",
    "Achtung: Eine Null hält ihren Stellenwert frei.",
    "Ordne nun jede Ziffer von rechts nach links ein.",
    "Deine Denkaufgabe beginnt. Nutze die Stellenwerttafel und prüfe jede Stelle.",
    "Die Lösung lautet [[fact:challenge-solution]].",
    "Merke: Stelle, Ziffer und Wert gehören zusammen.",
  ],
  en: [
    "Today we decode large numbers.",
    "You will read and expand a number by place value.",
    "The place-value chart gives every digit its position.",
    "Our example is [[fact:example-number]]. It expands to [[fact:expanded-number]].",
    "Watch out: a zero keeps a place open.",
    "Now place each digit from right to left.",
    "Your think task starts now. Use the chart and check every place.",
    "The solution is [[fact:challenge-solution]].",
    "Remember: place, digit, and value belong together.",
  ],
  es: [
    "Hoy desciframos números grandes.",
    "Leerás y descompondrás un número por valor posicional.",
    "La tabla de valor posicional ubica cada cifra.",
    "Nuestro ejemplo es [[fact:example-number]]. Se descompone en [[fact:expanded-number]].",
    "Atención: un cero mantiene libre una posición.",
    "Coloca cada cifra de derecha a izquierda.",
    "Empieza tu reto. Usa la tabla y comprueba cada posición.",
    "La solución es [[fact:challenge-solution]].",
    "Recuerda: posición, cifra y valor están relacionados.",
  ],
  fr: [
    "Aujourd'hui, nous décodons les grands nombres.",
    "Tu vas lire et décomposer un nombre selon sa valeur de position.",
    "Le tableau de numération place chaque chiffre.",
    "Notre exemple est [[fact:example-number]]. Il se décompose en [[fact:expanded-number]].",
    "Attention : un zéro conserve une position.",
    "Place maintenant chaque chiffre de droite à gauche.",
    "Ton défi commence. Utilise le tableau et vérifie chaque position.",
    "La solution est [[fact:challenge-solution]].",
    "Retiens : position, chiffre et valeur vont ensemble.",
  ],
  pt: [
    "Hoje vamos decifrar números grandes.",
    "Você vai ler e decompor um número pelo valor posicional.",
    "O quadro de valor posicional coloca cada algarismo em seu lugar.",
    "Nosso exemplo é [[fact:example-number]]. Ele se decompõe em [[fact:expanded-number]].",
    "Atenção: um zero mantém uma posição aberta.",
    "Agora coloque cada algarismo da direita para a esquerda.",
    "Seu desafio começa agora. Use o quadro e confira cada posição.",
    "A solução é [[fact:challenge-solution]].",
    "Lembre-se: posição, algarismo e valor estão ligados.",
  ],
};

export function buildFactLock(lesson: LessonVariantSpecification) {
  const value = {
    lessonId: lesson.lessonId,
    variant: lesson.variant,
    objectiveHash: canonicalHash(lesson.learningObjective),
    sceneFunctions: lesson.scenes.map((scene) => scene.sceneFunction),
    facts: lesson.facts.map((fact) => ({
      factId: fact.factId,
      semanticHash: canonicalHash(fact.semantic),
    })),
  };
  return { ...value, factLockHash: canonicalHash(value) };
}

export function localizeNarration(
  lesson: LessonVariantSpecification,
  language: MathLanguage
): LocalizedNarration {
  const lock = buildFactLock(lesson);
  const languagePhrases = phrases[language];
  const segments = lesson.scenes.map((scene, index) => {
    const text = languagePhrases[index];
    if (!text)
      throw new Error(`Missing ${language} narration phrase ${index}.`);
    const tokens = [...text.matchAll(/\[\[fact:([a-z0-9-]+)\]\]/gu)]
      .map((match) => match[1])
      .filter((id): id is string => id !== undefined);
    if (new Set(tokens).size !== tokens.length)
      throw new Error(
        `Duplicate fact token in ${language} scene ${scene.sceneId}.`
      );
    for (const factId of scene.factIds)
      if (index === 3 || index === 7) {
        if (!tokens.includes(factId))
          throw new Error(`Missing locked fact ${factId} in ${language}.`);
      }
    return {
      segmentId: `segment-${String(index + 1).padStart(3, "0")}`,
      sceneId: scene.sceneId,
      sceneFunction: scene.sceneFunction,
      text,
      factIds: tokens,
    };
  });
  const draft = {
    artifactVersion: "math-narration.v1" as const,
    language,
    lessonId: lesson.lessonId,
    objectiveHash: lock.objectiveHash,
    factLockHash: lock.factLockHash,
    segments,
    glossaryVersion: "math-glossary.v1" as const,
  };
  return localizedNarrationSchema.parse({
    ...draft,
    contentHash: canonicalHash(draft),
  });
}

export function formatExactInteger(
  value: string,
  language: MathLanguage
): string {
  const locale = {
    de: "de-DE",
    en: "en-US",
    es: "es-419",
    fr: "fr-FR",
    pt: "pt-BR",
  }[language];
  return new Intl.NumberFormat(locale, {
    useGrouping: true,
    maximumFractionDigits: 0,
  }).format(BigInt(value));
}
