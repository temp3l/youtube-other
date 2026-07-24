import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractCanonicalStoryFacts } from "./canonical-facts.service.js";
import { resolveBoundedEventDependencyClosure } from "./short-story-event-planner.js";
import { canonicalHookEntities, validateSemanticOpeningHook } from "./story-semantic-validation.js";
import { hasExactImmutableFinalLine, preserveImmutableFinalLine } from "./story-quality-repair.js";
import { requiresNaturalLocalization } from "./localization-text-kind.js";
import { isRetryableProviderError, resolveModelResponse, resolveProviderRetryDecision, UnapprovedModelFallbackError } from "./model-resolution.js";
import type { StoryEvent } from "./short-rewrite.types.js";

const fixture = <T>(name: string): T => JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "__fixtures__", "pipeline", name), "utf8")) as T;

function event(id: string, index: number, dependencies: readonly string[] = []): StoryEvent {
  return {
    id,
    chronologyIndex: index,
    statement: `Event ${id}`,
    action: "changes",
    narrativeRoles: index === 0 ? ["hook"] : ["escalation"],
    visualStrength: 3,
    horrorIntensity: 3,
    informationValue: 3,
    causalDependencyIds: dependencies,
    mandatoryFacts: [`Fact ${id}`],
    optionalDetails: [],
    sourceBeatIds: [],
  };
}

describe("story pipeline regressions", () => {
  it("classifies Episode 057 opening semantically and extracts non-empty critical facts", () => {
    const data = fixture<{ episodeNumber: string; title: string; paragraphs: string[]; immutableFinalLine: string }>("episode-057.json");
    const parsed = {
      language: "en" as const,
      sourceFile: "episode-057-sanitized.md",
      sourceHash: "a".repeat(64),
      episodeNumber: data.episodeNumber,
      slug: "the-lake-that-remembers-faces",
      title: data.title,
      audioInstructions: [],
      narrationParagraphs: data.paragraphs,
      metadata: { episodeNumber: data.episodeNumber, primaryTitle: data.title, audioInstructions: [], narration: data.paragraphs, tags: [], hashtags: [], contentDisclosure: "Original fiction" },
      content: data.paragraphs.join("\n\n"),
    };
    const facts = extractCanonicalStoryFacts(parsed);
    const hook = validateSemanticOpeningHook({ opening: data.paragraphs[0] ?? "", entities: canonicalHookEntities(facts) });
    expect(hook).toEqual(expect.objectContaining({ valid: true, hasEntity: true, hasAction: true, hasImpossibleDetail: true }));
    expect(facts.keyObjects).toEqual(expect.arrayContaining(["camera", "lake", "water"]));
    expect(facts.concreteLocations).toEqual(expect.arrayContaining(["lake", "shoreline", "road", "vehicle"]));
    expect(facts.protagonistAttachment).not.toBe("");
    expect(facts.emotionalCost).not.toBe("");
    expect(facts.openingImpossibleDetail).not.toBe(facts.requiredFinalReveal);
    expect(data.paragraphs).toHaveLength(4);
  });

  it("keeps dependency closure stable and fails closed above the event budget", () => {
    const events = [event("a", 0), event("b", 1, ["a"]), event("c", 2, ["b"])];
    expect(resolveBoundedEventDependencyClosure(events, ["c"], 3)).toEqual(expect.objectContaining({ ok: true, selectedEventIds: ["a", "b", "c"], expandedDependencyCount: 2 }));
    const above = resolveBoundedEventDependencyClosure(events, ["c"], 2);
    expect(above.ok).toBe(false);
    expect(above.issues[0]).toContain("requires 3 events");
  });

  it("preserves an immutable ending byte-for-byte and removes commentary after it", () => {
    const data = fixture<{ immutableFinalLine: string }>("episode-057.json");
    const repaired = preserveImmutableFinalLine(`Opening. ${data.immutableFinalLine} This explains why the story is repeated.`, data.immutableFinalLine);
    expect(hasExactImmutableFinalLine(repaired, data.immutableFinalLine)).toBe(true);
  });

  it("keeps black-phone localization mechanics and localizes spoken dialogue", () => {
    const data = fixture<{ acceptedEventIds: string[]; localizedEventIds: string[]; englishDialogue: string; germanDialogue: string; mechanics: Record<string, unknown>; finalDecision: string }>("black-phone.json");
    expect(data.localizedEventIds).toEqual(data.acceptedEventIds);
    expect(Object.keys(data.mechanics)).toEqual(expect.arrayContaining(["trigger", "activationEffect", "interactionRequirement", "cost", "endingInteraction", "migration", "climaxUse"]));
    expect(data.finalDecision).toContain("complete truth");
    expect(data.germanDialogue).not.toBe(data.englishDialogue);
    expect(requiresNaturalLocalization({ kind: "spokenDialogue", sourceText: data.englishDialogue, preserveSourceLanguage: false })).toBe(true);
  });

  it("records configured, resolved, and actual models and rejects unapproved fallback", () => {
    expect(resolveModelResponse({ configuredModel: "gpt-5", actualResponseModel: "gpt-5" })).toEqual({ configuredModel: "gpt-5", resolvedModel: "gpt-5", actualResponseModel: "gpt-5", fallbackUsed: false });
    expect(() => resolveModelResponse({ configuredModel: "gpt-5", actualResponseModel: "gpt-5-mini" })).toThrow(UnapprovedModelFallbackError);
    expect(resolveModelResponse({ configuredModel: "gpt-5", actualResponseModel: "gpt-5-mini", fallbackPolicy: { id: "approved-creative-fallback", approvedFallbacks: { "gpt-5": ["gpt-5-mini"] } }, fallbackReason: "capacity" }).fallbackPolicyId).toBe("approved-creative-fallback");
    expect(resolveModelResponse({ configuredModel: "offline", actualResponseModel: "mock", offlineMock: true }).fallbackUsed).toBe(false);
    const connectionError = { code: "ECONNRESET", message: "connection lost" };
    expect(isRetryableProviderError(connectionError)).toBe(true);
    expect(resolveProviderRetryDecision(connectionError, 1, 3)).toBe("retry");
    expect(resolveProviderRetryDecision(connectionError, 3, 3)).toBe("terminal-failure");
  });
});
