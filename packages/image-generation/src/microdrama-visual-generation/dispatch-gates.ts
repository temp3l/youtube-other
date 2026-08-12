import {
  type VisualAssetRegistryReadPort,
  type VisualRegistryRevisionEnvelope,
} from "@mediaforge/domain";
import { assertSourceImagePromptIsLanguageNeutral } from "@mediaforge/visual-planning";

import { resolveShotVisualContinuity } from "../visual-asset-continuity.js";
import {
  type MicrodramaVisualDispatchDecision,
  type MicrodramaVisualGenerationRequest,
} from "./contracts.js";

export function evaluateMicrodramaVisualDispatch(input: {
  readonly request: MicrodramaVisualGenerationRequest;
  readonly sceneShotPlanApproved: boolean;
  readonly registry: VisualAssetRegistryReadPort;
  readonly seenRequestIds?: ReadonlySet<string>;
}): MicrodramaVisualDispatchDecision {
  const issues: NonNullable<
    Extract<MicrodramaVisualDispatchDecision, { approved: false }>["issues"]
  > = [];

  if (input.seenRequestIds?.has(input.request.requestId)) {
    issues.push({
      code: "duplicate_request_id",
      message: `Duplicate visual generation request id: ${input.request.requestId}`,
    });
  }

  if (!input.sceneShotPlanApproved) {
    issues.push({
      code: "scene_shot_plan_not_approved",
      message: `Scene/shot plan ${input.request.sceneShotPlanRevisionId} is not approved for generation.`,
    });
  }

  try {
    assertSourceImagePromptIsLanguageNeutral(input.request.promptText);
  } catch (error: unknown) {
    issues.push({
      code: "localized_readable_text_in_prompt",
      message:
        error instanceof Error
          ? error.message
          : "Localized readable text cannot enter generated source-image prompts.",
    });
  }

  const continuity = resolveShotVisualContinuity({
    seriesId: input.request.seriesId,
    references: input.request.registryReferences,
    registry: input.registry,
  });
  if (!continuity.ok) {
    for (const issue of continuity.issues) {
      issues.push({
        code: "registry_continuity_failed",
        message: issue.message,
      });
    }
  }

  if (issues.length > 0) {
    return { approved: false, issues };
  }
  return { approved: true };
}

export function collectRegistryRevisionFingerprints(input: {
  readonly registry: VisualAssetRegistryReadPort;
  readonly references: MicrodramaVisualGenerationRequest["registryReferences"];
}): readonly VisualRegistryRevisionEnvelope[] {
  return input.references
    .map((reference) => input.registry.getRevision(reference.revisionId))
    .filter((revision): revision is VisualRegistryRevisionEnvelope => revision !== null);
}
