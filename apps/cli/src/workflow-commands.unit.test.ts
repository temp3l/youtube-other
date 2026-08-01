import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MATH_EXECUTABLE_TASK_IDS } from "@mediaforge/math-education";

import {
  WorkflowCliError,
  registerWorkflowCommands,
} from "./workflow-commands.js";

function program(): Command {
  const command = new Command().name("mediaforge");
  command.option("--workspace <path>");
  command.exitOverride();
  registerWorkflowCommands(command);
  return command;
}

async function run(args: readonly string[]): Promise<void> {
  await program().parseAsync([...args], { from: "user" });
}

describe("workflow CLI commands", () => {
  let stdout: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    stdout.mockRestore();
    process.exitCode = undefined;
  });

  it("keeps artifact migration dry-run deterministic and write-free", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "artifact-cli-dry-"));
    const refPath = path.join(root, "ref.json");
    await fs.writeFile(
      refPath,
      JSON.stringify({
        schemaVersion: "mediaforge.artifact.v1",
        unitId: "episode-001",
        profileId: "dark-truth",
        locale: "en",
        variant: "full",
        kind: "full-script",
        artifactRevision: "revision-1",
        workflowRevision: "workflow-1",
        policyRevision: "bible-1",
      })
    );
    const before = await fs.readdir(root);
    await run(["--workspace", root, "artifact", "migrate", "--ref", refPath]);
    const first = String(stdout.mock.calls.at(-1)?.[0]);
    await run(["--workspace", root, "artifact", "migrate", "--ref", refPath]);
    expect(String(stdout.mock.calls.at(-1)?.[0])).toBe(first);
    expect(JSON.parse(first)).toMatchObject({
      schemaVersion: "mediaforge.workflow-cli.v1",
      result: {
        dryRun: true,
        plan: { operation: "block", conflict: "not-found" },
      },
    });
    expect(await fs.readdir(root)).toEqual(before);

    await expect(
      run(["--workspace", root, "artifact", "migrate", "--write"])
    ).rejects.toMatchObject({ exitCode: 1 });
  });

  it("generates registry help and exposes list, explain, graph, and validation", async () => {
    const command = program();
    const fixture = command.commands
      .find((entry) => entry.name() === "workflow")
      ?.commands.find((entry) => entry.name() === "fixture");

    fixture?.outputHelp();
    const help = String(stdout.mock.calls.at(-1)?.[0]);
    expect(help).toContain("Registry examples:");
    expect(help).toContain(
      "mediaforge workflow fixture run --task fixture.prepare"
    );

    await run(["workflow", "fixture", "list"]);
    await run(["task", "explain", "math.render", "--profile", "lesson"]);
    await run(["workflow", "fixture", "graph"]);
    await run(["workflow", "validate"]);
    expect(stdout.mock.calls.length).toBeGreaterThanOrEqual(5);
  });

  it("exposes profile migration status and deterministic acceptance fixtures", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "workflow-cli-darktruth-")
    );
    await run([
      "workflow",
      "episode",
      "profile-status",
      "--episode",
      "001-fixture",
      "--unit-root",
      root,
    ]);
    const migration = JSON.parse(String(stdout.mock.calls.at(-1)?.[0])) as {
      result: { status: string; blockers: string[] };
    };
    expect(migration.result.status).toBe("migration-required");
    expect(migration.result.blockers).toContain(
      "DARKTRUTH_STORY_BIBLE_MISSING"
    );

    await run(["workflow", "episode", "profile-fixture"]);
    const fixture = JSON.parse(String(stdout.mock.calls.at(-1)?.[0])) as {
      result: { status: string; providerCalls: number; traversals: unknown[] };
    };
    expect(fixture.result).toMatchObject({
      status: "passed",
      providerCalls: 0,
    });
    expect(fixture.result.traversals).toHaveLength(10);

    const mathRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "workflow-cli-math-")
    );
    await run([
      "workflow",
      "lesson",
      "profile-status",
      "--lesson",
      "m5-zo-001-standard",
      "--unit-root",
      mathRoot,
    ]);
    const mathMigration = JSON.parse(String(stdout.mock.calls.at(-1)?.[0])) as {
      result: { status: string; blockers: string[] };
    };
    expect(mathMigration.result.status).toBe("migration-required");
    expect(mathMigration.result.blockers).toContain(
      "MATH_LESSON_PROFILE_MISSING"
    );

    await run(["workflow", "lesson", "profile-fixture"]);
    const mathFixture = JSON.parse(String(stdout.mock.calls.at(-1)?.[0])) as {
      result: {
        status: string;
        providerCalls: number;
        stateSource: string;
        traversals: unknown[];
      };
    };
    expect(mathFixture.result).toMatchObject({
      status: "passed",
      providerCalls: 0,
      stateSource: "shared-engine",
    });
    expect(mathFixture.result.traversals).toHaveLength(30);
  });

  it("constructs the lesson CLI graph with every provider-free canonical math binding", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "workflow-cli-canonical-math-")
    );

    await run([
      "workflow",
      "lesson",
      "graph",
      "--lesson",
      "m5-zo-001-standard",
      "--unit-root",
      root,
      "--locale",
      "de",
    ]);

    const graph = JSON.parse(String(stdout.mock.calls.at(-1)?.[0])) as {
      result: {
        nodes: Array<{
          taskId: string;
          implementationBound: boolean;
          implementationOwner: string;
        }>;
      };
    };
    const executableNodes = graph.result.nodes.filter((node) =>
      MATH_EXECUTABLE_TASK_IDS.includes(node.taskId as never)
    );

    expect(executableNodes).toHaveLength(MATH_EXECUTABLE_TASK_IDS.length);
    expect(executableNodes).toEqual(
      expect.arrayContaining(
        MATH_EXECUTABLE_TASK_IDS.map((taskId) =>
          expect.objectContaining({
            taskId,
            implementationBound: true,
            implementationOwner: expect.stringMatching(/^@mediaforge\//u),
          })
        )
      )
    );
    expect(
      graph.result.nodes.find((node) => node.taskId === "math.publish")
    ).toMatchObject({ implementationBound: false });
  });

  it("keeps fixture dry-runs side-effect free and runs one task by default", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "workflow-cli-dry-"));

    await run([
      "workflow",
      "fixture",
      "run-next",
      "--unit-root",
      root,
      "--dry-run",
    ]);
    await expect(fs.stat(path.join(root, "state"))).rejects.toMatchObject({
      code: "ENOENT",
    });

    await run(["workflow", "fixture", "run-next", "--unit-root", root]);
    await run(["workflow", "fixture", "status", "--unit-root", root]);
    const status = JSON.parse(String(stdout.mock.calls.at(-1)?.[0])) as {
      result: { nextTaskId: string; complete: boolean };
    };
    expect(status.result).toMatchObject({
      nextTaskId: "fixture.finish",
      complete: false,
    });
  });

  it("interrupts, resumes, reconciles, and validates through command parsing", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "workflow-cli-resume-")
    );
    const common = ["--unit-root", root] as const;

    await expect(
      run(["workflow", "fixture", "run-next", ...common, "--interrupt"])
    ).rejects.toMatchObject<Partial<WorkflowCliError>>({ exitCode: 130 });

    await run(["workflow", "fixture", "resume", ...common]);
    await run(["workflow", "fixture", "run-next", ...common]);
    await run(["workflow", "fixture", "reconcile", ...common]);
    await run(["workflow", "fixture", "validate-state", ...common]);
    await run(["workflow", "fixture", "status", ...common]);

    const status = JSON.parse(String(stdout.mock.calls.at(-1)?.[0])) as {
      result: { complete: boolean };
    };
    expect(status.result.complete).toBe(true);
  });

  it("inspects, explains, reuses, and safely plans cache pruning", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "workflow-cli-cache-")
    );
    const identity = ["--resource", "fixture", "--unit-root", root] as const;

    await run(["workflow", "fixture", "run-next", "--unit-root", root]);
    await run([
      "workflow",
      "fixture",
      "run",
      "--task",
      "fixture.prepare",
      "--unit-root",
      root,
    ]);
    const reuse = JSON.parse(String(stdout.mock.calls.at(-1)?.[0])) as {
      result: { cacheHit: boolean };
    };
    expect(reuse.result.cacheHit).toBe(true);

    await run(["cache", "inspect", ...identity]);
    await run([
      "cache",
      "explain-miss",
      ...identity,
      "--task",
      "fixture.finish",
    ]);
    const explanation = JSON.parse(String(stdout.mock.calls.at(-1)?.[0])) as {
      result: { status: string; reason: string };
    };
    expect(explanation.result).toMatchObject({
      status: "miss",
      reason: "no-successful-attempt",
    });

    await run(["cache", "prune", ...identity]);
    const prune = JSON.parse(String(stdout.mock.calls.at(-1)?.[0])) as {
      result: { removable: unknown[]; protected: unknown[] };
    };
    expect(prune.result.removable).toEqual([]);
    expect(prune.result.protected).toHaveLength(1);
  });

  it("plans, runs, resumes, reconciles, reports, and cancels canonical batches", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "workflow-cli-batch-")
    );
    const inputPath = path.join(root, "input.json");
    await fs.writeFile(
      inputPath,
      JSON.stringify({
        profileId: "dark-truth",
        provider: "fixture",
        operation: "fixture.batch",
        executionMode: "sync",
        configuration: { concurrency: 1, retryLimit: 0 },
        items: [
          {
            key: "one",
            taskId: "fixture.batch",
            unitId: "fixture-one",
            locale: "en",
            variant: "full",
            fingerprint: "a".repeat(64),
          },
        ],
      }),
      "utf8"
    );

    await run(["batch", "plan", "--input", inputPath, "--batch-root", root]);
    const planned = JSON.parse(String(stdout.mock.calls.at(-1)?.[0])) as {
      result: { id: string; items: Array<{ id: string }> };
    };
    await run(["batch", "run", "--input", inputPath, "--batch-root", root]);
    await run(["batch", "resume", "--input", inputPath, "--batch-root", root]);
    await run([
      "batch",
      "status",
      "--batch-id",
      planned.result.id,
      "--batch-root",
      root,
    ]);
    const status = JSON.parse(String(stdout.mock.calls.at(-1)?.[0])) as {
      result: { status: string; items: unknown[] };
    };
    expect(status.result).toMatchObject({ status: "succeeded" });
    expect(status.result.items).toHaveLength(1);

    const secondRoot = path.join(root, "cancel");
    await run([
      "batch",
      "plan",
      "--input",
      inputPath,
      "--batch-root",
      secondRoot,
    ]);
    const second = JSON.parse(String(stdout.mock.calls.at(-1)?.[0])) as {
      result: { id: string };
    };
    await run([
      "batch",
      "cancel",
      "--batch-id",
      second.result.id,
      "--reason",
      "fixture cancellation",
      "--batch-root",
      secondRoot,
    ]);
    const cancelled = JSON.parse(String(stdout.mock.calls.at(-1)?.[0])) as {
      result: { status: string };
    };
    expect(cancelled.result.status).toBe("cancelled");
  });
});
