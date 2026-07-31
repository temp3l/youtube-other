import { createApplicationExecutionContext, type WorkflowAdmissionCommand } from "@mediaforge/application";
import { loadRuntimeConfig } from "@mediaforge/config";
import { PostgresWorkflowRepository } from "@mediaforge/persistence";
import { Command } from "commander";
import { createHash, randomUUID } from "node:crypto";
import { Pool } from "pg";

import { createPostgresCliWorkflowAdmissionHandler } from "./workflow-admission-composition.js";

interface AdmissionOptions {
  readonly workspaceId: string;
  readonly template: string;
  readonly episodeRevision: string;
  readonly locales: string;
  readonly variants: string;
  readonly approvalMode: "required" | "none";
  readonly publicationMode: "none" | "manual" | "scheduled";
  readonly idempotencyKey: string;
}

function list(value: string): readonly string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

/** Adds the narrow connected entry point; legacy filesystem commands remain untouched. */
export function registerWorkflowAdmissionCommand(program: Command): void {
  const workflow = program.commands.find((command) => command.name() === "workflow");
  if (!workflow) throw new Error("Workflow command must be registered before connected admission.");
  workflow
    .command("admit")
    .description("Admit a workflow through the PostgreSQL-backed application handler")
    .requiredOption("--workspace-id <workspace-id>", "tenant workspace ID")
    .requiredOption("--template <template>", "workflow template")
    .requiredOption("--episode-revision <revision>", "episode revision")
    .requiredOption("--idempotency-key <key>", "stable request idempotency key")
    .option("--locales <locales>", "comma-separated locales", "en")
    .option("--variants <variants>", "comma-separated variants", "full")
    .option("--approval-mode <mode>", "required or none", "required")
    .option("--publication-mode <mode>", "none, manual, or scheduled", "none")
    .action(async (options: AdmissionOptions) => {
      const config = await loadRuntimeConfig();
      if (!config.workflowDatabaseUrl)
        throw new Error("MEDIAFORGE_WORKFLOW_DATABASE_URL is required for connected workflow admission.");
      const pool = new Pool({ connectionString: config.workflowDatabaseUrl });
      const repository = new PostgresWorkflowRepository(pool);
      try {
        await repository.migrate();
        const command: WorkflowAdmissionCommand = {
          template: options.template,
          episodeRevision: Number(options.episodeRevision),
          locales: list(options.locales),
          variants: list(options.variants),
          approvalMode: options.approvalMode,
          publicationMode: options.publicationMode,
        };
        if (!Number.isInteger(command.episodeRevision) || command.episodeRevision < 0)
          throw new Error("--episode-revision must be a non-negative integer.");
        if (!["required", "none"].includes(command.approvalMode))
          throw new Error("--approval-mode must be required or none.");
        if (!["none", "manual", "scheduled"].includes(command.publicationMode))
          throw new Error("--publication-mode must be none, manual, or scheduled.");
        const requestId = randomUUID();
        const result = await createPostgresCliWorkflowAdmissionHandler(pool).execute(
          command,
          createApplicationExecutionContext({
            context: {
              actor: { principalId: "cli-connected", kind: "service", permissions: ["workflow:write"] },
              workspace: { id: options.workspaceId },
              authorization: { decision: "allowed", requiredPermissions: ["workflow:write"] },
              requestId,
              correlationId: requestId,
              deadlineAt: new Date(Date.now() + 30_000).toISOString(),
              idempotency: {
                key: options.idempotencyKey,
                fingerprint: createHash("sha256").update(JSON.stringify(command)).digest("hex"),
              },
            },
          })
        );
        process.stdout.write(`${JSON.stringify(result)}\n`);
      } finally {
        await pool.end();
      }
    });
}
