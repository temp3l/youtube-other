import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  buildMicrodramaSharedVisualArtifactIdentity,
  planMicrodramaSharedVisualInvalidation,
  runMicrodramaVisualGenerationWorkflow,
} from "./microdrama-visual-generation.js";

describe("microdrama visual generation workflow", () => {
  it("records cache hits from the workflow port without provider calls", async () => {
    const journal = await runMicrodramaVisualGenerationWorkflow({
      requestId: "req.workflow.1",
      cacheKey: "a".repeat(64),
      port: {
        generate: async () => ({
          cacheHit: true,
          artifactHash: "b".repeat(64),
          storageUri: "mock://visual/cache-hit.png",
        }),
      },
    });

    expect(journal.status).toBe("SUCCEEDED");
    expect(journal.cacheHit).toBe(true);
    expect(journal.task).toBe("microdrama.generate-shared-visual");
  });

  it("plans invalidation when registry dependency fingerprints change", () => {
    const identity = buildMicrodramaSharedVisualArtifactIdentity({
      episodeId: "E001",
      shotSemanticId: "shot.sem.e001.001.001",
      sourcePlateSemanticId: "plate.sem.e001.001",
      sceneShotPlanRevisionId: "rev.scene-shot.e001.v1",
      registryDependencies: [
        {
          revisionId: "var.char.mira-chen.rev.1",
          contentHash: "c".repeat(64),
        },
      ],
      cacheKey: "d".repeat(64),
    });

    const targets = planMicrodramaSharedVisualInvalidation({
      artifacts: [identity],
      changes: [
        {
          kind: "source",
          id: "registry:var.char.mira-chen.rev.1",
          fingerprint: createHash("sha256").update("d".repeat(64), "utf8").digest("hex"),
        },
      ],
    });

    expect(targets).toHaveLength(1);
    expect(targets[0]?.artifactId).toBe(identity.artifactId);
  });
});
