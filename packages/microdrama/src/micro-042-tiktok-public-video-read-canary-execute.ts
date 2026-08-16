import { computePayloadHash } from "@mediaforge/narrative-core";
import {
  FakeMicrodramaPerformanceRepository,
  FakeMicrodramaTikTokAppAuditRepository,
  MicrodramaSQLiteRepository,
  createPersistence,
} from "@mediaforge/persistence";
import { ingestPerformanceObservation } from "@mediaforge/performance";
import {
  FixtureTikTokVideoQueryAdapter,
  type TikTokVideoQueryAdapter,
} from "@mediaforge/tiktok-publishing";

import { TikTokAppAuditApplicationService } from "../../application/src/tiktok-app-audit-service.js";

import { loadMicro042OperatorAuthorization } from "./micro-042-canary-authorization-persistence.js";
import {
  MICRO_042_CANARY_EPISODE_ID,
  MICRO_042_CANARY_LOCALE,
  MICRO_042_CANARY_OBSERVATION_WINDOW,
  MICRO_042_CANARY_PROVIDER_ACCOUNT_ID,
  MICRO_042_CANARY_PROVIDER_VIDEO_ID,
  MICRO_042_CANARY_REQUESTED_METRIC_SET,
  MICRO_042_IDEMPOTENCY_KEY,
  MICRO_042_TASK_ID,
  buildMicro042ReadOnlyBindingProbe,
} from "./micro-042-canary-bindings.js";
import {
  computeMicro038EvidenceContentHashForMicro042,
  loadMicro038PublicCanaryExecutionEvidence,
  micro038EvidenceProvesPublicCanaryDone,
  resolveMicro042PublicationIdFromEvidence,
} from "./micro-042-canary-micro-038-evidence.js";
import {
  buildMicro042ExplicitExecuteAuthorizationRecord,
  computeMicro042PreparationFingerprint,
  loadMicro042ExplicitExecuteAuthorization,
  persistMicro042ExplicitExecuteAuthorization,
  summarizeMicro042PreparationForFingerprint,
} from "./micro-042-explicit-execute-authorization.js";
import {
  evaluateMicro042TikTokPublicVideoReadCanaryPreflight,
  MICRO_042_AUDIT_PROBE,
} from "./micro-042-tiktok-public-video-read-canary-preflight.js";

export const MICRO_042_CANARY_EXECUTION_EVIDENCE_PROJECTION_KEY =
  "microdrama.canary-execution-evidence.MICRO-042";

export type Micro042TikTokPublicVideoReadPorts = {
  readonly performanceRepository: FakeMicrodramaPerformanceRepository;
  readonly videoQueryAdapter: FixtureTikTokVideoQueryAdapter;
  readonly auditRepository: FakeMicrodramaTikTokAppAuditRepository;
};

export function createMicro042TikTokPublicVideoReadPorts(): Micro042TikTokPublicVideoReadPorts {
  const performanceRepository = new FakeMicrodramaPerformanceRepository();
  performanceRepository.migratePerformance();
  const auditRepository = new FakeMicrodramaTikTokAppAuditRepository();
  auditRepository.migrateTikTokAppAudit();
  return {
    performanceRepository,
    videoQueryAdapter: new FixtureTikTokVideoQueryAdapter(
      new Map([
        [
          MICRO_042_CANARY_PROVIDER_VIDEO_ID,
          {
            counters: {
              view_count: 42,
              like_count: 3,
              comment_count: 1,
              share_count: 0,
              // retention intentionally absent → unavailable after normalization
            },
            privacyLevel: "PUBLIC_TO_EVERYONE",
          },
        ],
      ])
    ),
    auditRepository,
  };
}

export type Micro042AuthorizeExplicitExecuteInput = {
  readonly dbPath: string;
  readonly authorizedAt: string;
  readonly operatorId?: string;
  readonly ports: Micro042TikTokPublicVideoReadPorts;
  readonly micro038EvidenceJsonPath?: string;
};

export type Micro042AuthorizeExplicitExecuteResult = {
  readonly status: "AUTHORIZED" | "BLOCKED";
  readonly blockers: readonly string[];
  readonly authorizationId: string | null;
  readonly preparationFingerprint: string | null;
};

export type Micro042TikTokPublicVideoReadCanaryExecuteInput = {
  readonly dbPath: string;
  readonly executedAt: string;
  readonly operatorId?: string;
  readonly ports: Micro042TikTokPublicVideoReadPorts;
  readonly micro038EvidenceJsonPath?: string;
};

export type Micro042TikTokPublicVideoReadCanaryExecuteResult = {
  readonly status: "DONE" | "BLOCKED";
  readonly blockers: readonly string[];
  readonly publicationCalls: number;
  readonly externalCalls: number;
  readonly observationId: string | null;
  readonly providerVideoId: string | null;
  readonly evidenceProjectionKey: string;
};

export async function authorizeMicro042BoundedPublicVideoReadCanaryExplicitExecute(
  input: Micro042AuthorizeExplicitExecuteInput
): Promise<Micro042AuthorizeExplicitExecuteResult> {
  const blockers: string[] = [];
  const operatorId = input.operatorId ?? "operator.microdrama";

  const sqlite = createPersistence(input.dbPath);
  sqlite.migrate();
  const microdramaRepository = new MicrodramaSQLiteRepository(sqlite);
  microdramaRepository.migrate();

  const operatorAuthorization = loadMicro042OperatorAuthorization(microdramaRepository);
  if (!operatorAuthorization) {
    blockers.push("OPERATOR_AUTHORIZATION_MISSING");
  }

  const micro038Evidence = loadMicro038PublicCanaryExecutionEvidence({
    repository: microdramaRepository,
    ...(input.micro038EvidenceJsonPath
      ? { jsonFilePath: input.micro038EvidenceJsonPath }
      : {}),
  });
  if (!micro038EvidenceProvesPublicCanaryDone(micro038Evidence)) {
    blockers.push("MICRO_038_EVIDENCE_MISSING");
  }

  const auditService = new TikTokAppAuditApplicationService({
    port: input.ports.auditRepository,
  });
  if (!auditService.getLatestReadiness(MICRO_042_AUDIT_PROBE)) {
    auditService.recordReadinessBundle(MICRO_042_AUDIT_PROBE.fixture);
  }
  const appAuditReadiness = auditService.getLatestReadiness(MICRO_042_AUDIT_PROBE);

  const publicationId = resolveMicro042PublicationIdFromEvidence(micro038Evidence);
  const preflight = evaluateMicro042TikTokPublicVideoReadCanaryPreflight({
    evaluatedAt: input.authorizedAt,
    operatorAuthorization: operatorAuthorization ?? undefined,
    micro038Evidence,
    appAuditReadiness,
    publicationId,
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

  const bindingProbe = buildMicro042ReadOnlyBindingProbe({ publicationId });
  const preparationSummary = summarizeMicro042PreparationForFingerprint(
    microdramaRepository,
    {
      micro038EvidenceContentHash:
        computeMicro038EvidenceContentHashForMicro042(micro038Evidence),
      bindingProbe,
    }
  );
  const preparationFingerprint = computeMicro042PreparationFingerprint(
    preparationSummary
  );

  const record = buildMicro042ExplicitExecuteAuthorizationRecord({
    preparationFingerprint,
    binds: {
      providerAccountId: MICRO_042_CANARY_PROVIDER_ACCOUNT_ID,
      publicationId,
      providerVideoId: MICRO_042_CANARY_PROVIDER_VIDEO_ID,
      observationWindow: { ...MICRO_042_CANARY_OBSERVATION_WINDOW },
      requestedMetricSet: [...MICRO_042_CANARY_REQUESTED_METRIC_SET],
    },
    authorizedAt: input.authorizedAt,
    operatorId,
  });
  persistMicro042ExplicitExecuteAuthorization({
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

export async function executeMicro042TikTokPublicVideoReadCanary(
  input: Micro042TikTokPublicVideoReadCanaryExecuteInput
): Promise<Micro042TikTokPublicVideoReadCanaryExecuteResult> {
  const blockers: string[] = [];
  const operatorId = input.operatorId ?? "operator.microdrama";

  const sqlite = createPersistence(input.dbPath);
  sqlite.migrate();
  const microdramaRepository = new MicrodramaSQLiteRepository(sqlite);
  microdramaRepository.migrate();

  const executeAuthorization =
    loadMicro042ExplicitExecuteAuthorization(microdramaRepository);
  const operatorAuthorization = loadMicro042OperatorAuthorization(microdramaRepository);
  if (!executeAuthorization) {
    blockers.push("EXPLICIT_EXECUTE_AUTHORIZATION_MISSING");
  }
  if (!operatorAuthorization) {
    blockers.push("OPERATOR_AUTHORIZATION_MISSING");
  }

  const micro038Evidence = loadMicro038PublicCanaryExecutionEvidence({
    repository: microdramaRepository,
    ...(input.micro038EvidenceJsonPath
      ? { jsonFilePath: input.micro038EvidenceJsonPath }
      : {}),
  });
  if (!micro038EvidenceProvesPublicCanaryDone(micro038Evidence)) {
    blockers.push("MICRO_038_EVIDENCE_MISSING");
  }

  const auditService = new TikTokAppAuditApplicationService({
    port: input.ports.auditRepository,
  });
  if (!auditService.getLatestReadiness(MICRO_042_AUDIT_PROBE)) {
    auditService.recordReadinessBundle(MICRO_042_AUDIT_PROBE.fixture);
  }
  const appAuditReadiness = auditService.getLatestReadiness(MICRO_042_AUDIT_PROBE);

  const publicationId = resolveMicro042PublicationIdFromEvidence(micro038Evidence);
  const bindingProbe = buildMicro042ReadOnlyBindingProbe({ publicationId });

  const preparationSummary = summarizeMicro042PreparationForFingerprint(
    microdramaRepository,
    {
      micro038EvidenceContentHash:
        computeMicro038EvidenceContentHashForMicro042(micro038Evidence),
      bindingProbe,
    }
  );
  const preparationFingerprint = computeMicro042PreparationFingerprint(
    preparationSummary
  );

  if (
    executeAuthorization &&
    executeAuthorization.preparationFingerprint !== preparationFingerprint
  ) {
    blockers.push("EXPLICIT_EXECUTE_PREPARATION_STALE");
  }

  const preflight = evaluateMicro042TikTokPublicVideoReadCanaryPreflight({
    evaluatedAt: input.executedAt,
    operatorAuthorization: operatorAuthorization ?? undefined,
    micro038Evidence,
    appAuditReadiness,
    publicationId,
  });
  if (!preflight.preflight.allowed) {
    blockers.push("PREFLIGHT_BLOCKED");
  }

  if (blockers.length > 0 || !micro038Evidence) {
    return {
      status: "BLOCKED",
      blockers,
      publicationCalls: 0,
      externalCalls: 0,
      observationId: null,
      providerVideoId: null,
      evidenceProjectionKey: MICRO_042_CANARY_EXECUTION_EVIDENCE_PROJECTION_KEY,
    };
  }

  const queryAdapter: TikTokVideoQueryAdapter = input.ports.videoQueryAdapter;
  const queryResponse = await queryAdapter.queryVideo({
    providerAccountId: MICRO_042_CANARY_PROVIDER_ACCOUNT_ID,
    providerVideoId: MICRO_042_CANARY_PROVIDER_VIDEO_ID,
    fields: [...MICRO_042_CANARY_REQUESTED_METRIC_SET],
    requestedAt: input.executedAt,
  });

  const renderHash =
    micro038Evidence.visualRenderHash ??
    micro038Evidence.bindingProbe?.renderHash ??
    "a".repeat(64);
  const episodeRevisionId =
    micro038Evidence.bindingProbe?.episodeRevisionId ??
    "rev.script.en-us.micro-038.e002";
  const metadataRevisionId =
    micro038Evidence.bindingProbe?.metadataRevision ??
    "meta.rev.micro-038.public-canary";

  const observation = ingestPerformanceObservation({
    identity: {
      seriesId: "seven-minutes-ahead",
      episodeId: MICRO_042_CANARY_EPISODE_ID.toLowerCase(),
      episodeRevisionId,
      locale: MICRO_042_CANARY_LOCALE,
      provider: "tiktok",
      providerAccountId: MICRO_042_CANARY_PROVIDER_ACCOUNT_ID,
      publicationId,
      publicationRevision: 1,
      renderHash,
      metadataRevisionId,
      observationWindow: { ...MICRO_042_CANARY_OBSERVATION_WINDOW },
    },
    providerVideoId: queryResponse.providerVideoId,
    counters: queryResponse.counters,
    baseline: {
      accountBaselineHash: "b".repeat(64),
      publishTimeContextHash: "c".repeat(64),
    },
    observedAt: input.executedAt,
    fetchedAt: queryResponse.fetchedAt,
    idempotencyKey: MICRO_042_IDEMPOTENCY_KEY,
  });

  input.ports.performanceRepository.appendObservation({ observation });

  const externalCalls = input.ports.videoQueryAdapter.calls.length;
  const publicationCalls = 0;

  const evidence = {
    schemaVersion: "mediaforge.microdrama.micro-042-canary-execution-evidence.v1",
    taskId: MICRO_042_TASK_ID,
    status: "DONE" as const,
    executedAt: input.executedAt,
    operatorId,
    preparationFingerprint,
    publicationId,
    providerVideoId: queryResponse.providerVideoId,
    observationId: observation.observationId,
    observationFingerprint: observation.fingerprint,
    publicationCalls,
    externalCalls,
    requestedMetricSet: [...MICRO_042_CANARY_REQUESTED_METRIC_SET],
    normalizedMetrics: observation.normalized.metrics,
    rateLimit: queryResponse.rateLimit,
    cursor: queryResponse.cursor,
    endpointUrl: queryResponse.endpointUrl,
    micro038EvidenceContentHash:
      computeMicro038EvidenceContentHashForMicro042(micro038Evidence),
    bindingProbe,
  };

  microdramaRepository.replaceProjection({
    projectionKey: MICRO_042_CANARY_EXECUTION_EVIDENCE_PROJECTION_KEY,
    projection: evidence,
    contentHash: computePayloadHash(evidence),
    updatedAt: input.executedAt,
  });

  return {
    status: "DONE",
    blockers: [],
    publicationCalls,
    externalCalls,
    observationId: observation.observationId,
    providerVideoId: queryResponse.providerVideoId,
    evidenceProjectionKey: MICRO_042_CANARY_EXECUTION_EVIDENCE_PROJECTION_KEY,
  };
}
