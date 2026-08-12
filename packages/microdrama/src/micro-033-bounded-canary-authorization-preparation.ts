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
  defaultEnTtsCanaryBudgetProfiles,
  defaultV5PackRoot,
  evaluateEnE001E003TtsCanaryPreflight,
  MICRO_033_TASK_ID,
} from "./en-e001-e003-tts-canary-preflight.js";
import { compileV5CanonAdmission } from "./v5-canon-admission.js";
import {
  computeMicro033ProviderConfigRevision,
  MICRO_033_AUTHORIZATION_PACK_SCRIPT_FILE_HASHES,
  MICRO_033_AUTHORIZATION_PACK_SCRIPT_HASHES,
  MICRO_033_AUTHORIZATION_PACK_SCRIPT_FILE_HASHES,
  MICRO_033_AUTHORIZATION_PACK_SCRIPT_REVISIONS,
  MICRO_033_CANARY_COST_LIMIT_MINOR,
  MICRO_033_CANARY_CURRENCY,
  MICRO_033_CANARY_MAXIMUM_TOTAL_PROVIDER_REQUESTS,
  MICRO_033_DEFAULT_OPENAI_TTS_MODEL_CONFIGURATION,
  MICRO_033_PROVIDER_VOICE_ID,
} from "./micro-033-canary-bindings.js";
import {
  computeMicro033AuthorizationRevisionId,
  loadMicro033AssetGenerationApproval,
  loadMicro033CostBudgetApproval,
  loadMicro033OperatorAuthorization,
  loadMicro033SpeechCredential,
  MICRO_033_ASSET_GENERATION_APPROVAL_ID,
  MICRO_033_COST_BUDGET_APPROVAL_ID,
  MICRO_033_OPERATOR_AUTHORIZATION_ID,
  persistMicro033AssetGenerationApproval,
  persistMicro033CostBudgetApproval,
  persistMicro033OperatorAuthorization,
  persistMicro033SpeechCredential,
  type MicrodramaCostBudgetApprovalRecord,
} from "./micro-033-canary-authorization-persistence.js";
import {
  buildMicro033OpenAiSpeechCredentialRecord,
  isOpenAiSpeechSecretConfigured,
  MICRO_033_OPENAI_CREDENTIAL_HANDLE,
} from "./microdrama-openai-speech-credential.js";
import { ensureSevenMinutesAheadNarratorVoiceProfilePersisted } from "./seven-minutes-ahead-narrator-voice-persistence.js";
import {
  SEVEN_MINUTES_AHEAD_NARRATOR_OPENAI_MODEL_INTENT,
  SEVEN_MINUTES_AHEAD_NARRATOR_VOICE_PROFILE_ID,
  SEVEN_MINUTES_AHEAD_NARRATOR_VOICE_PROFILE_VERSION_ID,
} from "./seven-minutes-ahead-narrator-voice-registry.js";

export type Micro033BoundedCanaryAuthorizationPreparationInput = {
  readonly dbPath: string;
  readonly packRoot?: string;
  readonly admittedAt: string;
  readonly preparedAt: string;
  readonly operatorId?: string;
};

export type Micro033BoundedCanaryAuthorizationPreparationResult = {
  readonly status: "READY_FOR_EXPLICIT_EXECUTE" | "BLOCKED";
  readonly blockers: readonly string[];
  readonly voiceProfileId: string;
  readonly voiceRevision: string;
  readonly voiceBindingStatus: string;
  readonly provider: string;
  readonly providerModel: string;
  readonly providerVoiceId: string;
  readonly providerConfigRevision: string;
  readonly providerVoiceEvidenceHash: string;
  readonly credentialHandle: string | null;
  readonly assetGenerationApprovalId: string | null;
  readonly operatorAuthorizationId: string | null;
  readonly costBudgetApprovalId: string | null;
  readonly maximumProviderRequests: number;
  readonly costLimitMinor: number;
  readonly currency: string;
  readonly preflightAllowed: boolean;
  readonly scriptRevisionIds: readonly string[];
};

export function computeMicro033CanaryVoiceBindingEvidenceHash(input: {
  readonly voiceRevision: string;
  readonly provider: string;
  readonly providerModel: string;
  readonly providerVoiceId: string;
  readonly providerConfigRevision: string;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        scope: "micro-033.bounded-canary-voice-binding.v1",
        taskId: MICRO_033_TASK_ID,
        locale: "en-US",
        episodeIds: ["E001", "E002", "E003"],
        voiceRevision: input.voiceRevision,
        provider: input.provider,
        providerModel: input.providerModel,
        providerVoiceId: input.providerVoiceId,
        providerConfigRevision: input.providerConfigRevision,
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
    MICRO_033_AUTHORIZATION_PACK_SCRIPT_REVISIONS.E001,
    MICRO_033_AUTHORIZATION_PACK_SCRIPT_REVISIONS.E002,
    MICRO_033_AUTHORIZATION_PACK_SCRIPT_REVISIONS.E003,
  ].sort();
  const observedRevisions = [...input.scriptRevisionIds].sort();
  if (observedRevisions.join(",") !== expectedRevisions.join(",")) {
    blockers.push("SCRIPT_REVISION_BINDING_MISMATCH");
  }

  for (const episodeId of ["E001", "E002", "E003"] as const) {
    const expectedHash = MICRO_033_AUTHORIZATION_PACK_SCRIPT_FILE_HASHES[episodeId];
    const observedHash = input.scriptHashesByEpisode[episodeId];
    if (observedHash !== expectedHash) {
      blockers.push(`SCRIPT_HASH_MISMATCH_${episodeId}`);
    }
  }

  return blockers;
}

function buildOperatorAuthorization(input: {
  readonly scriptRevisionIds: readonly string[];
  readonly voiceRevision: string;
  readonly operatorId: string;
  readonly authorizedAt: string;
}): MicrodramaOperatorAuthorizationRecord {
  return {
    schemaVersion: "mediaforge.microdrama-operator-authorization.v1",
    authorizationId: MICRO_033_OPERATOR_AUTHORIZATION_ID,
    taskId: MICRO_033_TASK_ID,
    kind: "BOUNDED_PAID_PROVIDER_EFFECT",
    state: "active",
    bindings: {
      episodeIds: ["e001", "e002", "e003"],
      locale: "en-US",
      scriptRevisionIds: [...input.scriptRevisionIds],
      voiceRevision: input.voiceRevision,
      provider: "openai",
      costLimitMinor: MICRO_033_CANARY_COST_LIMIT_MINOR,
    },
    authorizedAt: input.authorizedAt,
    operatorId: input.operatorId,
  };
}

function buildAssetGenerationApproval(input: {
  readonly scriptRevisionIds: readonly string[];
  readonly voiceRevision: string;
  readonly operatorId: string;
  readonly approvedAt: string;
}): MicrodramaAssetGenerationApproval {
  return {
    schemaVersion: "mediaforge.microdrama-asset-generation-approval.v1",
    approvalId: MICRO_033_ASSET_GENERATION_APPROVAL_ID,
    taskId: MICRO_033_TASK_ID,
    state: "active",
    scope: {
      episodeIds: ["e001", "e002", "e003"],
      locale: "en-US",
      scriptRevisionIds: [...input.scriptRevisionIds],
      assetKinds: ["tts", "alignment"],
      providers: ["openai"],
      voiceRevision: input.voiceRevision,
      costLimitMinor: MICRO_033_CANARY_COST_LIMIT_MINOR,
    },
    approvedAt: input.approvedAt,
    operatorId: input.operatorId,
  };
}

function buildCostBudgetApproval(input: {
  readonly scriptRevisionIds: readonly string[];
  readonly voiceRevision: string;
  readonly providerConfigRevision: string;
  readonly operatorId: string;
  readonly approvedAt: string;
}): MicrodramaCostBudgetApprovalRecord {
  return {
    schemaVersion: "mediaforge.microdrama-cost-budget-approval.v1",
    approvalId: MICRO_033_COST_BUDGET_APPROVAL_ID,
    taskId: MICRO_033_TASK_ID,
    costLimitMinor: MICRO_033_CANARY_COST_LIMIT_MINOR,
    currency: MICRO_033_CANARY_CURRENCY,
    maximumProviderRequests: MICRO_033_CANARY_MAXIMUM_TOTAL_PROVIDER_REQUESTS,
    episodeIds: ["e001", "e002", "e003"],
    locale: "en-US",
    scriptRevisionIds: [...input.scriptRevisionIds],
    voiceRevision: input.voiceRevision,
    provider: "openai",
    providerModel: SEVEN_MINUTES_AHEAD_NARRATOR_OPENAI_MODEL_INTENT,
    providerVoiceId: MICRO_033_PROVIDER_VOICE_ID,
    providerConfigRevision: input.providerConfigRevision,
    approvedAt: input.approvedAt,
    operatorId: input.operatorId,
  };
}

export async function prepareMicro033BoundedCanaryAuthorization(
  input: Micro033BoundedCanaryAuthorizationPreparationInput
): Promise<Micro033BoundedCanaryAuthorizationPreparationResult> {
  const blockers: string[] = [];
  const packRoot = input.packRoot ?? defaultV5PackRoot;
  const operatorId = input.operatorId ?? "operator.microdrama";
  const providerConfigRevision = computeMicro033ProviderConfigRevision(
    MICRO_033_DEFAULT_OPENAI_TTS_MODEL_CONFIGURATION
  );
  const providerVoiceEvidenceHash = computeMicro033CanaryVoiceBindingEvidenceHash({
    voiceRevision: SEVEN_MINUTES_AHEAD_NARRATOR_VOICE_PROFILE_VERSION_ID,
    provider: "openai",
    providerModel: SEVEN_MINUTES_AHEAD_NARRATOR_OPENAI_MODEL_INTENT,
    providerVoiceId: MICRO_033_PROVIDER_VOICE_ID,
    providerConfigRevision,
  });

  const admission = compileV5CanonAdmission(packRoot, input.admittedAt);
  if (!admission.ok) {
    return {
      status: "BLOCKED",
      blockers: ["PACK_ADMISSION_FAILED"],
      voiceProfileId: SEVEN_MINUTES_AHEAD_NARRATOR_VOICE_PROFILE_ID,
      voiceRevision: SEVEN_MINUTES_AHEAD_NARRATOR_VOICE_PROFILE_VERSION_ID,
      voiceBindingStatus: "MISSING",
      provider: "openai",
      providerModel: SEVEN_MINUTES_AHEAD_NARRATOR_OPENAI_MODEL_INTENT,
      providerVoiceId: MICRO_033_PROVIDER_VOICE_ID,
      providerConfigRevision,
      providerVoiceEvidenceHash,
      credentialHandle: null,
      assetGenerationApprovalId: null,
      operatorAuthorizationId: null,
      costBudgetApprovalId: null,
      maximumProviderRequests: MICRO_033_CANARY_MAXIMUM_TOTAL_PROVIDER_REQUESTS,
      costLimitMinor: MICRO_033_CANARY_COST_LIMIT_MINOR,
      currency: MICRO_033_CANARY_CURRENCY,
      preflightAllowed: false,
      scriptRevisionIds: [],
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

  const probeOnly = await evaluateEnE001E003TtsCanaryPreflight({
    packRoot,
    admittedAt: input.admittedAt,
    evaluatedAt: input.preparedAt,
    profiles: defaultEnTtsCanaryBudgetProfiles(input.preparedAt),
  });

  blockers.push(
    ...verifyBindingProbe({
      scriptRevisionIds: probeOnly.bindingProbe.scriptRevisionIds,
      scriptHashesByEpisode,
    })
  );

  if (probeOnly.bindingProbe.voiceRevision !== SEVEN_MINUTES_AHEAD_NARRATOR_VOICE_PROFILE_VERSION_ID) {
    blockers.push("VOICE_REVISION_BINDING_MISMATCH");
  }

  const sqlite = createPersistence(input.dbPath);
  sqlite.migrate();
  const microdramaRepository = new MicrodramaSQLiteRepository(sqlite);
  microdramaRepository.migrate();
  const voiceRepository = new CharacterVoiceSQLiteRepository(sqlite);
  voiceRepository.migrate();
  const budgetRepository = new MicrodramaBudgetRepository(sqlite);
  budgetRepository.migrateBudgets();

  for (const profile of defaultEnTtsCanaryBudgetProfiles(input.preparedAt)) {
    budgetRepository.upsertBudgetProfile({ profile });
  }

  let voiceBindingStatus = "MISSING";
  if (blockers.length === 0) {
    await ensureSevenMinutesAheadNarratorVoiceProfilePersisted({
      port: voiceRepository,
      createdAt: input.preparedAt,
    });

    const boundVersion = voiceRepository.recordBoundedCanaryApprovedProviderBinding({
      profileVersionId: SEVEN_MINUTES_AHEAD_NARRATOR_VOICE_PROFILE_VERSION_ID,
      providerVoiceId: MICRO_033_PROVIDER_VOICE_ID,
      canaryEvidenceArtifactHash: providerVoiceEvidenceHash,
      recordedAt: input.preparedAt,
    });
    voiceBindingStatus = boundVersion.voiceBindingStatus;
  }

  let credentialHandle: string | null = null;
  if (!isOpenAiSpeechSecretConfigured()) {
    blockers.push("OPENAI_SECRET_REQUIRED");
  } else {
    const credential = buildMicro033OpenAiSpeechCredentialRecord({
      registeredAt: input.admittedAt,
      principalId: operatorId,
    });
    persistMicro033SpeechCredential({
      repository: microdramaRepository,
      record: credential,
    });
    credentialHandle = credential.credentialHandle;
  }

  if (blockers.length === 0) {
    const scriptRevisionIds = probeOnly.bindingProbe.scriptRevisionIds;
    const operatorAuthorization = buildOperatorAuthorization({
      scriptRevisionIds,
      voiceRevision: SEVEN_MINUTES_AHEAD_NARRATOR_VOICE_PROFILE_VERSION_ID,
      operatorId,
      authorizedAt: input.preparedAt,
    });
    const assetGenerationApproval = buildAssetGenerationApproval({
      scriptRevisionIds,
      voiceRevision: SEVEN_MINUTES_AHEAD_NARRATOR_VOICE_PROFILE_VERSION_ID,
      operatorId,
      approvedAt: input.preparedAt,
    });
    const costBudgetApproval = buildCostBudgetApproval({
      scriptRevisionIds,
      voiceRevision: SEVEN_MINUTES_AHEAD_NARRATOR_VOICE_PROFILE_VERSION_ID,
      providerConfigRevision,
      operatorId,
      approvedAt: input.preparedAt,
    });

    persistMicro033OperatorAuthorization({
      repository: microdramaRepository,
      record: operatorAuthorization,
    });
    persistMicro033AssetGenerationApproval({
      repository: microdramaRepository,
      record: assetGenerationApproval,
    });
    persistMicro033CostBudgetApproval({
      repository: microdramaRepository,
      record: costBudgetApproval,
    });
  }

  const loadedOperatorAuthorization = loadMicro033OperatorAuthorization(microdramaRepository);
  const loadedAssetGenerationApproval = loadMicro033AssetGenerationApproval(microdramaRepository);
  const loadedSpeechCredential = loadMicro033SpeechCredential(microdramaRepository);
  const loadedCostBudgetApproval = loadMicro033CostBudgetApproval(microdramaRepository);

  const finalPreflight = await evaluateEnE001E003TtsCanaryPreflight({
    packRoot,
    admittedAt: input.admittedAt,
    evaluatedAt: input.preparedAt,
    profiles: defaultEnTtsCanaryBudgetProfiles(input.preparedAt),
    operatorAuthorization: loadedOperatorAuthorization ?? undefined,
    assetGenerationApproval: loadedAssetGenerationApproval ?? undefined,
    voiceRegistryPort: voiceRepository,
    speechCredential: loadedSpeechCredential ?? undefined,
  });

  const preflightAllowed =
    blockers.length === 0 && finalPreflight.preflight.allowed;

  if (!preflightAllowed && blockers.length === 0) {
    blockers.push(...finalPreflight.preflight.blockReasons);
  }

  return {
    status: preflightAllowed ? "READY_FOR_EXPLICIT_EXECUTE" : "BLOCKED",
    blockers,
    voiceProfileId: SEVEN_MINUTES_AHEAD_NARRATOR_VOICE_PROFILE_ID,
    voiceRevision: SEVEN_MINUTES_AHEAD_NARRATOR_VOICE_PROFILE_VERSION_ID,
    voiceBindingStatus,
    provider: "openai",
    providerModel: SEVEN_MINUTES_AHEAD_NARRATOR_OPENAI_MODEL_INTENT,
    providerVoiceId: MICRO_033_PROVIDER_VOICE_ID,
    providerConfigRevision,
    providerVoiceEvidenceHash,
    credentialHandle,
    assetGenerationApprovalId: loadedAssetGenerationApproval?.approvalId ?? null,
    operatorAuthorizationId: loadedOperatorAuthorization?.authorizationId ?? null,
    costBudgetApprovalId: loadedCostBudgetApproval?.approvalId ?? null,
    maximumProviderRequests: MICRO_033_CANARY_MAXIMUM_TOTAL_PROVIDER_REQUESTS,
    costLimitMinor: MICRO_033_CANARY_COST_LIMIT_MINOR,
    currency: MICRO_033_CANARY_CURRENCY,
    preflightAllowed,
    scriptRevisionIds: probeOnly.bindingProbe.scriptRevisionIds,
  };
}

export function micro033AuthorizationEvidenceSummary(input: {
  readonly preparation: Micro033BoundedCanaryAuthorizationPreparationResult;
}): Record<string, unknown> {
  return {
    taskId: MICRO_033_TASK_ID,
    status: input.preparation.status,
    voiceProfileId: input.preparation.voiceProfileId,
    voiceRevision: input.preparation.voiceRevision,
    voiceBindingStatus: input.preparation.voiceBindingStatus,
    provider: input.preparation.provider,
    providerModel: input.preparation.providerModel,
    providerVoiceId: input.preparation.providerVoiceId,
    providerConfigRevision: input.preparation.providerConfigRevision,
    providerVoiceEvidenceHash: input.preparation.providerVoiceEvidenceHash,
    credentialHandle: input.preparation.credentialHandle ?? MICRO_033_OPENAI_CREDENTIAL_HANDLE,
    operatorAuthorizationRevision: input.preparation.operatorAuthorizationId
      ? computeMicro033AuthorizationRevisionId(
          "auth",
          input.preparation.operatorAuthorizationId
        )
      : null,
    assetGenerationApprovalRevision: input.preparation.assetGenerationApprovalId
      ? computeMicro033AuthorizationRevisionId(
          "approval",
          input.preparation.assetGenerationApprovalId
        )
      : null,
    costBudgetApprovalRevision: input.preparation.costBudgetApprovalId
      ? computeMicro033AuthorizationRevisionId(
          "cost",
          input.preparation.costBudgetApprovalId
        )
      : null,
    maximumProviderRequests: input.preparation.maximumProviderRequests,
    costLimitMinor: input.preparation.costLimitMinor,
    currency: input.preparation.currency,
    preflightAllowed: input.preparation.preflightAllowed,
    scriptRevisionIds: input.preparation.scriptRevisionIds,
    blockers: input.preparation.blockers,
  };
}
