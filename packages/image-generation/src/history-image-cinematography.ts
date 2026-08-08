import { z } from "zod";
import type { Scene } from "@mediaforge/domain";
import type { HistorySceneImageGuidance } from "./history-image-plan.js";

export const historyVisualStylePresetSchema = z.enum([
  "HISTORY_DOCUMENTARY",
  "HISTORY_EPIC",
  "HISTORY_PORTRAIT",
  "HISTORY_ARCHIVAL",
]);
export type HistoryVisualStylePreset = z.infer<
  typeof historyVisualStylePresetSchema
>;

export const historyShotTypeSchema = z.enum([
  "ENVIRONMENTAL_ESTABLISHING",
  "STANDARD_SCENE",
  "PORTRAIT",
  "INTIMATE_DRAMA",
  "EPIC_SCALE",
]);
export type HistoryShotType = z.infer<typeof historyShotTypeSchema>;

export const historyCameraPerspectiveSchema = z.enum([
  "ENVIRONMENTAL_24_35MM",
  "STANDARD_40_50MM",
  "PORTRAIT_85MM",
  "INTIMATE_50_85MM_SHALLOW_DOF",
  "EPIC_LARGE_FORMAT",
]);
export type HistoryCameraPerspective = z.infer<
  typeof historyCameraPerspectiveSchema
>;

export const historyLightingModeSchema = z.enum([
  "DAY_EXTERIOR",
  "OVERCAST_EXTERIOR",
  "WINTER_EXTERIOR",
  "INTERIOR_DAYLIGHT",
  "CANDLELIT_INTERIOR",
  "DAWN_DUSK",
  "NIGHT_EXTERIOR",
  "BATTLEFIELD_DAYLIGHT",
]);
export type HistoryLightingMode = z.infer<typeof historyLightingModeSchema>;

export const historyCinematographySchema = z.object({
  stylePreset: historyVisualStylePresetSchema,
  shotType: historyShotTypeSchema,
  perspective: historyCameraPerspectiveSchema,
  lighting: historyLightingModeSchema,
  referenceEntityIds: z.array(z.string()),
  referenceImageCount: z.number().int().nonnegative(),
});
export type HistoryCinematography = z.infer<typeof historyCinematographySchema>;

export interface HistoryCinematographyDiagnostics {
  readonly stylePreset: HistoryVisualStylePreset;
  readonly shotType: HistoryShotType;
  readonly cameraPerspective: HistoryCameraPerspective;
  readonly lightingMode: HistoryLightingMode;
  readonly referenceImageCount: number;
  readonly referenceEntityIds: readonly string[];
}

export function historyCinematographyDiagnostics(
  cinematography: HistoryCinematography
): HistoryCinematographyDiagnostics {
  return {
    stylePreset: cinematography.stylePreset,
    shotType: cinematography.shotType,
    cameraPerspective: cinematography.perspective,
    lightingMode: cinematography.lighting,
    referenceImageCount: cinematography.referenceImageCount,
    referenceEntityIds: cinematography.referenceEntityIds,
  };
}

const NAMED_HISTORICAL_FIGURE_PATTERN =
  /\b(?:Napoleon(?:\s+Bonaparte)?|Alexander(?:\s+I)?|Kutuzov|Caesar|Stalin|Hitler|Churchill|Lenin|Washington|Lincoln|Elizabeth(?:\s+I)?|Victoria|Charlemagne|Genghis\s+Khan|Columbus|Magellan|Hannibal|Cleopatra|Catherine(?:\s+(?:the\s+Great|II))?)\b/iu;

const EPIC_SCALE_PATTERN =
  /\b(?:battle(?:field)?|arm(?:y|ies)|Grande Armée|migration|siege|encirclement|naval expedition|fleet|armada|mass(?:es)?|thousands|disaster|catastrophe|invasion force|march(?:ed|ing)?\s+(?:on|into|through)\s+(?:Moscow|Paris|Rome|Berlin)|burning\s+(?:Moscow|city)|civil\s+war|world\s+war)\b/iu;

const ENVIRONMENTAL_ESTABLISHING_PATTERN =
  /\b(?:landscape|horizon|city view|aerial view|panorama|terrain|countryside|coastline|river valley|mountain range|fortress walls|cityscape|establishing)\b/iu;

const ARCHIVAL_PHOTOGRAPHY_PATTERN =
  /\b(?:photograph|photography|daguerreotype|wet[- ]plate|collodion|gelatin silver|press photo(?:graphy)?|Kodachrome|archival photo|period photo(?:graph)?)\b/iu;

const PRE_PHOTOGRAPHY_PERIOD_PATTERN =
  /\b(?:ancient|medieval|Rome|Roman Empire|Byzantine|Viking|Mongol|Crusade|Bronze Age|Iron Age|BCE|BC)\b|(?:\b(?:1[0-5]\d{2}|16\d{2}|17\d{2})\b)/iu;

const PHOTOGRAPHIC_ERA_PATTERN =
  /\b(?:18[3-9]\d|19\d{2}|20[0-6]\d)\b|(?:\bwet[- ]plate\b|\bdaguerreotype\b|\bpress photo(?:graphy)?\b|\bKodachrome\b|\bgelatin silver\b)/iu;

function normalizeText(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function sceneTextBundle(input: {
  readonly scene: Pick<
    Scene,
    "canonicalNarration" | "subject" | "action" | "setting" | "cameraFraming"
  >;
  readonly authoritativeImagePrompt?: string;
  readonly concept?: HistorySceneImageGuidance["concept"];
}): string {
  return normalizeText(
    [
      input.authoritativeImagePrompt,
      input.concept?.protectedFactualRelation,
      input.concept?.historicalSubject,
      input.scene.canonicalNarration,
      input.scene.subject,
      input.scene.action,
      input.scene.setting,
      input.scene.cameraFraming,
    ]
      .filter(Boolean)
      .join(" ")
  );
}

function namedFiguresInText(text: string): string[] {
  const matches = text.match(
    new RegExp(NAMED_HISTORICAL_FIGURE_PATTERN.source, "giu")
  );
  if (!matches) return [];
  return [...new Set(matches.map((match) => normalizeText(match)))];
}

function isDominantHistoricalPortraitSubject(input: {
  readonly text: string;
  readonly focalSubject: string;
  readonly characterNames: readonly string[];
}): boolean {
  if (input.characterNames.length > 0) {
    return true;
  }
  const figures = namedFiguresInText(input.text);
  if (figures.length === 0) {
    return false;
  }
  const focal = input.focalSubject.toLowerCase();
  const narrationLead = input.text.slice(0, 120).toLowerCase();
  return figures.some(
    (figure) =>
      focal.includes(figure.toLowerCase()) ||
      narrationLead.includes(figure.toLowerCase())
  );
}

function hasExplicitArchivalIntent(input: {
  readonly text: string;
  readonly dominantModality?: string;
  readonly approximatePeriod?: string | null;
}): boolean {
  if (!ARCHIVAL_PHOTOGRAPHY_PATTERN.test(input.text)) {
    return false;
  }
  if (PHOTOGRAPHIC_ERA_PATTERN.test(input.text)) {
    return true;
  }
  if (input.dominantModality === "archival image" && PHOTOGRAPHIC_ERA_PATTERN.test(input.text)) {
    return true;
  }
  if (
    input.approximatePeriod &&
    PHOTOGRAPHIC_ERA_PATTERN.test(input.approximatePeriod)
  ) {
    return true;
  }
  if (PRE_PHOTOGRAPHY_PERIOD_PATTERN.test(input.text) && !/\bstyliz(?:ed|ed)\b/iu.test(input.text)) {
    return false;
  }
  return /\b(?:archival image|period photograph|press photograph(?:y)?)\b/iu.test(
    input.text
  );
}

function deriveArchivalPhotographyLanguage(text: string): string {
  if (/\b(?:1940s?|world war ii|wwii)\b/iu.test(text)) {
    return "1940s monochrome press photography";
  }
  if (/\b(?:1960s?|Kodachrome)\b/iu.test(text)) {
    return "1960s Kodachrome documentary photography";
  }
  if (/\b(?:early 20th|19[0-3]\d|gelatin silver)\b/iu.test(text)) {
    return "early 20th-century gelatin silver photograph";
  }
  return "19th-century wet-plate collodion photograph";
}

export function deriveHistoryLightingMode(input: {
  readonly text: string;
}): HistoryLightingMode {
  const source = input.text.toLowerCase();
  if (/\b(?:candle(?:lit)?|firelight|torch(?:es)?|hearth|lantern)\b/u.test(source)) {
    return "CANDLELIT_INTERIOR";
  }
  if (/\b(?:interior|chamber|room|hall|cathedral|palace)\b/u.test(source)) {
    return "INTERIOR_DAYLIGHT";
  }
  if (/\b(?:dawn|dusk|sunset|sunrise|golden hour|twilight)\b/u.test(source)) {
    return "DAWN_DUSK";
  }
  if (/\b(?:night|midnight|moonlight)\b/u.test(source)) {
    return "NIGHT_EXTERIOR";
  }
  if (/\b(?:winter|snow|frost|freezing)\b/u.test(source)) {
    return "WINTER_EXTERIOR";
  }
  if (/\b(?:overcast|cloud(?:s|y)?)\b/u.test(source)) {
    return "OVERCAST_EXTERIOR";
  }
  if (/\b(?:battle|artillery|smoke|borodino)\b/u.test(source)) {
    return "BATTLEFIELD_DAYLIGHT";
  }
  return "DAY_EXTERIOR";
}

export function renderHistoryLightingPrompt(mode: HistoryLightingMode): string {
  switch (mode) {
    case "DAY_EXTERIOR":
      return "naturalistic directional daylight";
    case "OVERCAST_EXTERIOR":
      return "soft overcast daylight, subdued contrast, natural atmospheric haze";
    case "WINTER_EXTERIOR":
      return "soft overcast winter daylight";
    case "INTERIOR_DAYLIGHT":
      return "motivated window light, realistic light falloff";
    case "CANDLELIT_INTERIOR":
      return "motivated candlelight and firelight, realistic falloff, natural shadow detail";
    case "DAWN_DUSK":
      return "low-angle natural light, restrained atmospheric contrast";
    case "NIGHT_EXTERIOR":
      return "natural low-light with practical moonlight or campfires and realistic shadow detail";
    case "BATTLEFIELD_DAYLIGHT":
      return "natural daylight with smoke-diffused sun and realistic battlefield atmosphere";
  }
}

function deriveShotType(input: {
  readonly stylePreset: HistoryVisualStylePreset;
  readonly text: string;
  readonly shotSize: string;
  readonly cameraFraming: string;
  readonly dominantPortrait: boolean;
}): HistoryShotType {
  if (input.stylePreset === "HISTORY_PORTRAIT" || input.dominantPortrait) {
    return "PORTRAIT";
  }
  if (input.stylePreset === "HISTORY_EPIC") {
    return "EPIC_SCALE";
  }
  if (
    /\b(?:candle|firelight|intimate|whisper|private|confession|bedchamber)\b/iu.test(
      input.text
    )
  ) {
    return "INTIMATE_DRAMA";
  }
  if (
    input.shotSize.toLowerCase().includes("wide") ||
    /\bwide\b/iu.test(input.cameraFraming) ||
    ENVIRONMENTAL_ESTABLISHING_PATTERN.test(input.text)
  ) {
    return "ENVIRONMENTAL_ESTABLISHING";
  }
  return "STANDARD_SCENE";
}

function deriveCameraPerspective(input: {
  readonly shotType: HistoryShotType;
  readonly stylePreset: HistoryVisualStylePreset;
}): HistoryCameraPerspective {
  switch (input.shotType) {
    case "PORTRAIT":
      return "PORTRAIT_85MM";
    case "INTIMATE_DRAMA":
      return "INTIMATE_50_85MM_SHALLOW_DOF";
    case "EPIC_SCALE":
      return "EPIC_LARGE_FORMAT";
    case "ENVIRONMENTAL_ESTABLISHING":
      return "ENVIRONMENTAL_24_35MM";
    case "STANDARD_SCENE":
      return input.stylePreset === "HISTORY_EPIC"
        ? "EPIC_LARGE_FORMAT"
        : "STANDARD_40_50MM";
  }
}

export function renderHistoryCameraPerspectivePrompt(
  perspective: HistoryCameraPerspective
): string {
  switch (perspective) {
    case "ENVIRONMENTAL_24_35MM":
      return "24-35mm environmental composition, deep spatial layering";
    case "STANDARD_40_50MM":
      return "40-50mm natural perspective";
    case "PORTRAIT_85MM":
      return "85mm portrait perspective, natural facial proportions";
    case "INTIMATE_50_85MM_SHALLOW_DOF":
      return "50-85mm perspective, shallow depth of field";
    case "EPIC_LARGE_FORMAT":
      return "large-format cinematic composition, atmospheric depth, broad spatial perspective";
  }
}

export function renderHistoryStylePresetPrompt(
  preset: HistoryVisualStylePreset,
  archivalContext?: string
): string {
  switch (preset) {
    case "HISTORY_DOCUMENTARY":
      return [
        "cinematic historical reconstruction",
        "grounded documentary realism",
        "period-authentic clothing, materials and architecture",
        "naturalistic directional lighting",
        "realistic human proportions and skin texture",
        "restrained historically plausible color palette",
        "atmospheric depth",
        "subtle film grain",
        "physically plausible environment",
      ].join(", ");
    case "HISTORY_EPIC":
      return [
        "large-format historical cinema",
        "expansive environmental composition",
        "strong foreground-midground-background separation",
        "atmospheric perspective",
        "naturalistic dramatic light",
        "realistic scale",
        "restrained cinematic color grading",
      ].join(", ");
    case "HISTORY_PORTRAIT":
      return [
        "historically grounded portrait reconstruction",
        "realistic facial proportions",
        "realistic skin texture",
        "period-authentic clothing",
        "soft directional light",
        "restrained documentary realism",
      ].join(", ");
    case "HISTORY_ARCHIVAL":
      return [
        deriveArchivalPhotographyLanguage(archivalContext ?? ""),
        "period-authentic clothing and material culture",
        "historically plausible photographic texture",
        "no modern digital processing artifacts",
      ].join(", ");
  }
}

export function deriveHistoryStylePreset(input: {
  readonly text: string;
  readonly dominantPortrait: boolean;
  readonly guidance?: HistorySceneImageGuidance;
}): HistoryVisualStylePreset {
  const approximatePeriod = input.guidance?.concept?.approximatePeriod ?? null;
  if (
    hasExplicitArchivalIntent({
      text: input.text,
      approximatePeriod,
      ...(input.guidance?.dominantModality
        ? { dominantModality: input.guidance.dominantModality }
        : {}),
    })
  ) {
    return "HISTORY_ARCHIVAL";
  }
  if (input.dominantPortrait) {
    return "HISTORY_PORTRAIT";
  }
  if (EPIC_SCALE_PATTERN.test(input.text)) {
    return "HISTORY_EPIC";
  }
  return "HISTORY_DOCUMENTARY";
}

export function planHistorySceneCinematography(input: {
  readonly scene: Pick<
    Scene,
    | "canonicalNarration"
    | "subject"
    | "action"
    | "setting"
    | "cameraFraming"
    | "composition"
  >;
  readonly shotSize: string;
  readonly focalSubject: string;
  readonly guidance?: HistorySceneImageGuidance;
  readonly authoritativeImagePrompt?: string;
  readonly characterNames: readonly string[];
  readonly referenceCharacterIds: readonly string[];
}): HistoryCinematography {
  const text = sceneTextBundle({
    scene: input.scene,
    ...(input.authoritativeImagePrompt
      ? { authoritativeImagePrompt: input.authoritativeImagePrompt }
      : {}),
    ...(input.guidance?.concept ? { concept: input.guidance.concept } : {}),
  });
  const dominantPortrait = isDominantHistoricalPortraitSubject({
    text,
    focalSubject: input.focalSubject,
    characterNames: input.characterNames,
  });
  const stylePreset = deriveHistoryStylePreset({
    text,
    dominantPortrait,
    ...(input.guidance ? { guidance: input.guidance } : {}),
  });
  const shotType = deriveShotType({
    stylePreset,
    text,
    shotSize: input.shotSize,
    cameraFraming: input.scene.cameraFraming ?? "",
    dominantPortrait,
  });
  const perspective = deriveCameraPerspective({ shotType, stylePreset });
  const lighting = deriveHistoryLightingMode({ text });
  const hasReferencedPortraitSubject =
    input.referenceCharacterIds.length > 0 &&
    (dominantPortrait || input.characterNames.length > 0);
  const referenceEntityIds = hasReferencedPortraitSubject
    ? [...input.referenceCharacterIds]
    : [];

  return historyCinematographySchema.parse({
    stylePreset,
    shotType,
    perspective,
    lighting,
    referenceEntityIds,
    referenceImageCount: referenceEntityIds.length,
  });
}

export const HISTORY_RECONSTRUCTION_NEGATIVE_CONSTRAINTS = [
  "no modern objects",
  "no modern clothing",
  "no modern vehicles",
  "no modern infrastructure",
  "no contemporary signage",
  "no fantasy elements",
] as const;
