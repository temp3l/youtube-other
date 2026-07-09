import path from "node:path";
import { ensureDir, fileExists, hashText, readJsonIfExists, writeJsonAtomic } from "@mediaforge/shared";
import { z } from "zod";
import { compactCanonicalStoryFactsSchema } from "./story-localization.schemas.js";
import { type CanonicalStoryFacts } from "./story-localization.types.js";
import { normalizeCanonicalStoryFacts } from "./canonical-facts.service.js";
import { stableSerialize } from "./stable-json.js";

export const STORY_FACTS_SCHEMA_VERSION = "story-facts-v1";

const storyFactsDocumentSchema = z
  .object({
    schemaVersion: z.literal(STORY_FACTS_SCHEMA_VERSION),
    episodeSlug: z.string().min(1),
    sourceFullHash: z.string().min(64),
    factsHash: z.string().min(64),
    extractionConfidence: z.number().min(0).max(1),
    generatedAt: z.string().min(1),
    facts: compactCanonicalStoryFactsSchema.extend({
      protagonistNames: z.array(z.string().min(1)).default([]),
      locationAnchors: z.array(z.string().min(1)).default([]),
      threatMotifs: z.array(z.string().min(1)).default([]),
      keyRules: z.array(z.string().min(1)).default([]),
      supportingCharacters: z.array(z.string().min(1)).default([]),
      concreteLocations: z.array(z.string().min(1)).default([]),
      keyObjects: z.array(z.string().min(1)).default([]),
      threatMechanism: z.string().min(1).default(""),
      supernaturalRule: z.string().min(1).default(""),
      protagonistAttachment: z.string().min(1).default(""),
      threatTemptation: z.string().min(1).default(""),
      emotionalCost: z.string().min(1).default(""),
      finalDecision: z.string().min(1).default(""),
      forbiddenInventions: z.array(z.string().min(1)).default([]),
      localizationPreservationRules: z.array(z.string().min(1)).default([]),
      requiredFinalReveal: z.string().min(1).default(""),
      requiredFinalLine: z.string().min(1).default(""),
    }),
  })
  .strict();

export type StoryFactsDocument = z.infer<typeof storyFactsDocumentSchema>;

export function resolveStoryFactsPath(outputRoot: string, episodeSlug: string): string {
  return path.join(outputRoot, episodeSlug, "story-facts.json");
}

export async function readStoryFacts(args: {
  readonly outputRoot: string;
  readonly episodeSlug: string;
  readonly sourceFullHash?: string;
}): Promise<CanonicalStoryFacts | null> {
  const raw = await readJsonIfExists(
    resolveStoryFactsPath(args.outputRoot, args.episodeSlug),
    (value) => storyFactsDocumentSchema.parse(value)
  );
  if (!raw) {
    return null;
  }
  if (args.sourceFullHash && raw.sourceFullHash !== args.sourceFullHash) {
    return null;
  }
  return normalizeCanonicalStoryFacts({
    episodeNumber: "",
    primaryTitle: "",
    characters: raw.facts.characters.map((character) => ({
      name: character.name,
      role: character.role,
      ...(character.relationship ? { relationship: character.relationship } : {}),
    })),
    ...(raw.facts.setting ? { setting: raw.facts.setting } : {}),
    criticalObjects: raw.facts.criticalObjects,
    criticalEvents: raw.facts.criticalEvents,
    writtenMessages: raw.facts.writtenMessages,
    threat: raw.facts.centralThreat,
    primaryReveal: raw.facts.primaryReveal,
    finalConsequence: raw.facts.finalConsequence,
    protagonistNames: raw.facts.protagonistNames,
    locationAnchors: raw.facts.locationAnchors,
    threatMotifs: raw.facts.threatMotifs,
    keyRules: raw.facts.keyRules,
    supportingCharacters: raw.facts.supportingCharacters,
    concreteLocations: raw.facts.concreteLocations,
    keyObjects: raw.facts.keyObjects,
    threatMechanism: raw.facts.threatMechanism,
    supernaturalRule: raw.facts.supernaturalRule,
    protagonistAttachment: raw.facts.protagonistAttachment,
    threatTemptation: raw.facts.threatTemptation,
    emotionalCost: raw.facts.emotionalCost,
    finalDecision: raw.facts.finalDecision,
    forbiddenInventions: raw.facts.forbiddenInventions,
    localizationPreservationRules: raw.facts.localizationPreservationRules,
    requiredFinalReveal: raw.facts.requiredFinalReveal,
    requiredFinalLine: raw.facts.requiredFinalLine,
  });
}

export async function writeStoryFacts(args: {
  readonly outputRoot: string;
  readonly episodeSlug: string;
  readonly sourceFullHash: string;
  readonly extractionConfidence: number;
  readonly facts: CanonicalStoryFacts;
}): Promise<void> {
  const facts = normalizeCanonicalStoryFacts(args.facts);
  const payload: StoryFactsDocument = {
    schemaVersion: STORY_FACTS_SCHEMA_VERSION,
    episodeSlug: args.episodeSlug,
    sourceFullHash: args.sourceFullHash,
    factsHash: hashText(stableSerialize(facts)),
    extractionConfidence: args.extractionConfidence,
    generatedAt: new Date().toISOString(),
    facts: {
      characters: facts.characters.map((character, index) => ({
        id: `character-${index + 1}`,
        name: character.name,
        role: character.role,
        ...(character.relationship ? { relationship: character.relationship } : {}),
      })),
      ...(facts.setting ? { setting: facts.setting } : {}),
      criticalObjects: [...facts.criticalObjects],
      criticalEvents: [...facts.criticalEvents],
      writtenMessages: [...facts.writtenMessages],
      centralThreat: facts.threat,
      primaryReveal: facts.primaryReveal,
      finalConsequence: facts.finalConsequence,
      protagonistNames: [...(facts.protagonistNames ?? [])],
      locationAnchors: [...(facts.locationAnchors ?? [])],
      threatMotifs: [...(facts.threatMotifs ?? [])],
      keyRules: [...(facts.keyRules ?? [])],
      supportingCharacters: [...(facts.supportingCharacters ?? [])],
      concreteLocations: [...(facts.concreteLocations ?? [])],
      keyObjects: [...(facts.keyObjects ?? [])],
      threatMechanism: facts.threatMechanism ?? "",
      supernaturalRule: facts.supernaturalRule ?? "",
      protagonistAttachment: facts.protagonistAttachment ?? "",
      threatTemptation: facts.threatTemptation ?? "",
      emotionalCost: facts.emotionalCost ?? "",
      finalDecision: facts.finalDecision ?? "",
      forbiddenInventions: [...(facts.forbiddenInventions ?? [])],
      localizationPreservationRules: [...(facts.localizationPreservationRules ?? [])],
      requiredFinalReveal: facts.requiredFinalReveal ?? "",
      requiredFinalLine: facts.requiredFinalLine ?? "",
    },
  };
  const filePath = resolveStoryFactsPath(args.outputRoot, args.episodeSlug);
  await ensureDir(path.dirname(filePath));
  await writeJsonAtomic(filePath, storyFactsDocumentSchema.parse(payload));
}

export async function hasStoryFacts(outputRoot: string, episodeSlug: string): Promise<boolean> {
  return fileExists(resolveStoryFactsPath(outputRoot, episodeSlug));
}
