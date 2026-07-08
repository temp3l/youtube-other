import { countSpokenWords, normalizeWhitespace, splitIntoSentences } from "@mediaforge/shared";
import {
  type RepairScope,
  type StoryArtifactKind,
  type StoryGenerationBudget,
  type StoryQualityFinding,
  type StoryQualityGateResult,
} from "./story-generation-contracts.js";
import { type CanonicalStoryFacts, type LanguageCode } from "./story-localization.types.js";

const BANNED_OUTLINE_PHRASES = [
  "the protagonist",
  "the central rule",
  "this story follows",
  "in this story",
  "summary",
  "outline",
  "here is the story",
];

function finding(args: {
  readonly code: string;
  readonly message: string;
  readonly severity: "warning" | "error";
  readonly repairScope?: RepairScope;
  readonly deterministicFix?: string;
}): StoryQualityFinding {
  return args;
}

export function runStoryQualityGate(args: {
  readonly artifactKind: StoryArtifactKind;
  readonly language: LanguageCode;
  readonly text: string;
  readonly facts: CanonicalStoryFacts;
  readonly budget: StoryGenerationBudget;
  readonly targetWordRange?: { readonly min: number; readonly max: number };
}): StoryQualityGateResult {
  const findings: StoryQualityFinding[] = [];
  const warnings: string[] = [];
  const normalized = normalizeWhitespace(args.text);
  const lower = ` ${normalized.toLowerCase()} `;
  const sentences = splitIntoSentences(normalized);
  const wordCount = countSpokenWords(normalized);
  const repairScopes = new Set<RepairScope>();
  const deterministicFixes = new Set<string>();

  if (args.targetWordRange) {
    if (wordCount < args.targetWordRange.min || wordCount > args.targetWordRange.max) {
      findings.push(
        finding({
          code: "WORD_RANGE_INVALID",
          message: `Narration word count ${wordCount} is outside ${args.targetWordRange.min}-${args.targetWordRange.max}.`,
          severity: "error",
          repairScope: "targeted-short-repair",
        })
      );
      repairScopes.add("targeted-short-repair");
    }
  }

  if (args.budget.maxOutputTokens !== undefined && args.budget.maxOutputTokens > 0) {
    const estimatedTokens = Math.ceil(normalized.length / 4);
    if (estimatedTokens > args.budget.maxOutputTokens * 0.8) {
      warnings.push("Output is close to the configured max output token cap.");
    }
  }

  if ((normalized.match(/<!--\s*mediaforge:generated-full-story\s*-->/gu) ?? []).length > 1) {
    findings.push(
      finding({
        code: "DUPLICATE_GENERATED_MARKER",
        message: "Duplicate generated provenance markers detected.",
        severity: "error",
        repairScope: "generated-marker-replacement",
        deterministicFix: "dedupe-generated-marker",
      })
    );
    repairScopes.add("generated-marker-replacement");
    deterministicFixes.add("dedupe-generated-marker");
  }

  const bannedPhrase = BANNED_OUTLINE_PHRASES.find((phrase) => lower.includes(` ${phrase} `));
  if (bannedPhrase) {
    findings.push(
      finding({
        code: "BANNED_OUTLINE_PHRASE",
        message: `Narration includes banned outline phrase: ${bannedPhrase}.`,
        severity: "error",
        repairScope: "targeted-short-repair",
      })
    );
    repairScopes.add("targeted-short-repair");
  }

  for (const name of args.facts.protagonistNames ?? []) {
    if (!lower.includes(` ${name.toLowerCase()} `)) {
      warnings.push(`Canonical protagonist name is not explicit in the generated text: ${name}.`);
    }
  }

  for (const invention of args.facts.forbiddenInventions ?? []) {
    if (lower.includes(` ${invention.toLowerCase()} `)) {
      const repairScope =
        invention === "Funkgerät"
          ? "german-compound-repair"
          : "targeted-short-repair";
      findings.push(
        repairScope === "german-compound-repair"
          ? finding({
              code: "FORBIDDEN_INVENTION",
              message: `Forbidden invention detected: ${invention}.`,
              severity: "error",
              repairScope,
              deterministicFix: "repair-german-compounds",
            })
          : finding({
              code: "FORBIDDEN_INVENTION",
              message: `Forbidden invention detected: ${invention}.`,
              severity: "error",
              repairScope,
            })
      );
      if (invention === "Funkgerät") {
        repairScopes.add("german-compound-repair");
        deterministicFixes.add("repair-german-compounds");
      } else {
        repairScopes.add("targeted-short-repair");
      }
    }
  }

  if (args.language === "de" && /\bServic Eingang\b|\bServic eflur\b/iu.test(normalized)) {
    findings.push(
      finding({
        code: "MALFORMED_GERMAN_COMPOUND",
        message: "Malformed German service compounds detected.",
        severity: "error",
        repairScope: "german-compound-repair",
        deterministicFix: "repair-german-compounds",
      })
    );
    repairScopes.add("german-compound-repair");
    deterministicFixes.add("repair-german-compounds");
  }

  const finalSentence = normalizeWhitespace(sentences.at(-1) ?? normalized);
  if (
    args.language === "en" &&
    args.facts.requiredFinalLine &&
    finalSentence !== args.facts.requiredFinalLine
  ) {
    findings.push(
      finding({
        code: "FINAL_STING_MISSING",
        message: "Required final sting line is missing or altered.",
        severity: "error",
        repairScope: "final-sting-repair",
        deterministicFix: "repair-final-sting",
      })
    );
    repairScopes.add("final-sting-repair");
    deterministicFixes.add("repair-final-sting");
  }

  if (
    args.language === "en" &&
    args.facts.requiredFinalReveal &&
    !lower.includes(args.facts.requiredFinalReveal.toLowerCase())
  ) {
    findings.push(
      finding({
        code: "FINAL_REVEAL_MISSING",
        message: "Required final reveal is missing.",
        severity: "error",
        repairScope: "targeted-short-repair",
      })
    );
    repairScopes.add("targeted-short-repair");
  }
  if (
    args.artifactKind === "short" &&
    !/\?|!|\./u.test(finalSentence)
  ) {
    findings.push(
      finding({
        code: "FINAL_STING_WEAK",
        message: "Short is missing a clear final sting sentence.",
        severity: "error",
        repairScope: "targeted-short-repair",
      })
    );
    repairScopes.add("targeted-short-repair");
  }

  const abstractSignals = ["story", "mystery", "terror", "summary", "follows"];
  const abstractHits = abstractSignals.filter((entry) => lower.includes(` ${entry} `)).length;
  if (abstractHits >= 3 && args.artifactKind === "short") {
    findings.push(
      finding({
        code: "ABSTRACTION_HIGH",
        message: "Narration reads too abstractly instead of as a concrete micro-story.",
        severity: "error",
        repairScope: "targeted-short-repair",
      })
    );
    repairScopes.add("targeted-short-repair");
  }

  const errorCount = findings.filter((entry) => entry.severity === "error").length;
  const repairable =
    errorCount > 0 &&
    findings.every((entry) =>
      entry.repairScope !== undefined &&
      [
        "metadata-deduplication",
        "generated-marker-replacement",
        "german-compound-repair",
        "canonical-name-repair",
        "final-sting-repair",
        "targeted-short-repair",
      ].includes(entry.repairScope)
    );
  return {
    status: errorCount === 0 ? "PASS" : repairable ? "REPAIRABLE" : "FAIL",
    findings,
    warnings,
    repairScopes: [...repairScopes],
    deterministicFixes: [...deterministicFixes],
  };
}
