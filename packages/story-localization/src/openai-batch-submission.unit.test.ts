import { describe, expect, it, vi } from "vitest";
import { createOpenAiBatchSubmissionIdentity } from "@mediaforge/shared";
import {
  createOpenAiBatchSubmissionIntent,
  openAiBatchSubmissionMetadata,
  reconcileOpenAiBatchSubmission,
} from "./openai-batch-submission.js";

const identity = createOpenAiBatchSubmissionIdentity({
  endpoint: "/v1/responses",
  completionWindow: "24h",
  jsonl: `${JSON.stringify({
    custom_id: "item-1",
    method: "POST",
    url: "/v1/responses",
    body: { model: "gpt-5.6-terra", input: "private story" },
  })}\n`,
  submissionPolicyVersion: "story-batch-submission.v1",
  purpose: "initial",
});

const intent = {
  ...createOpenAiBatchSubmissionIntent({
    ...identity,
    endpoint: "/v1/responses",
    submissionPolicyVersion: "story-batch-submission.v1",
    purpose: "initial",
    now: "2026-08-11T10:00:00.000Z",
  }),
  state: "reconciliation_required" as const,
  inputFileId: "file-1",
  createAttemptedAt: "2026-08-11T10:01:00.000Z",
};

function remote(id: string) {
  return {
    id,
    status: "in_progress" as const,
    endpoint: "/v1/responses",
    input_file_id: "file-1",
    completion_window: "24h",
    created_at: 1,
    object: "batch" as const,
    metadata: openAiBatchSubmissionMetadata(identity.batchSubmissionKey),
  };
}

function clientWithList(
  list: () => Promise<{ readonly data: readonly ReturnType<typeof remote>[]; readonly has_more: boolean }>
) {
  return {
    responses: { create: vi.fn(), parse: vi.fn() },
    batches: {
      create: vi.fn(),
      retrieve: vi.fn(),
      cancel: vi.fn(),
      list: vi.fn(list),
    },
  };
}

describe("OpenAI Batch submission reconciliation", () => {
  it("adopts exactly one metadata match and never exposes request content", async () => {
    const client = clientWithList(async () => ({
      data: [remote("batch-1")],
      has_more: false,
    }));
    await expect(
      reconcileOpenAiBatchSubmission({ client: client as never, intent })
    ).resolves.toMatchObject({ kind: "exact", batch: { id: "batch-1" } });
    expect(JSON.stringify(remote("batch-1").metadata)).not.toContain("private story");
    expect(client.batches.create).not.toHaveBeenCalled();
  });

  it("reports zero and duplicate matches without choosing or creating", async () => {
    const none = clientWithList(async () => ({ data: [], has_more: false }));
    await expect(
      reconcileOpenAiBatchSubmission({ client: none as never, intent })
    ).resolves.toEqual({ kind: "none" });

    const duplicate = clientWithList(async () => ({
      data: [remote("batch-2"), remote("batch-1")],
      has_more: false,
    }));
    await expect(
      reconcileOpenAiBatchSubmission({ client: duplicate as never, intent })
    ).resolves.toEqual({
      kind: "ambiguous",
      batchIds: ["batch-1", "batch-2"],
    });
    expect(duplicate.batches.create).not.toHaveBeenCalled();
  });

  it("propagates list failures and bounds incomplete pagination", async () => {
    const failed = clientWithList(async () => {
      throw new Error("provider list unavailable");
    });
    await expect(
      reconcileOpenAiBatchSubmission({ client: failed as never, intent })
    ).rejects.toThrow("provider list unavailable");

    const incomplete = clientWithList(async () => ({
      data: [
        {
          ...remote("unrelated"),
          metadata: { mediaforge_submission_key: "0".repeat(64) },
        },
      ],
      has_more: true,
    }));
    await expect(
      reconcileOpenAiBatchSubmission({
        client: incomplete as never,
        intent,
        maxPages: 2,
      })
    ).resolves.toEqual({ kind: "incomplete", scannedPages: 2 });
  });
});
