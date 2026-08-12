import type {
  NarrativePromisePayload,
  NarrativeSecretPayload,
  NarrativeSnapshotPayload,
} from "@mediaforge/narrative-core";

import type { EpisodeBoundaryContract } from "./v5-canon-admission-contracts.js";
import {
  NEAR_HORIZON_DEFAULT_SIZE,
  NEAR_HORIZON_MAX_SIZE,
  parseCanonicalEpisodeNumber,
  SEASON_1_EPISODE_COUNT,
  type PlanningHorizon,
  type PlanningIntention,
  type RollingPlanIssue,
  type RollingPlanPayload,
  type RollingPlanRevision,
  type RollingPlanValidationResult,
} from "./rolling-plan-contracts.js";

export type RollingPlanConstraintContext = {
  readonly acceptedSnapshot: NarrativeSnapshotPayload;
  readonly acceptedEpisodeBoundaries: readonly EpisodeBoundaryContract[];
  readonly lastAcceptedEpisodeNumber: number;
};

function issue(
  code: RollingPlanIssue["code"],
  message: string,
  path?: string
): RollingPlanIssue {
  return path === undefined ? { code, message } : { code, message, path };
}

function episodeInSeasonOne(episodeId: string): RollingPlanIssue | null {
  const episodeNumber = parseCanonicalEpisodeNumber(episodeId);
  if (episodeNumber === null) {
    return issue("invalid_episode_id", `Episode id ${episodeId} is not canonical.`, episodeId);
  }
  if (episodeNumber < 1 || episodeNumber > SEASON_1_EPISODE_COUNT) {
    return issue(
      "season_boundary_exceeded",
      `Episode ${episodeId} is outside Season 1 (E001-E100).`,
      episodeId
    );
  }
  return null;
}

function resolveNearHorizonSize(payload: RollingPlanPayload): number {
  return payload.nearHorizonSize ?? NEAR_HORIZON_DEFAULT_SIZE;
}

export function expectedEpisodeRange(
  horizon: PlanningHorizon,
  productionEpisodeNumber: number,
  nearHorizonSize: number
): { start: number; end: number } {
  switch (horizon) {
    case "season_macro":
      return { start: 1, end: SEASON_1_EPISODE_COUNT };
    case "story_arc": {
      const arcStart = Math.max(1, productionEpisodeNumber - 2);
      const arcEnd = Math.min(SEASON_1_EPISODE_COUNT, productionEpisodeNumber + 5);
      return { start: arcStart, end: arcEnd };
    }
    case "near_horizon": {
      const end = Math.min(
        SEASON_1_EPISODE_COUNT,
        productionEpisodeNumber + nearHorizonSize - 1
      );
      return { start: productionEpisodeNumber, end };
    }
    case "current_episode":
      return { start: productionEpisodeNumber, end: productionEpisodeNumber };
  }
}

function validateHorizonRange(
  payload: RollingPlanPayload
): RollingPlanIssue[] {
  const issues: RollingPlanIssue[] = [];
  const productionNumber = parseCanonicalEpisodeNumber(payload.productionEpisodeId);
  const rangeStart = parseCanonicalEpisodeNumber(payload.episodeRange.startEpisodeId);
  const rangeEnd = parseCanonicalEpisodeNumber(payload.episodeRange.endEpisodeId);

  if (productionNumber === null || rangeStart === null || rangeEnd === null) {
    issues.push(
      issue("invalid_episode_id", "Planning range uses non-canonical episode ids.")
    );
    return issues;
  }

  const nearSize = resolveNearHorizonSize(payload);
  if (nearSize > NEAR_HORIZON_MAX_SIZE) {
    issues.push(
      issue(
        "horizon_size_exceeded",
        `Near horizon size ${nearSize} exceeds max ${NEAR_HORIZON_MAX_SIZE}.`
      )
    );
  }

  const expected = expectedEpisodeRange(
    payload.planningHorizon,
    productionNumber,
    nearSize
  );
  if (rangeStart !== expected.start || rangeEnd !== expected.end) {
    issues.push(
      issue(
        "horizon_range_invalid",
        `Horizon ${payload.planningHorizon} requires E${String(expected.start).padStart(3, "0")}-E${String(expected.end).padStart(3, "0")}, received ${payload.episodeRange.startEpisodeId}-${payload.episodeRange.endEpisodeId}.`
      )
    );
  }

  if (payload.planningHorizon === "current_episode" && payload.intentions.length !== 1) {
    issues.push(
      issue(
        "production_scope_violation",
        "Current-episode planning must contain exactly one intention.",
        "intentions"
      )
    );
  }

  return issues;
}

function validateSnapshotAnchor(
  payload: RollingPlanPayload,
  context: RollingPlanConstraintContext
): RollingPlanIssue[] {
  const issues: RollingPlanIssue[] = [];
  if (payload.anchoredSnapshotId !== context.acceptedSnapshot.snapshotId) {
    issues.push(
      issue(
        "snapshot_anchor_missing",
        "Planning revision must anchor to the accepted snapshot identity.",
        "anchoredSnapshotId"
      )
    );
  }
  if (
    !payload.provenance.sourceRevisionIds.includes(payload.anchoredSnapshotRevisionId)
  ) {
    issues.push(
      issue(
        "snapshot_anchor_missing",
        "Planning provenance must include the anchored snapshot revision id.",
        "provenance.sourceRevisionIds"
      )
    );
  }
  return issues;
}

function validateNoCanonRewrite(
  payload: RollingPlanPayload,
  context: RollingPlanConstraintContext
): RollingPlanIssue[] {
  const issues: RollingPlanIssue[] = [];
  for (const intention of payload.intentions) {
    const episodeNumber = parseCanonicalEpisodeNumber(intention.episodeId);
    if (episodeNumber === null) {
      continue;
    }
    if (
      episodeNumber < context.lastAcceptedEpisodeNumber &&
      payload.planningHorizon !== "season_macro"
    ) {
      issues.push(
        issue(
          "canon_rewrite_forbidden",
          `Horizon ${payload.planningHorizon} cannot replan accepted episode ${intention.episodeId}.`,
          intention.episodeId
        )
      );
    }
    const boundary = context.acceptedEpisodeBoundaries.find(
      (entry) => entry.episodeId === intention.episodeId
    );
    if (!boundary) {
      issues.push(
        issue(
          "invalid_episode_id",
          `No accepted boundary exists for ${intention.episodeId}.`,
          intention.episodeId
        )
      );
    }
  }
  return issues;
}

function validatePromiseDeadlines(
  intentions: readonly PlanningIntention[],
  promises: readonly NarrativePromisePayload[]
): RollingPlanIssue[] {
  const issues: RollingPlanIssue[] = [];
  for (const intention of intentions) {
    const episodeNumber = parseCanonicalEpisodeNumber(intention.episodeId);
    if (episodeNumber === null) {
      continue;
    }
    for (const movement of intention.promiseMovements) {
      const promise = promises.find((entry) => entry.promiseId === movement.promiseId);
      if (!promise) {
        issues.push(
          issue(
            "promise_deadline_violation",
            `Unknown promise ${movement.promiseId} referenced by ${intention.episodeId}.`,
            intention.episodeId
          )
        );
        continue;
      }
      const payoffEnd = parseCanonicalEpisodeNumber(promise.payoffWindowEndEpisodeId);
      if (payoffEnd !== null && episodeNumber > payoffEnd && promise.status === "open") {
        issues.push(
          issue(
            "promise_deadline_violation",
            `Episode ${intention.episodeId} moves open promise ${movement.promiseId} past payoff window ending ${promise.payoffWindowEndEpisodeId}.`,
            intention.episodeId
          )
        );
      }
    }
  }
  return issues;
}

function validateRevealPermissions(
  intentions: readonly PlanningIntention[],
  secrets: readonly NarrativeSecretPayload[]
): RollingPlanIssue[] {
  const issues: RollingPlanIssue[] = [];
  for (const intention of intentions) {
    for (const permission of intention.revealPermissions) {
      if (!permission.allowed) {
        continue;
      }
      const secret = secrets.find((entry) => entry.secretId === permission.secretId);
      if (!secret) {
        issues.push(
          issue(
            "forbidden_reveal",
            `Unknown secret ${permission.secretId} referenced by ${intention.episodeId}.`,
            intention.episodeId
          )
        );
        continue;
      }
      if (secret.revealStatus === "hidden" && secret.revealConstraints.length > 0) {
        const blocked = secret.revealConstraints.some((constraint) =>
          constraint.toLowerCase().includes("forbidden")
        );
        if (blocked) {
          issues.push(
            issue(
              "forbidden_reveal",
              `Reveal permission for ${permission.secretId} violates accepted reveal constraints.`,
              intention.episodeId
            )
          );
        }
      }
    }
  }
  return issues;
}

export function validateRollingPlanConstraints(
  revision: RollingPlanRevision,
  context: RollingPlanConstraintContext
): RollingPlanValidationResult {
  const issues: RollingPlanIssue[] = [];
  const payload = revision.payload;

  for (const episodeId of [
    payload.productionEpisodeId,
    payload.episodeRange.startEpisodeId,
    payload.episodeRange.endEpisodeId,
    ...payload.intentions.map((intention) => intention.episodeId),
  ]) {
    const seasonIssue = episodeInSeasonOne(episodeId);
    if (seasonIssue) {
      issues.push(seasonIssue);
    }
  }

  issues.push(...validateHorizonRange(payload));
  issues.push(...validateSnapshotAnchor(payload, context));
  issues.push(...validateNoCanonRewrite(payload, context));
  issues.push(
    ...validatePromiseDeadlines(payload.intentions, context.acceptedSnapshot.promises)
  );
  issues.push(
    ...validateRevealPermissions(payload.intentions, context.acceptedSnapshot.secrets)
  );

  if (issues.length > 0) {
    return { ok: false, issues };
  }
  return { ok: true, revision };
}
