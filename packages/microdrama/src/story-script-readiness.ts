import { computePayloadHash } from "@mediaforge/narrative-core";

import {
  READINESS_EVIDENCE_SCHEMA_VERSION,
  type ReadinessEvidenceRecord,
  type ReadinessProjectionResult,
} from "./readiness-evidence-contracts.js";
import {
  defaultEvidenceBackedCheck,
  evaluateReadinessProjection,
  type ReadinessCheckDefinition,
} from "./readiness-evidence-evaluator.js";
import type { V5CanonAdmissionBundle } from "./v5-canon-admission-contracts.js";
import type {
  V5EpisodeProductionBundle,
  V5EpisodeProductionRecord,
} from "./v5-episode-production-contracts.js";
import type {
  StoryApprovedEvidence,
  StoryQaIssueCode,
  V5StoryDeterministicQaResult,
} from "./v5-story-qa-contracts.js";

export const STORY_SCRIPT_READINESS_SCHEMA_VERSION =
  "mediaforge.microdrama.story-script-readiness.v1" as const;

export const STORY_SCRIPT_READINESS_CHECKS = [
  { checkId: "story.approved" },
  { checkId: "story.deterministic_qa" },
  { checkId: "story.locale_parity" },
  { checkId: "story.boundary_chain" },
] as const satisfies readonly ReadinessCheckDefinition[];

const LOCALE_PARITY_CODES: readonly StoryQaIssueCode[] = [
  "locale_parity_mismatch",
  "locale_timing_gate_failed",
  "hook_cliffhanger_missing",
];

const BOUNDARY_CHAIN_CODES: readonly StoryQaIssueCode[] = [
  "boundary_chain_break",
  "boundary_production_mismatch",
  "forbidden_event_present",
  "season_boundary_violation",
];

export type StoryScriptReadinessBinding = {
  readonly episodeId: string;
  readonly locale: string;
  readonly scriptRevisionId: string;
  readonly episodeSpecRevisionId: string;
  readonly beatPlanRevisionId: string;
  readonly boundaryRevisionId: string;
  readonly scriptContentHash: string;
  readonly episodeSpecContentHash: string;
  readonly beatPlanContentHash: string;
};

export type StoryScriptReadinessInput = {
  readonly binding: StoryScriptReadinessBinding;
  readonly evidenceById: ReadonlyMap<string, ReadinessEvidenceRecord>;
  readonly projectedAt: string;
};

export function storyScriptTargetRevisionId(
  binding: StoryScriptReadinessBinding
): string {
  return binding.scriptRevisionId;
}

export function storyScriptTargetRevisionHash(
  binding: StoryScriptReadinessBinding
): string {
  return computePayloadHash({
    schemaVersion: STORY_SCRIPT_READINESS_SCHEMA_VERSION,
    scriptRevisionId: binding.scriptRevisionId,
    episodeSpecRevisionId: binding.episodeSpecRevisionId,
    beatPlanRevisionId: binding.beatPlanRevisionId,
    scriptContentHash: binding.scriptContentHash,
    episodeSpecContentHash: binding.episodeSpecContentHash,
    beatPlanContentHash: binding.beatPlanContentHash,
  });
}

export function resolveStoryScriptReadinessBinding(input: {
  readonly canonBundle: V5CanonAdmissionBundle;
  readonly productionRecord: V5EpisodeProductionRecord;
  readonly locale: string;
}): StoryScriptReadinessBinding | undefined {
  const script = input.canonBundle.admittedScripts.find(
    (entry) =>
      entry.episodeId === input.productionRecord.episodeId &&
      entry.locale === input.locale
  );
  if (!script) {
    return undefined;
  }

  return {
    episodeId: input.productionRecord.episodeId,
    locale: input.locale,
    scriptRevisionId: script.scriptRevisionId,
    episodeSpecRevisionId: input.productionRecord.episodeSpecRevisionId,
    beatPlanRevisionId: input.productionRecord.beatPlanRevisionId,
    boundaryRevisionId: input.productionRecord.boundaryRevisionId,
    scriptContentHash: script.contentHash,
    episodeSpecContentHash: computePayloadHash(input.productionRecord.episodeSpec),
    beatPlanContentHash: computePayloadHash(input.productionRecord.beatPlan),
  };
}

export function validateStoryScriptBinding(input: {
  readonly binding: StoryScriptReadinessBinding;
  readonly canonBundle: V5CanonAdmissionBundle;
  readonly productionBundle: V5EpisodeProductionBundle;
}): string[] {
  const errors: string[] = [];
  const record = input.productionBundle.records.find(
    (entry) => entry.episodeId === input.binding.episodeId
  );
  if (!record) {
    errors.push(`Missing production record for ${input.binding.episodeId}`);
    return errors;
  }

  const script = input.canonBundle.admittedScripts.find(
    (entry) =>
      entry.episodeId === input.binding.episodeId &&
      entry.locale === input.binding.locale
  );
  if (!script) {
    errors.push(
      `Missing admitted script for ${input.binding.episodeId} ${input.binding.locale}`
    );
    return errors;
  }

  if (script.scriptRevisionId !== input.binding.scriptRevisionId) {
    errors.push("scriptRevisionId does not match admitted script");
  }
  if (record.episodeSpecRevisionId !== input.binding.episodeSpecRevisionId) {
    errors.push("episodeSpecRevisionId does not match production record");
  }
  if (record.beatPlanRevisionId !== input.binding.beatPlanRevisionId) {
    errors.push("beatPlanRevisionId does not match production record");
  }
  if (record.boundaryRevisionId !== input.binding.boundaryRevisionId) {
    errors.push("boundaryRevisionId does not match production record");
  }
  if (script.contentHash !== input.binding.scriptContentHash) {
    errors.push("scriptContentHash does not match admitted script");
  }
  if (
    computePayloadHash(record.episodeSpec) !== input.binding.episodeSpecContentHash
  ) {
    errors.push("episodeSpecContentHash does not match production record");
  }
  if (computePayloadHash(record.beatPlan) !== input.binding.beatPlanContentHash) {
    errors.push("beatPlanContentHash does not match production record");
  }

  return errors;
}

function qaSubsetStatus(
  qa: V5StoryDeterministicQaResult,
  codes: readonly StoryQaIssueCode[]
): "ACTIVE" | "STALE" {
  const blocking = qa.issues.filter(
    (issue) => issue.blocking && codes.includes(issue.code)
  );
  return blocking.length === 0 ? "ACTIVE" : "STALE";
}

export function buildStoryScriptReadinessEvidenceRecords(input: {
  readonly binding: StoryScriptReadinessBinding;
  readonly storyApproved: StoryApprovedEvidence;
  readonly qa: V5StoryDeterministicQaResult;
  readonly recordedAt: string;
}): ReadinessEvidenceRecord[] {
  const targetRevisionId = storyScriptTargetRevisionId(input.binding);
  const targetRevisionHash = storyScriptTargetRevisionHash(input.binding);
  const episodeKey = input.binding.episodeId.toLowerCase();
  const localeKey = input.binding.locale.toLowerCase();

  if (input.storyApproved.scriptRevisionId !== input.binding.scriptRevisionId) {
    throw new Error("STORY_APPROVED script revision does not match readiness binding");
  }
  if (input.storyApproved.episodeSpecRevisionId !== input.binding.episodeSpecRevisionId) {
    throw new Error("STORY_APPROVED episode spec revision does not match readiness binding");
  }
  if (input.storyApproved.beatPlanRevisionId !== input.binding.beatPlanRevisionId) {
    throw new Error("STORY_APPROVED beat plan revision does not match readiness binding");
  }

  const base = {
    schemaVersion: READINESS_EVIDENCE_SCHEMA_VERSION,
    domain: "story_script" as const,
    boundRevisionId: targetRevisionId,
    boundRevisionHash: targetRevisionHash,
    recordedAt: input.recordedAt,
  };

  return [
    {
      ...base,
      evidenceId: `evidence.${input.storyApproved.approvalId}`,
      checkId: "story.approved",
      status: "ACTIVE",
    },
    {
      ...base,
      evidenceId: `evidence.story.deterministic_qa.${episodeKey}.${localeKey}`,
      checkId: "story.deterministic_qa",
      status: input.qa.ok ? "ACTIVE" : "STALE",
    },
    {
      ...base,
      evidenceId: `evidence.story.locale_parity.${episodeKey}`,
      checkId: "story.locale_parity",
      status: qaSubsetStatus(input.qa, LOCALE_PARITY_CODES),
    },
    {
      ...base,
      evidenceId: `evidence.story.boundary_chain.${episodeKey}`,
      checkId: "story.boundary_chain",
      status: qaSubsetStatus(input.qa, BOUNDARY_CHAIN_CODES),
    },
  ];
}

export function evaluateStoryScriptReadiness(
  input: StoryScriptReadinessInput
): ReadinessProjectionResult {
  const targetRevisionId = storyScriptTargetRevisionId(input.binding);
  const targetRevisionHash = storyScriptTargetRevisionHash(input.binding);

  return evaluateReadinessProjection({
    domain: "story_script",
    targetRevisionId,
    targetRevisionHash,
    projectedAt: input.projectedAt,
    checks: [...STORY_SCRIPT_READINESS_CHECKS],
    evidenceById: input.evidenceById,
    evaluateCheck: (check, evidence) =>
      defaultEvidenceBackedCheck(
        check,
        evidence,
        targetRevisionId,
        targetRevisionHash
      ),
  });
}
