import { TikTokAppAuditApplicationService } from "../../application/src/tiktok-app-audit-service.js";
import {
  MicrodramaSQLiteRepository,
  MicrodramaTikTokAppAuditRepository,
  createPersistence,
} from "@mediaforge/persistence";

import {
  buildMicro042OperatorAuthorizationRecord,
  computeMicro042AuthorizationRevisionId,
  loadMicro042OperatorAuthorization,
  persistMicro042OperatorAuthorization,
} from "./micro-042-canary-authorization-persistence.js";
import {
  MICRO_042_CANARY_PROVIDER_ACCOUNT_ID,
  MICRO_042_CANARY_PROVIDER_APP_REVISION,
  MICRO_042_TASK_ID,
} from "./micro-042-canary-bindings.js";
import {
  loadMicro038PublicCanaryExecutionEvidence,
  micro038EvidenceProvesPublicCanaryDone,
  resolveMicro042PublicationIdFromEvidence,
} from "./micro-042-canary-micro-038-evidence.js";
import {
  evaluateMicro042TikTokPublicVideoReadCanaryPreflight,
  MICRO_042_AUDIT_PROBE,
} from "./micro-042-tiktok-public-video-read-canary-preflight.js";

export type Micro042BoundedPublicVideoReadCanaryAuthorizationPreparationInput = {
  readonly dbPath: string;
  readonly preparedAt: string;
  readonly operatorId?: string;
  readonly micro038EvidenceJsonPath?: string;
};

export type Micro042BoundedPublicVideoReadCanaryAuthorizationPreparationResult = {
  readonly status: "READY_FOR_EXPLICIT_EXECUTE" | "BLOCKED";
  readonly blockers: readonly string[];
  readonly operatorAuthorizationId: string | null;
  readonly publicationId: string | null;
  readonly providerVideoId: string | null;
  readonly preflightAllowed: boolean;
};

export async function prepareMicro042BoundedPublicVideoReadCanaryAuthorization(
  input: Micro042BoundedPublicVideoReadCanaryAuthorizationPreparationInput
): Promise<Micro042BoundedPublicVideoReadCanaryAuthorizationPreparationResult> {
  const blockers: string[] = [];
  const operatorId = input.operatorId ?? "operator.microdrama";

  const sqlite = createPersistence(input.dbPath);
  sqlite.migrate();
  const microdramaRepository = new MicrodramaSQLiteRepository(sqlite);
  microdramaRepository.migrate();

  const auditRepository = new MicrodramaTikTokAppAuditRepository(sqlite);
  auditRepository.migrateTikTokAppAudit();
  const auditService = new TikTokAppAuditApplicationService({ port: auditRepository });
  const auditBundle = auditService.recordReadinessBundle(MICRO_042_AUDIT_PROBE.fixture);
  const appAuditReadiness = auditBundle.readiness;

  const micro038Evidence = loadMicro038PublicCanaryExecutionEvidence({
    repository: microdramaRepository,
    ...(input.micro038EvidenceJsonPath
      ? { jsonFilePath: input.micro038EvidenceJsonPath }
      : {}),
  });

  if (!micro038EvidenceProvesPublicCanaryDone(micro038Evidence)) {
    blockers.push("MICRO_038_EVIDENCE_MISSING");
  }

  const publicationId = resolveMicro042PublicationIdFromEvidence(micro038Evidence);
  const providerVideoId = micro038Evidence?.receiptPublicVideoId ?? null;

  if (blockers.length === 0 && micro038Evidence) {
    persistMicro042OperatorAuthorization({
      repository: microdramaRepository,
      record: buildMicro042OperatorAuthorizationRecord({
        operatorId,
        authorizedAt: input.preparedAt,
        publicationId,
      }),
    });
  }

  const loadedOperatorAuthorization =
    loadMicro042OperatorAuthorization(microdramaRepository);
  const finalPreflight = evaluateMicro042TikTokPublicVideoReadCanaryPreflight({
    evaluatedAt: input.preparedAt,
    operatorAuthorization: loadedOperatorAuthorization ?? undefined,
    micro038Evidence,
    appAuditReadiness,
    publicationId,
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
    operatorAuthorizationId: loadedOperatorAuthorization?.authorizationId ?? null,
    publicationId: preflightAllowed ? publicationId : null,
    providerVideoId: preflightAllowed ? providerVideoId : null,
    preflightAllowed,
  };
}

export function micro042AuthorizationEvidenceSummary(input: {
  readonly preparation: Micro042BoundedPublicVideoReadCanaryAuthorizationPreparationResult;
}): Record<string, unknown> {
  return {
    taskId: MICRO_042_TASK_ID,
    status: input.preparation.status,
    operatorAuthorizationRevision: input.preparation.operatorAuthorizationId
      ? computeMicro042AuthorizationRevisionId(
          "auth",
          input.preparation.operatorAuthorizationId
        )
      : null,
    providerAppRevision: MICRO_042_CANARY_PROVIDER_APP_REVISION,
    providerAccountId: MICRO_042_CANARY_PROVIDER_ACCOUNT_ID,
    publicationId: input.preparation.publicationId,
    providerVideoId: input.preparation.providerVideoId,
    preflightAllowed: input.preparation.preflightAllowed,
    blockers: input.preparation.blockers,
  };
}
