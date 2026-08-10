import fs from "node:fs/promises";
import path from "node:path";
import { episodeManifestSchema, scenePlanSchema, type ScenePlan } from "@mediaforge/domain";
import {
  assembleSemanticImagePrompt,
  deriveSemanticImagePromptBrief,
  semanticImagePromptHash,
  writeJsonAtomic,
  type HistoryAssetSemanticContextV1,
  type SemanticAssetBriefV1,
  type SemanticImagePromptBriefV1,
  type SemanticImagePromptCacheArtifact,
  type SemanticImagePromptFinding,
  type SemanticImagePromptOpenAiClient,
  type SemanticImagePromptPlanInput,
  type SemanticImagePromptCapability,
} from "@mediaforge/shared";
import type { HistoryVisualPlanV35 } from "./history-v35-contracts.js";

export const HISTORY_SEMANTIC_IMAGE_PROMPT_ADAPTER_VERSION =
  "history-semantic-image-prompt-adapter.v1" as const;
export const HISTORY_SEMANTIC_IMAGE_PROMPT_PLANNER_VERSION =
  "history-semantic-image-prompt-v1" as const;
export const HISTORY_SEMANTIC_VISUAL_DIRECTION_VERSION =
  "history-semantic-visual-direction.v1" as const;
export const HISTORY_SEMANTIC_IMAGE_PROMPT_CAPABILITY = {
  enabled: true,
  provider: "openai",
  cache: true,
  failClosed: true,
  adapter: "history",
} as const satisfies SemanticImagePromptCapability;

export const HISTORY_SEMANTIC_ANTI_DRIFT_RULES = [
  "Do not replace the approved beat with a generic medieval battlefield, old map, Roman soldier, Victorian explorer, king portrait, smoky war scene, or ancient city.",
  "Show the correct approved event, actor roles, place, period, action, relationship, material setting, and documentary purpose.",
  "Do not invent historical facts, dates, places, identities, uniforms, weapons, technology, insignia, architecture, movements, weather, quotations, map geometry, diagram topology, or causal claims.",
  "Omit unsupported detail; never fill factual gaps from model memory.",
] as const;

export type HistorySemanticPromptFindingCode =
  | "HISTORY_SEMANTIC_PROMPT_UNSUPPORTED_ENTITY"
  | "HISTORY_SEMANTIC_PROMPT_UNSUPPORTED_PLACE"
  | "HISTORY_SEMANTIC_PROMPT_CHRONOLOGY_CONFLICT"
  | "HISTORY_SEMANTIC_PROMPT_ANACHRONISM"
  | "HISTORY_SEMANTIC_PROMPT_MAP_MUTATION"
  | "HISTORY_SEMANTIC_PROMPT_DIAGRAM_MUTATION"
  | "HISTORY_SEMANTIC_PROMPT_EVIDENCE_BROADENING";

function beatNarration(
  plan: HistoryVisualPlanV35,
  beatId: string,
): string {
  const beat = plan.beats.find((candidate) => candidate.id === beatId);
  return beat
    ? plan.narration.normalizedText
        .slice(beat.narrationSpan.startUtf16, beat.narrationSpan.endUtf16Exclusive)
        .trim()
    : "";
}

function assetMode(
  modality: HistoryVisualPlanV35["beats"][number]["modality"],
): HistoryAssetSemanticContextV1["assetMode"] {
  if (modality === "map") return "map";
  if (modality === "diagram" || modality === "timeline" || modality === "date-card") {
    return "diagram";
  }
  if (modality === "document" || modality === "quotation") return "document";
  if (modality === "archival image" || modality === "historical artwork") return "object";
  if (modality === "restrained atmospheric reconstruction") return "reenactment";
  return "environment";
}

function purposeFor(input: {
  readonly modality: HistoryVisualPlanV35["beats"][number]["modality"];
  readonly purpose: string;
}): SemanticAssetBriefV1["narrativePurpose"] {
  if (input.modality === "map") {
    return /mov|route|journey|campaign|migration|expedition/iu.test(input.purpose)
      ? "movement"
      : "location";
  }
  if (input.modality === "diagram") return "explanation";
  if (/evidence|document|source/iu.test(input.purpose)) return "evidence";
  if (/compar|contrast/iu.test(input.purpose)) return "comparison";
  return "event";
}

function historyContextForShot(input: {
  readonly plan: HistoryVisualPlanV35;
  readonly shot: HistoryVisualPlanV35["shots"][number];
}): HistoryAssetSemanticContextV1 {
  const { plan, shot } = input;
  const beat = plan.beats.find((candidate) => candidate.id === shot.beatId);
  if (!beat) throw new Error(`History shot ${shot.id} has no approved beat ${shot.beatId}.`);
  const claimIds = new Set(shot.linkedClaimIds);
  const claims = plan.claims.filter((claim) => claimIds.has(claim.id));
  const entities = plan.entities.filter((entity) => claimIds.has(entity.claimId));
  const geographicQualifierIds = new Set(
    claims.flatMap((claim) => claim.geographicQualifierIds),
  );
  const geography = plan.geographicQualifiers.filter((qualifier) =>
    geographicQualifierIds.has(qualifier.id),
  );
  const geographicEntities = geography
    .map((qualifier) =>
      plan.entities.find((entity) => entity.id === qualifier.entityMentionId),
    )
    .filter((entity): entity is NonNullable<typeof entity> => Boolean(entity));
  const temporalQualifierIds = new Set(
    claims.flatMap((claim) => claim.temporalQualifierIds),
  );
  const temporal = plan.temporalQualifiers.filter((qualifier) =>
    temporalQualifierIds.has(qualifier.id),
  );
  const approvedYears = temporal
    .flatMap((qualifier) => qualifier.normalizedValue.match(/\b\d{3,4}\b/gu) ?? [])
    .map(Number)
    .filter(Number.isInteger);
  const referenceUsages = plan.historicalPersonReferences.usages.filter(
    (usage) => usage.shotId === shot.id,
  );
  const mapStateIds = beat.mapStateId ? [beat.mapStateId] : [];
  const diagramStateIds = beat.diagramStateId ? [beat.diagramStateId] : [];
  return {
    ...(temporal.length > 0
      ? {
          period: {
            ...(approvedYears.length > 0
              ? {
                  startYear: Math.min(...approvedYears),
                  endYear: Math.max(...approvedYears),
                }
              : {}),
            displayEra: temporal.map((item) => item.verbatimText).join("; "),
          },
        }
      : {}),
    ...(geographicEntities.length > 0
      ? {
          geography: {
            placeIds: geographicEntities.map((entity) => entity.id),
            canonicalPlaceNames: geographicEntities.map(
              (entity) => entity.normalizedLabel,
            ),
          },
        }
      : {}),
    ...(entities.length > 0
      ? {
          entities: {
            entityIds: entities.map((entity) => entity.id),
            approvedDisplayNames: entities.map((entity) => entity.normalizedLabel),
          },
        }
      : {}),
    ...(referenceUsages.length > 0
      ? {
          historicalFigures: referenceUsages.map((usage) => ({
            entityId: usage.canonicalPersonId,
            canonicalName: usage.canonicalName,
            referenceEligible: usage.attachmentStatus === "attached",
            ...(usage.selectedReferenceAssetIds[0]
              ? { referenceAssetId: usage.selectedReferenceAssetIds[0] }
              : {}),
          })),
        }
      : {}),
    materialCulture: {
      approvedDetails: [],
      prohibitedAnachronisms: [
        ...shot.prohibitedAdditions,
        ...(plan.visualConcepts.find((concept) => concept.beatId === beat.id)
          ?.forbiddenAnachronisms ?? []),
      ],
    },
    evidence: {
      evidenceIds: [...claimIds],
      confidenceMode: plan.sourceAuthorityMode,
    },
    assetMode: assetMode(beat.modality),
    ...(mapStateIds.length > 0 ? { approvedMapStateIds: mapStateIds } : {}),
    ...(diagramStateIds.length > 0
      ? { approvedDiagramStateIds: diagramStateIds }
      : {}),
  };
}

export function buildHistorySemanticImagePromptPlanInput(
  plan: HistoryVisualPlanV35,
): SemanticImagePromptPlanInput {
  const sourceSemanticHash = semanticImagePromptHash({
    sourceAuthorityMode: plan.sourceAuthorityMode,
    trustSnapshotHash: plan.trustSnapshotHash,
    narration: plan.narration.normalizedText,
    beats: plan.beats.map((beat) => ({
      id: beat.id,
      narrationSpan: beat.narrationSpan,
      linkedClaimIds: beat.linkedClaimIds,
      modality: beat.modality,
    })),
  });
  const visualPlanHash = semanticImagePromptHash({
    plannerVersion: plan.plannerVersion,
    visualConcepts: plan.visualConcepts,
    visualPurposes: plan.visualPurposes,
    shots: plan.shots,
    mapStates: plan.mapStates,
    diagramStates: plan.diagramStates,
    historicalPersonReferences: plan.historicalPersonReferences,
  });
  const beats = new Map(plan.beats.map((beat) => [beat.id, beat] as const));
  return {
    genre: "history",
    contentId: plan.episodeId,
    title: plan.title,
    canonicalNarration: plan.narration.normalizedText,
    format: "long",
    aspectRatio: "16:9 with approved 9:16 derivative",
    sourceSemanticHash,
    visualPlanHash,
    genreAdapterVersion: HISTORY_SEMANTIC_IMAGE_PROMPT_ADAPTER_VERSION,
    genreVisualDirectionVersion: HISTORY_SEMANTIC_VISUAL_DIRECTION_VERSION,
    genreContext: {
      genre: "history",
      visualDirectionVersion: HISTORY_SEMANTIC_VISUAL_DIRECTION_VERSION,
      sourceAuthorityMode: plan.sourceAuthorityMode,
      trustSnapshotHash: plan.trustSnapshotHash,
      antiDriftRules: [...HISTORY_SEMANTIC_ANTI_DRIFT_RULES],
    },
    antiDriftRules: HISTORY_SEMANTIC_ANTI_DRIFT_RULES,
    contextHashes: {
      historicalContextHash: semanticImagePromptHash({
        temporalQualifiers: plan.temporalQualifiers,
        visualConcepts: plan.visualConcepts,
      }),
      entityResolutionHash: semanticImagePromptHash(plan.entities),
      geographyContextHash: semanticImagePromptHash({
        geographicQualifiers: plan.geographicQualifiers,
        places: plan.places,
        mapStates: plan.mapStates,
      }),
      evidenceSnapshotHash: semanticImagePromptHash({
        trustSnapshotHash: plan.trustSnapshotHash,
        claims: plan.claims,
      }),
    },
    assets: plan.shots.map((shot) => {
      const beat = beats.get(shot.beatId);
      if (!beat) throw new Error(`History shot ${shot.id} has unknown beat ${shot.beatId}.`);
      const concept = plan.visualConcepts.find((item) => item.beatId === beat.id);
      return {
        assetId: shot.id,
        beatId: beat.id,
        narrationBeat: beatNarration(plan, beat.id),
        currentPrompt: [
          concept?.historicalSubject ?? shot.subject,
          concept?.protectedFactualRelation ?? shot.purpose,
          concept?.settingGeography ?? shot.background,
          concept?.approximatePeriod ?? "",
        ]
          .filter(Boolean)
          .join(". "),
        approved: {
          narrativePurpose: purposeFor({ modality: beat.modality, purpose: shot.purpose }),
          subject: concept?.historicalSubject ?? shot.subject,
          action: shot.action,
          environment:
            concept?.settingGeography ?? shot.background ?? "approved documentary context",
          composition: concept?.intendedComposition ?? shot.adaptation16x9,
          camera: shot.framing,
          lighting: "use persisted History camera/image visual direction; do not invent a source",
          props: [shot.foreground, shot.midground]
            .map((item) => item.trim())
            .filter(Boolean),
          motionOpportunities: [shot.cameraMovement, ...shot.permittedMotion]
            .map((item) => item.trim())
            .filter(Boolean),
          negativeConstraints: [
            ...shot.prohibitedAdditions,
            ...(concept?.uncertaintyLimits ?? []),
            ...(concept?.forbiddenAnachronisms ?? []),
          ],
        },
        historyContext: historyContextForShot({ plan, shot }),
      };
    }),
  };
}

const genericHistoryPattern =
  /\b(?:generic|dramatic|cinematic)\b[^.]{0,40}\b(?:medieval|Roman|Victorian|historical|battlefield|old map|ancient city|explorer|soldier|king)/iu;
const historyRelationshipPattern =
  /\b(?:specific|supply|logistics|policy|quarantine|institution|cause|effect|movement|route|location|evidence|isolation|trapped|collapse|retreat|relationship|decision|sequence)/iu;
const positiveSemanticFields = (asset: SemanticAssetBriefV1): string =>
  [
    asset.spokenMeaning,
    asset.viewerTakeaway,
    asset.instantRead,
    asset.environmentIntent,
    asset.actionIntent,
    asset.conceptualComposition,
    asset.generationBasePrompt,
    ...asset.mustShow,
    ...asset.objectIntent,
    ...asset.relevanceAnchors,
  ].join(" ");

function capitalizedNames(value: string): readonly string[] {
  return value.match(/\b\p{Lu}[\p{L}'’-]+(?:\s+\p{Lu}[\p{L}'’-]+)+\b/gu) ?? [];
}

export function validateHistorySemanticImagePromptBrief(input: {
  readonly brief: SemanticImagePromptBriefV1;
  readonly plan: SemanticImagePromptPlanInput;
}): readonly SemanticImagePromptFinding[] {
  const findings: SemanticImagePromptFinding[] = [];
  const approvedAssets = new Map(
    input.plan.assets.map((asset) => [asset.assetId, asset] as const),
  );
  for (const asset of input.brief.assets) {
    const approved = approvedAssets.get(asset.assetId);
    if (!approved) continue;
    const expectedContext = approved.historyContext;
    if (!expectedContext) {
      findings.push({
        code: "SEMANTIC_IMAGE_BRIEF_SOURCE_MISMATCH",
        severity: "blocking",
        assetId: asset.assetId,
        message: `History asset ${asset.assetId} has no approved factual context.`,
      });
      continue;
    }
    if (
      semanticImagePromptHash(asset.historyContext?.entities ?? null) !==
      semanticImagePromptHash(expectedContext?.entities ?? null)
    ) {
      findings.push({
        code: "HISTORY_SEMANTIC_PROMPT_UNSUPPORTED_ENTITY",
        severity: "blocking",
        assetId: asset.assetId,
        message: `History asset ${asset.assetId} changes approved entity identity.`,
      });
    }
    if (
      semanticImagePromptHash(asset.historyContext?.geography ?? null) !==
      semanticImagePromptHash(expectedContext?.geography ?? null)
    ) {
      findings.push({
        code: "HISTORY_SEMANTIC_PROMPT_UNSUPPORTED_PLACE",
        severity: "blocking",
        assetId: asset.assetId,
        message: `History asset ${asset.assetId} changes approved geography.`,
      });
    }
    if (
      semanticImagePromptHash(asset.historyContext?.evidence ?? null) !==
      semanticImagePromptHash(expectedContext?.evidence ?? null)
    ) {
      findings.push({
        code: "HISTORY_SEMANTIC_PROMPT_EVIDENCE_BROADENING",
        severity: "blocking",
        assetId: asset.assetId,
        message: `History asset ${asset.assetId} changes the evidence-bound claim scope.`,
      });
    }
    if (
      semanticImagePromptHash(asset.historyContext?.approvedMapStateIds ?? []) !==
      semanticImagePromptHash(expectedContext?.approvedMapStateIds ?? [])
    ) {
      findings.push({
        code: "HISTORY_SEMANTIC_PROMPT_MAP_MUTATION",
        severity: "blocking",
        assetId: asset.assetId,
        message: `History asset ${asset.assetId} changes the approved map-state identity.`,
      });
    }
    if (
      semanticImagePromptHash(asset.historyContext?.approvedDiagramStateIds ?? []) !==
      semanticImagePromptHash(expectedContext?.approvedDiagramStateIds ?? [])
    ) {
      findings.push({
        code: "HISTORY_SEMANTIC_PROMPT_DIAGRAM_MUTATION",
        severity: "blocking",
        assetId: asset.assetId,
        message: `History asset ${asset.assetId} changes the approved diagram-state identity.`,
      });
    }
    if (
      !asset.historyContext ||
      semanticImagePromptHash(asset.historyContext) !==
        semanticImagePromptHash(expectedContext)
    ) {
      findings.push({
        code: "SEMANTIC_IMAGE_BRIEF_SOURCE_MISMATCH",
        severity: "blocking",
        assetId: asset.assetId,
        message: `History context for ${asset.assetId} does not exactly preserve approved provenance.`,
      });
      continue;
    }
    const positive = positiveSemanticFields(asset);
    const semanticMeaning = [
      asset.spokenMeaning,
      asset.viewerTakeaway,
      asset.instantRead,
      ...asset.mustShow,
      ...asset.relevanceAnchors,
    ].join(" ");
    if (
      genericHistoryPattern.test(semanticMeaning) &&
      !historyRelationshipPattern.test(semanticMeaning)
    ) {
      findings.push({
        code: "SEMANTIC_IMAGE_BRIEF_GENERIC_DRIFT",
        severity: "blocking",
        assetId: asset.assetId,
        message: `History asset ${asset.assetId} only looks historical and does not explain its beat.`,
      });
    }
    const allowedNames = [
      approved.narrationBeat,
      approved.approved.subject,
      approved.approved.environment,
      ...(expectedContext.entities?.approvedDisplayNames ?? []),
      ...(expectedContext.geography?.canonicalPlaceNames ?? []),
      ...(expectedContext.historicalFigures?.map((figure) => figure.canonicalName) ?? []),
    ].join(" ");
    for (const name of capitalizedNames(positive)) {
      if (!allowedNames.toLocaleLowerCase().includes(name.toLocaleLowerCase())) {
        findings.push({
          code: "HISTORY_SEMANTIC_PROMPT_UNSUPPORTED_ENTITY",
          severity: "blocking",
          assetId: asset.assetId,
          message: `History asset ${asset.assetId} introduces unsupported named entity ${name}.`,
        });
      }
    }
    const requestedYears = positive.match(/\b\d{3,4}\b/gu) ?? [];
    const approvedYears = new Set(
      [expectedContext.period?.startYear, expectedContext.period?.endYear]
        .filter((year): year is number => year !== undefined)
        .map(String),
    );
    if (requestedYears.some((year) => !approvedYears.has(year))) {
      findings.push({
        code: "HISTORY_SEMANTIC_PROMPT_CHRONOLOGY_CONFLICT",
        severity: "blocking",
        assetId: asset.assetId,
        message: `History asset ${asset.assetId} introduces an unsupported specific year.`,
      });
    }
    for (const prohibited of expectedContext.materialCulture?.prohibitedAnachronisms ?? []) {
      if (prohibited.length >= 4 && positive.toLocaleLowerCase().includes(prohibited.toLocaleLowerCase())) {
        findings.push({
          code: "HISTORY_SEMANTIC_PROMPT_ANACHRONISM",
          severity: "blocking",
          assetId: asset.assetId,
          message: `History asset ${asset.assetId} positively requests prohibited detail: ${prohibited}.`,
        });
      }
    }
    if (
      expectedContext.assetMode === "map" &&
      /\b(?:coordinates?|invent(?:ed)? borders?|add (?:a )?route|draw (?:an )?arrow|territory extends|exact distance)\b/iu.test(
        positive,
      )
    ) {
      findings.push({
        code: "HISTORY_SEMANTIC_PROMPT_MAP_MUTATION",
        severity: "blocking",
        assetId: asset.assetId,
        message: `History map ${asset.assetId} attempts to author geometry instead of preserving the approved map state.`,
      });
    }
    if (
      expectedContext.assetMode === "diagram" &&
      /\b(?:add|remove|replace|invent|change)\b[^.]{0,24}\b(?:node|edge|topology|causal link)\b/iu.test(
        positive,
      )
    ) {
      findings.push({
        code: "HISTORY_SEMANTIC_PROMPT_DIAGRAM_MUTATION",
        severity: "blocking",
        assetId: asset.assetId,
        message: `History diagram ${asset.assetId} attempts to mutate approved topology.`,
      });
    }
  }
  return findings;
}

function factualContext(context: HistoryAssetSemanticContextV1): readonly string[] {
  return [
    ...(context.period?.displayEra ? [`period/era: ${context.period.displayEra}`] : []),
    ...(context.geography?.canonicalPlaceNames.length
      ? [`geography: ${context.geography.canonicalPlaceNames.join(", ")}`]
      : []),
    ...(context.entities?.approvedDisplayNames.length
      ? [`approved entities: ${context.entities.approvedDisplayNames.join(", ")}`]
      : []),
    ...(context.materialCulture?.approvedDetails.length
      ? [`material culture: ${context.materialCulture.approvedDetails.join(", ")}`]
      : []),
    ...(context.materialCulture?.prohibitedAnachronisms.length
      ? [
          `prohibited anachronisms: ${context.materialCulture.prohibitedAnachronisms.join(", ")}`,
        ]
      : []),
    ...(context.assetMode === "map"
      ? [
          `map renderer remains authoritative; preserve state IDs ${(context.approvedMapStateIds ?? []).join(", ")}; do not invent labels, routes, borders, arrows, coordinates, or geometry`,
        ]
      : []),
    ...(context.assetMode === "diagram"
      ? [
          `diagram renderer remains authoritative; preserve state IDs ${(context.approvedDiagramStateIds ?? []).join(", ")}; do not change nodes, edges, topology, or evidence relationships`,
        ]
      : []),
  ];
}

export function assembleHistorySemanticImagePrompts(input: {
  readonly plan: HistoryVisualPlanV35;
  readonly brief: SemanticImagePromptBriefV1;
}): readonly {
  readonly assetId: string;
  readonly beatId: string;
  readonly prompt: string;
  readonly promptHash: string;
  readonly assetMode: HistoryAssetSemanticContextV1["assetMode"];
}[] {
  const normalized = buildHistorySemanticImagePromptPlanInput(input.plan);
  const approvedByAsset = new Map(
    normalized.assets.map((asset) => [asset.assetId, asset] as const),
  );
  const semanticByAsset = new Map(
    input.brief.assets.map((asset) => [asset.assetId, asset] as const),
  );
  return input.plan.shots.map((shot) => {
    const approved = approvedByAsset.get(shot.id);
    const semantic = semanticByAsset.get(shot.id);
    if (!approved?.historyContext || !semantic) {
      throw new Error(`Missing History semantic prompt for ${shot.id}.`);
    }
    const prompt = assembleSemanticImagePrompt({
      semantic,
      approved: approved.approved,
      aspectRatio: normalized.aspectRatio,
      genreStyle:
        approved.historyContext.assetMode === "map" ||
        approved.historyContext.assetMode === "diagram"
          ? "approved deterministic documentary map/diagram renderer; semantics guide emphasis only"
          : "fact-bound documentary reconstruction; evidence-aware and period-constrained",
      genreConstraints: HISTORY_SEMANTIC_ANTI_DRIFT_RULES,
      factualContext: factualContext(approved.historyContext),
    });
    return {
      assetId: shot.id,
      beatId: shot.beatId,
      prompt,
      promptHash: semanticImagePromptHash(prompt),
      assetMode: approved.historyContext.assetMode,
    };
  });
}

export function resolveHistorySemanticImagePromptPaths(
  episodeDir: string,
): { readonly cachePath: string; readonly reviewPath: string } {
  return {
    cachePath: path.join(
      episodeDir,
      "source",
      "history-v3.5",
      "semantic-image-prompt-brief.v1.json",
    ),
    reviewPath: path.join(
      episodeDir,
      "source",
      "history-v3.5",
      "semantic-image-prompt-review.v1.json",
    ),
  };
}

export async function deriveHistorySemanticImagePromptBrief(input: {
  readonly episodeDir: string;
  readonly plan: HistoryVisualPlanV35;
  readonly client: SemanticImagePromptOpenAiClient;
  readonly model: string;
  readonly refresh?: boolean;
  readonly now?: () => string;
}) {
  return deriveSemanticImagePromptBrief({
    plan: buildHistorySemanticImagePromptPlanInput(input.plan),
    cachePath: resolveHistorySemanticImagePromptPaths(input.episodeDir).cachePath,
    client: input.client,
    model: input.model,
    plannerPromptVersion: HISTORY_SEMANTIC_IMAGE_PROMPT_PLANNER_VERSION,
    ...(input.refresh ? { refresh: true } : {}),
    ...(input.now ? { now: input.now } : {}),
    validateGenre: validateHistorySemanticImagePromptBrief,
  });
}

export async function persistHistorySemanticImagePromptReview(input: {
  readonly episodeDir: string;
  readonly plan: HistoryVisualPlanV35;
  readonly artifact: SemanticImagePromptCacheArtifact;
  readonly cacheStatus: "hit" | "miss" | "refresh";
  readonly previousArtifact?: SemanticImagePromptCacheArtifact | null;
  readonly findings?: readonly SemanticImagePromptFinding[];
}): Promise<{
  readonly scenePlan: ScenePlan;
  readonly reviewPath: string;
  readonly finalPromptSetHash: string;
  readonly staleAssetIds: readonly string[];
}> {
  const prompts = assembleHistorySemanticImagePrompts({
    plan: input.plan,
    brief: input.artifact.brief,
  });
  const promptByAsset = new Map(prompts.map((prompt) => [prompt.assetId, prompt] as const));
  const previousPrompts = input.previousArtifact
    ? new Map(
        assembleHistorySemanticImagePrompts({
          plan: input.plan,
          brief: input.previousArtifact.brief,
        }).map((prompt) => [prompt.assetId, prompt.promptHash] as const),
      )
    : new Map<string, string>();
  const staleAssetIds = prompts
    .filter(
      (prompt) =>
        previousPrompts.has(prompt.assetId) &&
        previousPrompts.get(prompt.assetId) !== prompt.promptHash,
    )
    .map((prompt) => prompt.assetId);
  const sharedPath = path.join(input.episodeDir, "shared", "scenes.json");
  const canonicalPath = path.join(input.episodeDir, "canonical", "scenes.json");
  const existing = scenePlanSchema.parse(
    JSON.parse(await fs.readFile(sharedPath, "utf8")) as unknown,
  );
  if (existing.scenes.length !== input.plan.shots.length) {
    throw new Error("History semantic prompts do not match the canonical shot count.");
  }
  const scenePlan = scenePlanSchema.parse({
    ...existing,
    scenes: existing.scenes.map((scene, index) => {
      const shot = input.plan.shots[index];
      const prompt = shot ? promptByAsset.get(shot.id) : undefined;
      if (!shot || !prompt) throw new Error(`Missing History prompt for ${scene.id}.`);
      return { ...scene, imagePrompt: prompt.prompt };
    }),
  });
  const finalPromptSetHash = semanticImagePromptHash(
    prompts.map((prompt) => ({ assetId: prompt.assetId, promptHash: prompt.promptHash })),
  );
  const paths = resolveHistorySemanticImagePromptPaths(input.episodeDir);
  const semanticByAsset = new Map(
    input.artifact.brief.assets.map((asset) => [asset.assetId, asset] as const),
  );
  const findings = input.findings ?? [];
  const review = {
    schemaVersion: "history-semantic-image-prompt-review.v1",
    episodeId: input.plan.episodeId,
    sourceAuthorityMode: input.plan.sourceAuthorityMode,
    cacheStatus: input.cacheStatus,
    cacheKey: input.artifact.cacheKey,
    semanticBriefHash: input.artifact.briefHash,
    plannerPromptVersion: input.artifact.plannerPromptVersion,
    plannerModel: input.artifact.plannerModel,
    contentThesis: input.artifact.brief.contentThesis,
    viewerPromise: input.artifact.brief.viewerPromise,
    finalPromptSetHash,
    staleAssetIds,
    findings,
    metrics: {
      episodesWithSemanticBrief: 1,
      assetsWithSemanticBrief: prompts.length,
      assetsWithViewerTakeaway: input.artifact.brief.assets.filter(
        (asset) => asset.viewerTakeaway.length > 0,
      ).length,
      assetsWithNarrativeAction: input.artifact.brief.assets.filter(
        (asset) => asset.actionIntent.length > 0,
      ).length,
      assetsWithEraConstraintWhereRequired: input.artifact.brief.assets.filter(
        (asset) => asset.historyContext?.period?.displayEra,
      ).length,
      assetsWithGeographyConstraintWhereRequired: input.artifact.brief.assets.filter(
        (asset) => asset.historyContext?.geography?.canonicalPlaceNames.length,
      ).length,
      namedFigureIdentityMismatches: findings.filter((item) =>
        item.code.includes("UNSUPPORTED_ENTITY"),
      ).length,
      unsupportedEntityFindings: findings.filter((item) =>
        item.code.includes("UNSUPPORTED_ENTITY"),
      ).length,
      unsupportedPlaceFindings: findings.filter((item) =>
        item.code.includes("UNSUPPORTED_PLACE"),
      ).length,
      anachronismFindings: findings.filter((item) => item.code.includes("ANACHRONISM"))
        .length,
      genericHistoricalDriftFindings: findings.filter(
        (item) => item.code === "SEMANTIC_IMAGE_BRIEF_GENERIC_DRIFT",
      ).length,
      mapMutationFindings: findings.filter((item) => item.code.includes("MAP_MUTATION"))
        .length,
      diagramMutationFindings: findings.filter((item) =>
        item.code.includes("DIAGRAM_MUTATION"),
      ).length,
      promptAssemblyFailures: 0,
    },
    assets: prompts.map((prompt) => {
      const semantic = semanticByAsset.get(prompt.assetId)!;
      return {
        assetId: prompt.assetId,
        beatId: prompt.beatId,
        assetMode: prompt.assetMode,
        viewerTakeaway: semantic.viewerTakeaway,
        mustShow: semantic.mustShow,
        actionIntent: semantic.actionIntent,
        relevanceAnchors: semantic.relevanceAnchors,
        historyContext: semantic.historyContext,
        finalPromptPreview: prompt.prompt,
        finalPromptHash: prompt.promptHash,
        mapDiagramPreservation: ["map", "diagram"].includes(prompt.assetMode)
          ? "APPROVED_STATE_AUTHORITATIVE"
          : "NOT_APPLICABLE",
        staleStatus: staleAssetIds.includes(prompt.assetId)
          ? "STALE_BY_SEMANTIC_PROMPT"
          : "CURRENT",
      };
    }),
  };
  const manifestPath = path.join(input.episodeDir, "manifest.json");
  const manifest = episodeManifestSchema.parse(
    JSON.parse(await fs.readFile(manifestPath, "utf8")) as unknown,
  );
  const sourceMetadata =
    manifest.sourceMetadata && typeof manifest.sourceMetadata === "object"
      ? manifest.sourceMetadata
      : {};
  await Promise.all([
    writeJsonAtomic(sharedPath, scenePlan),
    writeJsonAtomic(canonicalPath, scenePlan),
    writeJsonAtomic(paths.reviewPath, review),
    writeJsonAtomic(manifestPath, {
      ...manifest,
      scenePlan,
      sourceMetadata: {
        ...sourceMetadata,
        semanticImagePromptBriefHash: input.artifact.briefHash,
        semanticImagePromptCacheKey: input.artifact.cacheKey,
        semanticImagePromptFinalPromptSetHash: finalPromptSetHash,
        semanticImagePromptPlannerVersion: input.artifact.plannerPromptVersion,
        semanticImagePromptStatus: "ready",
      },
      updatedAt: new Date().toISOString(),
    }),
  ]);
  return { scenePlan, reviewPath: paths.reviewPath, finalPromptSetHash, staleAssetIds };
}
