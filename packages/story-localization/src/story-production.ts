import fs from "node:fs/promises";
import path from "node:path";
import { ensureDir, writeJsonAtomic } from "@mediaforge/shared";
import { type CanonicalStoryFacts, type ParsedSourceStory } from "./story-localization.types.js";

export type StorySourceAnalysis = {
  readonly episodeNumber: string;
  readonly slug: string;
  readonly title: string;
  readonly sourceTitle?: string;
  readonly protagonist: string;
  readonly antagonist: string;
  readonly setting: string;
  readonly issueSummary: string;
  readonly keyCharacters: readonly string[];
  readonly keyObjects: readonly string[];
  readonly writtenMessages: readonly string[];
  readonly sceneCount: number;
  readonly summary: string;
};

export type StoryBible = {
  readonly episodeNumber: string;
  readonly slug: string;
  readonly title: string;
  readonly sourceTitle?: string;
  readonly protagonist: string;
  readonly antagonist: string;
  readonly setting: string;
  readonly premise: string;
  readonly centralThreat: string;
  readonly primaryReveal: string;
  readonly finalConsequence: string;
  readonly cast: readonly {
    readonly name: string;
    readonly role: string;
    readonly relationship?: string;
  }[];
  readonly keyObjects: readonly string[];
  readonly writtenMessages: readonly string[];
  readonly storyRules: readonly string[];
  readonly sceneOrder: readonly string[];
};

export type OriginalityReview = {
  readonly episodeNumber: string;
  readonly slug: string;
  readonly risk: "low" | "moderate" | "high";
  readonly summary: string;
  readonly protectedElements: readonly string[];
  readonly notes: readonly string[];
};

export type RetentionBeat = {
  readonly id: string;
  readonly label: string;
  readonly purpose: string;
  readonly tension: string;
  readonly payoff: string;
};

export type ProtectedStoryElement = {
  readonly category: "character" | "object" | "message" | "reveal" | "consequence" | "setting";
  readonly value: string;
  readonly reason: string;
};

export type StoryProductionStage =
  | "raw-source"
  | "source-analysis"
  | "story-bible"
  | "originality-review"
  | "retention-plan"
  | "english-short-generation"
  | "english-short-validation"
  | "localized-long-form-generation"
  | "localized-long-form-validation"
  | "localized-short-generation"
  | "localized-short-validation"
  | "completed"
  | "failed";

function normalize(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function firstOrFallback(values: readonly string[], fallback: string): string {
  return normalize(values[0] ?? fallback) || fallback;
}

function buildEpisodeHeading(parsed: ParsedSourceStory): string {
  return `${parsed.episodeNumber} - ${parsed.title}`;
}

function buildProtagonist(facts: CanonicalStoryFacts): string {
  return facts.characters[0]?.name ?? facts.primaryReveal;
}

function buildAntagonist(facts: CanonicalStoryFacts): string {
  return facts.threat || facts.finalConsequence;
}

function buildSetting(facts: CanonicalStoryFacts, parsed: ParsedSourceStory): string {
  return facts.setting ?? parsed.sourceTitle ?? parsed.title;
}

export function analyzeStorySource(
  parsed: ParsedSourceStory,
  facts: CanonicalStoryFacts
): StorySourceAnalysis {
  const protagonist = buildProtagonist(facts);
  const antagonist = buildAntagonist(facts);
  const setting = buildSetting(facts, parsed);
  const issueSummary = [
    `${facts.characters.length} character${facts.characters.length === 1 ? "" : "s"}`,
    `${facts.criticalObjects.length} critical object${facts.criticalObjects.length === 1 ? "" : "s"}`,
    `${facts.writtenMessages.length} written message${facts.writtenMessages.length === 1 ? "" : "s"}`,
  ].join(", ");
  return {
    episodeNumber: parsed.episodeNumber,
    slug: parsed.slug,
    title: parsed.title,
    protagonist,
    antagonist,
    setting,
    issueSummary,
    keyCharacters: facts.characters.map((character) => character.name),
    keyObjects: [...facts.criticalObjects],
    writtenMessages: [...facts.writtenMessages],
    sceneCount: parsed.narrationParagraphs.length,
    summary: `${buildEpisodeHeading(parsed)} centers on ${protagonist} facing ${antagonist} in ${setting}.`,
    ...(parsed.sourceTitle ? { sourceTitle: parsed.sourceTitle } : {}),
  };
}

export function buildStoryBible(
  parsed: ParsedSourceStory,
  facts: CanonicalStoryFacts,
  analysis: StorySourceAnalysis
): StoryBible {
  return {
    episodeNumber: parsed.episodeNumber,
    slug: parsed.slug,
    title: parsed.title,
    protagonist: analysis.protagonist,
    antagonist: analysis.antagonist,
    setting: analysis.setting,
    premise: `A story about ${analysis.protagonist} confronting ${analysis.antagonist} in ${analysis.setting}.`,
    centralThreat: facts.threat,
    primaryReveal: facts.primaryReveal,
    finalConsequence: facts.finalConsequence,
    cast: facts.characters.map((character) => ({
      name: character.name,
      role: character.role,
      ...(character.relationship ? { relationship: character.relationship } : {}),
    })),
    keyObjects: [...facts.criticalObjects],
    writtenMessages: [...facts.writtenMessages],
    storyRules: [
      `Keep the narration grounded in the source episode ${parsed.episodeNumber}.`,
      "Preserve the exact written messages verbatim.",
      "Do not add new plot events or change the ending.",
    ],
    sceneOrder: parsed.narrationParagraphs.map((_, index) => `scene-${index + 1}`),
    ...(parsed.sourceTitle ? { sourceTitle: parsed.sourceTitle } : {}),
  };
}

export function buildOriginalityReview(
  parsed: ParsedSourceStory,
  facts: CanonicalStoryFacts,
  analysis: StorySourceAnalysis
): OriginalityReview {
  const risk: OriginalityReview["risk"] =
    facts.characters.length > 4 || facts.writtenMessages.length > 1 ? "moderate" : "low";
  return {
    episodeNumber: parsed.episodeNumber,
    slug: parsed.slug,
    risk,
    summary: `The adaptation keeps the same core premise as ${analysis.protagonist}'s story and should preserve the original structure carefully.`,
    protectedElements: [
      analysis.protagonist,
      analysis.antagonist,
      ...facts.criticalObjects,
      ...facts.writtenMessages,
      facts.primaryReveal,
      facts.finalConsequence,
    ],
    notes: [
      "Use the source as a reference, not as a prompt to add new twists.",
      "Retain the episode's signature details and exact written messages.",
    ],
  };
}

export function buildRetentionPlan(
  parsed: ParsedSourceStory,
  bible: StoryBible
): readonly RetentionBeat[] {
  return [
    {
      id: "hook",
      label: "Hook",
      purpose: "Open with immediate unease and a recognizable threat.",
      tension: `${bible.protagonist} enters the story while ${bible.antagonist} is already present.`,
      payoff: `Establishes the premise of ${buildEpisodeHeading(parsed)} fast.`,
    },
    {
      id: "escalation",
      label: "Escalation",
      purpose: "Stack escalating discoveries without introducing new plot mechanics.",
      tension: "Each clue narrows the escape route and raises the cost of staying.",
      payoff: "The audience stays oriented while the pressure increases.",
    },
    {
      id: "reveal",
      label: "Reveal",
      purpose: "Land the primary reveal cleanly and late enough to feel earned.",
      tension: bible.primaryReveal,
      payoff: "The central mystery becomes explicit.",
    },
    {
      id: "ending",
      label: "Ending",
      purpose: "Finish on the original consequence and preserve the final beat.",
      tension: bible.finalConsequence,
      payoff: "The adaptation closes on the same emotional note as the source.",
    },
  ];
}

export function buildProtectedStoryElements(
  bible: StoryBible
): readonly ProtectedStoryElement[] {
  return [
    ...bible.cast.map((character) => ({
      category: "character" as const,
      value: character.name,
      reason: "Character continuity is part of the source identity.",
    })),
    ...bible.keyObjects.map((value) => ({
      category: "object" as const,
      value,
      reason: "Key objects anchor the episode's clues and reveal.",
    })),
    ...bible.writtenMessages.map((value) => ({
      category: "message" as const,
      value,
      reason: "Written messages must remain verbatim.",
    })),
    {
      category: "reveal",
      value: bible.primaryReveal,
      reason: "The primary reveal drives the story's payoff.",
    },
    {
      category: "consequence",
      value: bible.finalConsequence,
      reason: "The ending consequence preserves the original closure.",
    },
    {
      category: "setting",
      value: bible.setting,
      reason: "The setting provides the episode's identity and atmosphere.",
    },
  ];
}

export function resolveEpisodeStoryProductionDirectory(
  cacheDirectory: string,
  parsed: Pick<ParsedSourceStory, "episodeNumber" | "slug">
): string {
  return path.join(cacheDirectory, "production", parsed.episodeNumber, parsed.slug);
}

export async function persistStoryProductionArtifact(
  cacheDirectory: string,
  parsed: Pick<ParsedSourceStory, "episodeNumber" | "slug">,
  fileName: string,
  value: unknown
): Promise<void> {
  const productionDirectory = resolveEpisodeStoryProductionDirectory(
    cacheDirectory,
    parsed
  );
  await ensureDir(productionDirectory);
  await writeJsonAtomic(path.join(productionDirectory, fileName), value);
}

export async function persistStoryProductionStage(
  cacheDirectory: string,
  parsed: Pick<ParsedSourceStory, "episodeNumber" | "slug">,
  stage: StoryProductionStage
): Promise<void> {
  const productionDirectory = resolveEpisodeStoryProductionDirectory(
    cacheDirectory,
    parsed
  );
  await ensureDir(productionDirectory);
  await writeJsonAtomic(path.join(productionDirectory, "production-state.json"), {
    episodeNumber: parsed.episodeNumber,
    slug: parsed.slug,
    stage,
    updatedAt: new Date().toISOString(),
  });
}

export async function readStoryProductionStage(
  cacheDirectory: string,
  parsed: Pick<ParsedSourceStory, "episodeNumber" | "slug">
): Promise<Record<string, unknown> | null> {
  const productionDirectory = resolveEpisodeStoryProductionDirectory(
    cacheDirectory,
    parsed
  );
  try {
    const content = await fs.readFile(
      path.join(productionDirectory, "production-state.json"),
      "utf8"
    );
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return null;
  }
}
