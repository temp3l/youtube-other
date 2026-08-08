import type { Scene, SceneTextRequirement } from "@mediaforge/domain";
import {
  buildSceneNegativePrompt,
  buildSceneTextPromptSection,
} from "./scene-text.js";
import type { HistorySceneImageGuidance } from "./history-image-plan.js";
import type { HistoricalVisualDirectionProfileV1 } from "@mediaforge/history";
import { renderPersistedVisualDirectionPromptSectionsV1 } from "@mediaforge/history";
import {
  type HistoryCinematography,
  HISTORY_RECONSTRUCTION_NEGATIVE_CONSTRAINTS,
  planHistorySceneCinematography,
  renderHistoryCameraPerspectivePrompt,
  renderHistoryLightingPrompt,
  renderHistoryStylePresetPrompt,
} from "./history-image-cinematography.js";

function promptSection(title: string, body: string): string {
  return `${title}:\n${body}`;
}

function normalizeSentence(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function sanitizeHistoryAuthoritativePrompt(value: string): string {
  return normalizeSentence(
    value
      .replace(
        /\bHistorically grounded documentary reconstruction,?\s*/giu,
        ""
      )
      .replace(
        /\bclearly labeled as illustrative where evidence is incomplete\.?\s*/giu,
        ""
      )
      .replace(/\b35mm(?:\/natural[- ]light)?(?: documentary photograph)?,?\s*/giu, "")
      .replace(/\bnatural[- ]light\b/giu, "")
      .replace(
        /\bphotorealistic,?\s*shallow depth of field,?\s*subtle film grain\.?\s*/giu,
        ""
      )
      .replace(/\bmeasured, evidence-led\b/giu, "grounded documentary realism")
      .replace(/\billustrative\b/giu, "photorealistic")
  );
}

function historyPrimaryVisualEvent(input: {
  readonly authoritativePrompt?: string;
  readonly concept?: HistorySceneImageGuidance["concept"];
  readonly scene: HistoryImageProviderPromptRequest["scene"];
}): string {
  const sanitizedPrompt = input.authoritativePrompt
    ? sanitizeHistoryAuthoritativePrompt(input.authoritativePrompt)
    : "";
  if (sanitizedPrompt) return sanitizedPrompt;
  return (
    [
      input.concept?.protectedFactualRelation,
      input.concept?.intendedComposition,
      input.scene.visibleAction,
      input.scene.focalSubject,
    ]
      .map((value) => (value ? normalizeSentence(value) : ""))
      .filter(Boolean)
      .join(" ")
      .trim() ||
    "Cinematic historical reconstruction of the narrated beat with grounded documentary realism and period-accurate material culture."
  );
}

function historyForegroundFromNarration(narration: string, subject: string): string {
  const lower = narration.toLowerCase();
  if (/\briver\b|\bniemen\b|\bdanube\b|\bberezina\b/u.test(lower)) {
    return "soldiers, wagons, or boats at a river crossing with period-accurate uniforms and equipment";
  }
  if (/\bsnow\b|\bwinter\b|\bfrost\b|\bcold\b/u.test(lower)) {
    return "a winter march with snow, exhausted troops, and battered campaign equipment";
  }
  if (/\bbattle\b|\bfight\b|\bfire\b|\bartillery\b/u.test(lower)) {
    return "period battlefield action with smoke, movement, and historically grounded uniforms";
  }
  if (/\bsupply\b|\bfood\b|\bhorses?\b|\bwagon\b/u.test(lower)) {
    return "campaign logistics with horses, wagons, and supply crates in frame";
  }
  if (/\bcity\b|\bmoscow\b|\bparis\b|\bkremlin\b/u.test(lower)) {
    return "period architecture and civic space framing the narrated event";
  }
  return `${subject} with period-appropriate uniforms, weapons, and material culture in frame`;
}

function historyBackgroundFromNarration(narration: string, setting: string): string {
  const lower = narration.toLowerCase();
  if (/\bforest\b|\bwoods\b|\bsteppe\b/u.test(lower)) {
    return "distant tree lines or open terrain under a natural overcast sky";
  }
  if (/\briver\b/u.test(lower)) {
    return "the opposite bank, horizon, and atmospheric depth along the waterway";
  }
  if (/\bwinter\b|\bsnow\b/u.test(lower)) {
    return "snow-covered landscape with natural winter atmosphere";
  }
  return `historical landscape or interior depth consistent with ${setting}`;
}

export function deriveHistorySceneMood(scene: Scene): string {
  const source = scene.canonicalNarration.toLowerCase();
  if (/\bbattle\b|\bfight\b|\bcombat\b/u.test(source)) {
    return "tense and immediate, photographed as a real moment in the field";
  }
  if (/\bretreat\b|\bexhaust\b|\bhunger\b|\bcold\b/u.test(source)) {
    return "weary and grounded, captured as unposed reportage";
  }
  if (/\bfire\b|\bmoscow\b/u.test(source)) {
    return "urgent and documentary, observed without staged melodrama";
  }
  return "neutral historical reportage, unposed and observational";
}

export function deriveHistorySceneTimeOfDay(scene: Scene): string {
  const source = scene.canonicalNarration.toLowerCase();
  if (/\bnight\b/u.test(source)) return "night";
  if (/\bdawn\b|\bmorning\b/u.test(source)) return "morning";
  if (/\bafternoon\b/u.test(source)) return "afternoon";
  if (/\bwinter\b|\bsnow\b|\bfrost\b/u.test(source)) return "overcast midday";
  if (/\bbattle\b|\bborodino\b/u.test(source)) return "afternoon";
  return "daylight";
}

export function buildHistorySceneSpace(input: {
  readonly scene: Scene;
  readonly subject: string;
}): { readonly environment: string; readonly foreground: string; readonly background: string } {
  const setting = normalizeSentence(input.scene.setting);
  const narration = input.scene.canonicalNarration;
  return {
    environment: setting || "historical period setting grounded in the narration",
    foreground: historyForegroundFromNarration(narration, input.subject),
    background: historyBackgroundFromNarration(narration, setting || "the narrated region"),
  };
}

export type HistoryImageProviderPromptRequest = {
  readonly scene: {
    readonly visibleAction: string;
    readonly focalSubject: string;
    readonly environment: string;
    readonly foreground: string;
    readonly background: string;
    readonly shotSize: string;
    readonly cameraAngle: string;
    readonly cameraMovementImpression?: string;
    readonly composition: string;
    readonly cameraFraming?: string;
    readonly lighting: string;
    readonly timeOfDay: string;
    readonly mood: string;
    readonly distinctiveAnchor: string;
    readonly continuityElements: readonly string[];
    readonly prohibitedElements: readonly string[];
    readonly textRequirement: SceneTextRequirement;
    readonly sourceNarration?: string;
  };
  readonly aspectRatio: "16:9" | "9:16";
  readonly authoritativeImagePrompt?: string;
  readonly characterContexts: readonly {
    readonly characterId: string;
    readonly definition?: { readonly name: string };
  }[];
  readonly referenceCharacterIds?: readonly string[];
  readonly visualDirection?: HistoricalVisualDirectionProfileV1;
  readonly sceneId?: string;
};

function historyCharacterIdentityText(
  request: HistoryImageProviderPromptRequest,
  cinematography: HistoryCinematography
): string {
  if (request.characterContexts.length === 0) {
    return "Use unnamed incidental figures only when required by the narration; keep uniforms and material culture period-accurate.";
  }

  const referencedIds = new Set(cinematography.referenceEntityIds);
  return request.characterContexts
    .map((context) => {
      const name = context.definition?.name ?? context.characterId;
      if (referencedIds.has(context.characterId)) {
        return `Preserve approved identity continuity for ${name}; accurate facial structure based on supplied reference image.`;
      }
      if (context.definition) {
        return `Preserve approved identity continuity for ${name}.`;
      }
      return `Use the approved reference image for character \`${context.characterId}\`.`;
    })
    .join(" ");
}

function historyCameraComposition(
  request: HistoryImageProviderPromptRequest,
  cinematography: HistoryCinematography
): string {
  return [
    `${request.scene.shotSize} shot, ${request.scene.cameraAngle} angle`,
    request.scene.cameraMovementImpression
      ? `${request.scene.cameraMovementImpression}, cinematic historical framing`
      : "cinematic historical framing",
    request.scene.composition,
    renderHistoryCameraPerspectivePrompt(cinematography.perspective),
  ].join(", ");
}

export function planHistoryImagePromptCinematography(
  request: HistoryImageProviderPromptRequest,
  guidance?: HistorySceneImageGuidance
): HistoryCinematography {
  const narrationSource =
    request.scene.sourceNarration?.trim() ||
    request.authoritativeImagePrompt?.trim() ||
    request.scene.focalSubject;
  return planHistorySceneCinematography({
    scene: {
      canonicalNarration: narrationSource,
      subject: request.scene.focalSubject,
      action: request.scene.visibleAction,
      setting: request.scene.environment,
      cameraFraming: request.scene.cameraFraming ?? "",
      composition: request.scene.composition,
    },
    shotSize: request.scene.shotSize,
    focalSubject: request.scene.focalSubject,
    ...(guidance ? { guidance } : {}),
    ...(request.authoritativeImagePrompt
      ? { authoritativeImagePrompt: request.authoritativeImagePrompt }
      : {}),
    characterNames: request.characterContexts
      .map((context) => context.definition?.name ?? "")
      .filter(Boolean),
    referenceCharacterIds: request.referenceCharacterIds ?? [],
  });
}

export function renderHistoryImageProviderPrompt(
  request: HistoryImageProviderPromptRequest,
  guidance?: HistorySceneImageGuidance
): string {
  const concept = guidance?.concept;
  const authoritativePrompt = request.authoritativeImagePrompt?.trim();
  const environment = normalizeSentence(request.scene.environment);
  const foreground = normalizeSentence(request.scene.foreground);
  const background = normalizeSentence(request.scene.background);
  const primaryVisualEvent = historyPrimaryVisualEvent({
    ...(authoritativePrompt ? { authoritativePrompt } : {}),
    ...(concept ? { concept } : {}),
    scene: request.scene,
  });
  const cinematography = planHistoryImagePromptCinematography(request, guidance);

  const periodLine = concept?.approximatePeriod
    ? `Period: ${concept.approximatePeriod}.`
    : "";
  const geographyLine = concept?.settingGeography
    ? `Geography: ${concept.settingGeography}.`
    : "";

  const narrationSource =
    request.scene.sourceNarration?.trim() || primaryVisualEvent;
  const mood = deriveHistorySceneMood({
    canonicalNarration: narrationSource,
  } as Scene);
  const timeOfDay = deriveHistorySceneTimeOfDay({
    canonicalNarration: narrationSource,
  } as Scene);
  const lightingPrompt = renderHistoryLightingPrompt(cinematography.lighting);
  const stylePrompt = renderHistoryStylePresetPrompt(
    cinematography.stylePreset,
    narrationSource
  );
  const persistedDirection =
    request.visualDirection && request.sceneId
      ? renderPersistedVisualDirectionPromptSectionsV1({
          profile: request.visualDirection,
          sceneId: request.sceneId,
        })
      : null;

  return [
    promptSection("PRIMARY VISUAL EVENT", primaryVisualEvent),
    promptSection(
      "HISTORICAL FACTS",
      [periodLine, geographyLine, concept?.protectedFactualRelation]
        .filter(Boolean)
        .join(" ") || "Ground the scene in period-accurate material culture from the narration."
    ),
    promptSection(
      "CHARACTER IDENTITY AND CONTINUITY",
      historyCharacterIdentityText(request, cinematography)
    ),
    promptSection(
      "ENVIRONMENT",
      `${environment} Foreground: ${foreground}. Background: ${background}.`
    ),
    ...(persistedDirection
      ? [
          promptSection(
            "HISTORICAL CONSTRAINTS",
            persistedDirection.historicalConstraints ||
              "Maintain period-accurate material culture and avoid anachronisms."
          ),
          promptSection("CAMERA AND COMPOSITION", persistedDirection.cameraDirection),
          promptSection("LIGHTING AND COLOR", persistedDirection.lightingDirection),
          promptSection("VISUAL STYLE", persistedDirection.aestheticDirection),
          ...(persistedDirection.sceneOverride
            ? [promptSection("SCENE VISUAL OVERRIDE", persistedDirection.sceneOverride)]
            : []),
        ]
      : [
          promptSection(
            "CAMERA AND COMPOSITION",
            historyCameraComposition(request, cinematography)
          ),
          promptSection(
            "LIGHTING AND COLOR",
            `${lightingPrompt}. Time of day: ${timeOfDay}. Mood: ${mood}.`
          ),
          promptSection(
            "VISUAL STYLE",
            `${stylePrompt}, photorealistic, believable human anatomy, natural skin and fabric textures, no illustration, no painting, no watercolor, no collage, no stylized cartoon look, no CGI render look, ${request.aspectRatio}.`
          ),
        ]),
    promptSection(
      "TEXT REQUIREMENT",
      buildSceneTextPromptSection(request.scene.textRequirement)
    ),
    promptSection(
      "DISTINCTIVE SCENE ANCHOR",
      request.scene.distinctiveAnchor
    ),
    promptSection(
      "CONTINUITY REQUIREMENTS",
      request.scene.continuityElements.length > 0
        ? request.scene.continuityElements.join(" ")
        : "Maintain episode-level continuity for wardrobe, geography, and campaign logic where applicable."
    ),
    promptSection(
      "EXCLUSIONS",
      [
        buildSceneNegativePrompt(
          request.scene.textRequirement,
          request.scene.prohibitedElements
        ),
        (concept?.forbiddenAnachronisms ?? []).join(", "),
        HISTORY_RECONSTRUCTION_NEGATIVE_CONSTRAINTS.join(", "),
        persistedDirection?.negativeConcepts ?? "",
        "no illustration, no painting, no concept art, no horror mood, no altered photographs, no archive-table still life unless narration requires documents",
      ]
        .filter(Boolean)
        .join(", ")
    ),
  ].join("\n\n");
}

/** @deprecated Use planHistoryImagePromptCinematography instead. */
export function deriveHistorySceneLighting(scene: Scene): string {
  const source = scene.canonicalNarration.toLowerCase();
  if (/\bwinter\b|\bsnow\b|\bfrost\b|\bcold\b/u.test(source)) {
    return "soft overcast winter daylight";
  }
  if (/\bnight\b|\bdark\b/u.test(source)) {
    return "natural low-light with practical moonlight or campfires and realistic shadow detail";
  }
  if (/\bdusk\b|\bsunset\b|\bevening\b/u.test(source)) {
    return "low-angle natural light, restrained atmospheric contrast";
  }
  if (/\bbattle\b|\bfire\b|\bsmoke\b|\bartillery\b/u.test(source)) {
    return "natural daylight with smoke-diffused sun and realistic battlefield atmosphere";
  }
  return "naturalistic directional daylight";
}

export {
  historyCinematographyDiagnostics,
  type HistoryCinematography,
} from "./history-image-cinematography.js";
