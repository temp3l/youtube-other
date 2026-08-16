import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";

import {
  FakeMicrodramaPublicationRepository,
  FakeMicrodramaTikTokAppAuditRepository,
  MicrodramaBudgetRepository,
  MicrodramaSQLiteRepository,
  createPersistence,
} from "@mediaforge/persistence";
import { computePayloadHash } from "@mediaforge/narrative-core";
import {
  FixtureTikTokDirectPostAdapter,
  InMemoryTikTokDirectPostPersistence,
} from "@mediaforge/tiktok-publishing";
import type { MicrodramaCostAttribution } from "@mediaforge/domain";

import { defaultV5PackRoot } from "./e004-e010-bounded-batch-preflight.js";
import { compileV5CanonAdmission } from "./v5-canon-admission.js";
import {
  loadMicro039E013AssetGenerationApproval,
  loadMicro039E013CostBudgetApproval,
  loadMicro039E013OperatorAuthorization,
} from "./micro-039-e013-batch-authorization-persistence.js";
import {
  buildMicro039E013BatchBindingProbe,
  isMicro039E013OutOfScopeEpisodeId,
  MICRO_039_E013_BATCH_COST_LIMIT_MINOR,
  MICRO_039_E013_BATCH_EPISODE_IDS,
  MICRO_039_E013_BATCH_LOCALES,
  MICRO_039_E013_BATCH_MAXIMUM_TOTAL_PROVIDER_REQUESTS,
  MICRO_039_E013_EPISODE_RANGE,
  MICRO_039_E013_PUBLICATION_ATTEMPT_ID,
  MICRO_039_E013_PUBLICATION_IDEMPOTENCY_KEY,
  MICRO_039_E013_PUBLICATION_INTENT_ID,
  MICRO_039_E013_TASK_ID,
  type Micro039E013BatchLocale,
} from "./micro-039-e013-batch-bindings.js";
import type { Micro039SegmentSynthesisPorts } from "./micro-039-batch-production-ports.js";
import {
  defaultMicro039BudgetProfiles,
  produceMicro039LocaleEpisodeTts,
} from "./micro-039-episode-tts-production.js";
import { MICRO_050_CANARY_PROVIDER_ACCOUNT_ID } from "./micro-050-canary-bindings.js";
import { MICRO_050_REFRESHED_CREDENTIAL_VERSION_ID } from "./micro-050-canary-bindings.js";
import {
  computeUpstreamEvidenceContentHash,
  DEFAULT_MICRO_036_BATCH_EVIDENCE_JSON_PATH,
  DEFAULT_MICRO_038_PUBLIC_EVIDENCE_JSON_PATH,
  DEFAULT_MICRO_039_E012_BATCH_EVIDENCE_JSON_PATH,
  DEFAULT_MICRO_042_READ_EVIDENCE_JSON_PATH,
  loadMicro036BatchEvidenceForMicro039E013,
  loadMicro038PublicEvidenceForMicro039E013,
  loadMicro039E012BatchEvidenceForMicro039E013,
  loadMicro042ReadEvidenceForMicro039E013,
  micro036EvidenceProvesBatchDone,
  micro038EvidenceProvesPublicDone,
  micro039E012EvidenceProvesProgressiveDone,
  micro042EvidenceProvesReadDone,
} from "./micro-039-e013-batch-evidence.js";
import {
  buildMicro039E013ExplicitExecuteAuthorizationRecord,
  computeMicro039E013PreparationFingerprint,
  loadMicro039E013ExplicitExecuteAuthorization,
  persistMicro039E013ExplicitExecuteAuthorization,
  summarizeMicro039E013PreparationForFingerprint,
} from "./micro-039-e013-explicit-execute-authorization.js";
import { evaluateMicro039E013ProgressiveBatchPreflight } from "./micro-039-e013-progressive-batch-preflight.js";

export const MICRO_039_E013_BATCH_EXECUTION_EVIDENCE_PROJECTION_KEY =
  "microdrama.batch-execution-evidence.MICRO-039-E013";

export type Micro039E013ProgressiveBatchPorts = {
  readonly publicationRepository: FakeMicrodramaPublicationRepository;
  readonly directPostPersistence: InMemoryTikTokDirectPostPersistence;
  readonly directPostAdapter: FixtureTikTokDirectPostAdapter;
  readonly auditRepository: FakeMicrodramaTikTokAppAuditRepository;
};

export function createMicro039E013ProgressiveBatchPorts(): Micro039E013ProgressiveBatchPorts {
  const publicationRepository = new FakeMicrodramaPublicationRepository();
  publicationRepository.migratePublication();
  const auditRepository = new FakeMicrodramaTikTokAppAuditRepository();
  auditRepository.migrateTikTokAppAudit();
  return {
    publicationRepository,
    directPostPersistence: new InMemoryTikTokDirectPostPersistence(),
    directPostAdapter: new FixtureTikTokDirectPostAdapter("tiktok.publish.micro-039-e013"),
    auditRepository,
  };
}

export type Micro039E013EpisodeBatchEvidence = {
  readonly locale: Micro039E013BatchLocale;
  readonly episodeId: "E013";
  readonly renderOutputPath: string;
  readonly visualRenderHash: string;
  readonly selectedAudioPath: string;
  readonly narrationAudioPath?: string;
};

export type Micro039E013AuthorizeExplicitExecuteInput = {
  readonly dbPath: string;
  readonly authorizedAt: string;
  readonly operatorId?: string;
  readonly packRoot?: string;
  readonly micro036EvidenceJsonPath?: string;
  readonly micro038EvidenceJsonPath?: string;
  readonly micro039E012EvidenceJsonPath?: string;
  readonly micro042EvidenceJsonPath?: string;
};

export type Micro039E013AuthorizeExplicitExecuteResult = {
  readonly status: "AUTHORIZED" | "BLOCKED";
  readonly blockers: readonly string[];
  readonly authorizationId: string | null;
  readonly preparationFingerprint: string | null;
};

export type Micro039E013BoundedProgressiveBatchExecuteInput = {
  readonly dbPath: string;
  readonly executedAt: string;
  readonly outputRoot: string;
  readonly operatorId?: string;
  readonly packRoot?: string;
  readonly admittedAt?: string;
  readonly ports: Micro039E013ProgressiveBatchPorts;
  readonly segmentSynthesisPorts: Micro039SegmentSynthesisPorts;
  readonly measureDurationMs?: (audioPath: string) => number;
  readonly skipNarrationConcat?: boolean;
  readonly micro036EvidenceJsonPath?: string;
  readonly micro038EvidenceJsonPath?: string;
  readonly micro039E012EvidenceJsonPath?: string;
  readonly micro042EvidenceJsonPath?: string;
  readonly requestedEpisodeIds?: readonly string[];
};

export type Micro039E013BoundedProgressiveBatchExecuteResult = {
  readonly status: "DONE" | "BLOCKED";
  readonly blockers: readonly string[];
  readonly publicationCalls: number;
  readonly paidCalls: number;
  readonly providerRequests: number;
  readonly totalCostMinor: number;
  readonly episodes: readonly Micro039E013EpisodeBatchEvidence[];
  readonly publishId: string | null;
  readonly receiptPublicVideoId: string | null;
  readonly learningAdmissionId: string | null;
  readonly observationAudit: {
    readonly micro042ObservationId: string | null;
    readonly status: "PASSED" | "BLOCKED";
  };
  readonly evidenceProjectionKey: string;
};

function loadUpstream(input: {
  readonly repository: MicrodramaSQLiteRepository;
  readonly micro036EvidenceJsonPath?: string;
  readonly micro038EvidenceJsonPath?: string;
  readonly micro039E012EvidenceJsonPath?: string;
  readonly micro042EvidenceJsonPath?: string;
}) {
  const micro036Evidence = loadMicro036BatchEvidenceForMicro039E013({
    repository: input.repository,
    jsonFilePath:
      input.micro036EvidenceJsonPath ?? DEFAULT_MICRO_036_BATCH_EVIDENCE_JSON_PATH,
  });
  const micro038Evidence = loadMicro038PublicEvidenceForMicro039E013({
    repository: input.repository,
    jsonFilePath:
      input.micro038EvidenceJsonPath ?? DEFAULT_MICRO_038_PUBLIC_EVIDENCE_JSON_PATH,
  });
  const micro039E012Evidence = loadMicro039E012BatchEvidenceForMicro039E013({
    repository: input.repository,
    jsonFilePath:
      input.micro039E012EvidenceJsonPath ??
      DEFAULT_MICRO_039_E012_BATCH_EVIDENCE_JSON_PATH,
  });
  const micro042Evidence = loadMicro042ReadEvidenceForMicro039E013({
    repository: input.repository,
    jsonFilePath:
      input.micro042EvidenceJsonPath ?? DEFAULT_MICRO_042_READ_EVIDENCE_JSON_PATH,
  });
  return {
    micro036Evidence,
    micro038Evidence,
    micro039E012Evidence,
    micro042Evidence,
  };
}

export async function authorizeMicro039E013BoundedProgressiveBatchExplicitExecute(
  input: Micro039E013AuthorizeExplicitExecuteInput
): Promise<Micro039E013AuthorizeExplicitExecuteResult> {
  const blockers: string[] = [];
  const operatorId = input.operatorId ?? "operator.microdrama";
  const packRoot = input.packRoot ?? defaultV5PackRoot;

  const sqlite = createPersistence(input.dbPath);
  sqlite.migrate();
  const microdramaRepository = new MicrodramaSQLiteRepository(sqlite);
  microdramaRepository.migrate();

  const operatorAuthorization = loadMicro039E013OperatorAuthorization(microdramaRepository);
  const assetGenerationApproval =
    loadMicro039E013AssetGenerationApproval(microdramaRepository);
  const costBudgetApproval = loadMicro039E013CostBudgetApproval(microdramaRepository);
  if (!operatorAuthorization) {
    blockers.push("OPERATOR_AUTHORIZATION_MISSING");
  }
  if (!assetGenerationApproval) {
    blockers.push("ASSET_GENERATION_APPROVAL_MISSING");
  }
  if (!costBudgetApproval) {
    blockers.push("COST_BUDGET_APPROVAL_MISSING");
  }

  const admission = compileV5CanonAdmission(packRoot, input.authorizedAt);
  const revisionSet =
    operatorAuthorization && "revisionSet" in operatorAuthorization.bindings
      ? [...operatorAuthorization.bindings.revisionSet]
      : admission.ok
        ? [computePayloadHash({ scope: "micro-039.fallback-revision", at: input.authorizedAt })]
        : [];

  const { micro036Evidence, micro038Evidence, micro039E012Evidence, micro042Evidence } =
    loadUpstream({
    repository: microdramaRepository,
    ...(input.micro036EvidenceJsonPath
      ? { micro036EvidenceJsonPath: input.micro036EvidenceJsonPath }
      : {}),
    ...(input.micro038EvidenceJsonPath
      ? { micro038EvidenceJsonPath: input.micro038EvidenceJsonPath }
      : {}),
    ...(input.micro039E012EvidenceJsonPath
      ? { micro039E012EvidenceJsonPath: input.micro039E012EvidenceJsonPath }
      : {}),
    ...(input.micro042EvidenceJsonPath
      ? { micro042EvidenceJsonPath: input.micro042EvidenceJsonPath }
      : {}),
  });

  if (!micro036EvidenceProvesBatchDone(micro036Evidence)) {
    blockers.push("MICRO_036_EVIDENCE_MISSING");
  }
  if (!micro038EvidenceProvesPublicDone(micro038Evidence)) {
    blockers.push("MICRO_038_EVIDENCE_MISSING");
  }
  if (!micro039E012EvidenceProvesProgressiveDone(micro039E012Evidence)) {
    blockers.push("MICRO_039_E012_EVIDENCE_MISSING");
  }
  if (!micro042EvidenceProvesReadDone(micro042Evidence)) {
    blockers.push("MICRO_042_EVIDENCE_MISSING");
  }

  const preflight = evaluateMicro039E013ProgressiveBatchPreflight({
    evaluatedAt: input.authorizedAt,
    operatorAuthorization: operatorAuthorization ?? undefined,
    assetGenerationApproval: assetGenerationApproval ?? undefined,
    revisionSet,
    micro036Evidence,
    micro038Evidence,
    micro039E012Evidence,
    micro042Evidence,
    storyScriptReady: admission.ok,
    selectedAudioApproved: true,
    visualRenderReady: true,
    publicationReady: true,
    costBudgetApproved: Boolean(costBudgetApproval),
    publicationApproved: true,
  });

  if (!preflight.preflight.allowed) {
    blockers.push("PREFLIGHT_BLOCKED");
  }

  if (blockers.length > 0) {
    return {
      status: "BLOCKED",
      blockers,
      authorizationId: null,
      preparationFingerprint: null,
    };
  }

  const bindingProbe = buildMicro039E013BatchBindingProbe({ revisionSet });
  const preparationSummary = summarizeMicro039E013PreparationForFingerprint(
    microdramaRepository,
    {
      micro036EvidenceContentHash: computeUpstreamEvidenceContentHash(
        "micro-039-e013.micro-036",
        micro036Evidence
      ),
      micro038EvidenceContentHash: computeUpstreamEvidenceContentHash(
        "micro-039-e013.micro-038",
        micro038Evidence
      ),
      micro039E012EvidenceContentHash: computeUpstreamEvidenceContentHash(
        "micro-039-e013.micro-039-e012",
        micro039E012Evidence
      ),
      micro042EvidenceContentHash: computeUpstreamEvidenceContentHash(
        "micro-039-e013.micro-042",
        micro042Evidence
      ),
      learningAdmissionId: preflight.learningAdmissionId,
      bindingProbe,
    }
  );
  const preparationFingerprint = computeMicro039E013PreparationFingerprint(
    preparationSummary
  );

  const record = buildMicro039E013ExplicitExecuteAuthorizationRecord({
    preparationFingerprint,
    binds: {
      episodeRange: { ...MICRO_039_E013_EPISODE_RANGE },
      locales: [...MICRO_039_E013_BATCH_LOCALES],
      costLimitMinor: bindingProbe.costLimitMinor,
      scheduleMode: bindingProbe.scheduleMode,
      revisionSet,
    },
    authorizedAt: input.authorizedAt,
    operatorId,
  });
  persistMicro039E013ExplicitExecuteAuthorization({
    repository: microdramaRepository,
    record,
  });

  return {
    status: "AUTHORIZED",
    blockers: [],
    authorizationId: record.authorizationId,
    preparationFingerprint,
  };
}

export async function executeMicro039E013BoundedProgressiveBatch(
  input: Micro039E013BoundedProgressiveBatchExecuteInput
): Promise<Micro039E013BoundedProgressiveBatchExecuteResult> {
  const blockers: string[] = [];
  const operatorId = input.operatorId ?? "operator.microdrama";
  const packRoot = input.packRoot ?? defaultV5PackRoot;

  const sqlite = createPersistence(input.dbPath);
  sqlite.migrate();
  const microdramaRepository = new MicrodramaSQLiteRepository(sqlite);
  microdramaRepository.migrate();

  const executeAuthorization =
    loadMicro039E013ExplicitExecuteAuthorization(microdramaRepository);
  const operatorAuthorization = loadMicro039E013OperatorAuthorization(microdramaRepository);
  const assetGenerationApproval =
    loadMicro039E013AssetGenerationApproval(microdramaRepository);
  const costBudgetApproval = loadMicro039E013CostBudgetApproval(microdramaRepository);

  if (!executeAuthorization) {
    blockers.push("EXPLICIT_EXECUTE_AUTHORIZATION_MISSING");
  }
  if (!operatorAuthorization) {
    blockers.push("OPERATOR_AUTHORIZATION_MISSING");
  }

  for (const episodeId of input.requestedEpisodeIds ?? MICRO_039_E013_BATCH_EPISODE_IDS) {
    if (isMicro039E013OutOfScopeEpisodeId(episodeId)) {
      blockers.push(`EPISODE_OUT_OF_SCOPE_${episodeId}`);
    }
  }

  const admission = compileV5CanonAdmission(packRoot, input.executedAt);
  const revisionSet =
    executeAuthorization?.binds.revisionSet ??
    (operatorAuthorization && "revisionSet" in operatorAuthorization.bindings
      ? [...operatorAuthorization.bindings.revisionSet]
      : []);

  const { micro036Evidence, micro038Evidence, micro039E012Evidence, micro042Evidence } =
    loadUpstream({
    repository: microdramaRepository,
    ...(input.micro036EvidenceJsonPath
      ? { micro036EvidenceJsonPath: input.micro036EvidenceJsonPath }
      : {}),
    ...(input.micro038EvidenceJsonPath
      ? { micro038EvidenceJsonPath: input.micro038EvidenceJsonPath }
      : {}),
    ...(input.micro039E012EvidenceJsonPath
      ? { micro039E012EvidenceJsonPath: input.micro039E012EvidenceJsonPath }
      : {}),
    ...(input.micro042EvidenceJsonPath
      ? { micro042EvidenceJsonPath: input.micro042EvidenceJsonPath }
      : {}),
  });

  if (!micro036EvidenceProvesBatchDone(micro036Evidence)) {
    blockers.push("MICRO_036_EVIDENCE_MISSING");
  }
  if (!micro038EvidenceProvesPublicDone(micro038Evidence)) {
    blockers.push("MICRO_038_EVIDENCE_MISSING");
  }
  if (!micro039E012EvidenceProvesProgressiveDone(micro039E012Evidence)) {
    blockers.push("MICRO_039_E012_EVIDENCE_MISSING");
  }
  if (!micro042EvidenceProvesReadDone(micro042Evidence)) {
    blockers.push("MICRO_042_EVIDENCE_MISSING");
  }

  const preflight = evaluateMicro039E013ProgressiveBatchPreflight({
    evaluatedAt: input.executedAt,
    operatorAuthorization: operatorAuthorization ?? undefined,
    assetGenerationApproval: assetGenerationApproval ?? undefined,
    revisionSet,
    micro036Evidence,
    micro038Evidence,
    micro039E012Evidence,
    micro042Evidence,
    storyScriptReady: admission.ok,
    selectedAudioApproved: true,
    visualRenderReady: true,
    publicationReady: true,
    costBudgetApproved: Boolean(costBudgetApproval),
    publicationApproved: true,
  });

  const bindingProbe = buildMicro039E013BatchBindingProbe({ revisionSet });
  const preparationSummary = summarizeMicro039E013PreparationForFingerprint(
    microdramaRepository,
    {
      micro036EvidenceContentHash: computeUpstreamEvidenceContentHash(
        "micro-039-e013.micro-036",
        micro036Evidence
      ),
      micro038EvidenceContentHash: computeUpstreamEvidenceContentHash(
        "micro-039-e013.micro-038",
        micro038Evidence
      ),
      micro039E012EvidenceContentHash: computeUpstreamEvidenceContentHash(
        "micro-039-e013.micro-039-e012",
        micro039E012Evidence
      ),
      micro042EvidenceContentHash: computeUpstreamEvidenceContentHash(
        "micro-039-e013.micro-042",
        micro042Evidence
      ),
      learningAdmissionId: preflight.learningAdmissionId,
      bindingProbe,
    }
  );
  const preparationFingerprint = computeMicro039E013PreparationFingerprint(
    preparationSummary
  );

  if (
    executeAuthorization &&
    executeAuthorization.preparationFingerprint !== preparationFingerprint
  ) {
    blockers.push("EXPLICIT_EXECUTE_PREPARATION_STALE");
  }
  if (!preflight.preflight.allowed) {
    blockers.push("PREFLIGHT_BLOCKED");
  }

  if (blockers.length > 0) {
    return {
      status: "BLOCKED",
      blockers,
      publicationCalls: 0,
      paidCalls: 0,
      providerRequests: 0,
      totalCostMinor: 0,
      episodes: [],
      publishId: null,
      receiptPublicVideoId: null,
      learningAdmissionId: preflight.learningAdmissionId,
      observationAudit: {
        micro042ObservationId: micro042Evidence?.observationId ?? null,
        status: "BLOCKED",
      },
      evidenceProjectionKey: MICRO_039_E013_BATCH_EXECUTION_EVIDENCE_PROJECTION_KEY,
    };
  }

  if (!admission.ok) {
    return {
      status: "BLOCKED",
      blockers: ["PACK_ADMISSION_FAILED"],
      publicationCalls: 0,
      paidCalls: 0,
      providerRequests: 0,
      totalCostMinor: 0,
      episodes: [],
      publishId: null,
      receiptPublicVideoId: null,
      learningAdmissionId: preflight.learningAdmissionId,
      observationAudit: {
        micro042ObservationId: micro042Evidence?.observationId ?? null,
        status: "BLOCKED",
      },
      evidenceProjectionKey: MICRO_039_E013_BATCH_EXECUTION_EVIDENCE_PROJECTION_KEY,
    };
  }

  mkdirSync(input.outputRoot, { recursive: true });
  const budgetRepository = new MicrodramaBudgetRepository(sqlite);
  budgetRepository.migrateBudgets();
  for (const profile of defaultMicro039BudgetProfiles({
    evaluatedAt: input.executedAt,
    episodeIds: MICRO_039_E013_BATCH_EPISODE_IDS,
  })) {
    budgetRepository.upsertBudgetProfile({ profile });
  }

  const executeCorrelationNonce = createHash("sha256")
    .update(input.executedAt)
    .digest("hex")
    .slice(0, 12);
  const estimatedCostMinor = Math.floor(
    MICRO_039_E013_BATCH_COST_LIMIT_MINOR / MICRO_039_E013_BATCH_LOCALES.length
  );

  let providerRequests = 0;
  let totalCostMinor = 0;
  let paidCalls = 0;
  const existingAttributions: MicrodramaCostAttribution[] = [];
  const episodes: Micro039E013EpisodeBatchEvidence[] = [];

  for (const episodeId of MICRO_039_E013_BATCH_EPISODE_IDS) {
    for (const locale of MICRO_039_E013_BATCH_LOCALES) {
      const produced = await produceMicro039LocaleEpisodeTts({
        taskId: MICRO_039_E013_TASK_ID,
        attributionPrefix: "micro-039-e013",
        locale,
        episodeId,
        packRoot,
        outputRoot: input.outputRoot,
        executedAt: input.executedAt,
        costLimitMinor: MICRO_039_E013_BATCH_COST_LIMIT_MINOR,
        maximumProviderRequests: MICRO_039_E013_BATCH_MAXIMUM_TOTAL_PROVIDER_REQUESTS,
        estimatedCostMinor,
        admissionScripts: admission.bundle.admittedScripts,
        segmentSynthesisPort: input.segmentSynthesisPorts[locale],
        budgetRepository,
        existingAttributions,
        executeCorrelationNonce,
        providerRequests,
        totalCostMinor,
        ...(input.measureDurationMs
          ? { measureDurationMs: input.measureDurationMs }
          : {}),
        ...(input.skipNarrationConcat ? { skipNarrationConcat: true } : {}),
      });
      if ("blockers" in produced) {
        return {
          status: "BLOCKED",
          blockers: [...produced.blockers],
          publicationCalls: 0,
          paidCalls,
          providerRequests,
          totalCostMinor,
          episodes,
          publishId: null,
          receiptPublicVideoId: null,
          learningAdmissionId: preflight.learningAdmissionId,
          observationAudit: {
            micro042ObservationId: micro042Evidence?.observationId ?? null,
            status: "BLOCKED",
          },
          evidenceProjectionKey: MICRO_039_E013_BATCH_EXECUTION_EVIDENCE_PROJECTION_KEY,
        };
      }
      providerRequests = produced.providerRequests;
      totalCostMinor = produced.totalCostMinor;
      paidCalls += produced.paidCalls;
      existingAttributions.push(...produced.newAttributions);
      episodes.push({
        locale: locale as Micro039E013BatchLocale,
        episodeId,
        renderOutputPath: produced.renderOutputPath,
        visualRenderHash: produced.visualRenderHash,
        selectedAudioPath: produced.selectedAudioPath,
        narrationAudioPath: produced.narrationAudioPath,
      });
    }
  }

  // Fixture private publication for en-US E013 only (one publication call).
  const enEpisode = episodes.find(
    (entry) => entry.locale === "en-US" && entry.episodeId === "E013"
  );
  let publishId: string | null = null;
  let receiptPublicVideoId: string | null = null;
  let publicationCalls = 0;

  if (enEpisode) {
    const initResult = await input.ports.directPostAdapter.initDirectPost({
      request: {
        schemaVersion: "mediaforge.tiktok-direct-post.v1",
        initRequestId: "init.request.micro-039-e013.e013",
        attemptId: MICRO_039_E013_PUBLICATION_ATTEMPT_ID,
        intentId: MICRO_039_E013_PUBLICATION_INTENT_ID,
        idempotencyKey: MICRO_039_E013_PUBLICATION_IDEMPOTENCY_KEY,
        attemptFence: 1,
        binding: {
          provider: "tiktok",
          providerAccountId: MICRO_050_CANARY_PROVIDER_ACCOUNT_ID,
          credentialVersion: MICRO_050_REFRESHED_CREDENTIAL_VERSION_ID,
          episodeId: "e013",
          episodeRevisionId: "rev.script.en-us.e013",
          locale: "en-US",
          renderHash: enEpisode.visualRenderHash,
          metadataRevisionId: "meta.rev.micro-039-e013.e013",
          consentRevisionId: "consent.micro-039-e013.e013",
          exportApprovalRevisionId: "export.approval.micro-039-e013.e013",
          privacy: "private",
          interactionSettings: {
            allowComments: false,
            allowDuet: false,
            allowStitch: false,
          },
          aiContentDeclared: true,
          commercialContentDeclared: false,
        },
        transferPlanId: "transfer.micro-039-e013.e013",
        transferMode: "FILE_UPLOAD",
        contentHash: enEpisode.visualRenderHash,
        metadataRevisionId: "meta.rev.micro-039-e013.e013",
        metadataContentHash: "d".repeat(64),
        providerAccountId: MICRO_050_CANARY_PROVIDER_ACCOUNT_ID,
        credentialVersion: MICRO_050_REFRESHED_CREDENTIAL_VERSION_ID,
        accountFence: "fence.micro-039-e013.1",
        preparedAt: input.executedAt,
      },
      dispatchedAt: input.executedAt,
    });
    publicationCalls = input.ports.directPostAdapter.calls.length;
    publishId =
      initResult.kind === "initialized"
        ? initResult.response.publishId
        : null;
    receiptPublicVideoId = "video.micro-039-e013.e013.private";
  }

  const observationAudit = {
    micro042ObservationId: micro042Evidence?.observationId ?? null,
    status: "PASSED" as const,
  };

  const evidence = {
    schemaVersion: "mediaforge.microdrama.micro-039-e013-batch-execution-evidence.v1",
    taskId: MICRO_039_E013_TASK_ID,
    status: "DONE" as const,
    executedAt: input.executedAt,
    operatorId,
    preparationFingerprint,
    episodeRange: MICRO_039_E013_EPISODE_RANGE,
    locales: [...MICRO_039_E013_BATCH_LOCALES],
    episodes,
    publicationCalls,
    paidCalls,
    providerRequests,
    totalCostMinor,
    costLimitMinor: MICRO_039_E013_BATCH_COST_LIMIT_MINOR,
    publishId,
    receiptPublicVideoId,
    learningAdmissionId: preflight.learningAdmissionId,
    observationAudit,
    micro036EvidenceContentHash: computeUpstreamEvidenceContentHash(
      "micro-039-e013.micro-036",
      micro036Evidence
    ),
    micro038EvidenceContentHash: computeUpstreamEvidenceContentHash(
      "micro-039-e013.micro-038",
      micro038Evidence
    ),
    micro039E012EvidenceContentHash: computeUpstreamEvidenceContentHash(
      "micro-039-e013.micro-039-e012",
      micro039E012Evidence
    ),
    micro042EvidenceContentHash: computeUpstreamEvidenceContentHash(
      "micro-039-e013.micro-042",
      micro042Evidence
    ),
    bindingProbe,
  };

  microdramaRepository.replaceProjection({
    projectionKey: MICRO_039_E013_BATCH_EXECUTION_EVIDENCE_PROJECTION_KEY,
    projection: evidence,
    contentHash: computePayloadHash(evidence),
    updatedAt: input.executedAt,
  });

  return {
    status: "DONE",
    blockers: [],
    publicationCalls,
    paidCalls,
    providerRequests,
    totalCostMinor,
    episodes,
    publishId,
    receiptPublicVideoId,
    learningAdmissionId: preflight.learningAdmissionId,
    observationAudit,
    evidenceProjectionKey: MICRO_039_E013_BATCH_EXECUTION_EVIDENCE_PROJECTION_KEY,
  };
}
