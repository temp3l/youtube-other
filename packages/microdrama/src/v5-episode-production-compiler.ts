import {
  BEAT_CATEGORIES,
  beatPlanPayloadSchema,
  beatPlanPacingRatios,
  computePayloadHash,
  durationTargetFromRatio,
  episodeSpecPayloadSchema,
  narrativeEpisodeIdSchema,
  narrativeRevisionEnvelopeSchema,
  narrativeRevisionIdSchema,
  seriesIdSchema,
  storyArcIdSchema,
  type BeatCategory,
  type BeatPlanPayload,
  type CliffhangerTaxonomy,
  type EpisodeSpecPayload,
} from "@mediaforge/narrative-core";

import type {
  AdmittedLocalizedScript,
  EpisodeBoundaryContract,
  V5CanonAdmissionBundle,
} from "./v5-canon-admission-contracts.js";
import type {
  CompiledEpisodeProduction,
  V5EpisodeProductionBundle,
  V5EpisodeProductionIssue,
  V5EpisodeProductionProjection,
  V5EpisodeProductionResult,
} from "./v5-episode-production-contracts.js";
import { validateV5CanonAdmissionBundle } from "./v5-canon-admission-contracts.js";
import {
  MICRODRAMA_PACK_SCHEMA_VERSION,
  SEVEN_MINUTES_AHEAD_SERIES_ID,
  V5_REMEDIATED_PACK_VERSION,
  canonicalEpisodeIds,
} from "./v5-pack-constants.js";

const FORBIDDEN_OPEN_LOOP_RESOLUTION =
  "forbidden:premature_open_loop_resolution_before_cliffhanger";

function fail(issues: V5EpisodeProductionIssue[]): V5EpisodeProductionResult {
  return { ok: false, issues };
}

function narrativeEpisodeId(canonicalEpisodeId: string): string {
  return narrativeEpisodeIdSchema.parse(
    `episode.${canonicalEpisodeId.toLowerCase()}`
  );
}

function boundaryRevisionId(episodeId: string): string {
  return `rev.boundary.${episodeId.toLowerCase()}`;
}

function episodeSpecRevisionId(episodeId: string): string {
  return `rev.episode-spec.${episodeId.toLowerCase()}`;
}

function beatPlanRevisionId(episodeId: string): string {
  return `rev.beat-plan.${episodeId.toLowerCase()}`;
}

function arcRevisionId(arcId: string): string {
  return `rev.arc.${arcId}`;
}

function hookSemanticId(episodeId: string): string {
  return `hook.${episodeId.toLowerCase()}`;
}

function cliffhangerSemanticId(episodeId: string): string {
  return `cliffhanger.${episodeId.toLowerCase()}`;
}

function beatId(episodeId: string, category: BeatCategory): string {
  return `beat.${episodeId.toLowerCase()}.${category.toLowerCase()}`;
}

function inferCliffhangerTaxonomy(
  cliffhangerBeat: string,
  openLoop: string
): CliffhangerTaxonomy {
  const text = `${cliffhangerBeat} ${openLoop}`.toLowerCase();
  if (/(blood|danger|gun|attack|van|explod|kill|die|threat)/u.test(text)) {
    return "PHYSICAL_DANGER";
  }
  if (/(secret|hidden|never told|admit|expose|knows)/u.test(text)) {
    return "SECRET_EXPOSED";
  }
  if (/(betray|traitor|observer|works for)/u.test(text)) {
    return "BETRAYAL";
  }
  if (/(who|what|why|recogniz|you got them)/u.test(text)) {
    return "DISCOVERY";
  }
  if (/(decision|choose|sacrifice|override)/u.test(text)) {
    return "DECISION";
  }
  if (/(interrupt|knock|pass out|collapse)/u.test(text)) {
    return "INTERRUPTION";
  }
  if (/(reverse|wrong|not what|context trap|false)/u.test(text)) {
    return "FALSE_ASSUMPTION";
  }
  if (/(arriv|return|welcome back)/u.test(text)) {
    return "ARRIVAL";
  }
  if (/(trust|relationship|strangers again)/u.test(text)) {
    return "RELATIONSHIP_SHIFT";
  }
  if (/(identity|version|subject|receiver)/u.test(text)) {
    return "IDENTITY_REVEAL";
  }
  return "REVERSAL";
}

function beatEventForCategory(
  category: BeatCategory,
  boundary: EpisodeBoundaryContract
): string {
  switch (category) {
    case "HOOK":
      return boundary.hook;
    case "ORIENTATION":
      return boundary.location;
    case "CONFLICT":
      return boundary.openLoop;
    case "ESCALATION":
      return boundary.newInformation;
    case "DISCOVERY":
      return boundary.newInformation;
    case "REVERSAL":
      return boundary.openLoop;
    case "DECISION":
      return boundary.newInformation;
    case "CONSEQUENCE":
      return boundary.openLoop;
    case "CLIFFHANGER":
      return boundary.cliffhangerBeat;
    default:
      return boundary.newInformation;
  }
}

function beatPurposeForCategory(category: BeatCategory): string {
  switch (category) {
    case "HOOK":
      return "Open on canonical hook intent before orientation.";
    case "ORIENTATION":
      return "Establish cast and location before conflict escalates.";
    case "CONFLICT":
      return "Surface the episode tension carried by the open loop.";
    case "ESCALATION":
      return "Advance action toward the episode's new information.";
    case "DISCOVERY":
      return "Deliver the episode's accepted new information.";
    case "REVERSAL":
      return "Reframe stakes using the accepted open loop.";
    case "DECISION":
      return "Commit to the consequence implied by the new information.";
    case "CONSEQUENCE":
      return "Carry unresolved tension into the closing beat.";
    case "CLIFFHANGER":
      return "Close on the accepted hard cliffhanger beat.";
    default:
      return "Advance the accepted episode boundary.";
  }
}

function boundaryObligationForCategory(
  category: BeatCategory
): BeatPlanPayload["beats"][number]["boundaryObligation"] {
  switch (category) {
    case "HOOK":
      return "hook";
    case "CLIFFHANGER":
      return "cliffhanger";
    case "DISCOVERY":
      return "new_information";
    case "CONFLICT":
    case "REVERSAL":
    case "CONSEQUENCE":
      return "open_loop";
    default:
      return undefined;
  }
}

function compileEpisodeSpec(args: {
  boundary: EpisodeBoundaryContract;
  enScript: AdmittedLocalizedScript;
  priorBoundary?: EpisodeBoundaryContract;
}): EpisodeSpecPayload {
  const { boundary, enScript, priorBoundary } = args;
  const estimatedSeconds = enScript.manifestEntry.estimated_seconds;
  const durationRangeSeconds = durationTargetFromRatio(estimatedSeconds, 0, 1);
  const taxonomy = inferCliffhangerTaxonomy(
    boundary.cliffhangerBeat,
    boundary.openLoop
  );

  return episodeSpecPayloadSchema.parse({
    schemaVersion: "mediaforge.narrative.episode-production.v1",
    seriesId: seriesIdSchema.parse(SEVEN_MINUTES_AHEAD_SERIES_ID),
    episodeId: narrativeEpisodeId(boundary.episodeId),
    canonicalEpisodeId: boundary.episodeId,
    episodeNumber: boundary.episodeNumber,
    storyArcId: storyArcIdSchema.parse(`arc.${boundary.arcId}`),
    arcRevisionId: narrativeRevisionIdSchema.parse(arcRevisionId(boundary.arcId)),
    boundaryRevisionId: narrativeRevisionIdSchema.parse(
      boundaryRevisionId(boundary.episodeId)
    ),
    enScriptRevisionId: narrativeRevisionIdSchema.parse(enScript.scriptRevisionId),
    objective: boundary.newInformation,
    audienceQuestion: boundary.openLoop,
    startingConditions: {
      location: boundary.location,
      cast: boundary.characters,
    },
    requiredEvents: [
      boundary.hook,
      boundary.newInformation,
      boundary.cliffhangerBeat,
      ...(priorBoundary?.nextOpeningObligation
        ? [priorBoundary.nextOpeningObligation]
        : []),
    ],
    forbiddenEvents: [FORBIDDEN_OPEN_LOOP_RESOLUTION],
    promiseMovements: [],
    revealPermissions: [],
    endingState: {
      newInformation: boundary.newInformation,
      openLoop: boundary.openLoop,
      cliffhangerRequired: true,
    },
    hook: {
      semanticId: hookSemanticId(boundary.episodeId),
      canonicalIntent: boundary.hook,
    },
    cliffhanger: {
      semanticId: cliffhangerSemanticId(boundary.episodeId),
      canonicalIntent: boundary.cliffhangerBeat,
      taxonomy,
    },
    durationRangeSeconds,
    provenance: {
      sourceKind: "import",
      sourceRevisionIds: [
        boundaryRevisionId(boundary.episodeId),
        enScript.scriptRevisionId,
      ],
      sourceArtifactHashes: [enScript.contentHash],
      notes: `Imported V5 EpisodeSpec from ${V5_REMEDIATED_PACK_VERSION}`,
    },
  });
}

function compileBeatPlan(args: {
  boundary: EpisodeBoundaryContract;
  episodeSpec: EpisodeSpecPayload;
  enScript: AdmittedLocalizedScript;
  priorBoundary?: EpisodeBoundaryContract;
}): BeatPlanPayload {
  const { boundary, episodeSpec, enScript, priorBoundary } = args;
  const estimatedSeconds = enScript.manifestEntry.estimated_seconds;

  const beats = BEAT_CATEGORIES.map((category: BeatCategory, order: number) => {
    const ratio = beatPlanPacingRatios[category];

    return {
      beatId: beatId(boundary.episodeId, category),
      order,
      category,
      purpose: beatPurposeForCategory(category),
      event: beatEventForCategory(category, boundary),
      participants: boundary.characters,
      informationGain:
        category === "DISCOVERY" || category === "ESCALATION"
          ? boundary.newInformation
          : category === "CLIFFHANGER"
            ? boundary.cliffhangerBeat
            : boundary.openLoop,
      knowledgeTransition:
        category === "DISCOVERY" ? boundary.newInformation : undefined,
      emotionTransition:
        category === "CLIFFHANGER" ? boundary.openLoop : undefined,
      durationTargetSeconds: durationTargetFromRatio(
        estimatedSeconds,
        ratio.start,
        ratio.end
      ),
      requiredReactions:
        category === "CLIFFHANGER"
          ? ["retain_open_loop"]
          : category === "HOOK" && priorBoundary?.nextOpeningObligation
            ? ["honor_prior_opening_obligation"]
            : [],
      boundaryObligation: boundaryObligationForCategory(category),
    };
  });

  return beatPlanPayloadSchema.parse({
    schemaVersion: "mediaforge.narrative.episode-production.v1",
    seriesId: seriesIdSchema.parse(SEVEN_MINUTES_AHEAD_SERIES_ID),
    episodeId: narrativeEpisodeId(boundary.episodeId),
    canonicalEpisodeId: boundary.episodeId,
    episodeSpecRevisionId: narrativeRevisionIdSchema.parse(
      episodeSpecRevisionId(boundary.episodeId)
    ),
    beats,
    boundaryObligations: {
      hookSemanticId: hookSemanticId(boundary.episodeId),
      cliffhangerSemanticId: cliffhangerSemanticId(boundary.episodeId),
      ...(boundary.nextOpeningObligation
        ? { nextOpeningObligation: boundary.nextOpeningObligation }
        : {}),
      ...(priorBoundary?.nextOpeningObligation
        ? { priorOpeningObligation: priorBoundary.nextOpeningObligation }
        : {}),
    },
    provenance: {
      sourceKind: "import",
      sourceRevisionIds: [
        episodeSpecRevisionId(boundary.episodeId),
        boundaryRevisionId(boundary.episodeId),
        enScript.scriptRevisionId,
      ],
      sourceArtifactHashes: [enScript.contentHash],
      notes: `Imported V5 BeatPlan from ${V5_REMEDIATED_PACK_VERSION}`,
    },
  });
}

export function compileEpisodeProductionFromBoundary(args: {
  boundary: EpisodeBoundaryContract;
  enScript: AdmittedLocalizedScript;
  priorBoundary?: EpisodeBoundaryContract | undefined;
}): CompiledEpisodeProduction {
  const episodeSpec = compileEpisodeSpec(args);
  const beatPlanInput: {
    boundary: EpisodeBoundaryContract;
    episodeSpec: EpisodeSpecPayload;
    enScript: AdmittedLocalizedScript;
    priorBoundary?: EpisodeBoundaryContract;
  } = {
    boundary: args.boundary,
    episodeSpec,
    enScript: args.enScript,
  };
  if (args.priorBoundary) {
    beatPlanInput.priorBoundary = args.priorBoundary;
  }
  const beatPlan = compileBeatPlan(beatPlanInput);

  return {
    episodeSpec,
    beatPlan,
    episodeSpecRevisionId: episodeSpecRevisionId(args.boundary.episodeId),
    beatPlanRevisionId: beatPlanRevisionId(args.boundary.episodeId),
    boundaryRevisionId: boundaryRevisionId(args.boundary.episodeId),
    enScriptRevisionId: args.enScript.scriptRevisionId,
  };
}

export function compileV5EpisodeProduction(
  canonBundle: V5CanonAdmissionBundle,
  compiledAt = new Date().toISOString()
): V5EpisodeProductionResult {
  let bundle: V5CanonAdmissionBundle;
  try {
    bundle = validateV5CanonAdmissionBundle(canonBundle);
  } catch (error) {
    return fail([
      {
        code: "canon_bundle_invalid",
        message: error instanceof Error ? error.message : "Invalid canon bundle",
      },
    ]);
  }

  const boundaryByEpisode = new Map(
    bundle.episodeBoundaries.map((boundary) => [boundary.episodeId, boundary])
  );
  const enScripts = new Map(
    bundle.admittedScripts
      .filter((script) => script.locale === "en-US")
      .map((script) => [script.episodeId, script])
  );

  const records = [];
  for (const episodeId of canonicalEpisodeIds()) {
    const boundary = boundaryByEpisode.get(episodeId);
    if (!boundary) {
      return fail([
        {
          code: "boundary_missing",
          message: `Missing admitted boundary for ${episodeId}`,
          path: episodeId,
        },
      ]);
    }
    const enScript = enScripts.get(episodeId);
    if (!enScript) {
      return fail([
        {
          code: "script_missing",
          message: `Missing EN script for ${episodeId}`,
          path: episodeId,
        },
      ]);
    }

    const priorEpisodeNumber = boundary.episodeNumber - 1;
    const priorBoundary =
      priorEpisodeNumber >= 1
        ? boundaryByEpisode.get(`E${String(priorEpisodeNumber).padStart(3, "0")}`)
        : undefined;

    const compileInput: {
      boundary: EpisodeBoundaryContract;
      enScript: AdmittedLocalizedScript;
      priorBoundary?: EpisodeBoundaryContract;
    } = {
      boundary,
      enScript,
    };
    if (priorBoundary) {
      compileInput.priorBoundary = priorBoundary;
    }

    const compiled = compileEpisodeProductionFromBoundary(compileInput);

    records.push({
      episodeId,
      episodeSpecRevisionId: compiled.episodeSpecRevisionId,
      beatPlanRevisionId: compiled.beatPlanRevisionId,
      boundaryRevisionId: compiled.boundaryRevisionId,
      enScriptRevisionId: compiled.enScriptRevisionId,
      episodeSpec: compiled.episodeSpec,
      beatPlan: compiled.beatPlan,
    });
  }

  return {
    ok: true,
    bundle: {
      schemaVersion: MICRODRAMA_PACK_SCHEMA_VERSION,
      importId: bundle.importId,
      seriesBibleRevisionId: bundle.seriesBibleRevisionId,
      compiledAt,
      records,
    },
  };
}

export function buildEpisodeProductionRevisionEnvelopes(
  compiled: CompiledEpisodeProduction,
  admittedAt: string
) {
  const episodeSpecEnvelope = narrativeRevisionEnvelopeSchema.parse({
    schemaVersion: "mediaforge.narrative.v1",
    revisionId: narrativeRevisionIdSchema.parse(compiled.episodeSpecRevisionId),
    aggregateId: compiled.episodeSpec.canonicalEpisodeId,
    aggregateKind: "episode_spec",
    revisionNumber: 1,
    payload: compiled.episodeSpec,
    contentHash: computePayloadHash(compiled.episodeSpec),
    parentRevisionIds: [
      narrativeRevisionIdSchema.parse(compiled.boundaryRevisionId),
      narrativeRevisionIdSchema.parse(compiled.enScriptRevisionId),
    ],
    status: "ACCEPTED",
    provenance: compiled.episodeSpec.provenance,
    createdAt: admittedAt,
  });

  const beatPlanEnvelope = narrativeRevisionEnvelopeSchema.parse({
    schemaVersion: "mediaforge.narrative.v1",
    revisionId: narrativeRevisionIdSchema.parse(compiled.beatPlanRevisionId),
    aggregateId: compiled.episodeSpec.canonicalEpisodeId,
    aggregateKind: "beat_plan",
    revisionNumber: 1,
    payload: compiled.beatPlan,
    contentHash: computePayloadHash(compiled.beatPlan),
    parentRevisionIds: [
      narrativeRevisionIdSchema.parse(compiled.episodeSpecRevisionId),
    ],
    status: "ACCEPTED",
    provenance: compiled.beatPlan.provenance,
    createdAt: admittedAt,
  });

  return { episodeSpecEnvelope, beatPlanEnvelope };
}

export function buildV5EpisodeProductionProjection(
  bundle: V5EpisodeProductionBundle
): V5EpisodeProductionProjection {
  return {
    schemaVersion: MICRODRAMA_PACK_SCHEMA_VERSION,
    importId: bundle.importId,
    episodeSpecRevisionIds: bundle.records.map((record) => record.episodeSpecRevisionId),
    beatPlanRevisionIds: bundle.records.map((record) => record.beatPlanRevisionId),
    compiledAt: bundle.compiledAt,
  };
}

export { FORBIDDEN_OPEN_LOOP_RESOLUTION };
