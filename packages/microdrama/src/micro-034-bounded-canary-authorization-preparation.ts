import { createHash } from "node:crypto";

import type {
  MicrodramaAssetGenerationApproval,
  MicrodramaOperatorAuthorizationRecord,
} from "@mediaforge/domain";
import {
  MicrodramaBudgetRepository,
  MicrodramaSQLiteRepository,
  createPersistence,
} from "@mediaforge/persistence";

import {
  defaultEnVisualCanaryBudgetProfiles,
  defaultV5PackRoot,
  evaluateEnE001E003VisualCanaryPreflight,
  MICRO_034_TASK_ID,
} from "./en-e001-e003-visual-canary-preflight.js";
import { compileV5CanonAdmission } from "./v5-canon-admission.js";
import {
  computeMicro034ProviderConfigRevision,
  MICRO_034_AUTHORIZATION_PACK_SCRIPT_FILE_HASHES,
  MICRO_034_AUTHORIZATION_PACK_SCRIPT_REVISIONS,
  MICRO_034_CANARY_COST_LIMIT_MINOR,
  MICRO_034_CANARY_CURRENCY,
  MICRO_034_CANARY_MAXIMUM_TOTAL_PROVIDER_REQUESTS,
  MICRO_034_VISUAL_PROFILE_REVISION,
  MICRO_034_VISUAL_PROVIDERS,
} from "./micro-034-canary-bindings.js";
import {
  computeMicro034AuthorizationRevisionId,
  loadMicro034AssetGenerationApproval,
  loadMicro034CostBudgetApproval,
  loadMicro034OperatorAuthorization,
  MICRO_034_ASSET_GENERATION_APPROVAL_ID,
  MICRO_034_COST_BUDGET_APPROVAL_ID,
  MICRO_034_OPERATOR_AUTHORIZATION_ID,
  persistMicro034AssetGenerationApproval,
  persistMicro034CostBudgetApproval,
  persistMicro034OperatorAuthorization,
  type MicrodramaVisualCostBudgetApprovalRecord,
} from "./micro-034-canary-authorization-persistence.js";
import {
  computeMicro033EvidenceContentHash,
  extractMicro033AudioRevisionIds,
  loadMicro033CanaryExecutionEvidence,
} from "./micro-034-canary-micro-033-evidence.js";

export type Micro034BoundedCanaryAuthorizationPreparationInput = {
  readonly dbPath: string;
  readonly packRoot?: string;
  readonly admittedAt: string;
  readonly preparedAt: string;
  readonly operatorId?: string;
  readonly micro033EvidenceJsonPath?: string;
};

export type Micro034BoundedCanaryAuthorizationPreparationResult = {
  readonly status: "READY_FOR_EXPLICIT_EXECUTE" | "BLOCKED";
  readonly blockers: readonly string[];
  readonly visualProfileRevision: string;
  readonly providerConfigRevision: string;
  readonly providers: readonly string[];
  readonly audioRevisionIds: readonly string[];
  readonly assetGenerationApprovalId: string | null;
  readonly operatorAuthorizationId: string | null;
  readonly costBudgetApprovalId: string | null;
  readonly maximumProviderRequests: number;
  readonly costLimitMinor: number;
  readonly currency: string;
  readonly preflightAllowed: boolean;
  readonly scriptRevisionIds: readonly string[];
  readonly micro033EvidenceContentHash: string | null;
};

export function computeMicro034CanaryVisualBindingEvidenceHash(input: {
  readonly visualProfileRevision: string;
  readonly providerConfigRevision: string;
  readonly audioRevisionIds: readonly string[];
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        scope: "micro-034.bounded-canary-visual-binding.v1",
        taskId: MICRO_034_TASK_ID,
        locale: "en-US",
        episodeIds: ["E001", "E002", "E003"],
        visualProfileRevision: input.visualProfileRevision,
        providerConfigRevision: input.providerConfigRevision,
        audioRevisionIds: [...input.audioRevisionIds].sort(),
      }),
      "utf8"
    )
    .digest("hex");
}

function verifyBindingProbe(input: {
  readonly scriptRevisionIds: readonly string[];
  readonly scriptHashesByEpisode: Record<string, string | undefined>;
}): readonly string[] {
  const blockers: string[] = [];
  const expectedRevisions = [
    MICRO_034_AUTHORIZATION_PACK_SCRIPT_REVISIONS.E001,
    MICRO_034_AUTHORIZATION_PACK_SCRIPT_REVISIONS.E002,
    MICRO_034_AUTHORIZATION_PACK_SCRIPT_REVISIONS.E003,
  ].sort();
  const observedRevisions = [...input.scriptRevisionIds].sort();
  if (observedRevisions.join(",") !== expectedRevisions.join(",")) {
    blockers.push("SCRIPT_REVISION_BINDING_MISMATCH");
  }

  for (const episodeId of ["E001", "E002", "E003"] as const) {
    const expectedHash = MICRO_034_AUTHORIZATION_PACK_SCRIPT_FILE_HASHES[episodeId];
    const observedHash = input.scriptHashesByEpisode[episodeId];
    if (observedHash !== expectedHash) {
      blockers.push(`SCRIPT_HASH_MISMATCH_${episodeId}`);
    }
  }

  return blockers;
}

function buildOperatorAuthorization(input: {
  readonly scriptRevisionIds: readonly string[];
  readonly operatorId: string;
  readonly authorizedAt: string;
}): MicrodramaOperatorAuthorizationRecord {
  return {
    schemaVersion: "mediaforge.microdrama-operator-authorization.v1",
    authorizationId: MICRO_034_OPERATOR_AUTHORIZATION_ID,
    taskId: MICRO_034_TASK_ID,
    kind: "BOUNDED_PAID_PROVIDER_EFFECT",
    state: "active",
    bindings: {
      episodeIds: ["e001", "e002", "e003"],
      locale: "en-US",
      scriptRevisionIds: [...input.scriptRevisionIds],
      voiceRevision: MICRO_034_VISUAL_PROFILE_REVISION,
      provider: "openai",
      costLimitMinor: MICRO_034_CANARY_COST_LIMIT_MINOR,
    },
    authorizedAt: input.authorizedAt,
    operatorId: input.operatorId,
  };
}

function buildAssetGenerationApproval(input: {
  readonly scriptRevisionIds: readonly string[];
  readonly operatorId: string;
  readonly approvedAt: string;
}): MicrodramaAssetGenerationApproval {
  return {
    schemaVersion: "mediaforge.microdrama-asset-generation-approval.v1",
    approvalId: MICRO_034_ASSET_GENERATION_APPROVAL_ID,
    taskId: MICRO_034_TASK_ID,
    state: "active",
    scope: {
      episodeIds: ["e001", "e002", "e003"],
      locale: "en-US",
      scriptRevisionIds: [...input.scriptRevisionIds],
      assetKinds: ["image", "video", "render"],
      providers: [...MICRO_034_VISUAL_PROVIDERS],
      voiceRevision: MICRO_034_VISUAL_PROFILE_REVISION,
      costLimitMinor: MICRO_034_CANARY_COST_LIMIT_MINOR,
    },
    approvedAt: input.approvedAt,
    operatorId: input.operatorId,
  };
}

function buildCostBudgetApproval(input: {
  readonly scriptRevisionIds: readonly string[];
  readonly audioRevisionIds: readonly string[];
  readonly providerConfigRevision: string;
  readonly operatorId: string;
  readonly approvedAt: string;
}): MicrodramaVisualCostBudgetApprovalRecord {
  return {
    schemaVersion: "mediaforge.microdrama-cost-budget-approval.v1",
    approvalId: MICRO_034_COST_BUDGET_APPROVAL_ID,
    taskId: MICRO_034_TASK_ID,
    costLimitMinor: MICRO_034_CANARY_COST_LIMIT_MINOR,
    currency: MICRO_034_CANARY_CURRENCY,
    maximumProviderRequests: MICRO_034_CANARY_MAXIMUM_TOTAL_PROVIDER_REQUESTS,
    episodeIds: ["e001", "e002", "e003"],
    locale: "en-US",
    scriptRevisionIds: [...input.scriptRevisionIds],
    visualProfileRevision: MICRO_034_VISUAL_PROFILE_REVISION,
    audioRevisionIds: [...input.audioRevisionIds],
    providers: [...MICRO_034_VISUAL_PROVIDERS],
    providerConfigRevision: input.providerConfigRevision,
    approvedAt: input.approvedAt,
    operatorId: input.operatorId,
  };
}

export async function prepareMicro034BoundedCanaryAuthorization(
  input: Micro034BoundedCanaryAuthorizationPreparationInput
): Promise<Micro034BoundedCanaryAuthorizationPreparationResult> {
  const blockers: string[] = [];
  const packRoot = input.packRoot ?? defaultV5PackRoot;
  const operatorId = input.operatorId ?? "operator.microdrama";
  const providerConfigRevision = computeMicro034ProviderConfigRevision();

  const admission = compileV5CanonAdmission(packRoot, input.admittedAt);
  if (!admission.ok) {
    return {
      status: "BLOCKED",
      blockers: ["PACK_ADMISSION_FAILED"],
      visualProfileRevision: MICRO_034_VISUAL_PROFILE_REVISION,
      providerConfigRevision,
      providers: [...MICRO_034_VISUAL_PROVIDERS],
      audioRevisionIds: [],
      assetGenerationApprovalId: null,
      operatorAuthorizationId: null,
      costBudgetApprovalId: null,
      maximumProviderRequests: MICRO_034_CANARY_MAXIMUM_TOTAL_PROVIDER_REQUESTS,
      costLimitMinor: MICRO_034_CANARY_COST_LIMIT_MINOR,
      currency: MICRO_034_CANARY_CURRENCY,
      preflightAllowed: false,
      scriptRevisionIds: [],
      micro033EvidenceContentHash: null,
    };
  }

  const scriptHashesByEpisode: Record<string, string> = {};
  for (const episodeId of ["E001", "E002", "E003"] as const) {
    const script = admission.bundle.admittedScripts.find(
      (entry) => entry.episodeId === episodeId && entry.locale === "en-US"
    );
    if (script) {
      scriptHashesByEpisode[episodeId] = script.contentHash;
    }
  }

  const sqlite = createPersistence(input.dbPath);
  sqlite.migrate();
  const microdramaRepository = new MicrodramaSQLiteRepository(sqlite);
  microdramaRepository.migrate();
  const budgetRepository = new MicrodramaBudgetRepository(sqlite);
  budgetRepository.migrateBudgets();

  for (const profile of defaultEnVisualCanaryBudgetProfiles(input.preparedAt)) {
    budgetRepository.upsertBudgetProfile({ profile });
  }

  const micro033Evidence = loadMicro033CanaryExecutionEvidence({
    repository: microdramaRepository,
    ...(input.micro033EvidenceJsonPath
      ? { jsonFilePath: input.micro033EvidenceJsonPath }
      : {}),
  });
  const micro033EvidenceContentHash = micro033Evidence
    ? computeMicro033EvidenceContentHash(micro033Evidence)
    : null;

  if (!micro033Evidence || micro033Evidence.status !== "DONE") {
    blockers.push("MICRO_033_EVIDENCE_MISSING");
  }

  const audioRevisionIds = micro033Evidence
    ? extractMicro033AudioRevisionIds(micro033Evidence)
    : [];

  const probeOnly = await evaluateEnE001E003VisualCanaryPreflight({
    packRoot,
    admittedAt: input.admittedAt,
    evaluatedAt: input.preparedAt,
    profiles: defaultEnVisualCanaryBudgetProfiles(input.preparedAt),
    micro033Evidence,
  });

  blockers.push(
    ...verifyBindingProbe({
      scriptRevisionIds: probeOnly.bindingProbe.scriptRevisionIds,
      scriptHashesByEpisode,
    })
  );

  if (blockers.length === 0) {
    const scriptRevisionIds = probeOnly.bindingProbe.scriptRevisionIds;
    persistMicro034OperatorAuthorization({
      repository: microdramaRepository,
      record: buildOperatorAuthorization({
        scriptRevisionIds,
        operatorId,
        authorizedAt: input.preparedAt,
      }),
    });
    persistMicro034AssetGenerationApproval({
      repository: microdramaRepository,
      record: buildAssetGenerationApproval({
        scriptRevisionIds,
        operatorId,
        approvedAt: input.preparedAt,
      }),
    });
    persistMicro034CostBudgetApproval({
      repository: microdramaRepository,
      record: buildCostBudgetApproval({
        scriptRevisionIds,
        audioRevisionIds,
        providerConfigRevision,
        operatorId,
        approvedAt: input.preparedAt,
      }),
    });
  }

  const loadedOperatorAuthorization = loadMicro034OperatorAuthorization(microdramaRepository);
  const loadedAssetGenerationApproval = loadMicro034AssetGenerationApproval(microdramaRepository);
  const loadedCostBudgetApproval = loadMicro034CostBudgetApproval(microdramaRepository);

  const finalPreflight = await evaluateEnE001E003VisualCanaryPreflight({
    packRoot,
    admittedAt: input.admittedAt,
    evaluatedAt: input.preparedAt,
    profiles: defaultEnVisualCanaryBudgetProfiles(input.preparedAt),
    micro033Evidence,
    operatorAuthorization: loadedOperatorAuthorization ?? undefined,
    assetGenerationApproval: loadedAssetGenerationApproval ?? undefined,
  });

  const preflightAllowed =
    blockers.length === 0 && finalPreflight.preflight.allowed;

  if (!preflightAllowed && blockers.length === 0) {
    blockers.push(...finalPreflight.preflight.blockReasons);
    for (const gate of finalPreflight.preflight.readinessGates) {
      if (!gate.ok) {
        blockers.push(
          `GATE_${gate.gate}${gate.message ? `:${gate.message}` : ""}`
        );
      }
    }
  }

  return {
    status: preflightAllowed ? "READY_FOR_EXPLICIT_EXECUTE" : "BLOCKED",
    blockers,
    visualProfileRevision: MICRO_034_VISUAL_PROFILE_REVISION,
    providerConfigRevision,
    providers: [...MICRO_034_VISUAL_PROVIDERS],
    audioRevisionIds,
    assetGenerationApprovalId: loadedAssetGenerationApproval?.approvalId ?? null,
    operatorAuthorizationId: loadedOperatorAuthorization?.authorizationId ?? null,
    costBudgetApprovalId: loadedCostBudgetApproval?.approvalId ?? null,
    maximumProviderRequests: MICRO_034_CANARY_MAXIMUM_TOTAL_PROVIDER_REQUESTS,
    costLimitMinor: MICRO_034_CANARY_COST_LIMIT_MINOR,
    currency: MICRO_034_CANARY_CURRENCY,
    preflightAllowed,
    scriptRevisionIds: probeOnly.bindingProbe.scriptRevisionIds,
    micro033EvidenceContentHash,
  };
}

export function micro034AuthorizationEvidenceSummary(input: {
  readonly preparation: Micro034BoundedCanaryAuthorizationPreparationResult;
}): Record<string, unknown> {
  return {
    taskId: MICRO_034_TASK_ID,
    status: input.preparation.status,
    visualProfileRevision: input.preparation.visualProfileRevision,
    providerConfigRevision: input.preparation.providerConfigRevision,
    providers: input.preparation.providers,
    audioRevisionIds: input.preparation.audioRevisionIds,
    operatorAuthorizationRevision: input.preparation.operatorAuthorizationId
      ? computeMicro034AuthorizationRevisionId(
          "auth",
          input.preparation.operatorAuthorizationId
        )
      : null,
    assetGenerationApprovalRevision: input.preparation.assetGenerationApprovalId
      ? computeMicro034AuthorizationRevisionId(
          "approval",
          input.preparation.assetGenerationApprovalId
        )
      : null,
    costBudgetApprovalRevision: input.preparation.costBudgetApprovalId
      ? computeMicro034AuthorizationRevisionId(
          "cost",
          input.preparation.costBudgetApprovalId
        )
      : null,
    maximumProviderRequests: input.preparation.maximumProviderRequests,
    costLimitMinor: input.preparation.costLimitMinor,
    currency: input.preparation.currency,
    preflightAllowed: input.preparation.preflightAllowed,
    scriptRevisionIds: input.preparation.scriptRevisionIds,
    micro033EvidenceContentHash: input.preparation.micro033EvidenceContentHash,
    blockers: input.preparation.blockers,
  };
}
