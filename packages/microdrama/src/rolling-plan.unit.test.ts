import { describe, expect, it } from "vitest";

import {
  NARRATIVE_SCHEMA_VERSION,
  narrativePromiseIdSchema,
  narrativeRevisionIdSchema,
  narrativeSecretIdSchema,
  narrativeSnapshotIdSchema,
  seriesIdSchema,
  type NarrativeSnapshotPayload,
} from "@mediaforge/narrative-core";

import {
  compileRollingPlanFromFixture,
  buildRollingPlanRevision,
} from "./rolling-plan-planner.js";
import {
  expectedEpisodeRange,
  validateRollingPlanConstraints,
} from "./rolling-plan-constraints.js";
import {
  NEAR_HORIZON_DEFAULT_SIZE,
  parseCanonicalEpisodeNumber,
} from "./rolling-plan-contracts.js";
import type { EpisodeBoundaryContract } from "./v5-canon-admission-contracts.js";
import {
  MICRODRAMA_PLANNING_TASK_IDS,
  planningTaskForHorizon,
  topologicalSortMicrodramaPlanningTasks,
} from "./rolling-plan-workflow.js";
import { SEVEN_MINUTES_AHEAD_SERIES_ID } from "./v5-pack-constants.js";

const SNAPSHOT_REVISION_ID = narrativeRevisionIdSchema.parse(
  "rev.snapshot.season-1.e010"
);
const SNAPSHOT_ID = narrativeSnapshotIdSchema.parse("snapshot.season-1.e010");

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
      importedAt: "2026-08-12T00:00:00.000Z",
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
    characterStates: [
      {
        schemaVersion: NARRATIVE_SCHEMA_VERSION,
        characterId: "mara",
        goal: "Decode the signal",
        belief: "The loop is real",
        emotionalState: "anxious",
        injuriesAndStatus: [],
        provenanceRevisionIds: [],
      },
    ],
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
  acceptedEpisodeBoundaries: ["E009", "E010", "E011", "E012", "E100"].map(boundary),
  lastAcceptedEpisodeNumber: 10,
};

describe("rolling plan contracts and constraints", () => {
  it("produces bounded near-horizon plans linked to accepted snapshots", () => {
    const result = compileRollingPlanFromFixture({
      planningHorizon: "near_horizon",
      anchoredSnapshotRevisionId: SNAPSHOT_REVISION_ID,
      constraintContext,
      productionEpisodeId: "E011",
      nearHorizonSize: NEAR_HORIZON_DEFAULT_SIZE,
      createdAt: "2026-08-12T04:00:00.000Z",
      draftIntentions: [
        {
          episodeId: "E011",
          objective: "Escalate the packet mystery",
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

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.issues.map((issue) => issue.message).join("\n"));
    }
    expect(result.revision.payload.anchoredSnapshotRevisionId).toBe(
      SNAPSHOT_REVISION_ID
    );
    expect(result.revision.payload.episodeRange).toEqual({
      startEpisodeId: "E011",
      endEpisodeId: "E015",
    });
    expect(result.revision.payload.intentions).toHaveLength(2);
  });

  it("blocks planning that revises accepted canon episodes outside macro horizon", () => {
    const revision = buildRollingPlanRevision({
      planningHorizon: "near_horizon",
      anchoredSnapshotRevisionId: SNAPSHOT_REVISION_ID,
      constraintContext,
      productionEpisodeId: "E011",
      createdAt: "2026-08-12T04:00:00.000Z",
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

    const result = validateRollingPlanConstraints(revision, constraintContext);
    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected canon rewrite rejection");
    }
    expect(result.issues.some((issue) => issue.code === "canon_rewrite_forbidden")).toBe(
      true
    );
  });

  it("blocks season-boundary violations including implicit season-two episodes", () => {
    const revision = buildRollingPlanRevision({
      planningHorizon: "season_macro",
      anchoredSnapshotRevisionId: SNAPSHOT_REVISION_ID,
      constraintContext: {
        ...constraintContext,
        acceptedEpisodeBoundaries: [...constraintContext.acceptedEpisodeBoundaries, boundary("E101")],
      },
      productionEpisodeId: "E100",
      createdAt: "2026-08-12T04:00:00.000Z",
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

    const result = validateRollingPlanConstraints(revision, {
      ...constraintContext,
      acceptedEpisodeBoundaries: [...constraintContext.acceptedEpisodeBoundaries, boundary("E101")],
    });
    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected season boundary rejection");
    }
    expect(
      result.issues.some((issue) => issue.code === "season_boundary_exceeded")
    ).toBe(true);
  });

  it("blocks forbidden reveals and promise deadline violations", () => {
    const revision = buildRollingPlanRevision({
      planningHorizon: "current_episode",
      anchoredSnapshotRevisionId: SNAPSHOT_REVISION_ID,
      constraintContext,
      productionEpisodeId: "E035",
      createdAt: "2026-08-12T04:00:00.000Z",
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

    const result = validateRollingPlanConstraints(revision, {
      ...constraintContext,
      acceptedEpisodeBoundaries: [
        ...constraintContext.acceptedEpisodeBoundaries,
        boundary("E035"),
      ],
    });
    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected constraint rejection");
    }
    expect(
      result.issues.some((issue) => issue.code === "promise_deadline_violation")
    ).toBe(true);
    expect(result.issues.some((issue) => issue.code === "forbidden_reveal")).toBe(true);
  });

  it("orders provider-free planning workflow tasks deterministically", () => {
    const ordered = topologicalSortMicrodramaPlanningTasks([
      planningTaskForHorizon("current_episode"),
      planningTaskForHorizon("near_horizon"),
      "microdrama.planning.anchor-snapshot",
      "microdrama.planning.validate-constraints",
    ]);
    expect(ordered).toEqual([
      "microdrama.planning.anchor-snapshot",
      "microdrama.planning.validate-constraints",
      "microdrama.planning.compile-current-episode",
      "microdrama.planning.compile-near-horizon",
    ]);
    expect(MICRODRAMA_PLANNING_TASK_IDS.length).toBeGreaterThan(0);
    expect(expectedEpisodeRange("near_horizon", 11, 5)).toEqual({
      start: 11,
      end: 15,
    });
  });
});
