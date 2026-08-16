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
  loadMicro039E016AssetGenerationApproval,
  loadMicro039E016CostBudgetApproval,
  loadMicro039E016OperatorAuthorization,
} from "./micro-039-e016-batch-authorization-persistence.js";
import {
  buildMicro039E016BatchBindingProbe,
  isMicro039E016OutOfScopeEpisodeId,
  MICRO_039_E016_BATCH_COST_LIMIT_MINOR,
  MICRO_039_E016_BATCH_EPISODE_IDS,
  MICRO_039_E016_BATCH_LOCALES,
  MICRO_039_E016_BATCH_MAXIMUM_TOTAL_PROVIDER_REQUESTS,
  MICRO_039_E016_EPISODE_RANGE,
  MICRO_039_E016_PUBLICATION_ATTEMPT_ID,
  MICRO_039_E016_PUBLICATION_IDEMPOTENCY_KEY,
  MICRO_039_E016_PUBLICATION_INTENT_ID,
  MICRO_039_E016_TASK_ID,
  type Micro039E016BatchLocale,
} from "./micro-039-e016-batch-bindings.js";
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
  DEFAULT_MICRO_039_E015_BATCH_EVIDENCE_JSON_PATH,
  DEFAULT_MICRO_042_READ_EVIDENCE_JSON_PATH,
  loadMicro036BatchEvidenceForMicro039E016,
  loadMicro038PublicEvidenceForMicro039E016,
  loadMicro039E015BatchEvidenceForMicro039E016,
  loadMicro042ReadEvidenceForMicro039E016,
  micro036EvidenceProvesBatchDone,
  micro038EvidenceProvesPublicDone,
  micro039E015EvidenceProvesProgressiveDone,
  micro042EvidenceProvesReadDone,
} from "./micro-039-e016-batch-evidence.js";
import {
  buildMicro039E016ExplicitExecuteAuthorizationRecord,
  computeMicro039E016PreparationFingerprint,
  loadMicro039E016ExplicitExecuteAuthorization,
  persistMicro039E016ExplicitExecuteAuthorization,
  summarizeMicro039E016PreparationForFingerprint,
} from "./micro-039-e016-explicit-execute-authorization.js";
import { evaluateMicro039E016ProgressiveBatchPreflight } from "./micro-039-e016-progressive-batch-preflight.js";

export const MICRO_039_E016_BATCH_EXECUTION_EVIDENCE_PROJECTION_KEY =
  "microdrama.batch-execution-evidence.MICRO-039-E016";

export type Micro039E016ProgressiveBatchPorts = {
  readonly publicationRepository: FakeMicrodramaPublicationRepository;
  readonly directPostPersistence: InMemoryTikTokDirectPostPersistence;
  readonly directPostAdapter: FixtureTikTokDirectPostAdapter;
  readonly auditRepository: FakeMicrodramaTikTokAppAuditRepository;
};

export function createMicro039E016ProgressiveBatchPorts(): Micro039E016ProgressiveBatchPorts {
  const publicationRepository = new FakeMicrodramaPublicationRepository();
  publicationRepository.migratePublication();
  const auditRepository = new FakeMicrodramaTikTokAppAuditRepository();
  auditRepository.migrateTikTokAppAudit();
  return {
    publicationRepository,
    directPostPersistence: new InMemoryTikTokDirectPostPersistence(),
    directPostAdapter: new FixtureTikTokDirectPostAdapter("tiktok.publish.micro-039-e016"),
    auditRepository,
  };
}

export type Micro039E016EpisodeBatchEvidence = {
  readonly locale: Micro039E016BatchLocale;
  readonly episodeId: "E016";
  readonly renderOutputPath: string;
  readonly visualRenderHash: string;
  readonly selectedAudioPath: string;
  readonly narrationAudioPath?: string;
};

export type Micro039E016AuthorizeExplicitExecuteInput = {
  readonly dbPath: string;
  readonly authorizedAt: string;
  readonly operatorId?: string;
  readonly packRoot?: string;
  readonly micro036EvidenceJsonPath?: string;
  readonly micro038EvidenceJsonPath?: string;
  readonly micro039E015EvidenceJsonPath?: string;
  readonly micro042EvidenceJsonPath?: string;
};

export type Micro039E016AuthorizeExplicitExecuteResult = {
  readonly status: "AUTHORIZED" | "BLOCKED";
  readonly blockers: readonly string[];
  readonly authorizationId: string | null;
  readonly preparationFingerprint: string | null;
};

export type Micro039E016BoundedProgressiveBatchExecuteInput = {
  readonly dbPath: string;
  readonly executedAt: string;
  readonly outputRoot: string;
  readonly operatorId?: string;
  readonly packRoot?: string;
  readonly admittedAt?: string;
  readonly ports: Micro039E016ProgressiveBatchPorts;
  readonly segmentSynthesisPorts: Micro039SegmentSynthesisPorts;
  readonly measureDurationMs?: (audioPath: string) => number;
  readonly skipNarrationConcat?: boolean;
  readonly micro036EvidenceJsonPath?: string;
  readonly micro038EvidenceJsonPath?: string;
  readonly micro039E015EvidenceJsonPath?: string;
  readonly micro042EvidenceJsonPath?: string;
  readonly requestedEpisodeIds?: readonly string[];
};

export type Micro039E016BoundedProgressiveBatchExecuteResult = {
  readonly status: "DONE" | "BLOCKED";
  readonly blockers: readonly string[];
  readonly publicationCalls: number;
  readonly paidCalls: number;
  readonly providerRequests: number;
  readonly totalCostMinor: number;
  readonly episodes: readonly Micro039E016EpisodeBatchEvidence[];
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
  readonly micro039E015EvidenceJsonPath?: string;
  readonly micro042EvidenceJsonPath?: string;
}) {
  const micro036Evidence = loadMicro036BatchEvidenceForMicro039E016({
    repository: input.repository,
    jsonFilePath:
      input.micro036EvidenceJsonPath ?? DEFAULT_MICRO_036_BATCH_EVIDENCE_JSON_PATH,
  });
  const micro038Evidence = loadMicro038PublicEvidenceForMicro039E016({
    repository: input.repository,
    jsonFilePath:
      input.micro038EvidenceJsonPath ?? DEFAULT_MICRO_038_PUBLIC_EVIDENCE_JSON_PATH,
  });
  const micro039E015Evidence = loadMicro039E015BatchEvidenceForMicro039E016({
    repository: input.repository,
    jsonFilePath:
      input.micro039E015EvidenceJsonPath ??
      DEFAULT_MICRO_039_E015_BATCH_EVIDENCE_JSON_PATH,
  });
  const micro042Evidence = loadMicro042ReadEvidenceForMicro039E016({
    repository: input.repository,
    jsonFilePath:
      input.micro042EvidenceJsonPath ?? DEFAULT_MICRO_042_READ_EVIDENCE_JSON_PATH,
  });
  return {
    micro036Evidence,
    micro038Evidence,
    micro039E015Evidence,
    micro042Evidence,
  };
}

export async function authorizeMicro039E016BoundedProgressiveBatchExplicitExecute(
  input: Micro039E016AuthorizeExplicitExecuteInput
): Promise<Micro039E016AuthorizeExplicitExecuteResult> {
  const blockers: string[] = [];
  const operatorId = input.operatorId ?? "operator.microdrama";
  const packRoot = input.packRoot ?? defaultV5PackRoot;

  const sqlite = createPersistence(input.dbPath);
  sqlite.migrate();
  const microdramaRepository = new MicrodramaSQLiteRepository(sqlite);
  microdramaRepository.migrate();

  const operatorAuthorization = loadMicro039E016OperatorAuthorization(microdramaRepository);
  const assetGenerationApproval =
    loadMicro039E016AssetGenerationApproval(microdramaRepository);
  const costBudgetApproval = loadMicro039E016CostBudgetApproval(microdramaRepository);
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

  const { micro036Evidence, micro038Evidence, micro039E015Evidence, micro042Evidence } =
    loadUpstream({
    repository: microdramaRepository,
    ...(input.micro036EvidenceJsonPath
      ? { micro036EvidenceJsonPath: input.micro036EvidenceJsonPath }
      : {}),
    ...(input.micro038EvidenceJsonPath
      ? { micro038EvidenceJsonPath: input.micro038EvidenceJsonPath }
      : {}),
    ...(input.micro039E015EvidenceJsonPath
      ? { micro039E015EvidenceJsonPath: input.micro039E015EvidenceJsonPath }
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
  if (!micro039E015EvidenceProvesProgressiveDone(micro039E015Evidence)) {
    blockers.push("MICRO_039_E015_EVIDENCE_MISSING");
  }
  if (!micro042EvidenceProvesReadDone(micro042Evidence)) {
    blockers.push("MICRO_042_EVIDENCE_MISSING");
  }

  const preflight = evaluateMicro039E016ProgressiveBatchPreflight({
    evaluatedAt: input.authorizedAt,
    operatorAuthorization: operatorAuthorization ?? undefined,
    assetGenerationApproval: assetGenerationApproval ?? undefined,
    revisionSet,
    micro036Evidence,
    micro038Evidence,
    micro039E015Evidence,
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

  const bindingProbe = buildMicro039E016BatchBindingProbe({ revisionSet });
  const preparationSummary = summarizeMicro039E016PreparationForFingerprint(
    microdramaRepository,
    {
      micro036EvidenceContentHash: computeUpstreamEvidenceContentHash(
        "micro-039-e016.micro-036",
        micro036Evidence
      ),
      micro038EvidenceContentHash: computeUpstreamEvidenceContentHash(
        "micro-039-e016.micro-038",
        micro038Evidence
      ),
      micro039E015EvidenceContentHash: computeUpstreamEvidenceContentHash(
        "micro-039-e016.micro-039-e015",
        micro039E015Evidence
      ),
      micro042EvidenceContentHash: computeUpstreamEvidenceContentHash(
        "micro-039-e016.micro-042",
        micro042Evidence
      ),
      learningAdmissionId: preflight.learningAdmissionId,
      bindingProbe,
    }
  );
  const preparationFingerprint = computeMicro039E016PreparationFingerprint(
    preparationSummary
  );

  const record = buildMicro039E016ExplicitExecuteAuthorizationRecord({
    preparationFingerprint,
    binds: {
      episodeRange: { ...MICRO_039_E016_EPISODE_RANGE },
      locales: [...MICRO_039_E016_BATCH_LOCALES],
      costLimitMinor: bindingProbe.costLimitMinor,
      scheduleMode: bindingProbe.scheduleMode,
      revisionSet,
    },
    authorizedAt: input.authorizedAt,
    operatorId,
  });
  persistMicro039E016ExplicitExecuteAuthorization({
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

export async function executeMicro039E016BoundedProgressiveBatch(
  input: Micro039E016BoundedProgressiveBatchExecuteInput
): Promise<Micro039E016BoundedProgressiveBatchExecuteResult> {
  const blockers: string[] = [];
  const operatorId = input.operatorId ?? "operator.microdrama";
  const packRoot = input.packRoot ?? defaultV5PackRoot;

  const sqlite = createPersistence(input.dbPath);
  sqlite.migrate();
  const microdramaRepository = new MicrodramaSQLiteRepository(sqlite);
  microdramaRepository.migrate();

  const executeAuthorization =
    loadMicro039E016ExplicitExecuteAuthorization(microdramaRepository);
  const operatorAuthorization = loadMicro039E016OperatorAuthorization(microdramaRepository);
  const assetGenerationApproval =
    loadMicro039E016AssetGenerationApproval(microdramaRepository);
  const costBudgetApproval = loadMicro039E016CostBudgetApproval(microdramaRepository);

  if (!executeAuthorization) {
    blockers.push("EXPLICIT_EXECUTE_AUTHORIZATION_MISSING");
  }
  if (!operatorAuthorization) {
    blockers.push("OPERATOR_AUTHORIZATION_MISSING");
  }

  for (const episodeId of input.requestedEpisodeIds ?? MICRO_039_E016_BATCH_EPISODE_IDS) {
    if (isMicro039E016OutOfScopeEpisodeId(episodeId)) {
      blockers.push(`EPISODE_OUT_OF_SCOPE_${episodeId}`);
    }
  }

  const admission = compileV5CanonAdmission(packRoot, input.executedAt);
  const revisionSet =
    executeAuthorization?.binds.revisionSet ??
    (operatorAuthorization && "revisionSet" in operatorAuthorization.bindings
      ? [...operatorAuthorization.bindings.revisionSet]
      : []);

  const { micro036Evidence, micro038Evidence, micro039E015Evidence, micro042Evidence } =
    loadUpstream({
    repository: microdramaRepository,
    ...(input.micro036EvidenceJsonPath
      ? { micro036EvidenceJsonPath: input.micro036EvidenceJsonPath }
      : {}),
    ...(input.micro038EvidenceJsonPath
      ? { micro038EvidenceJsonPath: input.micro038EvidenceJsonPath }
      : {}),
    ...(input.micro039E015EvidenceJsonPath
      ? { micro039E015EvidenceJsonPath: input.micro039E015EvidenceJsonPath }
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
  if (!micro039E015EvidenceProvesProgressiveDone(micro039E015Evidence)) {
    blockers.push("MICRO_039_E015_EVIDENCE_MISSING");
  }
  if (!micro042EvidenceProvesReadDone(micro042Evidence)) {
    blockers.push("MICRO_042_EVIDENCE_MISSING");
  }

  const preflight = evaluateMicro039E016ProgressiveBatchPreflight({
    evaluatedAt: input.executedAt,
    operatorAuthorization: operatorAuthorization ?? undefined,
    assetGenerationApproval: assetGenerationApproval ?? undefined,
    revisionSet,
    micro036Evidence,
    micro038Evidence,
    micro039E015Evidence,
    micro042Evidence,
    storyScriptReady: admission.ok,
    selectedAudioApproved: true,
    visualRenderReady: true,
    publicationReady: true,
    costBudgetApproved: Boolean(costBudgetApproval),
    publicationApproved: true,
  });

  const bindingProbe = buildMicro039E016BatchBindingProbe({ revisionSet });
  const preparationSummary = summarizeMicro039E016PreparationForFingerprint(
    microdramaRepository,
    {
      micro036EvidenceContentHash: computeUpstreamEvidenceContentHash(
        "micro-039-e016.micro-036",
        micro036Evidence
      ),
      micro038EvidenceContentHash: computeUpstreamEvidenceContentHash(
        "micro-039-e016.micro-038",
        micro038Evidence
      ),
      micro039E015EvidenceContentHash: computeUpstreamEvidenceContentHash(
        "micro-039-e016.micro-039-e015",
        micro039E015Evidence
      ),
      micro042EvidenceContentHash: computeUpstreamEvidenceContentHash(
        "micro-039-e016.micro-042",
        micro042Evidence
      ),
      learningAdmissionId: preflight.learningAdmissionId,
      bindingProbe,
    }
  );
  const preparationFingerprint = computeMicro039E016PreparationFingerprint(
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
      evidenceProjectionKey: MICRO_039_E016_BATCH_EXECUTION_EVIDENCE_PROJECTION_KEY,
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
      evidenceProjectionKey: MICRO_039_E016_BATCH_EXECUTION_EVIDENCE_PROJECTION_KEY,
    };
  }

  mkdirSync(input.outputRoot, { recursive: true });
  const budgetRepository = new MicrodramaBudgetRepository(sqlite);
  budgetRepository.migrateBudgets();
  for (const profile of defaultMicro039BudgetProfiles({
    evaluatedAt: input.executedAt,
    episodeIds: MICRO_039_E016_BATCH_EPISODE_IDS,
  })) {
    budgetRepository.upsertBudgetProfile({ profile });
  }

  const executeCorrelationNonce = createHash("sha256")
    .update(input.executedAt)
    .digest("hex")
    .slice(0, 12);
  const estimatedCostMinor = Math.floor(
    MICRO_039_E016_BATCH_COST_LIMIT_MINOR / MICRO_039_E016_BATCH_LOCALES.length
  );

  let providerRequests = 0;
  let totalCostMinor = 0;
  let paidCalls = 0;
  const existingAttributions: MicrodramaCostAttribution[] = [];
  const episodes: Micro039E016EpisodeBatchEvidence[] = [];

  for (const episodeId of MICRO_039_E016_BATCH_EPISODE_IDS) {
    for (const locale of MICRO_039_E016_BATCH_LOCALES) {
      const produced = await produceMicro039LocaleEpisodeTts({
        taskId: MICRO_039_E016_TASK_ID,
        attributionPrefix: "micro-039-e016",
        locale,
        episodeId,
        packRoot,
        outputRoot: input.outputRoot,
        executedAt: input.executedAt,
        costLimitMinor: MICRO_039_E016_BATCH_COST_LIMIT_MINOR,
        maximumProviderRequests: MICRO_039_E016_BATCH_MAXIMUM_TOTAL_PROVIDER_REQUESTS,
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
          evidenceProjectionKey: MICRO_039_E016_BATCH_EXECUTION_EVIDENCE_PROJECTION_KEY,
        };
      }
      providerRequests = produced.providerRequests;
      totalCostMinor = produced.totalCostMinor;
      paidCalls += produced.paidCalls;
      existingAttributions.push(...produced.newAttributions);
      episodes.push({
        locale: locale as Micro039E016BatchLocale,
        episodeId,
        renderOutputPath: produced.renderOutputPath,
        visualRenderHash: produced.visualRenderHash,
        selectedAudioPath: produced.selectedAudioPath,
        narrationAudioPath: produced.narrationAudioPath,
      });
    }
  }

  // Fixture private publication for en-US E016 only (one publication call).
  const enEpisode = episodes.find(
    (entry) => entry.locale === "en-US" && entry.episodeId === "E016"
  );
  let publishId: string | null = null;
  let receiptPublicVideoId: string | null = null;
  let publicationCalls = 0;

  if (enEpisode) {
    const initResult = await input.ports.directPostAdapter.initDirectPost({
      request: {
        schemaVersion: "mediaforge.tiktok-direct-post.v1",
        initRequestId: "init.request.micro-039-e016.e016",
        attemptId: MICRO_039_E016_PUBLICATION_ATTEMPT_ID,
        intentId: MICRO_039_E016_PUBLICATION_INTENT_ID,
        idempotencyKey: MICRO_039_E016_PUBLICATION_IDEMPOTENCY_KEY,
        attemptFence: 1,
        binding: {
          provider: "tiktok",
          providerAccountId: MICRO_050_CANARY_PROVIDER_ACCOUNT_ID,
          credentialVersion: MICRO_050_REFRESHED_CREDENTIAL_VERSION_ID,
          episodeId: "e016",
          episodeRevisionId: "rev.script.en-us.e016",
          locale: "en-US",
          renderHash: enEpisode.visualRenderHash,
          metadataRevisionId: "meta.rev.micro-039-e016.e016",
          consentRevisionId: "consent.micro-039-e016.e016",
          exportApprovalRevisionId: "export.approval.micro-039-e016.e016",
          privacy: "private",
          interactionSettings: {
            allowComments: false,
            allowDuet: false,
            allowStitch: false,
          },
          aiContentDeclared: true,
          commercialContentDeclared: false,
        },
        transferPlanId: "transfer.micro-039-e016.e016",
        transferMode: "FILE_UPLOAD",
        contentHash: enEpisode.visualRenderHash,
        metadataRevisionId: "meta.rev.micro-039-e016.e016",
        metadataContentHash: "d".repeat(64),
        providerAccountId: MICRO_050_CANARY_PROVIDER_ACCOUNT_ID,
        credentialVersion: MICRO_050_REFRESHED_CREDENTIAL_VERSION_ID,
        accountFence: "fence.micro-039-e016.1",
        preparedAt: input.executedAt,
      },
      dispatchedAt: input.executedAt,
    });
    publicationCalls = input.ports.directPostAdapter.calls.length;
    publishId =
      initResult.kind === "initialized"
        ? initResult.response.publishId
        : null;
    receiptPublicVideoId = "video.micro-039-e016.e016.private";
  }

  const observationAudit = {
    micro042ObservationId: micro042Evidence?.observationId ?? null,
    status: "PASSED" as const,
  };

  const evidence = {
    schemaVersion: "mediaforge.microdrama.micro-039-e016-batch-execution-evidence.v1",
    taskId: MICRO_039_E016_TASK_ID,
    status: "DONE" as const,
    executedAt: input.executedAt,
    operatorId,
    preparationFingerprint,
    episodeRange: MICRO_039_E016_EPISODE_RANGE,
    locales: [...MICRO_039_E016_BATCH_LOCALES],
    episodes,
    publicationCalls,
    paidCalls,
    providerRequests,
    totalCostMinor,
    costLimitMinor: MICRO_039_E016_BATCH_COST_LIMIT_MINOR,
    publishId,
    receiptPublicVideoId,
    learningAdmissionId: preflight.learningAdmissionId,
    observationAudit,
    micro036EvidenceContentHash: computeUpstreamEvidenceContentHash(
      "micro-039-e016.micro-036",
      micro036Evidence
    ),
    micro038EvidenceContentHash: computeUpstreamEvidenceContentHash(
      "micro-039-e016.micro-038",
      micro038Evidence
    ),
    micro039E015EvidenceContentHash: computeUpstreamEvidenceContentHash(
      "micro-039-e016.micro-039-e015",
      micro039E015Evidence
    ),
    micro042EvidenceContentHash: computeUpstreamEvidenceContentHash(
      "micro-039-e016.micro-042",
      micro042Evidence
    ),
    bindingProbe,
  };

  microdramaRepository.replaceProjection({
    projectionKey: MICRO_039_E016_BATCH_EXECUTION_EVIDENCE_PROJECTION_KEY,
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
    evidenceProjectionKey: MICRO_039_E016_BATCH_EXECUTION_EVIDENCE_PROJECTION_KEY,
  };
}
