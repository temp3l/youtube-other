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
  "the story begins",
  "the threat follows a rule",
  "the final evidence appears",
  "the first real warning came",
  "what followed changed everything",
  "the danger became personal",
  "the pattern became worse",
  "the apparent ending did not survive",
  "the final piece of evidence arrived later",
  "all clues are connected to",
  "alle hinweise stehen im zusammenhang",
  "die geschichte beginnt",
  "die bedrohung folgt einer regel",
  "später erscheint ein letzter beweis",
];

function normalizeForDuplicate(value: string): string {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[`*_>#-]/gu, "")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .trim();
}

function paragraphDuplicates(text: string): readonly string[] {
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const paragraph of text.split(/\n{2,}/u)) {
    const normalized = normalizeForDuplicate(paragraph);
    if (normalized.length < 40) {
      continue;
    }
    if (seen.has(normalized)) {
      duplicates.push(normalized.slice(0, 80));
    }
    seen.add(normalized);
  }
  return duplicates;
}

function includesAny(lower: string, values: readonly string[] | undefined): boolean {
  return (values ?? []).some((value) => lower.includes(value.toLowerCase()));
}

function hasEmotionalCost(text: string, facts: CanonicalStoryFacts): boolean {
  const lower = text.toLowerCase();
  const cost = facts.emotionalCost?.toLowerCase();
  const attachment = facts.protagonistAttachment?.toLowerCase();
  const hasCostVerb = /\b(refus|sacrific|abandon|destroy|betray|accept|ignore|leave|reject|give up|lose)\w*\b/iu.test(text);
  return hasCostVerb && (!!cost ? lower.includes(cost.slice(0, Math.min(32, cost.length))) || includesAny(lower, [cost]) : true) && (!!attachment ? includesAny(lower, [attachment]) || /\bpromise|guilt|voice|loved|familiar|proof|recording|name|shame|trust\b/iu.test(text) : true);
}

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

  const duplicates = paragraphDuplicates(args.text);
  if (duplicates.length > 0) {
    findings.push(
      finding({
        code: "DUPLICATE_NARRATIVE_PARAGRAPH",
        message: "Duplicate or near-duplicate narrative paragraphs detected.",
        severity: "error",
        repairScope: "targeted-short-repair",
      })
    );
    repairScopes.add("targeted-short-repair");
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

  const titleAnchor = args.facts.primaryTitle.toLowerCase();
  if (titleAnchor && lower.split(titleAnchor).length > 4) {
    findings.push(
      finding({
        code: "TITLE_USED_AS_GENERIC_ANCHOR",
        message: "Story title is repeated as a generic anchor instead of natural narration.",
        severity: "error",
        repairScope: "targeted-short-repair",
      })
    );
    repairScopes.add("targeted-short-repair");
  }

  for (const name of args.facts.protagonistNames ?? []) {
    if (!lower.includes(` ${name.toLowerCase()} `)) {
      const code = args.artifactKind === "short" ? "CANONICAL_NAME_MISSING" : "CANONICAL_NAME_NOT_EXPLICIT";
      if (args.artifactKind === "short") {
        findings.push(
          finding({
            code,
            message: `Canonical protagonist name is missing: ${name}.`,
            severity: "error",
            repairScope: "canonical-name-repair",
          })
        );
        repairScopes.add("canonical-name-repair");
      } else {
        warnings.push(`Canonical protagonist name is not explicit in the generated text: ${name}.`);
      }
    }
  }

  const criticalObjects = args.facts.keyObjects ?? args.facts.criticalObjects;
  const missingObjects = criticalObjects.filter((object) => !lower.includes(object.toLowerCase()));
  if (criticalObjects.length > 0 && missingObjects.length > Math.max(0, criticalObjects.length - 2)) {
    findings.push(
      finding({
        code: "CONCRETE_OBJECTS_MISSING",
        message: `Generated text omits too many canonical objects: ${missingObjects.join(", ")}.`,
        severity: "error",
        repairScope: "targeted-short-repair",
      })
    );
    repairScopes.add("targeted-short-repair");
  }

  const locations = args.facts.concreteLocations ?? args.facts.locationAnchors;
  if (args.artifactKind === "short" && locations && locations.length > 0 && !includesAny(lower, locations)) {
    findings.push(
      finding({
        code: "CONCRETE_LOCATION_MISSING",
        message: "Short omits canonical concrete locations.",
        severity: "error",
        repairScope: "targeted-short-repair",
      })
    );
    repairScopes.add("targeted-short-repair");
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
  if (args.facts.supernaturalRule && !includesAny(lower, [args.facts.supernaturalRule]) && !/\bdo not\b|\bdon't\b|\bnever\b|\bmust\b|\brule\b/iu.test(normalized)) {
    findings.push(
      finding({
        code: "SUPERNATURAL_RULE_MISSING",
        message: "Generated text does not include a visible supernatural rule.",
        severity: "error",
        repairScope: "targeted-short-repair",
      })
    );
    repairScopes.add("targeted-short-repair");
  }

  if (!hasEmotionalCost(normalized, args.facts)) {
    findings.push(
      finding({
        code: "EMOTIONAL_COST_MISSING",
        message: "Ending lacks a concrete protagonist attachment and emotionally costly final decision.",
        severity: "error",
        repairScope: "targeted-short-repair",
      })
    );
    repairScopes.add("targeted-short-repair");
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

  if (args.artifactKind === "short") {
    const firstTwoSentences = sentences.slice(0, 2).join(" ");
    if (!/\bhook\b|\bdoor\b|\bradio\b|\bvoice\b|\bscrap|\bcar\b|\bmirror\b|\bphone\b/iu.test(firstTwoSentences)) {
      findings.push(
        finding({
          code: "SHORT_CONCRETE_HOOK_MISSING",
          message: "Short does not start with a concrete impossible detail.",
          severity: "error",
          repairScope: "targeted-short-repair",
        })
      );
      repairScopes.add("targeted-short-repair");
    }
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
