import { TikTokAppAuditApplicationService } from "../../application/src/tiktok-app-audit-service.js";
import {
  FakeMicrodramaTikTokAppAuditRepository,
  MicrodramaSQLiteRepository,
  MicrodramaTikTokAppAuditRepository,
  createPersistence,
} from "@mediaforge/persistence";

import {
  MICRO_050_AUDIT_READY_FIXTURE,
  MICRO_050_CANARY_ALLOWED_ENDPOINTS,
  MICRO_050_CANARY_AUTHORIZATION_WINDOW,
  MICRO_050_CANARY_PROVIDER_ACCOUNT_ID,
  MICRO_050_CANARY_PROVIDER_APP_ID,
  MICRO_050_CANARY_PROVIDER_APP_REVISION,
  MICRO_050_CANARY_REQUESTED_SCOPES,
  MICRO_050_CANARY_WORKSPACE_ID,
  MICRO_050_TASK_ID,
} from "./micro-050-canary-bindings.js";
import {
  buildMicro050OperatorAuthorizationRecord,
  computeMicro050AuthorizationRevisionId,
  loadMicro050OperatorAuthorization,
  persistMicro050OperatorAuthorization,
} from "./micro-050-canary-authorization-persistence.js";
import {
  evaluateMicro050TikTokOAuthCanaryPreflight,
  micro050AuditReadinessProbe,
} from "./micro-050-tiktok-oauth-canary-preflight.js";

export type Micro050BoundedOAuthCanaryAuthorizationPreparationInput = {
  readonly dbPath: string;
  readonly preparedAt: string;
  readonly operatorId?: string;
  readonly useEmbeddedAuditRepository?: boolean;
};

export type Micro050BoundedOAuthCanaryAuthorizationPreparationResult = {
  readonly status: "READY_FOR_EXPLICIT_EXECUTE" | "BLOCKED";
  readonly blockers: readonly string[];
  readonly operatorAuthorizationId: string | null;
  readonly appAuditReadinessProjectionId: string | null;
  readonly providerAppRevision: string;
  readonly providerAccountId: string;
  readonly preflightAllowed: boolean;
};

export async function prepareMicro050BoundedOAuthCanaryAuthorization(
  input: Micro050BoundedOAuthCanaryAuthorizationPreparationInput
): Promise<Micro050BoundedOAuthCanaryAuthorizationPreparationResult> {
  const blockers: string[] = [];
  const operatorId = input.operatorId ?? "operator.microdrama";

  const sqlite = createPersistence(input.dbPath);
  sqlite.migrate();
  const microdramaRepository = new MicrodramaSQLiteRepository(sqlite);
  microdramaRepository.migrate();

  let auditReadinessProjectionId: string | null = null;
  let appAuditReadiness: ReturnType<
    TikTokAppAuditApplicationService["getLatestReadiness"]
  > = null;

  if (input.useEmbeddedAuditRepository) {
    const auditRepository = new FakeMicrodramaTikTokAppAuditRepository();
    auditRepository.migrateTikTokAppAudit();
    const auditService = new TikTokAppAuditApplicationService({ port: auditRepository });
    const bundle = auditService.recordReadinessBundle(MICRO_050_AUDIT_READY_FIXTURE);
    appAuditReadiness = bundle.readiness;
    auditReadinessProjectionId = bundle.readiness.readinessProjectionId;
  } else {
    const auditRepository = new MicrodramaTikTokAppAuditRepository(sqlite);
    auditRepository.migrateTikTokAppAudit();
    const auditService = new TikTokAppAuditApplicationService({ port: auditRepository });
    const bundle = auditService.recordReadinessBundle(MICRO_050_AUDIT_READY_FIXTURE);
    appAuditReadiness = bundle.readiness;
    auditReadinessProjectionId = bundle.readiness.readinessProjectionId;
  }

  const auditProbe = evaluateMicro050TikTokOAuthCanaryPreflight({
    evaluatedAt: input.preparedAt,
    appAuditReadiness,
  });

  if (!auditProbe.preflight.readinessGates.every((gate) => gate.ok)) {
    blockers.push("PREFLIGHT_BLOCKED");
    for (const gate of auditProbe.preflight.readinessGates) {
      if (!gate.ok) {
        blockers.push(`GATE_${gate.gate}${gate.message ? `:${gate.message}` : ""}`);
      }
    }
  }

  if (blockers.length === 0) {
    persistMicro050OperatorAuthorization({
      repository: microdramaRepository,
      record: buildMicro050OperatorAuthorizationRecord({
        operatorId,
        authorizedAt: input.preparedAt,
      }),
    });
  }

  const loadedOperatorAuthorization = loadMicro050OperatorAuthorization(microdramaRepository);
  const finalPreflight = evaluateMicro050TikTokOAuthCanaryPreflight({
    evaluatedAt: input.preparedAt,
    operatorAuthorization: loadedOperatorAuthorization ?? undefined,
    appAuditReadiness,
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
    operatorAuthorizationId: loadedOperatorAuthorization?.authorizationId ?? null,
    appAuditReadinessProjectionId: auditReadinessProjectionId,
    providerAppRevision: MICRO_050_CANARY_PROVIDER_APP_REVISION,
    providerAccountId: MICRO_050_CANARY_PROVIDER_ACCOUNT_ID,
    preflightAllowed,
  };
}

export function micro050AuthorizationEvidenceSummary(input: {
  readonly preparation: Micro050BoundedOAuthCanaryAuthorizationPreparationResult;
}): Record<string, unknown> {
  return {
    taskId: MICRO_050_TASK_ID,
    status: input.preparation.status,
    workspaceId: MICRO_050_CANARY_WORKSPACE_ID,
    providerAppId: MICRO_050_CANARY_PROVIDER_APP_ID,
    providerAppRevision: input.preparation.providerAppRevision,
    providerAccountId: input.preparation.providerAccountId,
    requestedScopes: [...MICRO_050_CANARY_REQUESTED_SCOPES],
    allowedEndpoints: [...MICRO_050_CANARY_ALLOWED_ENDPOINTS],
    authorizationWindow: { ...MICRO_050_CANARY_AUTHORIZATION_WINDOW },
    operatorAuthorizationRevision: input.preparation.operatorAuthorizationId
      ? computeMicro050AuthorizationRevisionId(
          "auth",
          input.preparation.operatorAuthorizationId
        )
      : null,
    appAuditReadinessProjectionId: input.preparation.appAuditReadinessProjectionId,
    preflightAllowed: input.preparation.preflightAllowed,
    blockers: input.preparation.blockers,
    auditProbe: micro050AuditReadinessProbe({}),
  };
}
