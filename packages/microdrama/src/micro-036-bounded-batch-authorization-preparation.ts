import { createHash } from "node:crypto";

import type {
  MicrodramaAssetGenerationApproval,
  MicrodramaOperatorAuthorizationRecord,
} from "@mediaforge/domain";
import {
  CharacterVoiceSQLiteRepository,
  MicrodramaBudgetRepository,
  MicrodramaSQLiteRepository,
  createPersistence,
} from "@mediaforge/persistence";

import {
  defaultBoundedBatchBudgetProfiles,
  defaultV5PackRoot,
  evaluateE004E010BoundedBatchPreflight,
  MICRO_036_TASK_ID,
} from "./e004-e010-bounded-batch-preflight.js";
import { compileV5CanonAdmission } from "./v5-canon-admission.js";
import {
  computeMicro036ProviderConfigRevision,
  MICRO_036_AUTHORIZATION_PACK_SCRIPT_FILE_HASHES,
  MICRO_036_AUTHORIZATION_PACK_SCRIPT_REVISIONS,
  MICRO_036_BATCH_COST_LIMIT_MINOR,
  MICRO_036_BATCH_CURRENCY,
  MICRO_036_BATCH_EPISODE_IDS,
  MICRO_036_BATCH_LOCALES,
  MICRO_036_BATCH_MAXIMUM_TOTAL_PROVIDER_REQUESTS,
  MICRO_036_PRODUCTION_PROVIDERS,
  MICRO_036_VISUAL_PROFILE_REVISION,
} from "./micro-036-batch-bindings.js";
import {
  computeMicro036AuthorizationRevisionId,
  loadMicro036AssetGenerationApproval,
  loadMicro036CostBudgetApproval,
  loadMicro036OperatorAuthorization,
  MICRO_036_ASSET_GENERATION_APPROVAL_ID,
  MICRO_036_COST_BUDGET_APPROVAL_ID,
  MICRO_036_OPERATOR_AUTHORIZATION_ID,
  persistMicro036AssetGenerationApproval,
  persistMicro036CostBudgetApproval,
  persistMicro036OperatorAuthorization,
  persistMicro036SpeechCredential,
  type MicrodramaBatchCostBudgetApprovalRecord,
} from "./micro-036-batch-authorization-persistence.js";
import {
  computeMicro035EvidenceContentHash,
  loadMicro035CanaryExecutionEvidence,
} from "./micro-036-batch-micro-035-evidence.js";
import {
  buildMicro035OpenAiSpeechCredentialRecord,
  isOpenAiSpeechSecretConfigured,
  MICRO_035_OPENAI_CREDENTIAL_HANDLE,
} from "./microdrama-openai-speech-credential.js";
import { resolveMicro036OpenAiTtsModelConfigurationForLocale } from "./micro-036-openai-tts-env.js";
import { ensureSevenMinutesAheadNarratorVoiceProfilePersisted } from "./seven-minutes-ahead-narrator-voice-persistence.js";

export type Micro036BoundedBatchAuthorizationPreparationInput = {
  readonly dbPath: string;
  readonly packRoot?: string;
  readonly admittedAt: string;
  readonly preparedAt: string;
  readonly operatorId?: string;
  readonly micro035EvidenceJsonPath?: string;
};

export type Micro036BoundedBatchAuthorizationPreparationResult = {
  readonly status: "READY_FOR_EXPLICIT_EXECUTE" | "BLOCKED";
  readonly blockers: readonly string[];
  readonly visualProfileRevision: string;
  readonly providerConfigRevision: string;
  readonly providers: readonly string[];
  readonly revisionSet: readonly string[];
  readonly assetGenerationApprovalId: string | null;
  readonly operatorAuthorizationId: string | null;
  readonly costBudgetApprovalId: string | null;
  readonly maximumProviderRequests: number;
  readonly costLimitMinor: number;
  readonly currency: string;
  readonly preflightAllowed: boolean;
  readonly scriptRevisionIds: readonly string[];
  readonly micro035EvidenceContentHash: string | null;
};

export function computeMicro036BatchBindingEvidenceHash(input: {
  readonly visualProfileRevision: string;
  readonly providerConfigRevision: string;
  readonly revisionSet: readonly string[];
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        scope: "micro-036.bounded-batch-binding.v1",
        taskId: MICRO_036_TASK_ID,
        locales: [...MICRO_036_BATCH_LOCALES],
        episodeIds: [...MICRO_036_BATCH_EPISODE_IDS],
        visualProfileRevision: input.visualProfileRevision,
        providerConfigRevision: input.providerConfigRevision,
        revisionSet: [...input.revisionSet].sort(),
      }),
      "utf8"
    )
    .digest("hex");
}

function verifyBindingProbe(input: {
  readonly scriptRevisionIds: readonly string[];
  readonly scriptHashesByLocaleEpisode: Record<string, string | undefined>;
}): readonly string[] {
  const blockers: string[] = [];
  const expectedRevisions: string[] = [];
  for (const locale of MICRO_036_BATCH_LOCALES) {
    for (const episodeId of MICRO_036_BATCH_EPISODE_IDS) {
      expectedRevisions.push(
        MICRO_036_AUTHORIZATION_PACK_SCRIPT_REVISIONS[locale][episodeId]
      );
    }
  }
  const observedRevisions = [...input.scriptRevisionIds].sort();
  if (observedRevisions.join(",") !== [...expectedRevisions].sort().join(",")) {
    blockers.push("SCRIPT_REVISION_BINDING_MISMATCH");
  }

  for (const locale of MICRO_036_BATCH_LOCALES) {
    for (const episodeId of MICRO_036_BATCH_EPISODE_IDS) {
      const expectedHash =
        MICRO_036_AUTHORIZATION_PACK_SCRIPT_FILE_HASHES[locale][episodeId];
      const observedHash =
        input.scriptHashesByLocaleEpisode[`${locale}:${episodeId}`];
      if (observedHash !== expectedHash) {
        blockers.push(`SCRIPT_HASH_MISMATCH_${locale}_${episodeId}`);
      }
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
    authorizationId: MICRO_036_OPERATOR_AUTHORIZATION_ID,
    taskId: MICRO_036_TASK_ID,
    kind: "BOUNDED_PAID_PROVIDER_EFFECT",
    state: "active",
    bindings: {
      episodeIds: ["e004", "e005", "e006", "e007", "e008", "e009", "e010"],
      locale: "en-US",
      scriptRevisionIds: [...input.scriptRevisionIds],
      voiceRevision: MICRO_036_VISUAL_PROFILE_REVISION,
      provider: "openai",
      costLimitMinor: MICRO_036_BATCH_COST_LIMIT_MINOR,
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
    approvalId: MICRO_036_ASSET_GENERATION_APPROVAL_ID,
    taskId: MICRO_036_TASK_ID,
    state: "active",
    scope: {
      episodeIds: ["e004", "e005", "e006", "e007", "e008", "e009", "e010"],
      locale: "en-US",
      scriptRevisionIds: [...input.scriptRevisionIds],
      assetKinds: ["tts", "alignment", "render", "image"],
      providers: [...MICRO_036_PRODUCTION_PROVIDERS],
      voiceRevision: MICRO_036_VISUAL_PROFILE_REVISION,
      costLimitMinor: MICRO_036_BATCH_COST_LIMIT_MINOR,
    },
    approvedAt: input.approvedAt,
    operatorId: input.operatorId,
  };
}

function buildCostBudgetApproval(input: {
  readonly scriptRevisionIds: readonly string[];
  readonly revisionSet: readonly string[];
  readonly providerConfigRevision: string;
  readonly operatorId: string;
  readonly approvedAt: string;
}): MicrodramaBatchCostBudgetApprovalRecord {
  return {
    schemaVersion: "mediaforge.microdrama-cost-budget-approval.v1",
    approvalId: MICRO_036_COST_BUDGET_APPROVAL_ID,
    taskId: MICRO_036_TASK_ID,
    costLimitMinor: MICRO_036_BATCH_COST_LIMIT_MINOR,
    currency: MICRO_036_BATCH_CURRENCY,
    maximumProviderRequests: MICRO_036_BATCH_MAXIMUM_TOTAL_PROVIDER_REQUESTS,
    episodeIds: ["e004", "e005", "e006", "e007", "e008", "e009", "e010"],
    locales: [...MICRO_036_BATCH_LOCALES],
    scriptRevisionIds: [...input.scriptRevisionIds],
    revisionSet: [...input.revisionSet],
    visualProfileRevision: MICRO_036_VISUAL_PROFILE_REVISION,
    providers: [...MICRO_036_PRODUCTION_PROVIDERS],
    providerConfigRevision: input.providerConfigRevision,
    approvedAt: input.approvedAt,
    operatorId: input.operatorId,
  };
}

export async function prepareMicro036BoundedBatchAuthorization(
  input: Micro036BoundedBatchAuthorizationPreparationInput
): Promise<Micro036BoundedBatchAuthorizationPreparationResult> {
  const blockers: string[] = [];
  const packRoot = input.packRoot ?? defaultV5PackRoot;
  const operatorId = input.operatorId ?? "operator.microdrama";
  const providerConfigRevision = computeMicro036ProviderConfigRevision();

  const admission = compileV5CanonAdmission(packRoot, input.admittedAt);
  if (!admission.ok) {
    return {
      status: "BLOCKED",
      blockers: ["PACK_ADMISSION_FAILED"],
      visualProfileRevision: MICRO_036_VISUAL_PROFILE_REVISION,
      providerConfigRevision,
      providers: [...MICRO_036_PRODUCTION_PROVIDERS],
      revisionSet: [],
      assetGenerationApprovalId: null,
      operatorAuthorizationId: null,
      costBudgetApprovalId: null,
      maximumProviderRequests: MICRO_036_BATCH_MAXIMUM_TOTAL_PROVIDER_REQUESTS,
      costLimitMinor: MICRO_036_BATCH_COST_LIMIT_MINOR,
      currency: MICRO_036_BATCH_CURRENCY,
      preflightAllowed: false,
      scriptRevisionIds: [],
      micro035EvidenceContentHash: null,
    };
  }

  const scriptHashesByLocaleEpisode: Record<string, string> = {};
  for (const locale of MICRO_036_BATCH_LOCALES) {
    for (const episodeId of MICRO_036_BATCH_EPISODE_IDS) {
      const script = admission.bundle.admittedScripts.find(
        (entry) => entry.episodeId === episodeId && entry.locale === locale
      );
      if (script) {
        scriptHashesByLocaleEpisode[`${locale}:${episodeId}`] = script.contentHash;
      }
    }
  }

  const sqlite = createPersistence(input.dbPath);
  sqlite.migrate();
  const microdramaRepository = new MicrodramaSQLiteRepository(sqlite);
  microdramaRepository.migrate();
  const voiceRepository = new CharacterVoiceSQLiteRepository(sqlite);
  voiceRepository.migrate();
  const budgetRepository = new MicrodramaBudgetRepository(sqlite);
  budgetRepository.migrateBudgets();

  for (const profile of defaultBoundedBatchBudgetProfiles(input.preparedAt)) {
    budgetRepository.upsertBudgetProfile({ profile });
  }

  const micro035Evidence = loadMicro035CanaryExecutionEvidence({
    repository: microdramaRepository,
    ...(input.micro035EvidenceJsonPath
      ? { jsonFilePath: input.micro035EvidenceJsonPath }
      : {}),
  });
  const micro035EvidenceContentHash = micro035Evidence
    ? computeMicro035EvidenceContentHash(micro035Evidence)
    : null;

  if (!micro035Evidence || micro035Evidence.status !== "DONE") {
    blockers.push("MICRO_035_EVIDENCE_MISSING");
  }

  if (!isOpenAiSpeechSecretConfigured()) {
    blockers.push("OPENAI_SECRET_MISSING");
  } else {
    await ensureSevenMinutesAheadNarratorVoiceProfilePersisted({
      port: voiceRepository,
      createdAt: input.preparedAt,
    });
    persistMicro036SpeechCredential({
      repository: microdramaRepository,
      record: buildMicro035OpenAiSpeechCredentialRecord({
        credentialHandle: MICRO_035_OPENAI_CREDENTIAL_HANDLE,
        registeredAt: input.preparedAt,
        modelConfigurations: MICRO_036_BATCH_LOCALES.map((locale) =>
          resolveMicro036OpenAiTtsModelConfigurationForLocale(locale)
        ),
      }),
    });
  }

  const probeOnly = await evaluateE004E010BoundedBatchPreflight({
    packRoot,
    admittedAt: input.admittedAt,
    evaluatedAt: input.preparedAt,
    profiles: defaultBoundedBatchBudgetProfiles(input.preparedAt),
    micro035Evidence,
  });

  blockers.push(
    ...verifyBindingProbe({
      scriptRevisionIds: probeOnly.scriptRevisionIds,
      scriptHashesByLocaleEpisode,
    })
  );
  blockers.push(...probeOnly.scopeBlockers);

  if (blockers.length === 0) {
    const scriptRevisionIds = probeOnly.scriptRevisionIds;
    const revisionSet = probeOnly.revisionSet;
    persistMicro036OperatorAuthorization({
      repository: microdramaRepository,
      record: buildOperatorAuthorization({
        scriptRevisionIds,
        operatorId,
        authorizedAt: input.preparedAt,
      }),
    });
    persistMicro036AssetGenerationApproval({
      repository: microdramaRepository,
      record: buildAssetGenerationApproval({
        scriptRevisionIds,
        operatorId,
        approvedAt: input.preparedAt,
      }),
    });
    persistMicro036CostBudgetApproval({
      repository: microdramaRepository,
      record: buildCostBudgetApproval({
        scriptRevisionIds,
        revisionSet,
        providerConfigRevision,
        operatorId,
        approvedAt: input.preparedAt,
      }),
    });
  }

  const loadedOperatorAuthorization = loadMicro036OperatorAuthorization(microdramaRepository);
  const loadedAssetGenerationApproval = loadMicro036AssetGenerationApproval(microdramaRepository);
  const loadedCostBudgetApproval = loadMicro036CostBudgetApproval(microdramaRepository);

  const finalPreflight = await evaluateE004E010BoundedBatchPreflight({
    packRoot,
    admittedAt: input.admittedAt,
    evaluatedAt: input.preparedAt,
    profiles: defaultBoundedBatchBudgetProfiles(input.preparedAt),
    micro035Evidence,
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
    visualProfileRevision: MICRO_036_VISUAL_PROFILE_REVISION,
    providerConfigRevision,
    providers: [...MICRO_036_PRODUCTION_PROVIDERS],
    revisionSet: probeOnly.revisionSet,
    assetGenerationApprovalId: loadedAssetGenerationApproval?.approvalId ?? null,
    operatorAuthorizationId: loadedOperatorAuthorization?.authorizationId ?? null,
    costBudgetApprovalId: loadedCostBudgetApproval?.approvalId ?? null,
    maximumProviderRequests: MICRO_036_BATCH_MAXIMUM_TOTAL_PROVIDER_REQUESTS,
    costLimitMinor: MICRO_036_BATCH_COST_LIMIT_MINOR,
    currency: MICRO_036_BATCH_CURRENCY,
    preflightAllowed,
    scriptRevisionIds: probeOnly.scriptRevisionIds,
    micro035EvidenceContentHash,
  };
}

export function micro036AuthorizationEvidenceSummary(input: {
  readonly preparation: Micro036BoundedBatchAuthorizationPreparationResult;
}): Record<string, unknown> {
  return {
    taskId: MICRO_036_TASK_ID,
    status: input.preparation.status,
    visualProfileRevision: input.preparation.visualProfileRevision,
    providerConfigRevision: input.preparation.providerConfigRevision,
    providers: input.preparation.providers,
    revisionSet: input.preparation.revisionSet,
    operatorAuthorizationRevision: input.preparation.operatorAuthorizationId
      ? computeMicro036AuthorizationRevisionId(
          "auth",
          input.preparation.operatorAuthorizationId
        )
      : null,
    assetGenerationApprovalRevision: input.preparation.assetGenerationApprovalId
      ? computeMicro036AuthorizationRevisionId(
          "approval",
          input.preparation.assetGenerationApprovalId
        )
      : null,
    costBudgetApprovalRevision: input.preparation.costBudgetApprovalId
      ? computeMicro036AuthorizationRevisionId(
          "cost",
          input.preparation.costBudgetApprovalId
        )
      : null,
    maximumProviderRequests: input.preparation.maximumProviderRequests,
    costLimitMinor: input.preparation.costLimitMinor,
    currency: input.preparation.currency,
    preflightAllowed: input.preparation.preflightAllowed,
    scriptRevisionIds: input.preparation.scriptRevisionIds,
    micro035EvidenceContentHash: input.preparation.micro035EvidenceContentHash,
    blockers: input.preparation.blockers,
  };
}
