import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { hashText, writeJsonAtomic } from "@mediaforge/shared";
import type { HistoryVisualPlanV35 } from "./history-v35-contracts.js";

export const HISTORY_VISUAL_DIRECTION_SCHEMA_V1 =
  "history-visual-direction.v1" as const;
export const HISTORY_VISUAL_DIRECTION_RESOLVER_V1 =
  "history-visual-direction-resolver.v1.0.0" as const;

const sha256 = z.string().regex(/^[a-f0-9]{64}$/u);

export const historicalRepresentationSchemaV1 = z.enum([
  "historical-photographic",
  "documentary-reconstruction",
  "cinematic-reconstruction",
  "archival-inspired",
  "painting-inspired",
  "illustrative-reconstruction",
]);

export const referenceStrategyPurposeSchemaV1 = z.enum([
  "identity",
  "architecture",
  "artifact",
  "uniform",
  "location",
  "composition",
  "none",
]);

export const globalVisualDirectionSchemaV1 = z
  .object({
    period: z
      .object({
        yearStart: z.number().int().optional(),
        yearEnd: z.number().int().optional(),
        eraLabel: z.string().min(1),
      })
      .strict(),
    geography: z
      .object({
        region: z.string().optional(),
        country: z.string().optional(),
        locality: z.string().optional(),
        environment: z.string().optional(),
        climate: z.string().optional(),
        season: z.string().optional(),
      })
      .strict(),
    cameraDirection: z
      .object({
        perspectiveLanguage: z.string().min(1),
        defaultShotCharacter: z.string().min(1),
        lensEquivalentRange: z.string().optional(),
        defaultCameraHeight: z.string().optional(),
        depthOfFieldApproach: z.string().min(1),
        cameraEraInterpretation: z.string().min(1),
      })
      .strict(),
    lightingDirection: z
      .object({
        philosophy: z.string().min(1),
        historicallyAvailableSources: z.array(z.string()),
        contrast: z.string().min(1),
        atmosphere: z.string().min(1),
      })
      .strict(),
    aestheticDirection: z
      .object({
        representation: historicalRepresentationSchemaV1,
        realism: z.string().min(1),
        texture: z.string().min(1),
        colorTreatment: z.string().min(1),
        grain: z.string().optional(),
      })
      .strict(),
    historicalConstraints: z
      .object({
        architecture: z.array(z.string()),
        clothing: z.array(z.string()),
        materials: z.array(z.string()),
        technology: z.array(z.string()),
        transportation: z.array(z.string()),
        weapons: z.array(z.string()),
        lightingSources: z.array(z.string()),
        vegetation: z.array(z.string()),
        terrain: z.array(z.string()),
        prohibitedAnachronisms: z.array(z.string()),
      })
      .strict(),
    negativePromptConcepts: z.array(z.string()),
  })
  .strict();

export const sceneVisualDirectionSchemaV1 = z
  .object({
    sceneId: z.string().min(1),
    camera: z
      .object({
        shotType: z.string().optional(),
        framing: z.string().optional(),
        cameraHeight: z.string().optional(),
        cameraAngle: z.string().optional(),
        subjectDistance: z.string().optional(),
        lensEquivalent: z.string().optional(),
        depthOfField: z.string().optional(),
        movementImpression: z.string().optional(),
        perspectiveRationale: z.string().optional(),
      })
      .strict()
      .optional(),
    lighting: z
      .object({
        source: z.string().optional(),
        direction: z.string().optional(),
        quality: z.string().optional(),
        timeOfDay: z.string().optional(),
        atmosphere: z.string().optional(),
      })
      .strict()
      .optional(),
    composition: z
      .object({
        focalSubject: z.string().min(1),
        foreground: z.string().optional(),
        midground: z.string().optional(),
        background: z.string().optional(),
        visualHierarchy: z.string().optional(),
      })
      .strict()
      .optional(),
    historicalOverrides: z.array(z.string()).optional(),
    avoid: z.array(z.string()).optional(),
    referenceStrategy: z
      .object({
        required: z.boolean(),
        entityIds: z.array(z.string()),
        purpose: referenceStrategyPurposeSchemaV1,
      })
      .strict()
      .optional(),
    reasoningSummary: z.string().optional(),
  })
  .strict();

export const visualDirectionProvenanceSchemaV1 = z
  .object({
    schemaVersion: z.literal(HISTORY_VISUAL_DIRECTION_SCHEMA_V1),
    resolverVersion: z.literal(HISTORY_VISUAL_DIRECTION_RESOLVER_V1),
    episodeId: z.string().min(1),
    semanticInputFingerprint: sha256,
    outputFingerprint: sha256,
    provider: z.enum(["openai", "deterministic-fallback"]),
    model: z.string().min(1),
    providerStatus: z.enum(["resolved", "fallback", "refreshed"]),
    fallbackReason: z.string().optional(),
    createdAt: z.string().min(1),
    refreshedAt: z.string().optional(),
  })
  .strict();

export const visualDirectionValidationSchemaV1 = z
  .object({
    approved: z.boolean(),
    schemaValid: z.boolean(),
    blockerCodes: z.array(z.string()),
    warnings: z.array(z.string()),
  })
  .strict();

export const historicalVisualDirectionProfileSchemaV1 = z
  .object({
    schemaVersion: z.literal(HISTORY_VISUAL_DIRECTION_SCHEMA_V1),
    global: globalVisualDirectionSchemaV1,
    scenes: z.array(sceneVisualDirectionSchemaV1).optional(),
    provenance: visualDirectionProvenanceSchemaV1,
    validation: visualDirectionValidationSchemaV1,
  })
  .strict();

export type GlobalVisualDirectionV1 = z.infer<
  typeof globalVisualDirectionSchemaV1
>;
export type SceneVisualDirectionV1 = z.infer<typeof sceneVisualDirectionSchemaV1>;
export type HistoricalVisualDirectionProfileV1 = z.infer<
  typeof historicalVisualDirectionProfileSchemaV1
>;

export type VisualDirectionResolverInputV1 = {
  readonly episodeId: string;
  readonly title: string;
  readonly trustSnapshotHash: string;
  readonly semanticInputFingerprint: string;
  readonly sceneSummaries: readonly {
    readonly sceneId: string;
    readonly subject: string;
    readonly setting: string;
    readonly modality: string;
    readonly narrationExcerpt: string;
  }[];
  readonly periods: readonly string[];
  readonly geographies: readonly string[];
  readonly personReferences: readonly {
    readonly canonicalPersonId: string;
    readonly canonicalName: string;
    readonly likenessPolicy: string;
    readonly attachmentStatus: string;
  }[];
};

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as object)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`
      )
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function resolveHistoryVisualDirectionArtifactPathV1(
  episodeDir: string
): string {
  return path.join(
    episodeDir,
    "source",
    "history-v3.5",
    "history-visual-direction.v1.json"
  );
}

export function buildVisualDirectionSemanticFingerprintV1(input: {
  readonly episodeId: string;
  readonly title: string;
  readonly trustSnapshotHash: string;
  readonly sceneSummaries: VisualDirectionResolverInputV1["sceneSummaries"];
  readonly periods: readonly string[];
  readonly geographies: readonly string[];
  readonly personReferences: VisualDirectionResolverInputV1["personReferences"];
}): string {
  return hashText(
    stable({
      resolverVersion: HISTORY_VISUAL_DIRECTION_RESOLVER_V1,
      schemaVersion: HISTORY_VISUAL_DIRECTION_SCHEMA_V1,
      episodeId: input.episodeId,
      title: input.title,
      trustSnapshotHash: input.trustSnapshotHash,
      sceneSummaries: input.sceneSummaries,
      periods: [...input.periods].sort(),
      geographies: [...input.geographies].sort(),
      personReferences: [...input.personReferences]
        .map(
          (item) =>
            `${item.canonicalPersonId}|${item.likenessPolicy}|${item.attachmentStatus}`
        )
        .sort(),
    })
  );
}

export function buildVisualDirectionResolverInputV1(input: {
  readonly plan: HistoryVisualPlanV35;
}): VisualDirectionResolverInputV1 {
  const beatModality = new Map(
    input.plan.beats.map((beat) => [beat.id, beat.modality] as const)
  );
  const beatText = new Map(
    input.plan.beats.map((beat) => [
      beat.id,
      input.plan.narration.normalizedText.slice(
        beat.narrationSpan.startUtf16,
        beat.narrationSpan.endUtf16Exclusive
      ),
    ] as const)
  );
  const shotByIndex = [...input.plan.shots].sort((left, right) => {
    if (left.startMs !== right.startMs) return left.startMs - right.startMs;
    return left.id.localeCompare(right.id);
  });
  const sceneSummaries = shotByIndex.map((shot, index) => {
    const beatId = shot.beatId;
    const concept = input.plan.visualConcepts.find((item) => item.beatId === beatId);
    return {
      sceneId: `scene-${String(index + 1).padStart(3, "0")}`,
      subject: concept?.historicalSubject ?? shot.subject,
      setting:
        concept?.settingGeography ??
        shot.background ??
        "historically grounded documentary context",
      modality: beatModality.get(beatId) ?? "archival image",
      narrationExcerpt: (beatText.get(beatId) ?? shot.action).slice(0, 240),
    };
  });
  const periods = [
    ...new Set(
      input.plan.visualConcepts
        .map((concept) => concept.approximatePeriod)
        .filter((value): value is string => Boolean(value?.trim()))
    ),
  ];
  const geographies = [
    ...new Set(
      [
        ...input.plan.places.map((place) => place.label),
        ...input.plan.visualConcepts
          .map((concept) => concept.settingGeography)
          .filter((value): value is string => Boolean(value?.trim())),
      ].sort()
    ),
  ];
  const personReferences = input.plan.historicalPersonReferences.usages.map(
    (usage) => ({
      canonicalPersonId: usage.canonicalPersonId,
      canonicalName: usage.canonicalName,
      likenessPolicy: usage.likenessPolicy,
      attachmentStatus: usage.attachmentStatus,
    })
  );
  const semanticInputFingerprint = buildVisualDirectionSemanticFingerprintV1({
    episodeId: input.plan.episodeId,
    title: input.plan.title,
    trustSnapshotHash: input.plan.trustSnapshotHash,
    sceneSummaries,
    periods,
    geographies,
    personReferences,
  });
  return {
    episodeId: input.plan.episodeId,
    title: input.plan.title,
    trustSnapshotHash: input.plan.trustSnapshotHash,
    semanticInputFingerprint,
    sceneSummaries,
    periods,
    geographies,
    personReferences,
  };
}

export function computeVisualDirectionOutputFingerprintV1(
  profile: Pick<HistoricalVisualDirectionProfileV1, "global" | "scenes">
): string {
  return hashText(stable({ global: profile.global, scenes: profile.scenes ?? [] }));
}

export function isPersistedVisualDirectionReusableV1(input: {
  readonly persisted: HistoricalVisualDirectionProfileV1;
  readonly semanticInputFingerprint: string;
}): boolean {
  if (input.persisted.schemaVersion !== HISTORY_VISUAL_DIRECTION_SCHEMA_V1) return false;
  if (input.persisted.provenance.resolverVersion !== HISTORY_VISUAL_DIRECTION_RESOLVER_V1)
    return false;
  if (!input.persisted.validation.approved || !input.persisted.validation.schemaValid)
    return false;
  return (
    input.persisted.provenance.semanticInputFingerprint === input.semanticInputFingerprint
  );
}

export async function loadPersistedHistoricalVisualDirectionV1(
  episodeDir: string
): Promise<HistoricalVisualDirectionProfileV1 | null> {
  try {
    const raw = JSON.parse(
      await readFile(resolveHistoryVisualDirectionArtifactPathV1(episodeDir), "utf8")
    ) as unknown;
    return historicalVisualDirectionProfileSchemaV1.parse(raw);
  } catch {
    return null;
  }
}

export async function persistHistoricalVisualDirectionV1(
  episodeDir: string,
  profile: HistoricalVisualDirectionProfileV1
): Promise<void> {
  const validated = historicalVisualDirectionProfileSchemaV1.parse(profile);
  await writeJsonAtomic(
    resolveHistoryVisualDirectionArtifactPathV1(episodeDir),
    validated
  );
}

function inferEraLabel(periods: readonly string[], title: string): string {
  const joined = `${periods.join(" ")} ${title}`.toLowerCase();
  const yearMatch = joined.match(/\b(1[0-9]{3}|20[0-2][0-9])\b/u);
  if (yearMatch?.[1]) return `${yearMatch[1]} historical period`;
  if (/\bancient\b|\bbce\b|\bbc\b|\broman\b/u.test(joined)) return "ancient history";
  if (/\bmedieval\b/u.test(joined)) return "medieval period";
  if (/\b19th\b/u.test(joined)) return "nineteenth century";
  if (/\b20th\b|world war/u.test(joined)) return "twentieth century";
  return periods[0] ?? "historical period from narration";
}

function photographyLikely(yearStart?: number): boolean {
  return yearStart !== undefined && yearStart >= 1839;
}

export function buildDeterministicVisualDirectionFallbackV1(
  input: VisualDirectionResolverInputV1
): Omit<HistoricalVisualDirectionProfileV1, "provenance" | "validation"> {
  const yearCandidates = input.periods
    .flatMap((period) => [...period.matchAll(/\b(1[0-9]{3}|20[0-2][0-9])\b/gu)])
    .map((match) => Number(match[1]))
    .filter((year) => Number.isFinite(year));
  const yearStart = yearCandidates.length
    ? Math.min(...yearCandidates)
    : undefined;
  const yearEnd = yearCandidates.length ? Math.max(...yearCandidates) : undefined;
  const photographic = photographyLikely(yearStart);
  const geography = input.geographies[0] ?? input.sceneSummaries[0]?.setting;
  const global: GlobalVisualDirectionV1 = {
    period: {
      ...(yearStart !== undefined ? { yearStart } : {}),
      ...(yearEnd !== undefined ? { yearEnd } : {}),
      eraLabel: inferEraLabel(input.periods, input.title),
    },
    geography: {
      ...(geography ? { region: geography } : {}),
      environment: input.sceneSummaries[0]?.setting,
    },
    cameraDirection: {
      perspectiveLanguage: photographic
        ? "period-appropriate photojournalistic perspective"
        : "virtual documentary reconstruction perspective; not period photography",
      defaultShotCharacter: "grounded observational composition",
      lensEquivalentRange: photographic ? "35-50mm equivalent" : "40-50mm virtual equivalent",
      defaultCameraHeight: "eye-level",
      depthOfFieldApproach: photographic
        ? "moderate depth of field consistent with field documentation"
        : "moderate depth of field supporting readable subject separation",
      cameraEraInterpretation: photographic
        ? "archival photographic language where historically plausible"
        : "virtual lens terminology only; do not imply historical photography",
    },
    lightingDirection: {
      philosophy: "scene-appropriate illumination grounded in historically available sources",
      historicallyAvailableSources: photographic
        ? ["daylight", "interior daylight", "practical lamps where period-appropriate"]
        : ["daylight", "firelight", "candlelight", "overcast exterior"],
      contrast: "naturalistic contrast without modern studio stylization",
      atmosphere: "environmentally motivated atmosphere from narration context",
    },
    aestheticDirection: {
      representation: photographic
        ? "archival-inspired"
        : "documentary-reconstruction",
      realism: "historically grounded material culture and human presence",
      texture: photographic
        ? "subtle period-appropriate photographic texture where supported"
        : "believable surface detail without painterly stylization",
      colorTreatment: photographic
        ? "period-appropriate monochrome or restrained color treatment"
        : "naturalistic color treatment without modern grading gimmicks",
      ...(photographic ? { grain: "restrained period-appropriate grain only when archival tone is justified" } : {}),
    },
    historicalConstraints: {
      architecture: [],
      clothing: [],
      materials: [],
      technology: [],
      transportation: [],
      weapons: [],
      lightingSources: [],
      vegetation: [],
      terrain: [],
      prohibitedAnachronisms: [
        "modern vehicles",
        "modern signage",
        "modern clothing",
        "contemporary electronics",
        "anachronistic architecture",
      ],
    },
    negativePromptConcepts: [
      "no modern objects",
      "no illustration",
      "no fantasy embellishment",
      "no stylized cartoon look",
    ],
  };
  const scenes: SceneVisualDirectionV1[] = input.sceneSummaries.map((scene) => ({
    sceneId: scene.sceneId,
    composition: {
      focalSubject: scene.subject,
      background: scene.setting,
    },
    ...(scene.modality === "map" ||
    scene.modality === "diagram" ||
    scene.modality === "timeline"
      ? {
          referenceStrategy: {
            required: false,
            entityIds: [],
            purpose: "none" as const,
          },
        }
      : {}),
    reasoningSummary: `Deterministic fallback direction for ${scene.modality} scene.`,
  }));
  return {
    schemaVersion: HISTORY_VISUAL_DIRECTION_SCHEMA_V1,
    global,
    scenes,
  };
}

export function finalizeHistoricalVisualDirectionProfileV1(input: {
  readonly body: Omit<HistoricalVisualDirectionProfileV1, "provenance" | "validation">;
  readonly resolverInput: VisualDirectionResolverInputV1;
  readonly provider: "openai" | "deterministic-fallback";
  readonly model: string;
  readonly providerStatus: "resolved" | "fallback" | "refreshed";
  readonly fallbackReason?: string;
  readonly refreshed?: boolean;
}): HistoricalVisualDirectionProfileV1 {
  const outputFingerprint = computeVisualDirectionOutputFingerprintV1(input.body);
  const now = new Date().toISOString();
  const profile = historicalVisualDirectionProfileSchemaV1.parse({
    ...input.body,
    provenance: {
      schemaVersion: HISTORY_VISUAL_DIRECTION_SCHEMA_V1,
      resolverVersion: HISTORY_VISUAL_DIRECTION_RESOLVER_V1,
      episodeId: input.resolverInput.episodeId,
      semanticInputFingerprint: input.resolverInput.semanticInputFingerprint,
      outputFingerprint,
      provider: input.provider,
      model: input.model,
      providerStatus: input.providerStatus,
      ...(input.fallbackReason ? { fallbackReason: input.fallbackReason } : {}),
      createdAt: now,
      ...(input.refreshed ? { refreshedAt: now } : {}),
    },
    validation: {
      approved: true,
      schemaValid: true,
      blockerCodes: [],
      warnings:
        input.provider === "deterministic-fallback"
          ? ["VISUAL_DIRECTION_FALLBACK"]
          : [],
    },
  });
  return profile;
}

export function resolveSceneVisualDirectionV1(
  profile: HistoricalVisualDirectionProfileV1,
  sceneId: string
): SceneVisualDirectionV1 | undefined {
  return profile.scenes?.find((scene) => scene.sceneId === sceneId);
}

export function renderPersistedVisualDirectionPromptSectionsV1(input: {
  readonly profile: HistoricalVisualDirectionProfileV1;
  readonly sceneId: string;
}): {
  readonly historicalConstraints: string;
  readonly cameraDirection: string;
  readonly lightingDirection: string;
  readonly aestheticDirection: string;
  readonly sceneOverride: string;
  readonly negativeConcepts: string;
} {
  const global = input.profile.global;
  const scene = resolveSceneVisualDirectionV1(input.profile, input.sceneId);
  const historicalConstraints = [
    ...global.historicalConstraints.architecture,
    ...global.historicalConstraints.clothing,
    ...global.historicalConstraints.materials,
    ...global.historicalConstraints.technology,
    ...global.historicalConstraints.transportation,
    ...global.historicalConstraints.weapons,
    ...global.historicalConstraints.lightingSources,
    ...global.historicalConstraints.vegetation,
    ...global.historicalConstraints.terrain,
    ...global.historicalConstraints.prohibitedAnachronisms,
    ...(scene?.historicalOverrides ?? []),
  ]
    .filter(Boolean)
    .join("; ");
  const cameraDirection = [
    global.cameraDirection.perspectiveLanguage,
    global.cameraDirection.defaultShotCharacter,
    global.cameraDirection.lensEquivalentRange
      ? `Lens equivalent: ${global.cameraDirection.lensEquivalentRange}.`
      : "",
    global.cameraDirection.defaultCameraHeight
      ? `Camera height: ${global.cameraDirection.defaultCameraHeight}.`
      : "",
    global.cameraDirection.depthOfFieldApproach,
    global.cameraDirection.cameraEraInterpretation,
    scene?.camera?.shotType ? `Shot type override: ${scene.camera.shotType}.` : "",
    scene?.camera?.framing ? `Framing override: ${scene.camera.framing}.` : "",
    scene?.camera?.cameraAngle
      ? `Camera angle override: ${scene.camera.cameraAngle}.`
      : "",
    scene?.camera?.lensEquivalent
      ? `Scene lens override: ${scene.camera.lensEquivalent}.`
      : "",
    scene?.camera?.perspectiveRationale ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  const lightingDirection = [
    global.lightingDirection.philosophy,
    `Historically available sources: ${global.lightingDirection.historicallyAvailableSources.join(", ")}.`,
    global.lightingDirection.contrast,
    global.lightingDirection.atmosphere,
    scene?.lighting?.source ? `Scene lighting source: ${scene.lighting.source}.` : "",
    scene?.lighting?.timeOfDay ? `Scene time of day: ${scene.lighting.timeOfDay}.` : "",
    scene?.lighting?.atmosphere ? `Scene atmosphere: ${scene.lighting.atmosphere}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const aestheticDirection = [
    `Representation: ${global.aestheticDirection.representation}.`,
    global.aestheticDirection.realism,
    global.aestheticDirection.texture,
    global.aestheticDirection.colorTreatment,
    global.aestheticDirection.grain ? global.aestheticDirection.grain : "",
    `Period: ${global.period.eraLabel}.`,
    global.geography.region ? `Geography: ${global.geography.region}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const sceneOverride = [
    scene?.composition?.focalSubject
      ? `Focal subject: ${scene.composition.focalSubject}.`
      : "",
    scene?.composition?.foreground
      ? `Foreground: ${scene.composition.foreground}.`
      : "",
    scene?.composition?.background
      ? `Background: ${scene.composition.background}.`
      : "",
    scene?.composition?.visualHierarchy
      ? `Hierarchy: ${scene.composition.visualHierarchy}.`
      : "",
    scene?.referenceStrategy?.required
      ? `Reference strategy: ${scene.referenceStrategy.purpose} for ${scene.referenceStrategy.entityIds.join(", ")}.`
      : "",
    scene?.avoid?.length ? `Avoid: ${scene.avoid.join(", ")}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const negativeConcepts = [
    ...global.negativePromptConcepts,
    ...(scene?.avoid ?? []),
  ].join(", ");
  return {
    historicalConstraints,
    cameraDirection,
    lightingDirection,
    aestheticDirection,
    sceneOverride,
    negativeConcepts,
  };
}

export class VisualDirectionNotResolvedError extends Error {
  constructor(message = "History visual direction is not resolved for this episode.") {
    super(message);
    this.name = "VisualDirectionNotResolvedError";
  }
}

export class VisualDirectionInvalidError extends Error {
  constructor(message = "History visual direction failed validation.") {
    super(message);
    this.name = "VisualDirectionInvalidError";
  }
}
