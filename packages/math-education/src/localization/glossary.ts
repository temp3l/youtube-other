import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { mathLanguageSchema, type MathLanguage } from "../domain/index.js";
import { canonicalHash } from "../verification/canonical-json.js";

const glossaryTermSchema = z.strictObject({
  conceptId: z.string().regex(/^[a-z0-9-]+$/u),
  preferred: z.string().min(1),
  forbidden: z.array(z.string().min(1)),
  tts: z.string().min(1),
});

export const mathGlossarySchema = z
  .strictObject({
    artifactVersion: z.literal("math-glossary.v1"),
    language: mathLanguageSchema,
    region: z.string().min(1),
    terms: z.array(glossaryTermSchema).min(1),
  })
  .superRefine((value, context) => {
    const ids = value.terms.map((term) => term.conceptId);
    if (new Set(ids).size !== ids.length)
      context.addIssue({
        code: "custom",
        message: "Glossary concept IDs must be unique.",
      });
  });

export type MathGlossary = z.infer<typeof mathGlossarySchema> & {
  glossaryHash: string;
};

const cache = new Map<MathLanguage, MathGlossary>();

export function parseMathGlossary(
  raw: unknown,
  expectedLanguage?: MathLanguage
): MathGlossary {
  const parsed = mathGlossarySchema.parse(raw);
  if (expectedLanguage && parsed.language !== expectedLanguage)
    throw new Error(
      `Glossary language ${parsed.language} does not match ${expectedLanguage}.`
    );
  return { ...parsed, glossaryHash: canonicalHash(parsed) };
}

export function loadMathGlossary(language: MathLanguage): MathGlossary {
  const cached = cache.get(language);
  if (cached) return cached;
  const root = fileURLToPath(
    new URL("../../data/glossaries/v1/", import.meta.url)
  );
  const glossary = parseMathGlossary(
    JSON.parse(fs.readFileSync(`${root}${language}.json`, "utf8")),
    language
  );
  cache.set(language, glossary);
  return glossary;
}

export function glossaryTerm(
  glossary: MathGlossary,
  conceptId: string
): MathGlossary["terms"][number] {
  const term = glossary.terms.find(
    (candidate) => candidate.conceptId === conceptId
  );
  if (!term)
    throw new Error(
      `Glossary ${glossary.language}-${glossary.region} has no ${conceptId}.`
    );
  return term;
}

export function assertGlossaryText(
  text: string,
  glossary: MathGlossary,
  requiredConceptIds: readonly string[]
): void {
  const normalized = text.toLocaleLowerCase(glossary.language);
  for (const conceptId of requiredConceptIds) {
    const term = glossaryTerm(glossary, conceptId);
    if (
      !normalized.includes(term.preferred.toLocaleLowerCase(glossary.language))
    )
      throw new Error(
        `Glossary term ${conceptId} is missing from localized text.`
      );
  }
  for (const term of glossary.terms)
    for (const forbidden of term.forbidden)
      if (normalized.includes(forbidden.toLocaleLowerCase(glossary.language)))
        throw new Error(
          `Forbidden glossary form ${JSON.stringify(forbidden)} appears in localized text.`
        );
}
