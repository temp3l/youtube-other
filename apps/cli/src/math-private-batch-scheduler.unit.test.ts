import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  MathPrivateBatchScheduler,
  type MathBatchWorkflowOperator,
  type MathBatchWorkflowStatus,
} from "./math-private-batch-scheduler.js";

const tasks = ["math.tts", "math.render", "math.quality-gate", "math.publish-dry-run"];

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

class FakeOperator implements MathBatchWorkflowOperator {
  active = 0;
  maximumActive = 0;
  index: number;
  exceptional: "interrupted" | "failed" | undefined;
  readonly calls: string[] = [];

  constructor(
    readonly unitId: string,
    readonly execute: (taskId: string, unitId: string) => Promise<void>,
    initial:
      | "preparing"
      | "rendering-interrupted"
      | "finalizing"
      | "succeeded" = "preparing"
  ) {
    this.index =
      initial === "preparing"
        ? 0
        : initial === "rendering-interrupted"
          ? 1
          : initial === "finalizing"
            ? 2
            : tasks.length;
    this.exceptional =
      initial === "rendering-interrupted" ? "interrupted" : undefined;
  }

  async reconcile(): Promise<void> {
    this.calls.push("reconcile");
  }

  async status(): Promise<MathBatchWorkflowStatus> {
    return {
      complete: this.index === tasks.length,
      nextTaskId: this.exceptional ? null : (tasks[this.index] ?? null),
      tasks: tasks.map((taskId, index) => ({
        taskId,
        persistedStatus:
          index < this.index
            ? "succeeded"
            : index === this.index && this.exceptional
              ? this.exceptional
              : "pending",
      })),
    };
  }

  async runTask(taskId: string): Promise<void> {
    expect(taskId).toBe(tasks[this.index]);
    await this.run(taskId);
  }

  async resume(): Promise<void> {
    expect(this.exceptional).toBe("interrupted");
    this.exceptional = undefined;
    await this.run(tasks[this.index]!);
  }

  async retryFailed(): Promise<void> {
    expect(this.exceptional).toBe("failed");
    this.exceptional = undefined;
    await this.run(tasks[this.index]!);
  }

  private async run(taskId: string): Promise<void> {
    this.active += 1;
    this.maximumActive = Math.max(this.maximumActive, this.active);
    this.calls.push(taskId);
    try {
      await this.execute(taskId, this.unitId);
      this.index += 1;
    } finally {
      this.active -= 1;
    }
  }
}

async function fixture(input: {
  readonly units?: readonly string[];
  readonly maxRenderReadyLessons?: number;
  readonly initial?: Readonly<Record<string, ConstructorParameters<typeof FakeOperator>[2]>>;
  readonly execute?: (taskId: string, unitId: string) => Promise<void>;
  readonly beforePaidSpeech?: (unitId: string) => Promise<void>;
  readonly afterPaidSpeech?: (unitId: string) => Promise<void>;
  readonly signal?: AbortSignal;
}) {
  const units = input.units ?? ["lesson-a", "lesson-b"];
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "math-staged-batch-"));
  let milliseconds = Date.parse("2026-07-26T00:00:00.000Z");
  const operators = new Map<string, FakeOperator>();
  const scheduler = new MathPrivateBatchScheduler({
    batchId: "batch-test",
    stateRoot: root,
    maxRenderReadyLessons: input.maxRenderReadyLessons ?? 2,
    paidSpeechStartsPerSecond: 0.05,
    now: () => new Date(milliseconds),
    sleep: async (duration) => {
      milliseconds += duration;
    },
    ...(input.signal ? { signal: input.signal } : {}),
    ...(input.beforePaidSpeech
      ? { beforePaidSpeech: input.beforePaidSpeech }
      : {}),
    ...(input.afterPaidSpeech ? { afterPaidSpeech: input.afterPaidSpeech } : {}),
    classifyError: (error) => ({
      retryable:
        error instanceof Error && "retryable" in error
          ? (error as Error & { retryable: boolean }).retryable
          : false,
    }),
    items: units.map((unitId, index) => ({
      batchItemId: `item-${index}`,
      unitId,
      requestFingerprint: `${unitId}-fingerprint`,
      sharedImageId: "sha256:aaaaaaaa",
      createOperator: async () => {
        const operator = new FakeOperator(
          unitId,
          input.execute ?? (async () => undefined),
          input.initial?.[unitId]
        );
        operators.set(unitId, operator);
        return operator;
      },
    })),
  });
  return { scheduler, operators };
}

describe("canonical private math staged batch scheduler", () => {
  it("keeps paid speech and per-unit work serial while preparation overlaps shared local/remote render lanes", async () => {
    const firstRender = deferred();
    const firstRenderStarted = deferred();
    const secondSpeechFinished = deferred();
    const events: string[] = [];
    let activeSpeech = 0;
    let peakSpeech = 0;
    let activeLocal = 0;
    let activeRemote = 0;
    let peakLocal = 0;
    let peakRemote = 0;
    const { scheduler, operators } = await fixture({
      execute: async (taskId, unitId) => {
        events.push(`${unitId}:${taskId}:start`);
        if (taskId === "math.tts") {
          activeSpeech += 1;
          peakSpeech = Math.max(peakSpeech, activeSpeech);
          await Promise.resolve();
          activeSpeech -= 1;
          if (unitId === "lesson-b") secondSpeechFinished.resolve();
        }
        if (taskId === "math.render") {
          if (unitId === "lesson-a") firstRenderStarted.resolve();
          activeLocal += 1;
          activeRemote += 1;
          peakLocal = Math.max(peakLocal, activeLocal);
          peakRemote = Math.max(peakRemote, activeRemote);
          if (unitId === "lesson-a") await firstRender.promise;
          activeLocal -= 1;
          activeRemote -= 1;
        }
        events.push(`${unitId}:${taskId}:end`);
      },
    });

    const lessonA = scheduler.runUnit("lesson-a", false);
    await firstRenderStarted.promise;
    const lessonB = scheduler.runUnit("lesson-b", false);
    await secondSpeechFinished.promise;

    expect(events).toContain("lesson-b:math.tts:end");
    expect(events).not.toContain("lesson-a:math.render:end");
    expect(peakSpeech).toBe(1);
    expect(peakLocal).toBeLessThanOrEqual(2);
    expect(peakRemote).toBeLessThanOrEqual(2);
    firstRender.resolve();
    await Promise.all([lessonA, lessonB]);
    expect([...operators.values()].map((operator) => operator.maximumActive)).toEqual([
      1,
      1,
    ]);
  });

  it("resumes every canonical phase without duplicating paid speech or reconciled render work", async () => {
    const cases = [
      ["preparing", "preparing"],
      ["rendering", "rendering-interrupted"],
      ["finalizing", "finalizing"],
      ["terminal", "succeeded"],
    ] as const;
    for (const [label, initial] of cases) {
      const calls: string[] = [];
      const { scheduler } = await fixture({
        units: [`lesson-${label}`],
        initial: { [`lesson-${label}`]: initial },
        execute: async (taskId) => {
          calls.push(taskId);
        },
      });
      await scheduler.runUnit(`lesson-${label}`, true);
      expect(calls.filter((task) => task === "math.tts")).toHaveLength(
        initial === "preparing" ? 1 : 0
      );
      expect(calls.filter((task) => task === "math.render")).toHaveLength(
        initial === "preparing" || initial === "rendering-interrupted" ? 1 : 0
      );
    }
  });

  it("keeps aggregate cost callbacks serial when render completions resolve out of order", async () => {
    const first = deferred();
    const bothSpeechChecksFinished = deferred();
    const costEvents: string[] = [];
    const { scheduler } = await fixture({
      beforePaidSpeech: async (unitId) => {
        costEvents.push(`before:${unitId}`);
      },
      afterPaidSpeech: async (unitId) => {
        costEvents.push(`after:${unitId}`);
        if (unitId === "lesson-b") bothSpeechChecksFinished.resolve();
      },
      execute: async (taskId, unitId) => {
        if (taskId === "math.render" && unitId === "lesson-a") {
          await first.promise;
        }
      },
    });
    const one = scheduler.runUnit("lesson-a", false);
    const two = scheduler.runUnit("lesson-b", false);
    await bothSpeechChecksFinished.promise;
    expect(costEvents).toEqual([
      "before:lesson-a",
      "after:lesson-a",
      "before:lesson-b",
      "after:lesson-b",
    ]);
    first.resolve();
    await Promise.all([one, two]);
  });

  it("preserves completed fragments and lessons across partial failure and cancellation", async () => {
    const controller = new AbortController();
    const failure = Object.assign(new Error("permanent scene failure"), {
      retryable: false,
    });
    const { scheduler } = await fixture({
      signal: controller.signal,
      execute: async (taskId, unitId) => {
        if (taskId === "math.render" && unitId === "lesson-b") throw failure;
      },
    });
    await expect(
      Promise.allSettled([
        scheduler.runUnit("lesson-a", false),
        scheduler.runUnit("lesson-b", false),
      ])
    ).resolves.toEqual([
      expect.objectContaining({ status: "fulfilled" }),
      expect.objectContaining({ status: "rejected" }),
    ]);
    const partial = await scheduler.queue.read();
    expect(partial.items.map(({ phase }) => phase)).toEqual([
      "succeeded",
      "failed",
    ]);
    expect(partial.items[0]?.scenes.every((scene) => scene.status === "succeeded")).toBe(
      true
    );

    controller.abort(new Error("stop"));
    const cancelledRoot = await fixture({
      units: ["lesson-c"],
      signal: controller.signal,
    });
    await expect(
      cancelledRoot.scheduler.runUnit("lesson-c", false)
    ).rejects.toThrow("stop");
    expect((await cancelledRoot.scheduler.queue.read()).items[0]?.phase).toBe(
      "cancelled"
    );
  });

  it("keeps configured job concurrency one compatible with serial batches", async () => {
    let activeRender = 0;
    let peakRender = 0;
    const { scheduler } = await fixture({
      maxRenderReadyLessons: 1,
      execute: async (taskId) => {
        if (taskId !== "math.render") return;
        activeRender += 1;
        peakRender = Math.max(peakRender, activeRender);
        await Promise.resolve();
        activeRender -= 1;
      },
    });
    await Promise.all([
      scheduler.runUnit("lesson-a", false),
      scheduler.runUnit("lesson-b", false),
    ]);
    expect(peakRender).toBe(1);
  });
});
