import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { loadCurriculumRelease } from "../curriculum/release.js";
import { type LessonVariantSpecification } from "../domain/index.js";
import { buildLessonVariant } from "../lesson/variant-builder.js";
import { canonicalHash } from "../verification/canonical-json.js";
import {
  assertLocalizedDisplayVerification,
  localizedDisplayChecks,
} from "./display-verification.js";
import { assertFactLock, buildFactLock } from "./fact-lock.js";
import { loadMathGlossary, parseMathGlossary } from "./glossary.js";
import { formatExpression, formatMeasurement } from "./locale-formatter.js";
import {
  GERMAN_STANDARD_NARRATION_WORD_RANGE,
  localizeNarration,
} from "./localization.js";
import { reviewGermanStandardNarration } from "./narration-review.js";
import { MATH_SPEECH_FORMAT_VERSION } from "./tts-lexicon.js";

async function lesson(
  skillId = "M5-ZO-001"
): Promise<LessonVariantSpecification> {
  const release = await loadCurriculumRelease(
    "packages/math-education/data/curriculum/v1"
  );
  return buildLessonVariant(
    release.skills.find((skill) => skill.skillId === skillId)!,
    "standard"
  );
}

describe("locked-fact localization", () => {
  it("formats exact numbers, fractions, signs, units, and speech for five locale policies", () => {
    const expected = {
      de: [
        "12.345",
        "zwölftausenddreihundertfünfundvierzig",
        "123,045",
        "einhundertdreiundzwanzig Komma null vier fünf",
        "1/2",
        "eins durch zwei",
        "minus sieben",
        "drei Zentimeter",
        "zwei hoch drei",
        "drei Wurzel aus acht",
      ],
      en: [
        "12,345",
        "one two three four five",
        "123.045",
        "one two three point zero four five",
        "1/2",
        "one over two",
        "minus seven",
        "three centimeters",
        "two to the power of three",
        "three root of eight",
      ],
      es: [
        "12,345",
        "uno dos tres cuatro cinco",
        "123,045",
        "uno dos tres coma cero cuatro cinco",
        "1/2",
        "uno sobre dos",
        "menos siete",
        "tres centímetros",
        "dos elevado a tres",
        "tres raíz de ocho",
      ],
      fr: [
        "12 345",
        "un deux trois quatre cinq",
        "123,045",
        "un deux trois virgule zero quatre cinq",
        "1/2",
        "un sur deux",
        "moins sept",
        "trois centimètres",
        "deux puissance trois",
        "trois racine de huit",
      ],
      pt: [
        "12.345",
        "um dois três quatro cinco",
        "123,045",
        "um dois três vírgula zero quatro cinco",
        "1/2",
        "um sobre dois",
        "menos sete",
        "três centímetros",
        "dois elevado a três",
        "três raiz de oito",
      ],
    } as const;
    const semantic = { kind: "integer" as const, value: "12345" };
    const semanticHash = canonicalHash({ kind: "scalar", expression: semantic });
    for (const language of ["de", "en", "es", "fr", "pt"] as const) {
      const integer = formatExpression(
        { kind: "integer", value: "12345" },
        language
      );
      const decimal = formatExpression(
        { kind: "decimal", unscaled: "123045", scale: 3 },
        language
      );
      const fraction = formatExpression(
        { kind: "rational", numerator: "1", denominator: "2" },
        language
      );
      const negative = formatExpression(
        { kind: "negate", operand: { kind: "integer", value: "7" } },
        language
      );
      const unit = formatMeasurement(
        { kind: "integer", value: "3" },
        { symbol: "cm" },
        language
      );
      const power = formatExpression(
        {
          kind: "power",
          left: { kind: "integer", value: "2" },
          right: { kind: "integer", value: "3" },
        },
        language
      );
      const root = formatExpression(
        {
          kind: "root",
          degree: { kind: "integer", value: "3" },
          radicand: { kind: "integer", value: "8" },
        },
        language
      );
      expect([
        integer.display,
        integer.spoken,
        decimal.display,
        decimal.spoken,
        fraction.display,
        fraction.spoken,
        negative.spoken,
        unit.spoken,
        power.spoken,
        root.spoken,
      ]).toEqual(expected[language]);
      expect(canonicalHash({ kind: "scalar", expression: semantic })).toBe(
        semanticHash
      );
    }
    expect(MATH_SPEECH_FORMAT_VERSION).toBe("math-speech-format.v3");
    expect(
      formatExpression({ kind: "integer", value: "730405" }, "de").spoken
    ).toBe("siebenhundertdreißigtausendvierhundertfünf");
  });

  it("pronounces formula operators deterministically", () => {
    const formula = {
      kind: "relation" as const,
      operator: "eq" as const,
      left: {
        kind: "quotient" as const,
        left: { kind: "integer" as const, value: "6" },
        right: { kind: "integer" as const, value: "2" },
      },
      right: { kind: "integer" as const, value: "3" },
    };
    expect(formatExpression(formula, "de").spoken).toBe(
      "sechs geteilt durch zwei gleich drei"
    );
    expect(formatExpression(formula, "en").spoken).toBe(
      "six divided by two equals three"
    );
    expect(formatExpression(formula, "es").spoken).toBe(
      "seis dividido entre dos igual a tres"
    );
    expect(formatExpression(formula, "fr").spoken).toBe(
      "six divisé par deux égal à trois"
    );
    expect(formatExpression(formula, "pt").spoken).toBe(
      "seis dividido por dois igual a três"
    );
  });

  it("fails visibly for unsupported spoken symbols and functions", () => {
    expect(() =>
      formatExpression({ kind: "symbol", name: "x" }, "en")
    ).toThrow(/No reviewed en spoken form for symbol x/u);
    expect(() =>
      formatExpression(
        {
          kind: "function",
          name: "log",
          args: [{ kind: "integer", value: "10" }],
        },
        "en"
      )
    ).toThrow(/No reviewed en spoken form for function log/u);
  });

  it("preserves objective, variant, step, solution, fact, and scene order in every locale", async () => {
    const source = await lesson();
    const lock = buildFactLock(source);
    const localized = (["de", "en", "es", "fr", "pt"] as const).map(
      (language) => localizeNarration(source, language)
    );
    expect(new Set(localized.map((item) => item.factLockHash))).toEqual(
      new Set([lock.factLockHash])
    );
    for (const item of localized) {
      expect(item.region).toBe(loadMathGlossary(item.language).region);
      expect(item.segments.map((segment) => segment.sceneFunction)).toEqual(
        source.scenes.map((scene) => scene.sceneFunction)
      );
      expect(item.segments.map((segment) => segment.factIds)).toEqual(
        source.scenes.map((scene) => scene.factIds)
      );
      expect(
        item.segments.every(
          (segment) => !segment.displayText.includes("[[fact:")
        )
      ).toBe(true);
      expect(
        item.segments.every(
          (segment) => !segment.spokenText.includes("[[fact:")
        )
      ).toBe(true);
    }

    const changed = structuredClone(source);
    changed.challenge.solutionFactId = "example-number";
    expect(() => assertFactLock(changed, lock)).toThrow(/Fact lock mismatch/u);
    const reordered = structuredClone(source);
    reordered.scenes.reverse();
    expect(() => assertFactLock(reordered, lock)).toThrow(
      /Fact lock mismatch/u
    );
  });

  it("keeps every German Class 5 standard narration within the reviewed four-minute word budget", async () => {
    const release = await loadCurriculumRelease(
      "packages/math-education/data/curriculum/v1"
    );
    const skills = release.graph.order
      .map((skillId) => release.skills.find((skill) => skill.skillId === skillId))
      .filter(
        (skill): skill is NonNullable<typeof skill> =>
          Boolean(skill?.skillId.startsWith("M5-"))
      );
    expect(skills).toHaveLength(37);
    for (const skill of skills) {
      const narration = localizeNarration(
        buildLessonVariant(skill, "standard"),
        "de"
      );
      const words = narration.segments.reduce(
        (total, segment) =>
          total + segment.spokenText.trim().split(/\s+/u).filter(Boolean).length,
        0
      );
      expect(words).toBeGreaterThanOrEqual(
        GERMAN_STANDARD_NARRATION_WORD_RANGE.minimum
      );
      expect(words).toBeLessThanOrEqual(
        GERMAN_STANDARD_NARRATION_WORD_RANGE.maximum
      );
      const review = reviewGermanStandardNarration({
        lesson: buildLessonVariant(skill, "standard"),
        narration,
      });
      expect(review.checks).toHaveLength(9);
      expect(review.checks.every((check) => check.status === "passed")).toBe(
        true
      );
    }
  });

  it("blocks missing, duplicate, and reordered fact tokens", async () => {
    const source = await lesson();
    const valid = localizeNarration(source, "en").segments.map(
      (segment) => segment.tokenizedText
    );
    const target = valid.findIndex(
      (text) => (text.match(/\[\[fact:/gu) ?? []).length === 2
    );
    expect(target).toBeGreaterThanOrEqual(0);
    const tokens = [
      ...valid[target]!.matchAll(/\[\[fact:[a-z0-9-]+\]\]/gu),
    ].map((match) => match[0]);
    const missing = [...valid];
    missing[target] = missing[target]!.replace(tokens[0]!, "");
    expect(() =>
      localizeNarration(source, "en", { templates: missing })
    ).toThrow(/Missing, extra, or reordered/u);
    const duplicate = [...valid];
    duplicate[target] = `${duplicate[target]} ${tokens[0]}`;
    expect(() =>
      localizeNarration(source, "en", { templates: duplicate })
    ).toThrow(/Duplicate fact token/u);
    const reordered = [...valid];
    reordered[target] = reordered[target]!.replace(tokens[0]!, "__FIRST__")
      .replace(tokens[1]!, tokens[0]!)
      .replace("__FIRST__", tokens[1]!);
    expect(() =>
      localizeNarration(source, "en", { templates: reordered })
    ).toThrow(/Missing, extra, or reordered/u);
  });

  it("fails visibly on a glossary miss or false friend", async () => {
    const source = await lesson();
    const raw = JSON.parse(
      await fs.readFile(
        "packages/math-education/data/glossaries/v1/en.json",
        "utf8"
      )
    ) as { terms: Array<{ conceptId: string }> };
    raw.terms = raw.terms.filter((term) => term.conceptId !== "place-value");
    expect(() =>
      localizeNarration(source, "en", {
        glossary: parseMathGlossary(raw, "en"),
      })
    ).toThrow(/has no place-value/u);

    const valid = localizeNarration(source, "en").segments.map(
      (segment) => segment.tokenizedText
    );
    valid[0] = `${valid[0]} digit value`;
    expect(() => localizeNarration(source, "en", { templates: valid })).toThrow(
      /Forbidden glossary form/u
    );
  });

  it("uses glossary TTS forms independently from display forms", async () => {
    const source = await lesson();
    const raw = JSON.parse(
      await fs.readFile(
        "packages/math-education/data/glossaries/v1/en.json",
        "utf8"
      )
    ) as {
      terms: Array<{ conceptId: string; preferred: string; tts: string }>;
    };
    const placeValue = raw.terms.find(
      (term) => term.conceptId === "place-value"
    )!;
    placeValue.preferred = "place-value display";
    placeValue.tts = "place value speech";
    const narration = localizeNarration(source, "en", {
      glossary: parseMathGlossary(raw, "en"),
    });
    expect(narration.segments[0]?.displayText).toContain("place-value display");
    expect(narration.segments[0]?.spokenText).toContain("place value speech");
  });

  it("blocks a failed post-localization verifier result", async () => {
    const source = await lesson();
    const checks = localizedDisplayChecks(
      source,
      localizeNarration(source, "de")
    );
    expect(() =>
      assertLocalizedDisplayVerification(checks, {
        protocolVersion: "math-verifier.v3",
        requestId: "localized-test",
        inputHash: "0".repeat(64),
        verifierVersion: "3.0.0",
        sympyVersion: "1.14.0",
        status: "failed",
        checks: checks.map((check, index) => ({
          checkId: check.checkId,
          status: index === 0 ? "failed" : "passed",
        })),
      })
    ).toThrow(/Post-localization verification failed/u);
  });

  it("creates verifier-bound display checks for localized measurements", async () => {
    const source = await lesson("M5-GM-002");
    const checks = localizedDisplayChecks(
      source,
      localizeNarration(source, "de")
    );
    const measurements = source.facts.filter(
      (fact) => fact.semantic.kind === "measurement"
    );
    expect(measurements.length).toBeGreaterThan(0);
    for (const fact of measurements) {
      if (fact.semantic.kind !== "measurement") throw new Error("test setup");
      expect(
        checks.find(
          (check) => check.checkId === `check-display-${fact.factId}`
        )
      ).toMatchObject({
        kind: "display-fact",
        expression: fact.semantic.value,
        expected: fact.semantic,
      });
    }
  });

  it("rejects a schema-valid narration whose displayed fact was reformatted", async () => {
    const source = await lesson();
    const narration = structuredClone(localizeNarration(source, "de"));
    narration.resolvedFacts[0]!.display = "999";
    const { contentHash: _oldHash, ...content } = narration;
    narration.contentHash = canonicalHash(content);
    expect(() => localizedDisplayChecks(source, narration)).toThrow(
      /does not match deterministic formatting/u
    );
  });
});
