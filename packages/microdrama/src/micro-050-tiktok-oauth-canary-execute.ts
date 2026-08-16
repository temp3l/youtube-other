import { buildTikTokOAuthState } from "@mediaforge/domain";
import { computePayloadHash } from "@mediaforge/narrative-core";
import {
  FakeMicrodramaTikTokAppAuditRepository,
  MicrodramaSQLiteRepository,
  createPersistence,
} from "@mediaforge/persistence";
import {
  FakeTikTokAccountRepository,
  FixtureTikTokCreatorInfoAdapter,
  FixtureTikTokTokenExchange,
  InMemoryTikTokCreatorInfoCache,
  InMemoryTikTokSecretStore,
  TikTokAccountOAuthService,
  TikTokCreatorPreflightService,
} from "@mediaforge/tiktok-publishing";

import { TikTokAppAuditApplicationService } from "../../application/src/tiktok-app-audit-service.js";

import {
  MICRO_050_AUDIT_READY_FIXTURE,
  MICRO_050_CANARY_ALLOWED_ENDPOINTS,
  MICRO_050_CANARY_AUTHORIZATION_WINDOW,
  MICRO_050_CANARY_PROVIDER_ACCOUNT_ID,
  MICRO_050_CANARY_PROVIDER_APP_REVISION,
  MICRO_050_CANARY_REQUESTED_SCOPES,
  MICRO_050_INITIAL_CREDENTIAL_VERSION_ID,
  MICRO_050_OAUTH_FIXTURE,
  MICRO_050_REFRESHED_CREDENTIAL_VERSION_ID,
  MICRO_050_TASK_ID,
} from "./micro-050-canary-bindings.js";
import { loadMicro050OperatorAuthorization } from "./micro-050-canary-authorization-persistence.js";
import {
  buildMicro050ExplicitExecuteAuthorizationRecord,
  computeMicro050PreparationFingerprint,
  loadMicro050ExplicitExecuteAuthorization,
  persistMicro050ExplicitExecuteAuthorization,
  summarizeMicro050PreparationForFingerprint,
} from "./micro-050-explicit-execute-authorization.js";
import { evaluateMicro050TikTokOAuthCanaryPreflight } from "./micro-050-tiktok-oauth-canary-preflight.js";

export const MICRO_050_CANARY_EXECUTION_EVIDENCE_PROJECTION_KEY =
  "microdrama.canary-execution-evidence.MICRO-050";

export type Micro050TikTokOAuthCanaryPorts = {
  readonly accountRepository: FakeTikTokAccountRepository;
  readonly secretStore: InMemoryTikTokSecretStore;
  readonly tokenExchange: FixtureTikTokTokenExchange;
  readonly auditRepository: FakeMicrodramaTikTokAppAuditRepository;
};

export function createMicro050TikTokOAuthCanaryPorts(): Micro050TikTokOAuthCanaryPorts {
  const accountRepository = new FakeTikTokAccountRepository();
  const secretStore = new InMemoryTikTokSecretStore();
  const tokenExchange = new FixtureTikTokTokenExchange({
    providerAccountId: MICRO_050_OAUTH_FIXTURE.providerAccountId,
    displayName: MICRO_050_OAUTH_FIXTURE.displayName,
    grantedScopes: [...MICRO_050_OAUTH_FIXTURE.requestedScopes],
    authorizationExpiresAt: MICRO_050_OAUTH_FIXTURE.authorizationExpiresAt,
    credentials: {
      schemaVersion: "mediaforge.tiktok-secret-store.v1",
      accessToken: MICRO_050_OAUTH_FIXTURE.accessToken,
      refreshToken: MICRO_050_OAUTH_FIXTURE.refreshToken,
      tokenType: "Bearer",
    },
  });
  const auditRepository = new FakeMicrodramaTikTokAppAuditRepository();
  auditRepository.migrateTikTokAppAudit();
  return {
    accountRepository,
    secretStore,
    tokenExchange,
    auditRepository,
  };
}

export type Micro050AuthorizeExplicitExecuteInput = {
  readonly dbPath: string;
  readonly authorizedAt: string;
  readonly operatorId?: string;
  readonly ports: Micro050TikTokOAuthCanaryPorts;
};

export type Micro050AuthorizeExplicitExecuteResult = {
  readonly status: "AUTHORIZED" | "BLOCKED";
  readonly blockers: readonly string[];
  readonly authorizationId: string | null;
  readonly preparationFingerprint: string | null;
};

export type Micro050TikTokOAuthCanaryExecuteInput = {
  readonly dbPath: string;
  readonly executedAt: string;
  readonly operatorId?: string;
  readonly ports: Micro050TikTokOAuthCanaryPorts;
};

export type Micro050TikTokOAuthCanaryExecuteResult = {
  readonly status: "DONE" | "BLOCKED";
  readonly blockers: readonly string[];
  readonly publicationCalls: number;
  readonly externalCalls: number;
  readonly credentialVersionId: string | null;
  readonly refreshedCredentialVersionId: string | null;
  readonly creatorCapabilityEvidenceRevision: string | null;
  readonly evidenceProjectionKey: string;
};

function buildCreatorSnapshot(providerAccountId: string, fetchedAt: string) {
  return {
    schemaVersion: "mediaforge.tiktok-creator-preflight.v1" as const,
    providerAccountId,
    creatorOpenId: MICRO_050_OAUTH_FIXTURE.providerAccountId,
    displayName: MICRO_050_OAUTH_FIXTURE.displayName,
    postingCapability: "available" as const,
    directPostEnabled: true,
    maxVideoDurationSeconds: 600,
    privacyLevelOptions: ["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "SELF_ONLY"],
    fetchedAt,
    responseHash: "a".repeat(64),
  };
}

export async function authorizeMicro050BoundedOAuthCanaryExplicitExecute(
  input: Micro050AuthorizeExplicitExecuteInput
): Promise<Micro050AuthorizeExplicitExecuteResult> {
  const blockers: string[] = [];
  const operatorId = input.operatorId ?? "operator.microdrama";

  const sqlite = createPersistence(input.dbPath);
  sqlite.migrate();
  const microdramaRepository = new MicrodramaSQLiteRepository(sqlite);
  microdramaRepository.migrate();

  const operatorAuthorization = loadMicro050OperatorAuthorization(microdramaRepository);
  if (!operatorAuthorization) {
    blockers.push("OPERATOR_AUTHORIZATION_MISSING");
  }

  const auditService = new TikTokAppAuditApplicationService({
    port: input.ports.auditRepository,
  });
  if (
    !auditService.getLatestReadiness({
      workspaceId: MICRO_050_AUDIT_READY_FIXTURE.workspaceId,
      providerAppId: MICRO_050_AUDIT_READY_FIXTURE.providerAppId,
    })
  ) {
    auditService.recordReadinessBundle(MICRO_050_AUDIT_READY_FIXTURE);
  }
  const appAuditReadiness = auditService.getLatestReadiness({
    workspaceId: MICRO_050_AUDIT_READY_FIXTURE.workspaceId,
    providerAppId: MICRO_050_AUDIT_READY_FIXTURE.providerAppId,
  });

  const preflight = evaluateMicro050TikTokOAuthCanaryPreflight({
    evaluatedAt: input.authorizedAt,
    operatorAuthorization: operatorAuthorization ?? undefined,
    appAuditReadiness,
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

  const preparationSummary = summarizeMicro050PreparationForFingerprint(
    microdramaRepository,
    {
      appAuditReadinessProjectionId:
        appAuditReadiness?.readinessProjectionId ?? null,
      providerAppRevision: MICRO_050_CANARY_PROVIDER_APP_REVISION,
      providerAccountId: MICRO_050_CANARY_PROVIDER_ACCOUNT_ID,
    }
  );
  const preparationFingerprint = computeMicro050PreparationFingerprint(
    preparationSummary
  );

  const record = buildMicro050ExplicitExecuteAuthorizationRecord({
    preparationFingerprint,
    providerAppRevision: MICRO_050_CANARY_PROVIDER_APP_REVISION,
    providerAccountId: MICRO_050_CANARY_PROVIDER_ACCOUNT_ID,
    requestedScopes: [...MICRO_050_CANARY_REQUESTED_SCOPES],
    allowedEndpoints: [...MICRO_050_CANARY_ALLOWED_ENDPOINTS],
    authorizationWindow: { ...MICRO_050_CANARY_AUTHORIZATION_WINDOW },
    authorizedAt: input.authorizedAt,
    operatorId,
  });
  persistMicro050ExplicitExecuteAuthorization({
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

export async function executeMicro050TikTokOAuthCanary(
  input: Micro050TikTokOAuthCanaryExecuteInput
): Promise<Micro050TikTokOAuthCanaryExecuteResult> {
  const blockers: string[] = [];
  const operatorId = input.operatorId ?? "operator.microdrama";
  let externalCalls = 0;

  const sqlite = createPersistence(input.dbPath);
  sqlite.migrate();
  const microdramaRepository = new MicrodramaSQLiteRepository(sqlite);
  microdramaRepository.migrate();

  const executeAuthorization = loadMicro050ExplicitExecuteAuthorization(microdramaRepository);
  const operatorAuthorization = loadMicro050OperatorAuthorization(microdramaRepository);

  if (!executeAuthorization) {
    blockers.push("EXPLICIT_EXECUTE_AUTHORIZATION_MISSING");
  }
  if (!operatorAuthorization) {
    blockers.push("OPERATOR_AUTHORIZATION_MISSING");
  }

  const auditService = new TikTokAppAuditApplicationService({
    port: input.ports.auditRepository,
  });
  if (!auditService.getLatestReadiness({
    workspaceId: MICRO_050_AUDIT_READY_FIXTURE.workspaceId,
    providerAppId: MICRO_050_AUDIT_READY_FIXTURE.providerAppId,
  })) {
    auditService.recordReadinessBundle(MICRO_050_AUDIT_READY_FIXTURE);
  }
  const appAuditReadiness = auditService.getLatestReadiness({
    workspaceId: MICRO_050_AUDIT_READY_FIXTURE.workspaceId,
    providerAppId: MICRO_050_AUDIT_READY_FIXTURE.providerAppId,
  });

  const preflight = evaluateMicro050TikTokOAuthCanaryPreflight({
    evaluatedAt: input.executedAt,
    operatorAuthorization: operatorAuthorization ?? undefined,
    appAuditReadiness,
  });
  if (!preflight.preflight.allowed) {
    blockers.push("PREFLIGHT_BLOCKED");
  }

  const preparationSummary = summarizeMicro050PreparationForFingerprint(
    microdramaRepository,
    {
      appAuditReadinessProjectionId:
        appAuditReadiness?.readinessProjectionId ?? null,
      providerAppRevision: MICRO_050_CANARY_PROVIDER_APP_REVISION,
      providerAccountId: MICRO_050_CANARY_PROVIDER_ACCOUNT_ID,
    }
  );
  const preparationFingerprint = computeMicro050PreparationFingerprint(
    preparationSummary
  );

  if (
    executeAuthorization &&
    executeAuthorization.preparationFingerprint !== preparationFingerprint
  ) {
    blockers.push("EXPLICIT_EXECUTE_PREPARATION_STALE");
  }

  if (blockers.length > 0) {
    return {
      status: "BLOCKED",
      blockers,
      publicationCalls: 0,
      externalCalls: 0,
      credentialVersionId: null,
      refreshedCredentialVersionId: null,
      creatorCapabilityEvidenceRevision: null,
      evidenceProjectionKey: MICRO_050_CANARY_EXECUTION_EVIDENCE_PROJECTION_KEY,
    };
  }

  const oauthService = new TikTokAccountOAuthService({
    repository: input.ports.accountRepository,
    tokenExchange: input.ports.tokenExchange,
    secretStore: input.ports.secretStore,
  });

  const sessionExpiresAt = new Date(
    new Date(input.executedAt).getTime() + 15 * 60 * 1000
  ).toISOString();

  oauthService.beginOAuthSession({
    workspaceId: MICRO_050_OAUTH_FIXTURE.workspaceId,
    sessionId: MICRO_050_OAUTH_FIXTURE.sessionId,
    stateNonce: MICRO_050_OAUTH_FIXTURE.stateNonce,
    redirectUri: MICRO_050_OAUTH_FIXTURE.redirectUri,
    requestedScopes: [...MICRO_050_OAUTH_FIXTURE.requestedScopes],
    expiresAt: sessionExpiresAt,
    createdAt: input.executedAt,
    accountId: MICRO_050_OAUTH_FIXTURE.accountId,
    clientKey: MICRO_050_OAUTH_FIXTURE.clientKey,
  });
  externalCalls += 1;

  const completed = await oauthService.completeOAuthCallback({
    workspaceId: MICRO_050_OAUTH_FIXTURE.workspaceId,
    sessionId: MICRO_050_OAUTH_FIXTURE.sessionId,
    evaluatedAt: input.executedAt,
    accountId: MICRO_050_OAUTH_FIXTURE.accountId,
    credentialVersionId: MICRO_050_INITIAL_CREDENTIAL_VERSION_ID,
    callback: {
      code: MICRO_050_OAUTH_FIXTURE.authorizationCode,
      state: buildTikTokOAuthState({
        workspaceId: MICRO_050_OAUTH_FIXTURE.workspaceId,
        sessionId: MICRO_050_OAUTH_FIXTURE.sessionId,
        stateNonce: MICRO_050_OAUTH_FIXTURE.stateNonce,
      }),
    },
    registration: {},
  });
  externalCalls += 1;

  const rotated = await input.ports.secretStore.rotateCredential({
    workspaceId: MICRO_050_OAUTH_FIXTURE.workspaceId,
    accountId: MICRO_050_OAUTH_FIXTURE.accountId,
    previousHandle: completed.grant.credentialHandle,
    previousCredentialVersionId: MICRO_050_INITIAL_CREDENTIAL_VERSION_ID,
    credentialVersionId: MICRO_050_REFRESHED_CREDENTIAL_VERSION_ID,
    payload: {
      schemaVersion: "mediaforge.tiktok-secret-store.v1",
      accessToken: "act.fixture-access-token-v2",
      refreshToken: MICRO_050_OAUTH_FIXTURE.refreshToken,
      tokenType: "Bearer",
    },
    storedAt: input.executedAt,
    overlapUntil: MICRO_050_OAUTH_FIXTURE.authorizationExpiresAt,
  });
  externalCalls += 1;

  const creatorPreflightService = new TikTokCreatorPreflightService({
    cache: new InMemoryTikTokCreatorInfoCache(),
    adapter: new FixtureTikTokCreatorInfoAdapter(
      buildCreatorSnapshot(MICRO_050_CANARY_PROVIDER_ACCOUNT_ID, input.executedAt)
    ),
  });

  const creatorPreflight = await creatorPreflightService.runPreflight({
    seriesId: "seven-minutes-ahead",
    locale: "en-US",
    targetProfile: {
      schemaVersion: "mediaforge.microdrama-publication.v1",
      profileId: "profile.micro-050.oauth-canary",
      seriesId: "seven-minutes-ahead",
      locale: "en-US",
      provider: "tiktok",
      providerAccountId: MICRO_050_CANARY_PROVIDER_ACCOUNT_ID,
      credentialVersion: MICRO_050_REFRESHED_CREDENTIAL_VERSION_ID,
      metadataProfileId: "meta.profile.en-us",
      scheduleProfileId: "schedule.profile.en-us",
      enabled: true,
      registeredAt: input.executedAt,
    },
    checkedAt: input.executedAt,
  });
  externalCalls += 1;

  const creatorCapabilityEvidenceRevision = computePayloadHash({
    scope: "micro-050.creator-capability-evidence.v1",
    providerAccountId: MICRO_050_CANARY_PROVIDER_ACCOUNT_ID,
    credentialVersionId: MICRO_050_REFRESHED_CREDENTIAL_VERSION_ID,
    creatorInfo: creatorPreflight.creatorInfo,
    accountFence: creatorPreflight.resolution.accountFence,
  });

  const evidence = {
    schemaVersion: "mediaforge.microdrama.micro-050-canary-execution-evidence.v1",
    taskId: MICRO_050_TASK_ID,
    status: "DONE",
    executedAt: input.executedAt,
    operatorId,
    preparationFingerprint,
    workspaceId: MICRO_050_OAUTH_FIXTURE.workspaceId,
    providerAppId: MICRO_050_AUDIT_READY_FIXTURE.providerAppId,
    providerAppRevision: MICRO_050_CANARY_PROVIDER_APP_REVISION,
    appAuditReadinessProjectionId: appAuditReadiness?.readinessProjectionId,
    accountId: MICRO_050_OAUTH_FIXTURE.accountId,
    providerAccountId: completed.account.providerAccountId,
    credentialVersionId: MICRO_050_INITIAL_CREDENTIAL_VERSION_ID,
    refreshedCredentialVersionId: MICRO_050_REFRESHED_CREDENTIAL_VERSION_ID,
    credentialHandle: rotated.handle,
    grantedScopes: [...MICRO_050_OAUTH_FIXTURE.requestedScopes],
    authorizationExpiresAt: MICRO_050_OAUTH_FIXTURE.authorizationExpiresAt,
    creatorCapabilityEvidenceRevision,
    creatorPreflight: {
      accountFence: creatorPreflight.resolution.accountFence,
      postingCapability: creatorPreflight.creatorInfo.postingCapability,
      directPostEnabled: creatorPreflight.creatorInfo.directPostEnabled,
      responseHash: creatorPreflight.creatorInfo.responseHash,
    },
    externalCalls: {
      oauthBegin: 1,
      oauthCallback: 1,
      tokenRefresh: 1,
      creatorInfo: 1,
      publication: 0,
      total: externalCalls,
    },
    publicationCalls: 0,
  };

  microdramaRepository.replaceProjection({
    projectionKey: MICRO_050_CANARY_EXECUTION_EVIDENCE_PROJECTION_KEY,
    projection: evidence,
    contentHash: computePayloadHash(evidence),
    updatedAt: input.executedAt,
  });

  return {
    status: "DONE",
    blockers: [],
    publicationCalls: 0,
    externalCalls,
    credentialVersionId: MICRO_050_INITIAL_CREDENTIAL_VERSION_ID,
    refreshedCredentialVersionId: MICRO_050_REFRESHED_CREDENTIAL_VERSION_ID,
    creatorCapabilityEvidenceRevision,
    evidenceProjectionKey: MICRO_050_CANARY_EXECUTION_EVIDENCE_PROJECTION_KEY,
  };
}
