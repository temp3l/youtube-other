import crypto from "node:crypto";
import fs from "node:fs/promises";

import {
  APPROVAL_SCHEMA_VERSION,
  approvalGateSchema,
  approvalRecordSchema,
  contentLocaleSchema,
  contentVariantSchema,
  workflowDefinitionSchema,
} from "@mediaforge/domain";
import { WorkflowStore } from "@mediaforge/workflow-engine";
import { Command } from "commander";

interface ApprovalCommandOptions {
  readonly workflow: string;
  readonly unitRoot: string;
  readonly instance: string;
  readonly unit: string;
  readonly locale: string;
  readonly variant: string;
  readonly json?: boolean;
}

function hashes(value: string): [string, ...string[]] {
  const parsed = value.split(",").map((item) => item.trim()).filter(Boolean);
  if (parsed.length === 0 || parsed.some((hash) => !/^[a-f0-9]{64}$/u.test(hash))) {
    throw new Error("Approval hashes must contain lowercase SHA-256 digests.");
  }
  return parsed as [string, ...string[]];
}

function reviewerCount(value: string): number {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 1 || count > 10) {
    throw new Error("--required-reviewers must be an integer from 1 to 10.");
  }
  return count;
}

function emit(value: unknown, json: boolean | undefined): void {
  // JSON is deliberately the same stable shape for both machine and terminal
  // callers; this avoids a human-only output path that drops audit evidence.
  process.stdout.write(`${JSON.stringify(value, null, json ? 2 : undefined)}\n`);
}

async function openStore(options: ApprovalCommandOptions): Promise<WorkflowStore> {
  const workflow = workflowDefinitionSchema.parse(
    JSON.parse(await fs.readFile(options.workflow, "utf8")) as unknown
  );
  const store = new WorkflowStore({
    unitRoot: options.unitRoot,
    workflow,
    identity: {
      instanceId: options.instance,
      unitId: options.unit,
      locale: contentLocaleSchema.parse(options.locale),
      variant: contentVariantSchema.parse(options.variant),
    },
  });
  await store.readState();
  return store;
}

function common(command: Command): Command {
  return command
    .requiredOption("--workflow <path>", "workflow definition JSON")
    .requiredOption("--unit-root <path>", "episode or unit root")
    .requiredOption("--instance <id>", "workflow instance ID")
    .requiredOption("--unit <id>", "production unit ID")
    .requiredOption("--locale <locale>", "approval locale")
    .requiredOption("--variant <variant>", "approval variant")
    .option("--json", "emit stable JSON output");
}

/** Registers local, event-backed approval operations. No provider is invoked. */
export function registerApprovalCommands(program: Command): void {
  const approvals = program.command("approvals").description("Inspect and record durable scoped approvals");
  common(approvals.command("status")).requiredOption("--task <task-id>", "workflow task ID")
    .requiredOption("--gate <gate>", "source, canonical-script, localization, voice, metadata, render-qa, or publish")
    .requiredOption("--input-hashes <sha256,...>", "input fingerprint hashes")
    .requiredOption("--output-hashes <sha256,...>", "output fingerprint hashes")
    .option("--required-reviewers <count>", "distinct reviewer count", "1")
    .action(async (options: ApprovalCommandOptions & { task: string; gate: string; inputHashes: string; outputHashes: string; requiredReviewers: string }) => {
      const store = await openStore(options);
      const outputHashes = hashes(options.outputHashes);
      const records = await store.currentApprovals(options.task, {
        artifactHashes: outputHashes,
        locale: options.locale,
        variant: options.variant,
        gate: approvalGateSchema.parse(options.gate),
        inputArtifactHashes: hashes(options.inputHashes),
      });
      const requestedDistinctActors = reviewerCount(options.requiredReviewers);
      const requiredDistinctActors = records.some((record) => record.scope?.highRisk)
        ? Math.max(2, requestedDistinctActors)
        : requestedDistinctActors;
      const current = await store.currentApproval(options.task, {
        artifactHashes: outputHashes,
        locale: options.locale,
        variant: options.variant,
        gate: approvalGateSchema.parse(options.gate),
        inputArtifactHashes: hashes(options.inputHashes),
        requiredDistinctActors,
      });
      emit({ taskId: options.task, satisfied: current !== null, requiredDistinctActors, approvals: records.map((record) => ({ id: record.id, actor: record.actor, decision: record.decision, createdAt: record.createdAt })) }, options.json);
    });

  for (const decision of ["approved", "rejected"] as const) {
    common(approvals.command(decision === "approved" ? "grant" : "reject"))
      .requiredOption("--task <task-id>", "workflow task ID")
      .requiredOption("--gate <gate>", "approval gate")
      .requiredOption("--actor <actor>", "attributable reviewer identity")
      .requiredOption("--reason <text>", "review decision rationale")
      .requiredOption("--input-hashes <sha256,...>", "input fingerprint hashes")
      .requiredOption("--output-hashes <sha256,...>", "output fingerprint hashes")
      .option("--high-risk", "require distinct high-risk review")
      .option("--expires-at <iso-date>", "optional decision expiry")
      .action(async (options: ApprovalCommandOptions & { task: string; gate: string; actor: string; reason: string; inputHashes: string; outputHashes: string; highRisk?: boolean; expiresAt?: string }) => {
        const store = await openStore(options);
        const state = await store.readState();
        const outputHashes = hashes(options.outputHashes);
        const record = approvalRecordSchema.parse({
          schemaVersion: APPROVAL_SCHEMA_VERSION,
          id: `approval-${crypto.randomUUID()}`,
          workflowInstanceId: state.id,
          taskId: options.task,
          profileId: state.profileId,
          unitId: state.unitId,
          locale: contentLocaleSchema.parse(options.locale),
          variant: contentVariantSchema.parse(options.variant),
          decision,
          actor: options.actor,
          reason: options.reason,
          boundRevision: state.workflowRevision,
          artifactHashes: outputHashes,
          createdAt: new Date().toISOString(),
          ...(options.expiresAt ? { expiresAt: options.expiresAt } : {}),
          scope: {
            gate: approvalGateSchema.parse(options.gate),
            locale: contentLocaleSchema.parse(options.locale),
            variant: contentVariantSchema.parse(options.variant),
            inputArtifactHashes: hashes(options.inputHashes),
            outputArtifactHashes: outputHashes,
            highRisk: options.highRisk ?? false,
          },
        });
        await store.recordApproval(record);
        emit({ action: decision === "approved" ? "granted" : "rejected", approvalId: record.id, taskId: record.taskId, actor: record.actor }, options.json);
      });
  }

  common(approvals.command("revoke")).requiredOption("--approval <id>", "approval ID")
    .requiredOption("--actor <actor>", "attributable reviewer identity")
    .requiredOption("--reason <text>", "revocation rationale")
    .action(async (options: ApprovalCommandOptions & { approval: string; actor: string; reason: string }) => {
      const record = await (await openStore(options)).revokeApproval({ approvalId: options.approval, actor: options.actor, reason: options.reason });
      emit({ action: "revoked", approvalId: record.supersedesApprovalId, revocationId: record.id, actor: record.actor }, options.json);
    });
}
