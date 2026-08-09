import {
  compareRevisionAnalytics,
  type RevisionAnalyticsComparison,
} from "@mediaforge/domain";
import {
  PostgresRevisionAnalyticsRepository,
} from "@mediaforge/persistence";

import type { AuthenticatedPrincipal } from "@mediaforge/application";
import type { RevisionAnalyticsComparisonRequest } from "./revision-analytics-comparison-contract.js";

export function createRevisionAnalyticsComparisonUseCase(input: {
  readonly analytics: Pick<PostgresRevisionAnalyticsRepository, "listForComparison" | "appendComparison">;
}): {
  compare(request: RevisionAnalyticsComparisonRequest, context: {
    readonly workspaceId: string;
    readonly principal: AuthenticatedPrincipal;
    readonly idempotencyKey: string;
  }): Promise<{
    readonly comparison: RevisionAnalyticsComparison;
    readonly replayed: boolean;
    readonly reused: boolean;
  }>;
} {
  return {
    async compare(request, context) {
      if (
        context.principal.workspaceId !== context.workspaceId ||
        !context.principal.permissions.includes("content.write") ||
        context.idempotencyKey.trim().length === 0
      ) throw new Error("REVISION_ANALYTICS_COMPARISON_AUTHORIZATION_REQUIRED");
      const observations = await input.analytics.listForComparison({
        workspaceId: context.workspaceId,
        contentProfileId: request.contentProfileId,
        episodeId: request.episodeId,
        observationIds: request.cohorts.map((cohort) => cohort.observationId),
      });
      const byId = new Map(observations.map((observation) => [observation.observationId, observation]));
      const planned = compareRevisionAnalytics({
        contentProfileId: request.contentProfileId,
        episodeId: request.episodeId,
        metric: request.metric,
        comparisonDimensions: request.comparisonDimensions,
        cohorts: request.cohorts.map((cohort) => {
          const observation = byId.get(cohort.observationId);
          if (!observation) throw new Error("REVISION_ANALYTICS_COMPARISON_OBSERVATION_MISSING");
          return { observation, format: cohort.format };
        }),
        effectiveConfigurationHash: request.effectiveConfigurationHash,
        dependencyIdentity: request.dependencyIdentity,
      });
      return input.analytics.appendComparison({
        workspaceId: context.workspaceId,
        idempotencyKey: context.idempotencyKey,
        comparison: planned.comparison,
      });
    },
  };
}
