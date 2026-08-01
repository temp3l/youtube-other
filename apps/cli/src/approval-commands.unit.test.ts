import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { WORKFLOW_SCHEMA_VERSION, workflowDefinitionSchema } from "@mediaforge/domain";
import { WorkflowStore } from "@mediaforge/workflow-engine";
import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";

import { registerApprovalCommands } from "./approval-commands.js";

const hashA = "a".repeat(64);
const hashB = "b".repeat(64);
let temporaryRoot: string | undefined;

const workflow = workflowDefinitionSchema.parse({
  schemaVersion: WORKFLOW_SCHEMA_VERSION,
  id: "test.workflow",
  revision: "revision-1",
  profileId: "dark-truth",
  taskIds: ["test.publish"],
});

afterEach(async () => {
  vi.restoreAllMocks();
  if (temporaryRoot) await fs.rm(temporaryRoot, { recursive: true, force: true });
  temporaryRoot = undefined;
});

describe("approval commands", () => {
  it("emits stable JSON and attributable events for status, grant, reject, and revoke", async () => {
    temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mediaforge-approval-cli-"));
    const workflowPath = path.join(temporaryRoot, "workflow.json");
    await fs.writeFile(workflowPath, JSON.stringify(workflow), "utf8");
    const store = new WorkflowStore({
      unitRoot: temporaryRoot,
      workflow,
      identity: { instanceId: "instance-001", unitId: "episode-001", locale: "en", variant: "full" },
    });
    await store.initialize();
    const output = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const common = ["--workflow", workflowPath, "--unit-root", temporaryRoot, "--instance", "instance-001", "--unit", "episode-001", "--locale", "en", "--variant", "full"];
    const scope = ["--task", "test.publish", "--gate", "publish", "--input-hashes", hashB, "--output-hashes", hashA, "--json"];
    const run = async (action: string, args: readonly string[]) => {
      const command = new Command();
      registerApprovalCommands(command);
      await command.parseAsync(["node", "mediaforge", "approvals", action, ...common, ...args]);
      return JSON.parse(String(output.mock.calls.at(-1)?.[0] ?? "{}")) as Record<string, unknown>;
    };

    const first = await run("grant", [...scope, "--actor", "reviewer-one", "--reason", "First high-risk review.", "--high-risk"]);
    expect(first).toMatchObject({ action: "granted", actor: "reviewer-one" });
    const oneActorStatus = await run("status", scope);
    expect(oneActorStatus).toMatchObject({ satisfied: false, requiredDistinctActors: 2 });
    const stableStatus = await run("status", scope);
    expect(stableStatus).toEqual(oneActorStatus);

    await run("grant", [...scope, "--actor", "reviewer-two", "--reason", "Second high-risk review.", "--high-risk"]);
    expect(await run("status", scope)).toMatchObject({ satisfied: true, requiredDistinctActors: 2 });
    await run("reject", [...scope, "--actor", "reviewer-three", "--reason", "Fingerprint rejected."]);
    expect(await run("status", scope)).toMatchObject({ satisfied: false });

    const replacement = await run("grant", [...scope, "--actor", "reviewer-four", "--reason", "Replacement review.", "--high-risk"]);
    await run("revoke", ["--approval", String(replacement["approvalId"]), "--actor", "operator-one", "--reason", "Artifact superseded.", "--json"]);
    expect(await run("status", scope)).toMatchObject({ satisfied: false });

    const events = (await store.readEvents()).filter((event) => event.eventType === "approval-recorded");
    expect(events.map((event) => event.actor)).toEqual([
      "reviewer-one", "reviewer-two", "reviewer-three", "reviewer-four", "operator-one",
    ]);
    expect(events.map((event) => event.decision)).toEqual([
      "approved", "approved", "rejected", "approved", "revoked",
    ]);
  });
});
