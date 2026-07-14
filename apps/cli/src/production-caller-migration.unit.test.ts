import { currentProductionCallerInvocation } from "@mediaforge/workflow-engine";
import { Command } from "commander";
import { describe, expect, it, vi } from "vitest";

import {
  migrateProductionCommandCallers,
  resolveProductionCallerRoute,
} from "./production-caller-migration.js";

describe("production caller migration", () => {
  it.each([
    ["episode english", "darktruth.rewrite-full"],
    ["stories rewrite-short", "darktruth.shorts-derive"],
    ["images batch resume", "darktruth.scene-images"],
    ["thumbnails generate", "darktruth.thumbnail-generate"],
    ["audio narration synthesize", "darktruth.audio-generate"],
    ["render remote test", "darktruth.render"],
    ["metadata youtube", "darktruth.metadata"],
    ["youtube upload", "darktruth.publish"],
    ["episode migrate-layout", "darktruth.scene-images"],
    ["math curriculum import", "math.curriculum-import"],
    ["math production verify", "math.math-verification"],
    ["math production run", "math.publish-dry-run"],
    ["math production resume", "math.publish-dry-run"],
    ["math production status", "math.quality-gate"],
    ["math publish", "math.publish-dry-run"],
  ])("routes %s through %s", (caller, taskId) => {
    expect(resolveProductionCallerRoute(caller)?.taskId).toBe(taskId);
  });

  it("wraps an existing command action without changing its arguments or result", async () => {
    const program = new Command().name("mediaforge").exitOverride();
    const action = vi.fn((source: string) => ({
      source,
      invocation: currentProductionCallerInvocation(),
    }));
    program.command("metadata").command("youtube <source>").action(action);

    const summary = migrateProductionCommandCallers(program);
    await program.parseAsync([
      "node",
      "mediaforge",
      "metadata",
      "youtube",
      "scenes.json",
    ]);

    expect(summary.unmappedProductionCallers).toEqual([]);
    expect(summary.routes).toHaveLength(1);
    expect(action).toHaveBeenCalledWith(
      "scenes.json",
      expect.anything(),
      expect.anything()
    );
    expect(action.mock.results[0]?.value).toMatchObject({
      source: "scenes.json",
      invocation: {
        caller: "mediaforge metadata youtube",
        taskId: "darktruth.metadata",
        implementationOwner: "@mediaforge/metadata",
      },
    });
  });

  it("fails closed when a production action has no canonical mapping", () => {
    const program = new Command().name("mediaforge");
    program
      .command("youtube")
      .command("unknown")
      .action(() => undefined);
    expect(() => migrateProductionCommandCallers(program)).toThrow(
      /youtube unknown/u
    );
  });
});
