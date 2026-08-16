import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { BEAT_CATEGORIES, type BeatCategory } from "@mediaforge/narrative-core";
import { slugifyRegistryEntryId } from "@mediaforge/scene-planning";
import {
  buildMicrodramaProviderVisualBrief,
  deriveCharacterVisualNotes,
  type MicrodramaProviderVisualCastMember,
  type MicrodramaShotBlockingKind,
} from "@mediaforge/visual-planning";

import type { MicrodramaVisualGenerationRequest } from "../../image-generation/src/microdrama-visual-generation/contracts.js";
import { toImageSafeVisualMoment } from "./microdrama-narration-visual-alignment.js";
import { compileV5CanonAdmission } from "./v5-canon-admission.js";
import type { EpisodeBoundaryContract } from "./v5-canon-admission-contracts.js";

type SeriesStateDocument = {
  readonly series?: {
    readonly title?: string;
    readonly genre?: readonly string[];
  };
  readonly characters?: Readonly<Record<string, string>>;
};

export type MicrodramaVisualLexicon = {
  readonly seriesTitle: string;
  readonly genres: readonly string[];
  readonly charactersByEntryId: Readonly<Record<string, MicrodramaProviderVisualCastMember>>;
};

export type MicrodramaEpisodeVisualBeat = {
  readonly category: BeatCategory;
  readonly visualMoment: string;
  readonly purpose: string;
};

export type MicrodramaEpisodeVisualContext = {
  readonly episodeId: string;
  readonly episodeTitle: string;
  readonly location: string;
  readonly hook: string;
  readonly beatsByOrder: Readonly<Record<number, MicrodramaEpisodeVisualBeat>>;
};

function defaultPackRoot(): string {
  return path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../content-packs/seven-minutes-ahead-content-pack-v5-remediated"
  );
}

export function loadSevenMinutesAheadVisualLexicon(input?: {
  readonly packRoot?: string;
}): MicrodramaVisualLexicon {
  const packRoot = input?.packRoot ?? defaultPackRoot();
  const seriesStatePath = path.join(packRoot, "shared", "series-state.json");
  const parsed = JSON.parse(readFileSync(seriesStatePath, "utf8")) as SeriesStateDocument;
  const charactersByEntryId: Record<string, MicrodramaProviderVisualCastMember> = {};
  for (const [name, description] of Object.entries(parsed.characters ?? {})) {
    const entryId = slugifyRegistryEntryId("character", name);
    charactersByEntryId[entryId] = {
      name,
      visualNotes: deriveCharacterVisualNotes(description),
    };
  }
  return {
    seriesTitle: parsed.series?.title?.trim() || "7 Minutes Ahead",
    genres: [...(parsed.series?.genre ?? ["mystery", "thriller", "drama"])],
    charactersByEntryId,
  };
}

export function visualMomentForBoundaryBeat(
  category: BeatCategory,
  boundary: EpisodeBoundaryContract
): string {
  switch (category) {
    case "HOOK":
      return boundary.hook;
    case "ORIENTATION":
      return `At ${boundary.location}, introduce the cast in the situation from: ${boundary.hook}`;
    case "CONFLICT":
      return `Tension rises around: ${boundary.openLoop}`;
    case "ESCALATION":
      return `Escalate the action proving: ${boundary.newInformation}`;
    case "DISCOVERY":
      return `Reveal / confirm: ${boundary.newInformation}`;
    case "REVERSAL":
      return `Reframe the stakes: ${boundary.openLoop}`;
    case "DECISION":
      return `Characters act on: ${boundary.newInformation}`;
    case "CONSEQUENCE":
      return `Immediate fallout while unresolved: ${boundary.openLoop}`;
    case "CLIFFHANGER":
      return boundary.cliffhangerBeat;
    default:
      return boundary.hook;
  }
}

export function buildEpisodeVisualContextFromBoundary(
  boundary: EpisodeBoundaryContract
): MicrodramaEpisodeVisualContext {
  const beatsByOrder: Record<number, MicrodramaEpisodeVisualBeat> = {};
  for (const [index, category] of BEAT_CATEGORIES.entries()) {
    beatsByOrder[index + 1] = {
      category,
      visualMoment: visualMomentForBoundaryBeat(category, boundary),
      purpose: category,
    };
  }
  return {
    episodeId: boundary.episodeId,
    episodeTitle: boundary.title,
    location: boundary.location,
    hook: boundary.hook,
    beatsByOrder,
  };
}

export function loadSevenMinutesAheadEpisodeVisualContexts(input?: {
  readonly packRoot?: string;
  readonly admittedAt?: string;
}): ReadonlyMap<string, MicrodramaEpisodeVisualContext> {
  const packRoot = input?.packRoot ?? defaultPackRoot();
  const admittedAt = input?.admittedAt ?? "2026-08-12T04:00:00.000Z";
  const admission = compileV5CanonAdmission(packRoot, admittedAt);
  const contexts = new Map<string, MicrodramaEpisodeVisualContext>();
  if (!admission.ok) {
    return contexts;
  }
  for (const boundary of admission.bundle.episodeBoundaries) {
    contexts.set(
      boundary.episodeId,
      buildEpisodeVisualContextFromBoundary(boundary)
    );
  }
  return contexts;
}

export function parseSceneOrderFromSemanticId(sceneSemanticId: string): number | null {
  const match = sceneSemanticId.match(/\.(\d{3})$/u);
  if (!match) {
    return null;
  }
  const order = Number(match[1]);
  return Number.isFinite(order) && order > 0 ? order : null;
}

export function resolveLocationLabelFromRegistryReferences(
  references: MicrodramaVisualGenerationRequest["registryReferences"]
): string {
  const location = references.find((reference) => reference.entryKind === "location");
  if (!location) {
    return "contemporary urban interior";
  }
  return location.entryId
    .replace(/^location\./u, "")
    .replace(/-/gu, " ")
    .trim() || "contemporary urban interior";
}

export function resolveCastFromRegistryReferences(
  references: MicrodramaVisualGenerationRequest["registryReferences"],
  lexicon: MicrodramaVisualLexicon
): MicrodramaProviderVisualCastMember[] {
  const cast: MicrodramaProviderVisualCastMember[] = [];
  for (const reference of references) {
    if (reference.entryKind !== "character") {
      continue;
    }
    const known = lexicon.charactersByEntryId[reference.entryId];
    if (known) {
      cast.push(known);
      continue;
    }
    const name = reference.entryId
      .replace(/^character\./u, "")
      .replace(/-/gu, " ")
      .replace(/\b\w/gu, (char) => char.toUpperCase());
    cast.push({
      name,
      visualNotes: "naturalistic contemporary look",
    });
  }
  return cast;
}

export function expandMicrodramaProviderPromptFromRequest(input: {
  readonly request: MicrodramaVisualGenerationRequest;
  readonly lexicon: MicrodramaVisualLexicon;
  readonly episodeContexts?: ReadonlyMap<string, MicrodramaEpisodeVisualContext>;
  readonly narrationMoment?: string;
}): string {
  const cast = resolveCastFromRegistryReferences(
    input.request.registryReferences,
    input.lexicon
  );
  const episodeContext = input.episodeContexts?.get(input.request.episodeId);
  const sceneOrder = parseSceneOrderFromSemanticId(input.request.sceneSemanticId);
  const beat =
    sceneOrder !== null ? episodeContext?.beatsByOrder[sceneOrder] : undefined;
  const locationLabel =
    episodeContext?.location ??
    resolveLocationLabelFromRegistryReferences(input.request.registryReferences);

  return buildMicrodramaProviderVisualBrief({
    seriesTitle: input.lexicon.seriesTitle,
    genres: input.lexicon.genres,
    episodeId: input.request.episodeId,
    episodeTitle: episodeContext?.episodeTitle,
    locationLabel,
    cast,
    blockingKind: input.request.blockingKind as MicrodramaShotBlockingKind,
    plateSemanticId: input.request.sourcePlateSemanticId,
    sceneSemanticId: input.request.sceneSemanticId,
    visualMoment: beat?.visualMoment
      ? toImageSafeVisualMoment(beat.visualMoment)
      : undefined,
    narrationMoment: input.narrationMoment
      ? toImageSafeVisualMoment(input.narrationMoment)
      : undefined,
    beatCategory: beat?.category,
    episodeHook: episodeContext?.hook
      ? toImageSafeVisualMoment(episodeContext.hook)
      : undefined,
  });
}
