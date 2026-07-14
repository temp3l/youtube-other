import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  ArtifactRepository,
  WorkflowInterruptedError,
  WorkflowOperator,
  WorkflowStore,
  createTaskRegistry,
} from "@mediaforge/workflow-engine";
import { describe, expect, it, vi } from "vitest";

import {
  assessAuthoritativeMathReadiness,
  createMathProductionTaskImplementations,
  MATH_EXECUTABLE_TASK_IDS,
  type MathCanonicalAdapterOptions,
} from "./orchestration/canonical-task-adapters.js";
import { createReviewedCurriculumFixture } from "./testing/reviewed-curriculum-fixture.js";
import { canonicalHash } from "./verification/canonical-json.js";
import type { VerifierRequest } from "./verification/protocol-schemas.js";
import {
  MATH_TASK_IDS,
  createMathTaskRegistry,
  createMathTaskRegistrations,
  mathWorkflowDefinition,
} from "./task-registry.js";

async function canonicalFixture(
  args: {
    readonly authorizeProvider?: boolean;
    readonly interruptVerification?: boolean;
  } = {}
) {
  const workspaceRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "math-canonical-adapters-")
  );
  const curriculum = await createReviewedCurriculumFixture(
    path.join(workspaceRoot, "state", "reviewed-curriculum")
  );
  const unitId = "m5-zo-001-standard";
  const unitRoot = path.join(workspaceRoot, unitId);
  const identity = {
    instanceId: "workflow-mathcanonicalfixture000001",
    unitId,
    locale: "de",
    variant: "full",
  } as const;
  const store = new WorkflowStore({
    unitRoot,
    workflow: mathWorkflowDefinition,
    identity,
  });
  const repository = new ArtifactRepository({ workspaceRoot });
  let interrupted = false;
  const verifier = vi.fn(async (request: VerifierRequest) => {
    if (args.interruptVerification && !interrupted) {
      interrupted = true;
      throw new WorkflowInterruptedError("Verifier fixture interrupted.");
    }
    return {
      protocolVersion: "math-verifier.v3" as const,
      requestId: request.requestId,
      inputHash: request.inputHash,
      verifierVersion: "3.0.0" as const,
      sympyVersion: "1.14.0" as const,
      status: "passed" as const,
      checks: request.checks.map((check) => ({
        checkId: check.checkId,
        status: "passed" as const,
      })),
    };
  });
  const options: MathCanonicalAdapterOptions = {
    repositoryRoot: path.resolve("."),
    workspaceRoot,
    unitRoot,
    unitId,
    curriculum,
    profile: null,
    visualStyle: null,
    locale: "de",
    lessonVariant: "standard",
    contentVariant: "full",
    skillId: "M5-ZO-001",
    simulation: true,
    releaseVisibility: "public",
    providerAuthorization: {
      configured: true,
      operatorAuthorized: args.authorizeProvider ?? true,
      mode: "fixture-mock",
      configurationFingerprint: canonicalHash({ mode: "fixture-mock" }),
    },
    store,
    repository,
    verifier,
    rendererVersions: { visualPlan: "math-visual-plan.v1" },
  };
  const readiness = assessAuthoritativeMathReadiness(options);
  const registry = createTaskRegistry(
    createMathTaskRegistrations(
      createMathProductionTaskImplementations(options),
      readiness
    )
  );
  let id = 0;
  const operator = new WorkflowOperator({
    unitRoot,
    workflow: mathWorkflowDefinition,
    registry,
    identity,
    store,
    idFactory: () => `mathfixture${++id}`,
    fingerprintMaterial: Object.fromEntries(
      MATH_TASK_IDS.map((taskId) => [
        taskId,
        {
          curriculumRevision: curriculum.release.curriculumVersion,
          provider: options.providerAuthorization,
        },
      ])
    ),
    verifyArtifact: async (manifest) => {
      try {
        const verified = await repository.verify(manifest.ref, {
          dependencyFingerprints: manifest.dependencyFingerprints,
        });
        return (
          verified.manifest.id === manifest.id &&
          verified.manifest.checksumSha256 === manifest.checksumSha256
        );
      } catch {
        return false;
      }
    },
  });
  return { operator, registry, workspaceRoot, unitRoot, options, verifier };
}

describe("mathematics task registry", () => {
  it("validates the complete profile DAG with one owner per logical task", () => {
    const registry = createMathTaskRegistry();
    expect(registry.validateWorkflow(mathWorkflowDefinition)).toEqual(
      mathWorkflowDefinition
    );
    expect(registry.list("mathematics-education")).toHaveLength(
      MATH_TASK_IDS.length
    );
    expect(new Set(MATH_TASK_IDS).size).toBe(MATH_TASK_IDS.length);
    expect(
      registry
        .list("mathematics-education")
        .every((task) => task.implementationOwner.startsWith("@mediaforge/"))
    ).toBe(true);
    expect(registry.explain("math.publish")).toMatchObject({
      implementationOwner: "@mediaforge/youtube-upload",
      requiredDependencies: ["math.publish-approval"],
    });
  });

  it("binds every executable task through publish dry-run and traverses only canonical operator state", async () => {
    const { operator, registry, unitRoot } = await canonicalFixture();
    const graph = operator.graph();
    expect(
      graph.nodes
        .filter((node) =>
          MATH_EXECUTABLE_TASK_IDS.includes(node.taskId as never)
        )
        .every((node) => node.implementationBound)
    ).toBe(true);
    expect(registry.explain("math.visual-assets").implementationOwner).toBe(
      "@mediaforge/math-rendering"
    );
    expect(registry.explain("math.render").implementationOwner).toBe(
      "@mediaforge/educational-renderer"
    );
    expect(registry.explain("math.publish").implementationBound).toBe(false);

    const before = await fs.readdir(path.dirname(unitRoot));
    expect(await operator.runNext({ dryRun: true })).toHaveLength(1);
    expect(await fs.readdir(path.dirname(unitRoot))).toEqual(before);

    const results = await operator.runNext({ continue: true });
    expect(results.map((result) => result.taskId)).toEqual(
      MATH_EXECUTABLE_TASK_IDS
    );
    expect((await operator.status()).tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          taskId: "math.publish-dry-run",
          persistedStatus: "succeeded",
        }),
        expect.objectContaining({
          taskId: "math.publish-approval",
          readiness: "blocked",
        }),
      ])
    );
    expect(
      await fs.stat(path.join(unitRoot, "state", "workflow", "math.production"))
    ).toBeDefined();
    await expect(
      fs.stat(path.join(unitRoot, "manifest.json"))
    ).rejects.toMatchObject({
      code: "ENOENT",
    });

    const duplicate = await operator.runTask("math.curriculum-import");
    expect(duplicate.cacheHit).toBe(true);
    expect(
      await operator.store.listAttempts("math.curriculum-import")
    ).toHaveLength(1);
  }, 20_000);

  it("fails closed for provider authorization and resumes an interrupted canonical attempt", async () => {
    const unauthorized = await canonicalFixture({ authorizeProvider: false });
    const readiness = unauthorized.registry.readiness("math.tts", {
      profileId: "mathematics-education",
      completedTaskIds: new Set(MATH_TASK_IDS),
      availableArtifacts: MATH_TASK_IDS.flatMap(
        (taskId) => unauthorized.registry.get(taskId).definition.outputs
      ),
      approvedTaskIds: new Set(),
    });
    expect(readiness.reasons).toContain(
      "An explicit operator action is required for the provider-dependent speech task."
    );

    const interrupted = await canonicalFixture({ interruptVerification: true });
    await expect(
      interrupted.operator.runNext({ continue: true })
    ).rejects.toBeInstanceOf(WorkflowInterruptedError);
    expect(
      (await interrupted.operator.status()).tasks.find(
        (task) => task.taskId === "math.math-verification"
      )?.persistedStatus
    ).toBe("interrupted");
    expect((await interrupted.operator.resume()).taskId).toBe(
      "math.math-verification"
    );
    expect(await interrupted.operator.runNext({ continue: true })).toHaveLength(
      MATH_EXECUTABLE_TASK_IDS.length - 5
    );
  }, 20_000);

  it("invalidates stale dependency evidence and rejects a forged artifact hash", async () => {
    const { operator } = await canonicalFixture();
    await operator.runNext({ continue: true });
    const attempt = (await operator.store.listAttempts("math.lesson-spec"))[0];
    expect(attempt?.status).toBe("completed");
    if (
      attempt?.status !== "completed" ||
      attempt.result.status !== "succeeded"
    ) {
      throw new Error("Expected a successful lesson-spec attempt.");
    }
    const output = attempt.result.outputs[0]!;
    await fs.appendFile(
      path.join(operator.unitRoot, output.relativePath),
      "forged",
      "utf8"
    );
    const cache = (await operator.inspectCache("math.lesson-spec"))[0]!;
    expect(cache.status).toBe("miss");
    expect(cache.reason).toBe("output-manifest-invalid");
    expect((await operator.status()).nextTaskId).toBe("math.lesson-spec");
  }, 20_000);
});
