import { hashText, normalizeWhitespace, splitIntoSentences } from "@mediaforge/shared";
import { z } from "zod";
import { stableSerialize } from "./stable-json.js";
import {
  type CanonicalStoryFacts,
  type ParsedSourceStory,
} from "./story-localization.types.js";
import { type StoryIR } from "./story-artifact-model.js";

export const STORY_MECHANICS_CONTRACT_VERSION = "story-mechanics-contract-v1";
export const CANONICAL_STORY_BEAT_VERSION = "canonical-story-beats-v1";

export const storyMechanicsContractSchema = z.object({
  centralThreat: z.string().trim().min(1),
  supernaturalRule: z.string().trim().min(1),
  ruleEvidence: z.array(z.string().trim().min(1)).min(2),
  prohibitedActions: z.array(z.string().trim().min(1)),
  protagonistGoal: z.string().trim().min(1),
  emotionalStake: z.string().trim().min(1),
  emotionalCost: z.string().trim().min(1),
  failedResponses: z.array(z.object({
    action: z.string().trim().min(1),
    failure: z.string().trim().min(1),
    informationRevealed: z.string().trim().min(1),
  }).strict()).min(1),
  climaxAction: z.string().trim().min(1),
  climaxRuleConnection: z.string().trim().min(1),
  finalConsequence: z.string().trim().min(1),
}).strict();
export type StoryMechanicsContract = z.infer<typeof storyMechanicsContractSchema>;

export const canonicalStoryBeatTypeSchema = z.enum([
  "HOOK",
  "SETUP",
  "WARNING",
  "EVIDENCE",
  "RULE_DISCOVERY",
  "FAILED_RESPONSE",
  "EMOTIONAL_ESCALATION",
  "CLIMAX",
  "AFTERMATH",
  "FINAL_REVERSAL",
]);

export const canonicalStoryBeatSchema = z.object({
  id: z.string().regex(/^beat-\d{3}$/u),
  type: canonicalStoryBeatTypeSchema,
  summary: z.string().trim().min(1),
  requiredFacts: z.array(z.string().trim().min(1)),
  requiredCharacters: z.array(z.string().trim().min(1)),
  mechanicsReferences: z.array(z.string().trim().min(1)),
}).strict();
export type CanonicalStoryBeat = z.infer<typeof canonicalStoryBeatSchema>;

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map(normalizeWhitespace).filter(Boolean))];
}

function firstNonEmpty(values: readonly (string | undefined)[]): string {
  return values.map((value) => normalizeWhitespace(value ?? "")).find(Boolean) ?? "";
}

function inferBeatType(text: string, index: number, count: number): CanonicalStoryBeat["type"] {
  if (index === 0) return "HOOK";
  if (index === count - 1) return "FINAL_REVERSAL";
  if (index === count - 2) return "CLIMAX";
  if (/\b(?:tried|attempted|called|locked|sealed|ran|escaped|failed)\b/iu.test(text)) return "FAILED_RESPONSE";
  if (/\b(?:rule|never|must|only|whenever|each time)\b/iu.test(text)) return "RULE_DISCOVERY";
  if (/\b(?:recording|camera|footage|witness|photo|evidence|trace|proof)\b/iu.test(text)) return "EVIDENCE";
  if (/\b(?:warned|warning|note|message|said not to|do not|don't)\b/iu.test(text)) return "WARNING";
  if (index >= Math.floor(count * 0.65)) return "EMOTIONAL_ESCALATION";
  return index <= Math.max(1, Math.floor(count * 0.2)) ? "SETUP" : "EVIDENCE";
}

export function buildCanonicalStoryBeats(args: {
  readonly story: Pick<ParsedSourceStory, "narrationParagraphs">;
  readonly facts: CanonicalStoryFacts;
}): readonly CanonicalStoryBeat[] {
  const paragraphs = args.story.narrationParagraphs.map(normalizeWhitespace).filter(Boolean);
  return paragraphs.map((paragraph, index) => {
    const requiredCharacters = args.facts.characters
      .map((character) => character.name)
      .filter((name) => paragraph.toLocaleLowerCase().includes(name.toLocaleLowerCase()));
    const requiredFacts = unique([
      ...args.facts.criticalObjects.filter((item) => paragraph.toLocaleLowerCase().includes(item.toLocaleLowerCase())),
      ...args.facts.writtenMessages.filter((item) => paragraph.toLocaleLowerCase().includes(item.toLocaleLowerCase())),
    ]);
    const mechanicsReferences = unique([
      ...(args.facts.supernaturalRule && /\b(?:rule|never|must|only|whenever|each time)\b/iu.test(paragraph)
        ? [args.facts.supernaturalRule]
        : []),
      ...(index >= paragraphs.length - 2 ? [args.facts.finalConsequence] : []),
    ]);
    return canonicalStoryBeatSchema.parse({
      id: `beat-${String(index + 1).padStart(3, "0")}`,
      type: inferBeatType(paragraph, index, paragraphs.length),
      summary: splitIntoSentences(paragraph).slice(0, 2).join(" ") || paragraph,
      requiredFacts,
      requiredCharacters,
      mechanicsReferences,
    });
  });
}

function failedResponseFromEvent(event: string, rule: string): StoryMechanicsContract["failedResponses"][number] {
  return {
    action: event,
    failure: `The response does not stop the central threat: ${event}`,
    informationRevealed: `The result narrows or demonstrates the established rule: ${rule}`,
  };
}

export function buildStoryMechanicsContract(args: {
  readonly facts: CanonicalStoryFacts;
  readonly storyIr: StoryIR;
}): StoryMechanicsContract {
  const evidence = unique([
    ...args.facts.criticalEvents,
    ...args.storyIr.chronology,
  ]).slice(0, 3);
  const rule = normalizeWhitespace(
    args.facts.supernaturalRule ?? args.storyIr.centralRuleMechanism.description
  );
  const failedEvents = unique([...args.facts.criticalEvents, ...args.storyIr.chronology])
    .filter((event) => /\b(?:tried|attempted|called|locked|sealed|ran|escaped|failed|could not|did not)\b/iu.test(event));
  const fallbackFailure = args.facts.criticalEvents[1] ?? args.storyIr.chronology[1] ?? args.storyIr.climax;
  const protagonistGoal = firstNonEmpty([
    args.facts.protagonistAttachment,
    args.facts.primaryReveal,
    `Survive ${args.facts.threat}`,
  ]);
  const emotionalCost = firstNonEmpty([
    args.facts.emotionalCost,
    args.facts.finalDecision,
    args.facts.finalConsequence,
    args.storyIr.endingConsequence,
  ]);
  const climaxAction = firstNonEmpty([
    args.facts.finalDecision,
    args.storyIr.climax,
    args.facts.primaryReveal,
  ]);
  return storyMechanicsContractSchema.parse({
    centralThreat: args.facts.threatMechanism ?? args.facts.threat,
    supernaturalRule: rule,
    ruleEvidence: evidence.length >= 2 ? evidence : [evidence[0] ?? rule, args.storyIr.climax],
    prohibitedActions: unique(args.facts.keyRules ?? []).filter((entry) => /\b(?:never|must not|do not|don't|forbidden)\b/iu.test(entry)),
    protagonistGoal,
    emotionalStake: firstNonEmpty([args.facts.protagonistAttachment, args.facts.primaryReveal, args.facts.finalConsequence, args.storyIr.endingConsequence]),
    emotionalCost,
    failedResponses: (failedEvents.length > 0 ? failedEvents : [fallbackFailure]).slice(0, 3).map((event) => failedResponseFromEvent(event, rule)),
    climaxAction,
    climaxRuleConnection: `${climaxAction} must directly use or subvert this established rule: ${rule}`,
    finalConsequence: args.facts.finalConsequence || args.storyIr.endingConsequence,
  });
}

export function hashCanonicalStoryBeats(beats: readonly CanonicalStoryBeat[]): string {
  return hashText(stableSerialize({ version: CANONICAL_STORY_BEAT_VERSION, beats }));
}

export function hashStoryMechanicsContract(contract: StoryMechanicsContract): string {
  return hashText(stableSerialize({ version: STORY_MECHANICS_CONTRACT_VERSION, contract }));
}
