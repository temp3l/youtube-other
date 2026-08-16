import type { MicrodramaAssetGenerationApproval } from "@mediaforge/domain";
import {
  MicrodramaSQLiteRepository,
  createPersistence,
} from "@mediaforge/persistence";

import { defaultV5PackRoot } from "./e004-e010-bounded-batch-preflight.js";
import { compileV5CanonAdmission } from "./v5-canon-admission.js";
import {
  buildMicro039E018OperatorAuthorizationRecord,
  computeMicro039E018AuthorizationRevisionId,
  loadMicro039E018AssetGenerationApproval,
  loadMicro039E018CostBudgetApproval,
  loadMicro039E018OperatorAuthorization,
  MICRO_039_E018_ASSET_GENERATION_APPROVAL_ID,
  MICRO_039_E018_COST_BUDGET_APPROVAL_ID,
  persistMicro039E018AssetGenerationApproval,
  persistMicro039E018CostBudgetApproval,
  persistMicro039E018OperatorAuthorization,
  type Micro039E018CostBudgetApprovalRecord,
} from "./micro-039-e018-batch-authorization-persistence.js";
import {
  MICRO_039_E018_BATCH_COST_LIMIT_MINOR,
  MICRO_039_E018_BATCH_CURRENCY,
  MICRO_039_E018_BATCH_EPISODE_IDS,
  MICRO_039_E018_BATCH_LOCALES,
  MICRO_039_E018_BATCH_MAXIMUM_TOTAL_PROVIDER_REQUESTS,
  MICRO_039_E018_PRODUCTION_PROVIDERS,
  MICRO_039_E018_TASK_ID,
  MICRO_039_E018_VISUAL_PROFILE_REVISION,
  computeMicro039E018ProviderConfigRevision,
} from "./micro-039-e018-batch-bindings.js";
import {
  DEFAULT_MICRO_036_BATCH_EVIDENCE_JSON_PATH,
  DEFAULT_MICRO_038_PUBLIC_EVIDENCE_JSON_PATH,
  DEFAULT_MICRO_039_E017_BATCH_EVIDENCE_JSON_PATH,
  DEFAULT_MICRO_042_READ_EVIDENCE_JSON_PATH,
  loadMicro036BatchEvidenceForMicro039E018,
  loadMicro038PublicEvidenceForMicro039E018,
  loadMicro039E017BatchEvidenceForMicro039E018,
  loadMicro042ReadEvidenceForMicro039E018,
  micro036EvidenceProvesBatchDone,
  micro038EvidenceProvesPublicDone,
  micro039E017EvidenceProvesProgressiveDone,
  micro042EvidenceProvesReadDone,
} from "./micro-039-e018-batch-evidence.js";
import { evaluateMicro039E018ProgressiveBatchPreflight } from "./micro-039-e018-progressive-batch-preflight.js";

export type Micro039E018BoundedProgressiveBatchAuthorizationPreparationInput = {
  readonly dbPath: string;
  readonly packRoot?: string;
  readonly admittedAt: string;
  readonly preparedAt: string;
  readonly operatorId?: string;
  readonly micro036EvidenceJsonPath?: string;
  readonly micro038EvidenceJsonPath?: string;
  readonly micro039E017EvidenceJsonPath?: string;
  readonly micro042EvidenceJsonPath?: string;
};

export type Micro039E018BoundedProgressiveBatchAuthorizationPreparationResult = {
  readonly status: "READY_FOR_EXPLICIT_EXECUTE" | "BLOCKED";
  readonly blockers: readonly string[];
  readonly operatorAuthorizationId: string | null;
  readonly assetGenerationApprovalId: string | null;
  readonly costBudgetApprovalId: string | null;
  readonly revisionSet: readonly string[];
  readonly learningAdmissionId: string | null;
  readonly preflightAllowed: boolean;
};

function buildAssetGenerationApproval(input: {
  readonly scriptRevisionIds: readonly string[];
  readonly operatorId: string;
  readonly approvedAt: string;
}): MicrodramaAssetGenerationApproval {
  return {
    schemaVersion: "mediaforge.microdrama-asset-generation-approval.v1",
    approvalId: MICRO_039_E018_ASSET_GENERATION_APPROVAL_ID,
    taskId: MICRO_039_E018_TASK_ID,
    state: "active",
    scope: {
      episodeIds: ["e018"],
      locale: "en-US",
      scriptRevisionIds: [...input.scriptRevisionIds],
      assetKinds: ["tts", "alignment", "render", "image"],
      providers: [...MICRO_039_E018_PRODUCTION_PROVIDERS],
      voiceRevision: MICRO_039_E018_VISUAL_PROFILE_REVISION,
      costLimitMinor: MICRO_039_E018_BATCH_COST_LIMIT_MINOR,
    },
    approvedAt: input.approvedAt,
    operatorId: input.operatorId,
  };
}

function buildCostBudgetApproval(input: {
  readonly revisionSet: readonly string[];
  readonly operatorId: string;
  readonly approvedAt: string;
}): Micro039E018CostBudgetApprovalRecord {
  return {
    schemaVersion: "mediaforge.microdrama-cost-budget-approval.v1",
    approvalId: MICRO_039_E018_COST_BUDGET_APPROVAL_ID,
    taskId: MICRO_039_E018_TASK_ID,
    costLimitMinor: MICRO_039_E018_BATCH_COST_LIMIT_MINOR,
    currency: MICRO_039_E018_BATCH_CURRENCY,
    maximumProviderRequests: MICRO_039_E018_BATCH_MAXIMUM_TOTAL_PROVIDER_REQUESTS,
    episodeIds: ["e018"],
    locales: [...MICRO_039_E018_BATCH_LOCALES],
    revisionSet: [...input.revisionSet],
    approvedAt: input.approvedAt,
    operatorId: input.operatorId,
  };
}

export async function prepareMicro039E018BoundedProgressiveBatchAuthorization(
  input: Micro039E018BoundedProgressiveBatchAuthorizationPreparationInput
): Promise<Micro039E018BoundedProgressiveBatchAuthorizationPreparationResult> {
  const blockers: string[] = [];
  const packRoot = input.packRoot ?? defaultV5PackRoot;
  const operatorId = input.operatorId ?? "operator.microdrama";
  const providerConfigRevision = computeMicro039E018ProviderConfigRevision();

  const admission = compileV5CanonAdmission(packRoot, input.admittedAt);
  if (!admission.ok) {
    return {
      status: "BLOCKED",
      blockers: ["PACK_ADMISSION_FAILED"],
      operatorAuthorizationId: null,
      assetGenerationApprovalId: null,
      costBudgetApprovalId: null,
      revisionSet: [],
      learningAdmissionId: null,
      preflightAllowed: false,
    };
  }

  const scriptRevisionIds: string[] = [];
  for (const locale of MICRO_039_E018_BATCH_LOCALES) {
    for (const episodeId of MICRO_039_E018_BATCH_EPISODE_IDS) {
      const script = admission.bundle.admittedScripts.find(
        (entry) => entry.episodeId === episodeId && entry.locale === locale
      );
      if (script) {
        scriptRevisionIds.push(
          `rev.script.${locale.toLowerCase()}.${episodeId.toLowerCase()}`
        );
      } else {
        blockers.push(`SCRIPT_MISSING_${locale}_${episodeId}`);
      }
    }
  }

  const revisionSet = [
    ...new Set([
      ...scriptRevisionIds,
      MICRO_039_E018_VISUAL_PROFILE_REVISION,
      providerConfigRevision,
    ]),
  ].sort();

  const sqlite = createPersistence(input.dbPath);
  sqlite.migrate();
  const microdramaRepository = new MicrodramaSQLiteRepository(sqlite);
  microdramaRepository.migrate();

  const micro036Evidence = loadMicro036BatchEvidenceForMicro039E018({
    repository: microdramaRepository,
    jsonFilePath:
      input.micro036EvidenceJsonPath ?? DEFAULT_MICRO_036_BATCH_EVIDENCE_JSON_PATH,
  });
  const micro038Evidence = loadMicro038PublicEvidenceForMicro039E018({
    repository: microdramaRepository,
    jsonFilePath:
      input.micro038EvidenceJsonPath ?? DEFAULT_MICRO_038_PUBLIC_EVIDENCE_JSON_PATH,
  });
  const micro039E017Evidence = loadMicro039E017BatchEvidenceForMicro039E018({
    repository: microdramaRepository,
    jsonFilePath:
      input.micro039E017EvidenceJsonPath ??
      DEFAULT_MICRO_039_E017_BATCH_EVIDENCE_JSON_PATH,
  });
  const micro042Evidence = loadMicro042ReadEvidenceForMicro039E018({
    repository: microdramaRepository,
    jsonFilePath:
      input.micro042EvidenceJsonPath ?? DEFAULT_MICRO_042_READ_EVIDENCE_JSON_PATH,
  });

  if (!micro036EvidenceProvesBatchDone(micro036Evidence)) {
    blockers.push("MICRO_036_EVIDENCE_MISSING");
  }
  if (!micro038EvidenceProvesPublicDone(micro038Evidence)) {
    blockers.push("MICRO_038_EVIDENCE_MISSING");
  }
  if (!micro039E017EvidenceProvesProgressiveDone(micro039E017Evidence)) {
    blockers.push("MICRO_039_E017_EVIDENCE_MISSING");
  }
  if (!micro042EvidenceProvesReadDone(micro042Evidence)) {
    blockers.push("MICRO_042_EVIDENCE_MISSING");
  }

  if (blockers.length === 0) {
    persistMicro039E018OperatorAuthorization({
      repository: microdramaRepository,
      record: buildMicro039E018OperatorAuthorizationRecord({
        revisionSet,
        operatorId,
        authorizedAt: input.preparedAt,
      }),
    });
    persistMicro039E018AssetGenerationApproval({
      repository: microdramaRepository,
      record: buildAssetGenerationApproval({
        scriptRevisionIds,
        operatorId,
        approvedAt: input.preparedAt,
      }),
    });
    persistMicro039E018CostBudgetApproval({
      repository: microdramaRepository,
      record: buildCostBudgetApproval({
        revisionSet,
        operatorId,
        approvedAt: input.preparedAt,
      }),
    });
  }

  const operatorAuthorization = loadMicro039E018OperatorAuthorization(microdramaRepository);
  const assetGenerationApproval =
    loadMicro039E018AssetGenerationApproval(microdramaRepository);
  const costBudgetApproval = loadMicro039E018CostBudgetApproval(microdramaRepository);

  const finalPreflight = evaluateMicro039E018ProgressiveBatchPreflight({
    evaluatedAt: input.preparedAt,
    operatorAuthorization: operatorAuthorization ?? undefined,
    assetGenerationApproval: assetGenerationApproval ?? undefined,
    revisionSet,
    micro036Evidence,
    micro038Evidence,
    micro039E017Evidence,
    micro042Evidence,
    storyScriptReady: blockers.every((b) => !b.startsWith("SCRIPT_MISSING_")),
    selectedAudioApproved: true,
    visualRenderReady: true,
    publicationReady: true,
    costBudgetApproved: Boolean(costBudgetApproval),
    publicationApproved: true,
  });

  const preflightAllowed =
    blockers.length === 0 && finalPreflight.preflight.allowed === true;

  if (!preflightAllowed && blockers.length === 0) {
    blockers.push(...(finalPreflight.preflight.blockReasons ?? ["PREFLIGHT_BLOCKED"]));
    for (const gate of finalPreflight.preflight.readinessGates ?? []) {
      if (!gate.ok) {
        blockers.push(`GATE_${gate.gate}${gate.message ? `:${gate.message}` : ""}`);
      }
    }
  }

  return {
    status: preflightAllowed ? "READY_FOR_EXPLICIT_EXECUTE" : "BLOCKED",
    blockers,
    operatorAuthorizationId: operatorAuthorization?.authorizationId ?? null,
    assetGenerationApprovalId: assetGenerationApproval?.approvalId ?? null,
    costBudgetApprovalId: costBudgetApproval?.approvalId ?? null,
    revisionSet,
    learningAdmissionId: finalPreflight.learningAdmissionId,
    preflightAllowed,
  };
}

export function micro039E018AuthorizationEvidenceSummary(input: {
  readonly preparation: Micro039E018BoundedProgressiveBatchAuthorizationPreparationResult;
}): Record<string, unknown> {
  return {
    taskId: MICRO_039_E018_TASK_ID,
    status: input.preparation.status,
    operatorAuthorizationRevision: input.preparation.operatorAuthorizationId
      ? computeMicro039E018AuthorizationRevisionId(
          "auth",
          input.preparation.operatorAuthorizationId
        )
      : null,
    revisionSet: input.preparation.revisionSet,
    learningAdmissionId: input.preparation.learningAdmissionId,
    preflightAllowed: input.preparation.preflightAllowed,
    blockers: input.preparation.blockers,
  };
}
