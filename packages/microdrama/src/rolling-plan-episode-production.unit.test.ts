import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  BEAT_CATEGORIES,
  NARRATIVE_SCHEMA_VERSION,
  narrativePromiseIdSchema,
  narrativeRevisionIdSchema,
  narrativeSecretIdSchema,
  narrativeSnapshotIdSchema,
  parseBeatPlanPayload,
  parseEpisodeSpecPayload,
  seriesIdSchema,
  type NarrativeSnapshotPayload,
} from "@mediaforge/narrative-core";

import {
  resolveMicrodramaRollingPlanLineage,
  rollingPlanLineageUsesRevisionIdsOnly,
} from "../../story-localization/src/microdrama-script-lineage.js";

import { buildRollingPlanRevision } from "./rolling-plan-planner.js";
import { compileRollingPlanEpisodeProduction } from "./rolling-plan-episode-production-compiler.js";
import { FORBIDDEN_OPEN_LOOP_RESOLUTION } from "./v5-episode-production-compiler.js";
import { validateRollingPlanConstraints } from "./rolling-plan-constraints.js";
import { parseCanonicalEpisodeNumber } from "./rolling-plan-contracts.js";
import {
  compileEpisodeProductionFromBoundary,
  compileV5CanonAdmission,
  compileV5EpisodeProduction,
} from "./index.js";
import type { EpisodeBoundaryContract } from "./v5-canon-admission-contracts.js";
import { SEVEN_MINUTES_AHEAD_SERIES_ID } from "./v5-pack-constants.js";

const SNAPSHOT_REVISION_ID = narrativeRevisionIdSchema.parse(
  "rev.snapshot.season-1.e010"
);
const SNAPSHOT_ID = narrativeSnapshotIdSchema.parse("snapshot.season-1.e010");
const COMPILED_AT = "2026-08-12T05:00:00.000Z";
const V5_PACK_ROOT = path.resolve(
  import.meta.dirname,
  "../../../content-packs/seven-minutes-ahead-content-pack-v5-remediated"
);

function boundary(episodeId: string): EpisodeBoundaryContract {
  const episodeNumber = parseCanonicalEpisodeNumber(episodeId) ?? 1;
  return {
    schemaVersion: "mediaforge.microdrama-pack.v1",
    episodeId,
    episodeNumber,
    arcId: "arc-1",
    arcName: "Signal",
    title: `Episode ${episodeNumber}`,
    newInformation: "New signal detail",
    openLoop: "Who sent the packet?",
    hook: "A message arrives before it was sent.",
    cliffhangerBeat: "The timestamp is from tomorrow.",
    characters: ["mara"],
    location: "apartment",
    provenance: {
      sourceKind: "import",
      sourcePackVersion: "v5-remediated",
      sourceRelativePath: `shared/episodes/${episodeId}.md`,
      sourceArtifactHash: "a".repeat(64),
      importedAt: COMPILED_AT,
    },
  };
}

function acceptedSnapshot(): NarrativeSnapshotPayload {
  return {
    schemaVersion: NARRATIVE_SCHEMA_VERSION,
    snapshotId: SNAPSHOT_ID,
    seriesId: seriesIdSchema.parse(SEVEN_MINUTES_AHEAD_SERIES_ID),
    episodeId: "episode.e010",
    acceptedSeriesBibleRevisionId: narrativeRevisionIdSchema.parse(
      "rev.series-bible.v5-remediated"
    ),
    characterStates: [],
    relationshipStates: [],
    secrets: [
      {
        schemaVersion: NARRATIVE_SCHEMA_VERSION,
        secretId: narrativeSecretIdSchema.parse("secret.signal-origin"),
        objectiveFact: "The signal originates outside the loop",
        holderCharacterIds: ["mara"],
        affectedCharacterIds: ["mara"],
        audienceKnowledge: "unknown",
        revealConstraints: ["forbidden before E050"],
        revealStatus: "hidden",
        revealProvenanceRevisionIds: [],
      },
    ],
    knowledgeClaims: [],
    promises: [
      {
        schemaVersion: NARRATIVE_SCHEMA_VERSION,
        promiseId: narrativePromiseIdSchema.parse("promise.packet-truth"),
        description: "Reveal who sent the packet",
        plantedEpisodeId: "episode.e001",
        payoffWindowStartEpisodeId: "episode.e020",
        payoffWindowEndEpisodeId: "episode.e030",
        progression: "Escalate suspicion",
        status: "open",
      },
    ],
    provenance: {
      sourceKind: "acceptance",
      sourceRevisionIds: [SNAPSHOT_REVISION_ID],
    },
  };
}

const constraintContext = {
  acceptedSnapshot: acceptedSnapshot(),
  acceptedEpisodeBoundaries: ["E009", "E010", "E011", "E012", "E015"].map(boundary),
  lastAcceptedEpisodeNumber: 10,
};

function acceptedNearHorizonRevision() {
  return buildRollingPlanRevision({
    planningHorizon: "near_horizon",
    anchoredSnapshotRevisionId: SNAPSHOT_REVISION_ID,
    constraintContext,
    productionEpisodeId: "E011",
    createdAt: COMPILED_AT,
    revisionNumber: 2,
    parentRevisionIds: [SNAPSHOT_REVISION_ID],
    draftIntentions: [
      {
        episodeId: "E011",
        objective: "Escalate the packet mystery",
        audienceQuestion: "Who forged the timestamp?",
        promiseMovements: [
          {
            promiseId: narrativePromiseIdSchema.parse("promise.packet-truth"),
            progression: "Introduce contradictory evidence",
          },
        ],
        revealPermissions: [],
        requiredEvents: ["packet-analysis"],
        forbiddenEvents: ["full-reveal"],
      },
      {
        episodeId: "E012",
        objective: "Pressure trust between leads",
        promiseMovements: [],
        revealPermissions: [],
        requiredEvents: ["confrontation"],
        forbiddenEvents: [],
      },
    ],
  });
}

describe("rolling plan EpisodeSpec and BeatPlan compiler", () => {
  it("compiles accepted future revisions through production contracts", () => {
    const revision = {
      ...acceptedNearHorizonRevision(),
      status: "ACCEPTED" as const,
    };

    const result = compileRollingPlanEpisodeProduction({
      revision,
      context: constraintContext,
      compiledAt: COMPILED_AT,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.issues.map((issue) => issue.message).join("\n"));
    }

    expect(result.bundle.records).toHaveLength(2);
    for (const record of result.bundle.records) {
      parseEpisodeSpecPayload(record.episodeSpec);
      parseBeatPlanPayload(record.beatPlan);
      expect(record.episodeSpec.provenance.sourceKind).toBe("planning");
      expect(record.beatPlan.provenance.sourceKind).toBe("planning");
      expect(record.episodeSpec.parentSnapshotRevisionId).toBe(SNAPSHOT_REVISION_ID);
      expect(record.episodeSpec.forbiddenEvents).toContain(
        FORBIDDEN_OPEN_LOOP_RESOLUTION
      );
      expect(record.beatPlan.beats.map((beat) => beat.category)).toEqual([
        ...BEAT_CATEGORIES,
      ]);
    }

    const e011 = result.bundle.records.find((record) => record.episodeId === "E011");
    expect(e011?.episodeSpecRevisionId).toBe("rev.rolling.episode-spec.e011.v2");
    expect(e011?.pendingScriptRevisionId).toBe("rev.script.pending.e011");
    expect(e011?.episodeSpec.promiseMovements).toHaveLength(1);
  });

  it("resolves canon-bound future lineage from revision IDs only", () => {
    const revision = {
      ...acceptedNearHorizonRevision(),
      status: "ACCEPTED" as const,
    };
    const result = compileRollingPlanEpisodeProduction({
      revision,
      context: constraintContext,
      compiledAt: COMPILED_AT,
    });
    if (!result.ok) {
      throw new Error("expected successful compile");
    }

    const record = result.bundle.records.find((entry) => entry.episodeId === "E011");
    expect(record).toBeTruthy();

    const lineage = resolveMicrodramaRollingPlanLineage({
      episodeId: record!.episodeId,
      rollingPlanRevisionId: record!.rollingPlanRevisionId,
      episodeSpecRevisionId: record!.episodeSpecRevisionId,
      beatPlanRevisionId: record!.beatPlanRevisionId,
      boundaryRevisionId: record!.boundaryRevisionId,
      pendingScriptRevisionId: record!.pendingScriptRevisionId,
      episodeSpec: record!.episodeSpec,
      beatPlan: record!.beatPlan,
    });

    expect(lineage.proseAuthority).toBe("pending_script");
    expect(lineage.rollingPlanRevisionId).toContain("rev.rolling-plan.");
    expect(rollingPlanLineageUsesRevisionIdsOnly(lineage)).toBe(true);
    expect(JSON.stringify(lineage)).not.toContain("Escalate the packet mystery");
  });

  it("rejects non-accepted revisions and canon, promise, and season violations", () => {
    const validatedOnly = acceptedNearHorizonRevision();
    expect(validatedOnly.status).toBe("VALIDATED");
    const notAccepted = compileRollingPlanEpisodeProduction({
      revision: validatedOnly,
      context: constraintContext,
      compiledAt: COMPILED_AT,
    });
    expect(notAccepted.ok).toBe(false);
    if (notAccepted.ok) {
      throw new Error("expected non-accepted rejection");
    }
    expect(notAccepted.issues.some((issue) => issue.code === "revision_not_accepted")).toBe(
      true
    );

    const canonRewrite = buildRollingPlanRevision({
      planningHorizon: "near_horizon",
      anchoredSnapshotRevisionId: SNAPSHOT_REVISION_ID,
      constraintContext,
      productionEpisodeId: "E011",
      createdAt: COMPILED_AT,
      draftIntentions: [
        {
          episodeId: "E009",
          objective: "Rewrite accepted episode",
          promiseMovements: [],
          revealPermissions: [],
          requiredEvents: [],
          forbiddenEvents: [],
        },
      ],
    });
    const canonResult = compileRollingPlanEpisodeProduction({
      revision: { ...canonRewrite, status: "ACCEPTED" },
      context: constraintContext,
      compiledAt: COMPILED_AT,
    });
    expect(canonResult.ok).toBe(false);
    if (canonResult.ok) {
      throw new Error("expected canon rewrite rejection");
    }
    expect(
      canonResult.issues.some((issue) => issue.code === "canon_rewrite_forbidden")
    ).toBe(true);

    const promiseViolation = buildRollingPlanRevision({
      planningHorizon: "current_episode",
      anchoredSnapshotRevisionId: SNAPSHOT_REVISION_ID,
      constraintContext,
      productionEpisodeId: "E035",
      createdAt: COMPILED_AT,
      draftIntentions: [
        {
          episodeId: "E035",
          objective: "Force impossible promise resolution",
          promiseMovements: [
            {
              promiseId: narrativePromiseIdSchema.parse("promise.packet-truth"),
              progression: "Resolve after deadline",
            },
          ],
          revealPermissions: [
            {
              secretId: narrativeSecretIdSchema.parse("secret.signal-origin"),
              allowed: true,
              rationale: "Too early reveal",
            },
          ],
          requiredEvents: [],
          forbiddenEvents: [],
        },
      ],
    });
    const promiseResult = compileRollingPlanEpisodeProduction({
      revision: { ...promiseViolation, status: "ACCEPTED" },
      context: {
        ...constraintContext,
        acceptedEpisodeBoundaries: [
          ...constraintContext.acceptedEpisodeBoundaries,
          boundary("E035"),
        ],
      },
      compiledAt: COMPILED_AT,
    });
    expect(promiseResult.ok).toBe(false);
    if (promiseResult.ok) {
      throw new Error("expected promise/reveal rejection");
    }
    expect(
      promiseResult.issues.some((issue) => issue.code === "promise_deadline_violation")
    ).toBe(true);
    expect(promiseResult.issues.some((issue) => issue.code === "forbidden_reveal")).toBe(
      true
    );

    const seasonViolation = buildRollingPlanRevision({
      planningHorizon: "season_macro",
      anchoredSnapshotRevisionId: SNAPSHOT_REVISION_ID,
      constraintContext: {
        ...constraintContext,
        acceptedEpisodeBoundaries: [
          ...constraintContext.acceptedEpisodeBoundaries,
          boundary("E101"),
        ],
      },
      productionEpisodeId: "E100",
      createdAt: COMPILED_AT,
      draftIntentions: [
        {
          episodeId: "E101",
          objective: "Season 2 opener",
          promiseMovements: [],
          revealPermissions: [],
          requiredEvents: [],
          forbiddenEvents: [],
        },
      ],
    });
    const seasonResult = compileRollingPlanEpisodeProduction({
      revision: { ...seasonViolation, status: "ACCEPTED" },
      context: {
        ...constraintContext,
        acceptedEpisodeBoundaries: [
          ...constraintContext.acceptedEpisodeBoundaries,
          boundary("E101"),
        ],
      },
      compiledAt: COMPILED_AT,
    });
    expect(seasonResult.ok).toBe(false);
    if (seasonResult.ok) {
      throw new Error("expected season boundary rejection");
    }
    expect(
      seasonResult.issues.some((issue) => issue.code === "season_boundary_exceeded")
    ).toBe(true);
  });

  it("leaves imported V5 production compilation on the separate import path", () => {
    const constraintOnly = validateRollingPlanConstraints(
      acceptedNearHorizonRevision(),
      constraintContext
    );
    expect(constraintOnly.ok).toBe(true);

    const compiled = compileEpisodeProductionFromBoundary({
      boundary: boundary("E011"),
      enScript: {
        schemaVersion: "mediaforge.microdrama-pack.v1",
        episodeId: "E011",
        locale: "en-US",
        sourceLocaleAlias: "en",
        scriptRelativePath: "languages/en/episodes/e011.md",
        contentHash: "c".repeat(64),
        manifestEntry: {
          episode: 11,
          id: "E011",
          arc: "1",
          arc_name: "Arc",
          title: "Title",
          hook: "A message arrives before it was sent.",
          cliffhanger_beat: "The timestamp is from tomorrow.",
          characters: "mara",
          location: "apartment",
          locale: "en-US",
          wpm: 155,
          word_count: 154,
          estimated_seconds: 59.6,
          timing_gate: "PASS",
          editorial_score: 9.7,
          editorial_gate: "PASS",
          source_authority: "EN-v5",
        },
        provenance: {
          sourceKind: "import",
          sourcePackVersion: "v5-remediated",
          sourceRelativePath: "languages/en/episodes/e011.md",
          sourceArtifactHash: "c".repeat(64),
          importedAt: COMPILED_AT,
        },
        importStatus: "IMPORTED_APPROVED_LOCALIZED_SCRIPT",
        scriptRevisionId: "rev.script.en-us.e011",
      },
      priorBoundary: boundary("E010"),
    });

    expect(compiled.episodeSpecRevisionId).toBe("rev.episode-spec.e011");
    expect(compiled.episodeSpec.provenance.sourceKind).toBe("import");
    expect(compiled.beatPlan.provenance.sourceKind).toBe("import");
    expect(compiled.episodeSpec.parentSnapshotRevisionId).toBeUndefined();

    const admission = compileV5CanonAdmission(V5_PACK_ROOT, COMPILED_AT);
    if (admission.ok) {
      const production = compileV5EpisodeProduction(admission.bundle, COMPILED_AT);
      expect(production.ok).toBe(true);
    }
  });
});
