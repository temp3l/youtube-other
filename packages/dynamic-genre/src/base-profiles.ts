import type { BaseProfileId, GenreId } from "./contracts.js";

export interface BaseProfileDefinition {
  readonly id: BaseProfileId;
  readonly supportedGenres: readonly GenreId[];
  readonly rendererFamily: "story" | "educational" | "presenter";
  readonly conservative: boolean;
}

/** Application-owned mappings. Model output can name a semantic genre only. */
export const BASE_PROFILE_REGISTRY: Readonly<
  Record<BaseProfileId, BaseProfileDefinition>
> = {
  "neutral-narrative": {
    id: "neutral-narrative",
    supportedGenres: ["neutral"],
    rendererFamily: "story",
    conservative: true,
  },
  "horror-compatible": {
    id: "horror-compatible",
    supportedGenres: ["horror", "suspense"],
    rendererFamily: "story",
    conservative: false,
  },
  "educational-compatible": {
    id: "educational-compatible",
    supportedGenres: ["education", "mathematics"],
    rendererFamily: "educational",
    conservative: false,
  },
  "presenter-advice-compatible": {
    id: "presenter-advice-compatible",
    supportedGenres: ["presenter-advice"],
    rendererFamily: "presenter",
    conservative: false,
  },
  documentary: {
    id: "documentary",
    supportedGenres: ["documentary"],
    rendererFamily: "story",
    conservative: false,
  },
  "children-family": {
    id: "children-family",
    supportedGenres: ["children-family"],
    rendererFamily: "story",
    conservative: true,
  },
  "comedy-light": {
    id: "comedy-light",
    supportedGenres: ["comedy"],
    rendererFamily: "story",
    conservative: true,
  },
  inspirational: {
    id: "inspirational",
    supportedGenres: ["inspirational"],
    rendererFamily: "presenter",
    conservative: true,
  },
  "business-explainer": {
    id: "business-explainer",
    supportedGenres: ["business"],
    rendererFamily: "presenter",
    conservative: false,
  },
  historical: {
    id: "historical",
    supportedGenres: ["historical", "history"],
    rendererFamily: "story",
    conservative: true,
  },
  "science-technology": {
    id: "science-technology",
    supportedGenres: ["science-technology"],
    rendererFamily: "educational",
    conservative: false,
  },
  "abstract-experimental": {
    id: "abstract-experimental",
    supportedGenres: ["abstract-experimental"],
    rendererFamily: "story",
    conservative: true,
  },
};

const profileForGenre: Readonly<Record<GenreId, BaseProfileId>> = {
  neutral: "neutral-narrative",
  horror: "horror-compatible",
  suspense: "horror-compatible",
  education: "educational-compatible",
  mathematics: "educational-compatible",
  "presenter-advice": "presenter-advice-compatible",
  documentary: "documentary",
  "children-family": "children-family",
  comedy: "comedy-light",
  inspirational: "inspirational",
  business: "business-explainer",
  historical: "historical",
  history: "historical",
  "science-technology": "science-technology",
  "abstract-experimental": "abstract-experimental",
};

export function selectBaseProfile(
  primaryGenre: GenreId,
  secondaryGenres: readonly GenreId[] = []
): BaseProfileId {
  // Primary genre wins, deliberately avoiding contradictory mixed-genre executables.
  return (
    profileForGenre[primaryGenre] ??
    profileForGenre[secondaryGenres[0] ?? "neutral"]
  );
}

export function getBaseProfile(id: BaseProfileId): BaseProfileDefinition {
  return BASE_PROFILE_REGISTRY[id];
}
