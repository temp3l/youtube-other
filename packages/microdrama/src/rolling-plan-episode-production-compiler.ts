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

import {
  mapRollingPlanIssues,
  type CompiledRollingEpisodeProduction,
  type RollingPlanEpisodeProductionIssue,
  type RollingPlanEpisodeProductionResult,
} from "./rolling-plan-episode-production-contracts.js";
import {
  parseCanonicalEpisodeNumber,
  type PlanningIntention,
  type RollingPlanRevision,
} from "./rolling-plan-contracts.js";
import {
  validateRollingPlanConstraints,
  type RollingPlanConstraintContext,
} from "./rolling-plan-constraints.js";
import type { EpisodeBoundaryContract } from "./v5-canon-admission-contracts.js";
import { FORBIDDEN_OPEN_LOOP_RESOLUTION } from "./v5-episode-production-compiler.js";
import {
  ROLLING_PLAN_DEFAULT_EPISODE_SECONDS,
  SEVEN_MINUTES_AHEAD_SERIES_ID,
} from "./v5-pack-constants.js";

function fail(
  issues: RollingPlanEpisodeProductionIssue[]
): RollingPlanEpisodeProductionResult {
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

function rollingEpisodeSpecRevisionId(
  episodeId: string,
  revisionNumber: number
): string {
  return `rev.rolling.episode-spec.${episodeId.toLowerCase()}.v${revisionNumber}`;
}

function rollingBeatPlanRevisionId(
  episodeId: string,
  revisionNumber: number
): string {
  return `rev.rolling.beat-plan.${episodeId.toLowerCase()}.v${revisionNumber}`;
}

function pendingScriptRevisionId(episodeId: string): string {
  return `rev.script.pending.${episodeId.toLowerCase()}`;
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
  boundary: EpisodeBoundaryContract,
  intention: PlanningIntention
): string {
  switch (category) {
    case "HOOK":
      return boundary.hook;
    case "ORIENTATION":
      return boundary.location;
    case "CONFLICT":
      return intention.audienceQuestion ?? boundary.openLoop;
    case "ESCALATION":
      return intention.objective;
    case "DISCOVERY":
      return boundary.newInformation;
    case "REVERSAL":
      return intention.audienceQuestion ?? boundary.openLoop;
    case "DECISION":
      return intention.objective;
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
      return "Advance action toward the episode's planned objective.";
    case "DISCOVERY":
      return "Deliver the episode's accepted new information.";
    case "REVERSAL":
      return "Reframe stakes using the accepted open loop.";
    case "DECISION":
      return "Commit to the consequence implied by the planning objective.";
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

function validateFutureEpisodeScope(
  revision: RollingPlanRevision,
  context: RollingPlanConstraintContext
): RollingPlanEpisodeProductionIssue[] {
  const issues: RollingPlanEpisodeProductionIssue[] = [];
  for (const intention of revision.payload.intentions) {
    const episodeNumber = parseCanonicalEpisodeNumber(intention.episodeId);
    if (episodeNumber === null) {
      continue;
    }
    if (episodeNumber <= context.lastAcceptedEpisodeNumber) {
      issues.push({
        code: "not_future_episode",
        message: `Rolling production compile only admits future episodes after E${String(context.lastAcceptedEpisodeNumber).padStart(3, "0")}.`,
        path: intention.episodeId,
      });
    }
  }
  return issues;
}

function validateCompiledBoundaryAlignment(
  boundary: EpisodeBoundaryContract,
  compiled: CompiledRollingEpisodeProduction
): RollingPlanEpisodeProductionIssue[] {
  const issues: RollingPlanEpisodeProductionIssue[] = [];
  if (compiled.episodeSpec.hook.canonicalIntent !== boundary.hook) {
    issues.push({
      code: "boundary_production_mismatch",
      message: `EpisodeSpec hook does not match admitted boundary for ${boundary.episodeId}`,
      path: `${boundary.episodeId}.episodeSpec.hook`,
    });
  }
  if (compiled.episodeSpec.cliffhanger.canonicalIntent !== boundary.cliffhangerBeat) {
    issues.push({
      code: "boundary_production_mismatch",
      message: `EpisodeSpec cliffhanger does not match admitted boundary for ${boundary.episodeId}`,
      path: `${boundary.episodeId}.episodeSpec.cliffhanger`,
    });
  }
  if (compiled.episodeSpec.forbiddenEvents.includes(FORBIDDEN_OPEN_LOOP_RESOLUTION)) {
    const cliffhangerBeat = compiled.beatPlan.beats.at(-1);
    if (cliffhangerBeat?.event !== boundary.cliffhangerBeat) {
      issues.push({
        code: "boundary_production_mismatch",
        message: `Cliffhanger beat must preserve open loop for ${boundary.episodeId}`,
        path: `${boundary.episodeId}.beatPlan.cliffhanger`,
      });
    }
  }
  return issues;
}

function compileRollingEpisodeSpec(args: {
  intention: PlanningIntention;
  boundary: EpisodeBoundaryContract;
  revision: RollingPlanRevision;
  priorBoundary?: EpisodeBoundaryContract;
  estimatedSeconds: number;
}): EpisodeSpecPayload {
  const { intention, boundary, revision, priorBoundary, estimatedSeconds } = args;
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
    enScriptRevisionId: narrativeRevisionIdSchema.parse(
      pendingScriptRevisionId(boundary.episodeId)
    ),
    parentSnapshotRevisionId: narrativeRevisionIdSchema.parse(
      revision.payload.anchoredSnapshotRevisionId
    ),
    objective: intention.objective,
    audienceQuestion: intention.audienceQuestion ?? boundary.openLoop,
    startingConditions: {
      location: boundary.location,
      cast: boundary.characters,
    },
    requiredEvents: [
      boundary.hook,
      boundary.newInformation,
      boundary.cliffhangerBeat,
      ...intention.requiredEvents,
      ...(priorBoundary?.nextOpeningObligation
        ? [priorBoundary.nextOpeningObligation]
        : []),
    ],
    forbiddenEvents: [
      ...intention.forbiddenEvents,
      FORBIDDEN_OPEN_LOOP_RESOLUTION,
    ],
    promiseMovements: intention.promiseMovements,
    revealPermissions: intention.revealPermissions,
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
      sourceKind: "planning",
      sourceRevisionIds: [
        revision.revisionId,
        revision.payload.anchoredSnapshotRevisionId,
        boundaryRevisionId(boundary.episodeId),
      ],
      notes: `Rolling-plan EpisodeSpec from ${revision.revisionId}`,
    },
  });
}

function compileRollingBeatPlan(args: {
  intention: PlanningIntention;
  boundary: EpisodeBoundaryContract;
  episodeSpec: EpisodeSpecPayload;
  revision: RollingPlanRevision;
  priorBoundary?: EpisodeBoundaryContract;
  estimatedSeconds: number;
}): BeatPlanPayload {
  const { intention, boundary, episodeSpec, revision, priorBoundary, estimatedSeconds } =
    args;

  const beats = BEAT_CATEGORIES.map((category: BeatCategory, order: number) => {
    const ratio = beatPlanPacingRatios[category];

    return {
      beatId: beatId(boundary.episodeId, category),
      order,
      category,
      purpose: beatPurposeForCategory(category),
      event: beatEventForCategory(category, boundary, intention),
      participants: boundary.characters,
      informationGain:
        category === "DISCOVERY" || category === "ESCALATION"
          ? boundary.newInformation
          : category === "CLIFFHANGER"
            ? boundary.cliffhangerBeat
            : intention.audienceQuestion ?? boundary.openLoop,
      knowledgeTransition:
        category === "DISCOVERY" ? boundary.newInformation : undefined,
      emotionTransition:
        category === "CLIFFHANGER" ? boundary.openLoop : undefined,
      promiseProgression:
        category === "ESCALATION" && intention.promiseMovements[0]
          ? intention.promiseMovements[0].progression
          : undefined,
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
      rollingEpisodeSpecRevisionId(boundary.episodeId, revision.revisionNumber)
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
      sourceKind: "planning",
      sourceRevisionIds: [
        rollingEpisodeSpecRevisionId(boundary.episodeId, revision.revisionNumber),
        revision.revisionId,
        revision.payload.anchoredSnapshotRevisionId,
      ],
      notes: `Rolling-plan BeatPlan from ${revision.revisionId}`,
    },
  });
}

export function compileRollingEpisodeProductionFromIntention(args: {
  intention: PlanningIntention;
  boundary: EpisodeBoundaryContract;
  revision: RollingPlanRevision;
  priorBoundary?: EpisodeBoundaryContract;
  estimatedSeconds?: number;
}): CompiledRollingEpisodeProduction {
  const estimatedSeconds =
    args.estimatedSeconds ?? ROLLING_PLAN_DEFAULT_EPISODE_SECONDS;
  const episodeSpec = compileRollingEpisodeSpec({
    ...args,
    estimatedSeconds,
  });
  const beatPlan = compileRollingBeatPlan({
    ...args,
    episodeSpec,
    estimatedSeconds,
  });

  return {
    episodeSpec,
    beatPlan,
    rollingPlanRevisionId: args.revision.revisionId,
    episodeSpecRevisionId: rollingEpisodeSpecRevisionId(
      args.boundary.episodeId,
      args.revision.revisionNumber
    ),
    beatPlanRevisionId: rollingBeatPlanRevisionId(
      args.boundary.episodeId,
      args.revision.revisionNumber
    ),
    boundaryRevisionId: boundaryRevisionId(args.boundary.episodeId),
    pendingScriptRevisionId: pendingScriptRevisionId(args.boundary.episodeId),
  };
}

export function compileRollingPlanEpisodeProduction(input: {
  revision: RollingPlanRevision;
  context: RollingPlanConstraintContext;
  compiledAt?: string;
  estimatedEpisodeSeconds?: number;
}): RollingPlanEpisodeProductionResult {
  if (input.revision.status !== "ACCEPTED") {
    return fail([
      {
        code: "revision_not_accepted",
        message: "Rolling-plan production compile requires an ACCEPTED revision.",
        path: "status",
      },
    ]);
  }

  const constraintResult = validateRollingPlanConstraints(
    input.revision,
    input.context
  );
  if (!constraintResult.ok) {
    return fail(mapRollingPlanIssues(constraintResult.issues));
  }

  const scopeIssues = validateFutureEpisodeScope(input.revision, input.context);
  if (scopeIssues.length > 0) {
    return fail(scopeIssues);
  }

  const boundaryByEpisode = new Map(
    input.context.acceptedEpisodeBoundaries.map((boundary) => [
      boundary.episodeId,
      boundary,
    ])
  );
  const records = [];
  const alignmentIssues: RollingPlanEpisodeProductionIssue[] = [];

  for (const intention of input.revision.payload.intentions) {
    const boundary = boundaryByEpisode.get(intention.episodeId);
    if (!boundary) {
      return fail([
        {
          code: "boundary_missing",
          message: `Missing admitted boundary for ${intention.episodeId}`,
          path: intention.episodeId,
        },
      ]);
    }

    const priorEpisodeNumber = boundary.episodeNumber - 1;
    const priorBoundary =
      priorEpisodeNumber >= 1
        ? boundaryByEpisode.get(`E${String(priorEpisodeNumber).padStart(3, "0")}`)
        : undefined;

    const compileInput: {
      intention: PlanningIntention;
      boundary: EpisodeBoundaryContract;
      revision: RollingPlanRevision;
      priorBoundary?: EpisodeBoundaryContract;
      estimatedSeconds?: number;
    } = {
      intention,
      boundary,
      revision: input.revision,
    };
    if (priorBoundary) {
      compileInput.priorBoundary = priorBoundary;
    }
    if (input.estimatedEpisodeSeconds !== undefined) {
      compileInput.estimatedSeconds = input.estimatedEpisodeSeconds;
    }

    let compiled: CompiledRollingEpisodeProduction;
    try {
      compiled = compileRollingEpisodeProductionFromIntention(compileInput);
    } catch (error) {
      return fail([
        {
          code: "production_compile_invalid",
          message:
            error instanceof Error
              ? error.message
              : `Failed to compile production for ${intention.episodeId}`,
          path: intention.episodeId,
        },
      ]);
    }

    alignmentIssues.push(...validateCompiledBoundaryAlignment(boundary, compiled));
    records.push({
      episodeId: intention.episodeId,
      rollingPlanRevisionId: input.revision.revisionId,
      episodeSpecRevisionId: compiled.episodeSpecRevisionId,
      beatPlanRevisionId: compiled.beatPlanRevisionId,
      boundaryRevisionId: compiled.boundaryRevisionId,
      pendingScriptRevisionId: compiled.pendingScriptRevisionId,
      episodeSpec: compiled.episodeSpec,
      beatPlan: compiled.beatPlan,
    });
  }

  if (alignmentIssues.length > 0) {
    return fail(alignmentIssues);
  }

  return {
    ok: true,
    bundle: {
      schemaVersion: "mediaforge.microdrama.rolling-plan.v1",
      rollingPlanRevisionId: input.revision.revisionId,
      anchoredSnapshotRevisionId: input.revision.payload.anchoredSnapshotRevisionId,
      compiledAt: input.compiledAt ?? new Date().toISOString(),
      records,
    },
  };
}

export function buildRollingPlanEpisodeProductionRevisionEnvelopes(
  compiled: CompiledRollingEpisodeProduction,
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
      narrativeRevisionIdSchema.parse(compiled.rollingPlanRevisionId),
      narrativeRevisionIdSchema.parse(compiled.boundaryRevisionId),
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
