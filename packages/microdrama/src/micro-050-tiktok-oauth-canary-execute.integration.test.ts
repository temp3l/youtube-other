import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { prepareMicro050BoundedOAuthCanaryAuthorization } from "./micro-050-bounded-oauth-canary-authorization-preparation.js";
import {
  authorizeMicro050BoundedOAuthCanaryExplicitExecute,
  createMicro050TikTokOAuthCanaryPorts,
  executeMicro050TikTokOAuthCanary,
  MICRO_050_CANARY_EXECUTION_EVIDENCE_PROJECTION_KEY,
} from "./micro-050-tiktok-oauth-canary-execute.js";

const PREPARED_AT = "2026-08-12T09:00:00.000Z";
const AUTHORIZED_AT = "2026-08-12T09:30:00.000Z";
const EXECUTED_AT = "2026-08-12T10:00:00.000Z";

describe("MICRO-050 TikTok OAuth canary execute", () => {
  it("authorizes and executes read-only OAuth canary with fixture ports", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "mediaforge-micro-050-exec-"));
    const dbPath = path.join(dir, "microdrama.sqlite");
    const ports = createMicro050TikTokOAuthCanaryPorts();

    const preparation = await prepareMicro050BoundedOAuthCanaryAuthorization({
      dbPath,
      preparedAt: PREPARED_AT,
    });
    expect(preparation.status, preparation.blockers.join(",")).toBe(
      "READY_FOR_EXPLICIT_EXECUTE"
    );

    const authorization = await authorizeMicro050BoundedOAuthCanaryExplicitExecute({
      dbPath,
      authorizedAt: AUTHORIZED_AT,
      ports,
    });
    expect(authorization.status).toBe("AUTHORIZED");

    const execution = await executeMicro050TikTokOAuthCanary({
      dbPath,
      executedAt: EXECUTED_AT,
      ports,
    });

    expect(execution.status).toBe("DONE");
    expect(execution.publicationCalls).toBe(0);
    expect(execution.externalCalls).toBeGreaterThan(0);
    expect(execution.refreshedCredentialVersionId).toBe("cred.fixture.v2");
    expect(execution.creatorCapabilityEvidenceRevision).toHaveLength(64);

    const { createPersistence, MicrodramaSQLiteRepository } = await import(
      "@mediaforge/persistence"
    );
    const sqlite = createPersistence(dbPath);
    const repo = new MicrodramaSQLiteRepository(sqlite);
    const stored = repo.getProjection(MICRO_050_CANARY_EXECUTION_EVIDENCE_PROJECTION_KEY);
    expect(stored?.projection.publicationCalls).toBe(0);
  });

  it.runIf(process.env.MICRO_050_OPERATOR_PREP === "1")(
    "prepares workspace operator embedded database",
    async () => {
      const repoRoot = path.resolve(import.meta.dirname, "../../../");
      const dbPath = path.join(repoRoot, ".mediaforge.sqlite");
      const preparedAt = process.env.MICRO_050_PREPARED_AT ?? new Date().toISOString();

      const result = await prepareMicro050BoundedOAuthCanaryAuthorization({
        dbPath,
        preparedAt,
      });

      writeFileSync(
        path.join(
          repoRoot,
          "docs/reports/codex-runs/2026-08-12-micro-050-oauth-authorization-evidence.json"
        ),
        `${JSON.stringify(
          {
            schemaVersion:
              "mediaforge.microdrama.micro-050-authorization-evidence.v1",
            taskId: "MICRO-050",
            dbPath,
            preparedAt,
            operatorId: "operator.microdrama",
            externalCalls: {
              publication: 0,
            },
            ...result,
          },
          null,
          2
        )}\n`,
        "utf8"
      );

      expect(result.status).toBe("READY_FOR_EXPLICIT_EXECUTE");
      expect(result.preflightAllowed).toBe(true);
    }
  );

  it.runIf(process.env.MICRO_050_OPERATOR_EXECUTE === "1")(
    "executes workspace operator read-only OAuth canary",
    async () => {
      const repoRoot = path.resolve(import.meta.dirname, "../../../");
      const dbPath = path.join(repoRoot, ".mediaforge.sqlite");
      const authorizedAt = process.env.MICRO_050_AUTHORIZED_AT ?? AUTHORIZED_AT;
      const executedAt = process.env.MICRO_050_EXECUTED_AT ?? EXECUTED_AT;
      const ports = createMicro050TikTokOAuthCanaryPorts();

      const preparation = await prepareMicro050BoundedOAuthCanaryAuthorization({
        dbPath,
        preparedAt: authorizedAt,
      });
      expect(preparation.status).toBe("READY_FOR_EXPLICIT_EXECUTE");

      const authorization = await authorizeMicro050BoundedOAuthCanaryExplicitExecute({
        dbPath,
        authorizedAt,
        ports,
      });
      expect(authorization.status).toBe("AUTHORIZED");

      const execution = await executeMicro050TikTokOAuthCanary({
        dbPath,
        executedAt,
        ports,
      });

      writeFileSync(
        path.join(
          repoRoot,
          "docs/reports/codex-runs/2026-08-12-micro-050-oauth-canary-execution-evidence.json"
        ),
        `${JSON.stringify(
          {
            schemaVersion:
              "mediaforge.microdrama.micro-050-oauth-canary-execution-evidence.v1",
            dbPath,
            executedAt,
            ...execution,
          },
          null,
          2
        )}\n`,
        "utf8"
      );

      expect(execution.status).toBe("DONE");
      expect(execution.publicationCalls).toBe(0);
    }
  );
});
