import { z } from "zod";
import { storyIrSchema, type StoryIR } from "./story-artifact-model.js";
import type { CanonicalStoryFacts } from "./story-localization.types.js";
import type { CanonicalStoryBeat, StoryMechanicsContract } from "./story-mechanics.js";

const namedDescription = z.object({ id: z.string().min(1), name: z.string().min(1), description: z.string().min(1) }).strict();
export const canonicalStoryContractSchema = z.object({
  schemaVersion: z.literal("canonical-story-contract-v1"),
  genre: storyIrSchema.shape.genre.exclude(["unknown"]),
  fictionality: storyIrSchema.shape.fictionality.exclude(["unknown"]),
  narrativeMode: storyIrSchema.shape.narrativeMode.exclude(["unknown"]),
  centralThreat: z.string().min(1),
  protagonistGoal: z.string().min(1),
  emotionalStake: z.string().min(1),
  observableEmotionalCost: z.string().min(1),
  supernaturalRule: z.object({
    trigger: z.string().min(1),
    activationEffect: z.string().min(1),
    interactionRequirement: z.string().min(1),
    cost: z.string().min(1),
    exceptions: z.array(z.string().min(1)),
    limits: z.array(z.string().min(1)),
    threatCapabilities: z.array(z.string().min(1)).min(1),
    failedResponseDiscoveries: z.array(z.object({ action: z.string().min(1), failure: z.string().min(1), informationRevealed: z.string().min(1) }).strict()).min(1),
    climaxUse: z.string().min(1),
    endingInteraction: z.string().min(1),
    migration: z.string().min(1).optional(),
  }).strict(),
  climaxAction: z.string().min(1),
  finalConsequence: z.string().min(1),
  immutableFinalLine: z.string().min(1).optional(),
  characters: z.array(namedDescription).min(1),
  relationships: z.array(z.object({ fromCharacter: z.string().min(1), toCharacter: z.string().min(1), description: z.string().min(1) }).strict()),
  locations: z.array(namedDescription).min(1),
  objects: z.array(namedDescription).min(1),
  emotionalAttachments: z.array(z.object({ character: z.string().min(1), attachment: z.string().min(1), observableCost: z.string().min(1) }).strict()).min(1),
  events: z.array(z.object({ id: z.string().min(1), summary: z.string().min(1), kind: z.literal("atomic-canonical-event") }).strict()).min(1),
  scenes: z.array(z.object({ id: z.string().min(1), summary: z.string().min(1), kind: z.literal("scene-beat") }).strict()).min(1),
}).strict();
export type CanonicalStoryContract = z.infer<typeof canonicalStoryContractSchema>;

/** Isolated migration adapter from the legacy StoryIR/facts split. */
export function adaptLegacyStoryToCanonicalContract(args: {
  readonly storyIr: StoryIR;
  readonly facts: CanonicalStoryFacts;
  readonly mechanics: StoryMechanicsContract;
  readonly beats: readonly CanonicalStoryBeat[];
}): CanonicalStoryContract {
  const protagonist = args.facts.protagonistNames?.[0] ?? args.facts.characters[0]?.name ?? "Protagonist";
  return canonicalStoryContractSchema.parse({
    schemaVersion: "canonical-story-contract-v1",
    genre: args.storyIr.genre,
    fictionality: args.storyIr.fictionality,
    narrativeMode: args.storyIr.narrativeMode,
    centralThreat: args.mechanics.centralThreat,
    protagonistGoal: args.mechanics.protagonistGoal,
    emotionalStake: args.mechanics.emotionalStake,
    observableEmotionalCost: args.mechanics.emotionalCost,
    supernaturalRule: {
      ...args.mechanics.supernaturalMechanics,
      failedResponseDiscoveries: args.mechanics.failedResponses,
    },
    climaxAction: args.mechanics.climaxAction,
    finalConsequence: args.mechanics.finalConsequence,
    ...(args.facts.requiredFinalLine ? { immutableFinalLine: args.facts.requiredFinalLine } : {}),
    characters: args.facts.characters.map((character, index) => ({ id: `character-${index + 1}`, name: character.name, description: character.role })),
    relationships: args.facts.characters.flatMap((character) => character.relationship ? [{ fromCharacter: protagonist, toCharacter: character.name, description: character.relationship }] : []),
    locations: (args.facts.concreteLocations ?? args.facts.locationAnchors ?? []).map((name, index) => ({ id: `location-${index + 1}`, name, description: "canonical scene location" })),
    objects: (args.facts.keyObjects ?? args.facts.criticalObjects).map((name, index) => ({ id: `object-${index + 1}`, name, description: "critical canonical object" })),
    emotionalAttachments: [{ character: protagonist, attachment: args.mechanics.emotionalStake, observableCost: args.mechanics.emotionalCost }],
    events: args.storyIr.chronology.map((summary, index) => ({ id: `event-${index + 1}`, summary, kind: "atomic-canonical-event" as const })),
    scenes: args.beats.map((beat) => ({ id: beat.id, summary: beat.summary, kind: "scene-beat" as const })),
  });
}
