import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createStrategicFullWorkflowOperator } from "./workflow-operator.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe("canonical Veronica workflow operator", () => {
  it("binds fail-closed stages without reviving the fixture pipeline", async () => {
    const unitRoot = await fs.mkdtemp(path.join(os.tmpdir(), "veronica-operator-"));
    roots.push(unitRoot);
    const operator = createStrategicFullWorkflowOperator({
      unitRoot,
      episodeId: "episode-001",
    });

    expect(operator.graph().workflow.profileId).toBe("veronicabenini");
    expect(operator.graph().nodes.find(
      (node) => node.taskId === "strategic.source-ingest",
    )?.implementationBound).toBe(true);
    await expect(operator.runNext()).rejects.toThrow("not enabled for direct execution");
  });

  it("accepts owning capability bindings while retaining canonical identity", async () => {
    const unitRoot = await fs.mkdtemp(path.join(os.tmpdir(), "veronica-capability-"));
    roots.push(unitRoot);
    const operator = createStrategicFullWorkflowOperator({
      unitRoot,
      episodeId: "episode-001",
      implementations: {
        "strategic.source-ingest": async (context) => ({
          outputArtifacts: [],
          warnings: [`bound:${context.profileId}`],
        }),
      },
    });

    const [result] = await operator.runNext();
    expect(result?.taskId).toBe("strategic.source-ingest");
    expect(result?.warnings).toEqual(["bound:veronicabenini"]);
  });
});
