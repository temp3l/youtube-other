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
import { localizeNarration } from "./localization.js";

async function lesson(): Promise<LessonVariantSpecification> {
  const release = await loadCurriculumRelease(
    "packages/math-education/data/curriculum/v1"
  );
  return buildLessonVariant(
    release.skills.find((skill) => skill.skillId === "M5-ZO-001")!,
    "standard"
  );
}

describe("locked-fact localization", () => {
  it("formats exact numbers, fractions, signs, units, and speech for five locale policies", () => {
    const expected = {
      de: ["-12.345", "123,45", "1/2", "minus 7", "3 Zentimeter"],
      en: ["-12,345", "123.45", "1/2", "minus 7", "3 centimeters"],
      es: ["-12,345", "123,45", "1/2", "menos 7", "3 centímetros"],
      fr: ["-12 345", "123,45", "1/2", "moins 7", "3 centimètres"],
      pt: ["-12.345", "123,45", "1/2", "menos 7", "3 centímetros"],
    } as const;
    for (const language of ["de", "en", "es", "fr", "pt"] as const) {
      const integer = formatExpression(
        { kind: "integer", value: "-12345" },
        language
      );
      const decimal = formatExpression(
        { kind: "decimal", unscaled: "12345", scale: 2 },
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
      expect([
        integer.display,
        decimal.display,
        fraction.display,
        negative.spoken,
        unit.spoken,
      ]).toEqual(expected[language]);
    }
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
      "6 geteilt durch 2 gleich 3"
    );
    expect(formatExpression(formula, "en").spoken).toBe(
      "6 divided by 2 equals 3"
    );
    expect(formatExpression(formula, "es").spoken).toBe(
      "6 dividido entre 2 igual a 3"
    );
    expect(formatExpression(formula, "fr").spoken).toBe(
      "6 divisé par 2 égal à 3"
    );
    expect(formatExpression(formula, "pt").spoken).toBe(
      "6 dividido por 2 igual a 3"
    );
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
        protocolVersion: "math-verifier.v2",
        requestId: "localized-test",
        inputHash: "0".repeat(64),
        verifierVersion: "2.0.0",
        sympyVersion: "1.14.0",
        status: "failed",
        checks: checks.map((check, index) => ({
          checkId: check.checkId,
          status: index === 0 ? "failed" : "passed",
        })),
      })
    ).toThrow(/Post-localization verification failed/u);
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
