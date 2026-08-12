import type { V5CanonAdmissionBundle } from "./v5-canon-admission-contracts.js";
import type { V5EpisodeProductionRecord } from "./v5-episode-production-contracts.js";
import {
  STORY_QA_SCHEMA_VERSION,
  storyApprovedEvidenceSchema,
  type SemanticStoryQaAdapter,
  type SemanticStoryQaAdapterResult,
  type StoryApprovedEvidence,
  type StoryQaIssue,
  type V5StoryDeterministicQaResult,
} from "./v5-story-qa-contracts.js";
import { validateV5StoryDeterministicQa } from "./v5-story-qa.js";

export type StoryApprovalRequest = {
  readonly canonBundle: V5CanonAdmissionBundle;
  readonly productionRecord: V5EpisodeProductionRecord;
  readonly locale: string;
  readonly scriptRevisionId: string;
  readonly approvedAt: string;
  readonly forceBypass?: boolean;
  readonly retryWithoutRevisionChange?: boolean;
};

export type StoryApprovalResult =
  | { ok: true; evidence: StoryApprovedEvidence; advisoryIssues: StoryQaIssue[] }
  | { ok: false; issues: StoryQaIssue[] };

export async function evaluateOptionalSemanticStoryQa(
  adapter: SemanticStoryQaAdapter | undefined,
  input: {
    episodeId: string;
    locale: string;
    hookSemanticId: string;
    cliffhangerSemanticId: string;
    mandatory: boolean;
  }
): Promise<{ issues: StoryQaIssue[]; result?: SemanticStoryQaAdapterResult }> {
  if (!adapter) {
    if (input.mandatory) {
      return {
        issues: [
          {
            code: "semantic_qa_failed",
            message: "Mandatory semantic QA adapter is unavailable",
            episodeId: input.episodeId,
            locale: input.locale,
            blocking: true,
          },
        ],
      };
    }
    return { issues: [] };
  }

  const result = await adapter({
    episodeId: input.episodeId,
    locale: input.locale,
    hookSemanticId: input.hookSemanticId,
    cliffhangerSemanticId: input.cliffhangerSemanticId,
  });

  if (result.status === "PASS" || result.status === "ADVISORY") {
    return {
      issues: [],
      result,
    };
  }
  if (result.status === "UNAVAILABLE") {
    return {
      issues: input.mandatory
        ? [
            {
              code: "semantic_qa_failed",
              message: result.message,
              episodeId: input.episodeId,
              locale: input.locale,
              blocking: true,
            },
          ]
        : [],
      result,
    };
  }

  return {
    issues: [
      {
        code: "semantic_qa_failed",
        message: result.message,
        episodeId: input.episodeId,
        locale: input.locale,
        blocking: true,
      },
    ],
    result,
  };
}

export function assertDeterministicStoryQaPassed(
  qa: V5StoryDeterministicQaResult
): void {
  if (!qa.ok) {
    throw new Error(
      qa.issues
        .filter((issue) => issue.blocking)
        .map((issue) => issue.message)
        .join("\n")
    );
  }
}

export async function grantStoryApprovedEvidence(
  request: StoryApprovalRequest,
  options: {
    deterministicQa: V5StoryDeterministicQaResult;
    semanticAdapter?: SemanticStoryQaAdapter;
    mandatorySemanticQa?: boolean;
  }
): Promise<StoryApprovalResult> {
  const issues: StoryQaIssue[] = [];

  if (request.forceBypass || request.retryWithoutRevisionChange) {
    issues.push({
      code: "approval_force_bypass_forbidden",
      message: "STORY_APPROVED cannot be granted via force or retry without revision change",
      episodeId: request.productionRecord.episodeId,
      locale: request.locale,
      blocking: true,
    });
    return { ok: false, issues };
  }

  if (!options.deterministicQa.ok) {
    return { ok: false, issues: options.deterministicQa.issues };
  }

  const record = request.productionRecord;
  const admittedScript = request.canonBundle.admittedScripts.find(
    (script) =>
      script.episodeId === record.episodeId && script.locale === request.locale
  );
  if (!admittedScript) {
    issues.push({
      code: "approval_revision_mismatch",
      message: `No admitted script for ${record.episodeId} ${request.locale}`,
      episodeId: record.episodeId,
      locale: request.locale,
      blocking: true,
    });
    return { ok: false, issues };
  }
  if (admittedScript.scriptRevisionId !== request.scriptRevisionId) {
    issues.push({
      code: "approval_revision_mismatch",
      message: "Script revision id does not match approval request",
      episodeId: record.episodeId,
      locale: request.locale,
      blocking: true,
    });
    return { ok: false, issues };
  }
  if (
    request.locale === "en-US" &&
    record.enScriptRevisionId !== request.scriptRevisionId
  ) {
    issues.push({
      code: "approval_revision_mismatch",
      message: "EN production record revision does not match admitted EN script",
      episodeId: record.episodeId,
      locale: request.locale,
      blocking: true,
    });
    return { ok: false, issues };
  }

  const semantic = await evaluateOptionalSemanticStoryQa(options.semanticAdapter, {
    episodeId: record.episodeId,
    locale: request.locale,
    hookSemanticId: record.episodeSpec.hook.semanticId,
    cliffhangerSemanticId: record.episodeSpec.cliffhanger.semanticId,
    mandatory: options.mandatorySemanticQa ?? false,
  });
  const blockingSemantic = semantic.issues.filter((issue) => issue.blocking);
  if (blockingSemantic.length > 0) {
    return { ok: false, issues: blockingSemantic };
  }

  const evidence = storyApprovedEvidenceSchema.parse({
    schemaVersion: STORY_QA_SCHEMA_VERSION,
    approvalId: `story.approved.${record.episodeId.toLowerCase()}.${request.locale.toLowerCase()}`,
    episodeSpecRevisionId: record.episodeSpecRevisionId,
    beatPlanRevisionId: record.beatPlanRevisionId,
    scriptRevisionId: request.scriptRevisionId,
    boundaryRevisionId: record.boundaryRevisionId,
    importId: request.canonBundle.importId,
    locale: request.locale,
    episodeId: record.episodeId,
    approvedAt: request.approvedAt,
    deterministicQaPassed: true,
  });

  return {
    ok: true,
    evidence,
    advisoryIssues: semantic.issues.filter((issue) => !issue.blocking),
  };
}

export function buildStoryApprovalDeterministicQa(input: {
  canonBundle: V5CanonAdmissionBundle;
  productionBundle: { records: readonly V5EpisodeProductionRecord[] };
}): V5StoryDeterministicQaResult {
  return validateV5StoryDeterministicQa({
    canonBundle: input.canonBundle,
    productionBundle: {
      schemaVersion: input.canonBundle.schemaVersion,
      importId: input.canonBundle.importId,
      seriesBibleRevisionId: input.canonBundle.seriesBibleRevisionId,
      compiledAt: input.canonBundle.admittedAt,
      records: [...input.productionBundle.records],
    },
  });
}
