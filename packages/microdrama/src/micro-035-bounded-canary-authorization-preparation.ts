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
  defaultMultilingualCanaryBudgetProfiles,
  defaultV5PackRoot,
  evaluateDeEsPtE001E003MultilingualCanaryPreflight,
  MICRO_035_TASK_ID,
} from "./de-es-pt-e001-e003-multilingual-canary-preflight.js";
import { compileV5CanonAdmission } from "./v5-canon-admission.js";
import {
  computeMicro035ProviderConfigRevision,
  MICRO_035_AUTHORIZATION_PACK_SCRIPT_FILE_HASHES,
  MICRO_035_AUTHORIZATION_PACK_SCRIPT_REVISIONS,
  MICRO_035_CANARY_COST_LIMIT_MINOR,
  MICRO_035_CANARY_CURRENCY,
  MICRO_035_CANARY_EPISODE_IDS,
  MICRO_035_CANARY_LOCALES,
  MICRO_035_CANARY_MAXIMUM_TOTAL_PROVIDER_REQUESTS,
  MICRO_035_PRODUCTION_PROVIDERS,
  MICRO_035_SHARED_VISUAL_REVISION_IDS,
  MICRO_035_VISUAL_PROFILE_REVISION,
} from "./micro-035-canary-bindings.js";
import {
  computeMicro035AuthorizationRevisionId,
  loadMicro035AssetGenerationApproval,
  loadMicro035CostBudgetApproval,
  loadMicro035OperatorAuthorization,
  MICRO_035_ASSET_GENERATION_APPROVAL_ID,
  MICRO_035_COST_BUDGET_APPROVAL_ID,
  MICRO_035_OPERATOR_AUTHORIZATION_ID,
  persistMicro035AssetGenerationApproval,
  persistMicro035CostBudgetApproval,
  persistMicro035OperatorAuthorization,
  persistMicro035SpeechCredential,
  type MicrodramaMultilingualCostBudgetApprovalRecord,
} from "./micro-035-canary-authorization-persistence.js";
import {
  computeMicro034EvidenceContentHash,
  extractMicro034SharedVisualRevisionIds,
  loadMicro034CanaryExecutionEvidence,
} from "./micro-035-canary-micro-034-evidence.js";
import {
  buildMicro035OpenAiSpeechCredentialRecord,
  isOpenAiSpeechSecretConfigured,
  MICRO_035_OPENAI_CREDENTIAL_HANDLE,
} from "./microdrama-openai-speech-credential.js";
import { resolveMicro035OpenAiTtsModelConfigurationForLocale } from "./micro-035-openai-tts-env.js";
import { ensureSevenMinutesAheadNarratorVoiceProfilePersisted } from "./seven-minutes-ahead-narrator-voice-persistence.js";

export type Micro035BoundedCanaryAuthorizationPreparationInput = {
  readonly dbPath: string;
  readonly packRoot?: string;
  readonly admittedAt: string;
  readonly preparedAt: string;
  readonly operatorId?: string;
  readonly micro034EvidenceJsonPath?: string;
};

export type Micro035BoundedCanaryAuthorizationPreparationResult = {
  readonly status: "READY_FOR_EXPLICIT_EXECUTE" | "BLOCKED";
  readonly blockers: readonly string[];
  readonly visualProfileRevision: string;
  readonly providerConfigRevision: string;
  readonly providers: readonly string[];
  readonly sharedVisualRevisionIds: readonly string[];
  readonly assetGenerationApprovalId: string | null;
  readonly operatorAuthorizationId: string | null;
  readonly costBudgetApprovalId: string | null;
  readonly maximumProviderRequests: number;
  readonly costLimitMinor: number;
  readonly currency: string;
  readonly preflightAllowed: boolean;
  readonly scriptRevisionIds: readonly string[];
  readonly micro034EvidenceContentHash: string | null;
};

export function computeMicro035CanaryMultilingualBindingEvidenceHash(input: {
  readonly visualProfileRevision: string;
  readonly providerConfigRevision: string;
  readonly sharedVisualRevisionIds: readonly string[];
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        scope: "micro-035.bounded-canary-multilingual-binding.v1",
        taskId: MICRO_035_TASK_ID,
        locales: [...MICRO_035_CANARY_LOCALES],
        episodeIds: ["E001", "E002", "E003"],
        visualProfileRevision: input.visualProfileRevision,
        providerConfigRevision: input.providerConfigRevision,
        sharedVisualRevisionIds: [...input.sharedVisualRevisionIds].sort(),
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
  for (const locale of MICRO_035_CANARY_LOCALES) {
    for (const episodeId of MICRO_035_CANARY_EPISODE_IDS) {
      expectedRevisions.push(
        MICRO_035_AUTHORIZATION_PACK_SCRIPT_REVISIONS[locale][episodeId]
      );
    }
  }
  const observedRevisions = [...input.scriptRevisionIds].sort();
  if (observedRevisions.join(",") !== [...expectedRevisions].sort().join(",")) {
    blockers.push("SCRIPT_REVISION_BINDING_MISMATCH");
  }

  for (const locale of MICRO_035_CANARY_LOCALES) {
    for (const episodeId of MICRO_035_CANARY_EPISODE_IDS) {
      const expectedHash =
        MICRO_035_AUTHORIZATION_PACK_SCRIPT_FILE_HASHES[locale][episodeId];
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
    authorizationId: MICRO_035_OPERATOR_AUTHORIZATION_ID,
    taskId: MICRO_035_TASK_ID,
    kind: "BOUNDED_PAID_PROVIDER_EFFECT",
    state: "active",
    bindings: {
      episodeIds: ["e001", "e002", "e003"],
      locale: "de-DE",
      scriptRevisionIds: [...input.scriptRevisionIds],
      voiceRevision: MICRO_035_VISUAL_PROFILE_REVISION,
      provider: "openai",
      costLimitMinor: MICRO_035_CANARY_COST_LIMIT_MINOR,
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
    approvalId: MICRO_035_ASSET_GENERATION_APPROVAL_ID,
    taskId: MICRO_035_TASK_ID,
    state: "active",
    scope: {
      episodeIds: ["e001", "e002", "e003"],
      locale: "de-DE",
      scriptRevisionIds: [...input.scriptRevisionIds],
      assetKinds: ["tts", "alignment", "render", "image"],
      providers: [...MICRO_035_PRODUCTION_PROVIDERS],
      voiceRevision: MICRO_035_VISUAL_PROFILE_REVISION,
      costLimitMinor: MICRO_035_CANARY_COST_LIMIT_MINOR,
    },
    approvedAt: input.approvedAt,
    operatorId: input.operatorId,
  };
}

function buildCostBudgetApproval(input: {
  readonly scriptRevisionIds: readonly string[];
  readonly sharedVisualRevisionIds: readonly string[];
  readonly providerConfigRevision: string;
  readonly operatorId: string;
  readonly approvedAt: string;
}): MicrodramaMultilingualCostBudgetApprovalRecord {
  return {
    schemaVersion: "mediaforge.microdrama-cost-budget-approval.v1",
    approvalId: MICRO_035_COST_BUDGET_APPROVAL_ID,
    taskId: MICRO_035_TASK_ID,
    costLimitMinor: MICRO_035_CANARY_COST_LIMIT_MINOR,
    currency: MICRO_035_CANARY_CURRENCY,
    maximumProviderRequests: MICRO_035_CANARY_MAXIMUM_TOTAL_PROVIDER_REQUESTS,
    episodeIds: ["e001", "e002", "e003"],
    locales: [...MICRO_035_CANARY_LOCALES],
    scriptRevisionIds: [...input.scriptRevisionIds],
    sharedVisualRevisionIds: [...input.sharedVisualRevisionIds],
    visualProfileRevision: MICRO_035_VISUAL_PROFILE_REVISION,
    providers: [...MICRO_035_PRODUCTION_PROVIDERS],
    providerConfigRevision: input.providerConfigRevision,
    approvedAt: input.approvedAt,
    operatorId: input.operatorId,
  };
}

export async function prepareMicro035BoundedCanaryAuthorization(
  input: Micro035BoundedCanaryAuthorizationPreparationInput
): Promise<Micro035BoundedCanaryAuthorizationPreparationResult> {
  const blockers: string[] = [];
  const packRoot = input.packRoot ?? defaultV5PackRoot;
  const operatorId = input.operatorId ?? "operator.microdrama";
  const providerConfigRevision = computeMicro035ProviderConfigRevision();

  const admission = compileV5CanonAdmission(packRoot, input.admittedAt);
  if (!admission.ok) {
    return {
      status: "BLOCKED",
      blockers: ["PACK_ADMISSION_FAILED"],
      visualProfileRevision: MICRO_035_VISUAL_PROFILE_REVISION,
      providerConfigRevision,
      providers: [...MICRO_035_PRODUCTION_PROVIDERS],
      sharedVisualRevisionIds: [],
      assetGenerationApprovalId: null,
      operatorAuthorizationId: null,
      costBudgetApprovalId: null,
      maximumProviderRequests: MICRO_035_CANARY_MAXIMUM_TOTAL_PROVIDER_REQUESTS,
      costLimitMinor: MICRO_035_CANARY_COST_LIMIT_MINOR,
      currency: MICRO_035_CANARY_CURRENCY,
      preflightAllowed: false,
      scriptRevisionIds: [],
      micro034EvidenceContentHash: null,
    };
  }

  const scriptHashesByLocaleEpisode: Record<string, string> = {};
  for (const locale of MICRO_035_CANARY_LOCALES) {
    for (const episodeId of MICRO_035_CANARY_EPISODE_IDS) {
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

  for (const profile of defaultMultilingualCanaryBudgetProfiles(input.preparedAt)) {
    budgetRepository.upsertBudgetProfile({ profile });
  }

  const micro034Evidence = loadMicro034CanaryExecutionEvidence({
    repository: microdramaRepository,
    ...(input.micro034EvidenceJsonPath
      ? { jsonFilePath: input.micro034EvidenceJsonPath }
      : {}),
  });
  const micro034EvidenceContentHash = micro034Evidence
    ? computeMicro034EvidenceContentHash(micro034Evidence)
    : null;

  if (!micro034Evidence || micro034Evidence.status !== "DONE") {
    blockers.push("MICRO_034_EVIDENCE_MISSING");
  }

  const sharedVisualRevisionIds = micro034Evidence
    ? extractMicro034SharedVisualRevisionIds(micro034Evidence)
    : [...Object.values(MICRO_035_SHARED_VISUAL_REVISION_IDS)];

  if (!isOpenAiSpeechSecretConfigured()) {
    blockers.push("OPENAI_SECRET_MISSING");
  } else {
    await ensureSevenMinutesAheadNarratorVoiceProfilePersisted({
      port: voiceRepository,
      createdAt: input.preparedAt,
    });
    persistMicro035SpeechCredential({
      repository: microdramaRepository,
      record: buildMicro035OpenAiSpeechCredentialRecord({
        credentialHandle: MICRO_035_OPENAI_CREDENTIAL_HANDLE,
        registeredAt: input.preparedAt,
        modelConfigurations: MICRO_035_CANARY_LOCALES.map((locale) =>
          resolveMicro035OpenAiTtsModelConfigurationForLocale(locale)
        ),
      }),
    });
  }

  const probeOnly = await evaluateDeEsPtE001E003MultilingualCanaryPreflight({
    packRoot,
    admittedAt: input.admittedAt,
    evaluatedAt: input.preparedAt,
    profiles: defaultMultilingualCanaryBudgetProfiles(input.preparedAt),
    micro034Evidence,
  });

  blockers.push(
    ...verifyBindingProbe({
      scriptRevisionIds: probeOnly.scriptRevisionIds,
      scriptHashesByLocaleEpisode,
    })
  );

  if (blockers.length === 0) {
    const scriptRevisionIds = probeOnly.scriptRevisionIds;
    persistMicro035OperatorAuthorization({
      repository: microdramaRepository,
      record: buildOperatorAuthorization({
        scriptRevisionIds,
        operatorId,
        authorizedAt: input.preparedAt,
      }),
    });
    persistMicro035AssetGenerationApproval({
      repository: microdramaRepository,
      record: buildAssetGenerationApproval({
        scriptRevisionIds,
        operatorId,
        approvedAt: input.preparedAt,
      }),
    });
    persistMicro035CostBudgetApproval({
      repository: microdramaRepository,
      record: buildCostBudgetApproval({
        scriptRevisionIds,
        sharedVisualRevisionIds,
        providerConfigRevision,
        operatorId,
        approvedAt: input.preparedAt,
      }),
    });
  }

  const loadedOperatorAuthorization = loadMicro035OperatorAuthorization(microdramaRepository);
  const loadedAssetGenerationApproval = loadMicro035AssetGenerationApproval(microdramaRepository);
  const loadedCostBudgetApproval = loadMicro035CostBudgetApproval(microdramaRepository);

  const finalPreflight = await evaluateDeEsPtE001E003MultilingualCanaryPreflight({
    packRoot,
    admittedAt: input.admittedAt,
    evaluatedAt: input.preparedAt,
    profiles: defaultMultilingualCanaryBudgetProfiles(input.preparedAt),
    micro034Evidence,
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
    visualProfileRevision: MICRO_035_VISUAL_PROFILE_REVISION,
    providerConfigRevision,
    providers: [...MICRO_035_PRODUCTION_PROVIDERS],
    sharedVisualRevisionIds,
    assetGenerationApprovalId: loadedAssetGenerationApproval?.approvalId ?? null,
    operatorAuthorizationId: loadedOperatorAuthorization?.authorizationId ?? null,
    costBudgetApprovalId: loadedCostBudgetApproval?.approvalId ?? null,
    maximumProviderRequests: MICRO_035_CANARY_MAXIMUM_TOTAL_PROVIDER_REQUESTS,
    costLimitMinor: MICRO_035_CANARY_COST_LIMIT_MINOR,
    currency: MICRO_035_CANARY_CURRENCY,
    preflightAllowed,
    scriptRevisionIds: probeOnly.scriptRevisionIds,
    micro034EvidenceContentHash,
  };
}

export function micro035AuthorizationEvidenceSummary(input: {
  readonly preparation: Micro035BoundedCanaryAuthorizationPreparationResult;
}): Record<string, unknown> {
  return {
    taskId: MICRO_035_TASK_ID,
    status: input.preparation.status,
    visualProfileRevision: input.preparation.visualProfileRevision,
    providerConfigRevision: input.preparation.providerConfigRevision,
    providers: input.preparation.providers,
    sharedVisualRevisionIds: input.preparation.sharedVisualRevisionIds,
    operatorAuthorizationRevision: input.preparation.operatorAuthorizationId
      ? computeMicro035AuthorizationRevisionId(
          "auth",
          input.preparation.operatorAuthorizationId
        )
      : null,
    assetGenerationApprovalRevision: input.preparation.assetGenerationApprovalId
      ? computeMicro035AuthorizationRevisionId(
          "approval",
          input.preparation.assetGenerationApprovalId
        )
      : null,
    costBudgetApprovalRevision: input.preparation.costBudgetApprovalId
      ? computeMicro035AuthorizationRevisionId(
          "cost",
          input.preparation.costBudgetApprovalId
        )
      : null,
    maximumProviderRequests: input.preparation.maximumProviderRequests,
    costLimitMinor: input.preparation.costLimitMinor,
    currency: input.preparation.currency,
    preflightAllowed: input.preparation.preflightAllowed,
    scriptRevisionIds: input.preparation.scriptRevisionIds,
    micro034EvidenceContentHash: input.preparation.micro034EvidenceContentHash,
    blockers: input.preparation.blockers,
  };
}
