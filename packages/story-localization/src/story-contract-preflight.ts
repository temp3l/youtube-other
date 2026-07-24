import { normalizeWhitespace } from "@mediaforge/shared";
import type { StoryIR } from "./story-artifact-model.js";
import type { CanonicalStoryFacts } from "./story-localization.types.js";
import type { StoryMechanicsContract } from "./story-mechanics.js";

export type StoryContractPreflightCode =
  | "REQUIRED_VALUE_UNKNOWN"
  | "PLACEHOLDER_VALUE"
  | "EMPTY_REQUIRED_VALUE"
  | "EMPTY_REQUIRED_ARRAY"
  | "PROVENANCE_METADATA_LEAK"
  | "DUPLICATED_UNRELATED_VALUE"
  | "UNSTRUCTURED_SUPERNATURAL_RULE"
  | "MISSING_LOCATION"
  | "MISSING_CRITICAL_OBJECT"
  | "MISSING_EMOTIONAL_ATTACHMENT"
  | "MISSING_OBSERVABLE_EMOTIONAL_COST"
  | "MISSING_CLIMAX_RULE_CONNECTION"
  | "BEAT_LIMIT_CONTRADICTION"
  | "EVENT_LIMIT_CONTRADICTION"
  | "OUTPUT_SCHEMA_CONTRADICTION"
  | "DUPLICATED_PROMPT_SECTION";

export interface StoryContractPreflightDiagnostic {
  readonly code: StoryContractPreflightCode;
  readonly path: readonly (string | number)[];
  readonly message: string;
  readonly blocking: true;
}

const PROVENANCE = /<!--|-->|\b(?:source|content|contract|prompt)[-_ ]?(?:sha256|hash|fingerprint)\s*[:=]|\bGENERATED[-_ ](?:SOURCE|BY|MARKER)\b/iu;
const PLACEHOLDER = /\?\s*$/u;

function normalized(value: string | undefined): string {
  return normalizeWhitespace(value ?? "");
}

function diagnostic(
  code: StoryContractPreflightCode,
  path: readonly (string | number)[],
  message: string
): StoryContractPreflightDiagnostic {
  return { code, path, message, blocking: true };
}

function checkNarrativeValue(args: {
  readonly path: readonly (string | number)[];
  readonly value: string | undefined;
  readonly allowUnknown?: boolean;
}): readonly StoryContractPreflightDiagnostic[] {
  const value = normalized(args.value);
  if (!value) return [diagnostic("EMPTY_REQUIRED_VALUE", args.path, `${args.path.join(".")} must not be empty.`)];
  if (!args.allowUnknown && /^unknown$/iu.test(value)) return [diagnostic("REQUIRED_VALUE_UNKNOWN", args.path, `${args.path.join(".")} must be resolved before compilation.`)];
  if (PLACEHOLDER.test(value)) return [diagnostic("PLACEHOLDER_VALUE", args.path, `${args.path.join(".")} contains a question-mark placeholder.`)];
  if (PROVENANCE.test(value)) return [diagnostic("PROVENANCE_METADATA_LEAK", args.path, `${args.path.join(".")} contains compiler provenance metadata.`)];
  return [];
}

export function validateStoryContractPreflight(args: {
  readonly storyIr: StoryIR;
  readonly facts: CanonicalStoryFacts;
  readonly mechanics: StoryMechanicsContract;
}): readonly StoryContractPreflightDiagnostic[] {
  const issues: StoryContractPreflightDiagnostic[] = [];
  for (const [path, value] of [
    [["storyIr", "genre"], args.storyIr.genre],
    [["storyIr", "fictionality"], args.storyIr.fictionality],
    [["storyIr", "narrativeMode"], args.storyIr.narrativeMode],
    [["mechanics", "centralThreat"], args.mechanics.centralThreat],
    [["mechanics", "protagonistGoal"], args.mechanics.protagonistGoal],
    [["mechanics", "emotionalStake"], args.mechanics.emotionalStake],
    [["mechanics", "emotionalCost"], args.mechanics.emotionalCost],
    [["mechanics", "climaxAction"], args.mechanics.climaxAction],
    [["mechanics", "climaxRuleConnection"], args.mechanics.climaxRuleConnection],
    [["mechanics", "finalConsequence"], args.mechanics.finalConsequence],
    [["mechanics", "supernaturalMechanics", "trigger"], args.mechanics.supernaturalMechanics.trigger],
    [["mechanics", "supernaturalMechanics", "activationEffect"], args.mechanics.supernaturalMechanics.activationEffect],
    [["mechanics", "supernaturalMechanics", "interactionRequirement"], args.mechanics.supernaturalMechanics.interactionRequirement],
    [["mechanics", "supernaturalMechanics", "cost"], args.mechanics.supernaturalMechanics.cost],
    [["mechanics", "supernaturalMechanics", "climaxUse"], args.mechanics.supernaturalMechanics.climaxUse],
  ] as const) issues.push(...checkNarrativeValue({ path, value }));

  const locations = args.facts.concreteLocations ?? args.facts.locationAnchors ?? [];
  const objects = args.facts.keyObjects ?? args.facts.criticalObjects;
  if (locations.length === 0) issues.push(diagnostic("MISSING_LOCATION", ["facts", "concreteLocations"], "At least one concrete canonical location is required."));
  if (objects.length === 0) issues.push(diagnostic("MISSING_CRITICAL_OBJECT", ["facts", "keyObjects"], "At least one critical canonical object is required."));
  if (!normalized(args.facts.protagonistAttachment)) issues.push(diagnostic("MISSING_EMOTIONAL_ATTACHMENT", ["facts", "protagonistAttachment"], "A concrete emotional attachment is required before the climax."));
  if (!normalized(args.facts.emotionalCost)) issues.push(diagnostic("MISSING_OBSERVABLE_EMOTIONAL_COST", ["facts", "emotionalCost"], "An observable emotional cost is required."));
  if (!normalized(args.mechanics.climaxRuleConnection)) issues.push(diagnostic("MISSING_CLIMAX_RULE_CONNECTION", ["mechanics", "climaxRuleConnection"], "The climax must explicitly use an established rule."));

  for (const [index, entry] of [...locations, ...objects, ...args.storyIr.chronology].entries()) {
    if (PROVENANCE.test(entry)) issues.push(diagnostic("PROVENANCE_METADATA_LEAK", ["canonicalValues", index], "Canonical arrays must not contain source comments or hashes."));
  }
  const related = [
    ["protagonistGoal", args.mechanics.protagonistGoal],
    ["emotionalStake", args.mechanics.emotionalStake],
    ["emotionalCost", args.mechanics.emotionalCost],
    ["climaxAction", args.mechanics.climaxAction],
    ["finalConsequence", args.mechanics.finalConsequence],
  ] as const;
  const byValue = new Map<string, string[]>();
  for (const [field, value] of related) {
    const key = normalized(value).toLocaleLowerCase();
    byValue.set(key, [...(byValue.get(key) ?? []), field]);
  }
  for (const [value, fields] of byValue) {
    if (value && fields.length > 1) issues.push(diagnostic("DUPLICATED_UNRELATED_VALUE", ["mechanics", ...fields], `Unrelated critical fields contain the same value: ${fields.join(", ")}.`));
  }
  const rule = args.mechanics.supernaturalRule;
  if (!/\b(?:when|whenever|only|must|never|if|trigger|answer|respond|listen|cost|until|while)\b/iu.test(rule)) {
    issues.push(diagnostic("UNSTRUCTURED_SUPERNATURAL_RULE", ["mechanics", "supernaturalRule"], "A standalone evidence sentence cannot serve as the complete supernatural rule."));
  }
  return issues;
}

export function validateCompiledPromptContract(args: {
  readonly system: string;
  readonly user: string;
  readonly responseSchemaName: string;
  readonly selectedEventCount: number;
  readonly emittedEventCount: number;
  readonly sceneBeatCount: number;
  readonly maxCanonicalEvents: number;
  readonly maxSceneBeats: number;
}): readonly StoryContractPreflightDiagnostic[] {
  const issues: StoryContractPreflightDiagnostic[] = [];
  const combined = `${args.system}\n${args.user}`;
  const metadataRequired = /metadata/iu.test(args.responseSchemaName);
  if (/narration only|narration-only/iu.test(combined) && metadataRequired) issues.push(diagnostic("OUTPUT_SCHEMA_CONTRADICTION", ["responseSchema"], "Narration-only instructions cannot use a metadata-required schema."));
  if (/metadata (?:is |are )?(?:forbidden|prohibited)|do not (?:generate|produce).*metadata/iu.test(combined) && metadataRequired) issues.push(diagnostic("OUTPUT_SCHEMA_CONTRADICTION", ["responseSchema"], "Metadata-prohibited instructions cannot use a metadata-required schema."));
  if (args.sceneBeatCount > args.maxSceneBeats) issues.push(diagnostic("BEAT_LIMIT_CONTRADICTION", ["sceneBeatCount"], `Prompt contains ${args.sceneBeatCount} beats but declares a maximum of ${args.maxSceneBeats}.`));
  if (args.selectedEventCount > args.maxCanonicalEvents || args.emittedEventCount > args.maxCanonicalEvents) issues.push(diagnostic("EVENT_LIMIT_CONTRADICTION", ["emittedEventCount"], `Prompt emits ${args.emittedEventCount} events under a maximum of ${args.maxCanonicalEvents}.`));
  const headings = [...combined.matchAll(/^##\s+(.+)$/gmu)].map((match) => normalized(match[1]).toLocaleLowerCase());
  const duplicateHeading = headings.find((heading, index) => headings.indexOf(heading) !== index);
  if (duplicateHeading) issues.push(diagnostic("DUPLICATED_PROMPT_SECTION", ["prompt", duplicateHeading], `Prompt section "${duplicateHeading}" appears more than once.`));
  return issues;
}
