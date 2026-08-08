import { describe, expect, it } from "vitest";
import {
  DEFAULT_HISTORY_APPROVAL_PACK_CONCURRENCY,
  resolveHistoryApprovalPackConcurrency,
  runWithHistoryApprovalPackConcurrency,
} from "./history-approval-pack-concurrency.js";

describe("history approval-pack concurrency", () => {
  it("defaults to all available CPU cores", () => {
    expect(DEFAULT_HISTORY_APPROVAL_PACK_CONCURRENCY).toBeGreaterThan(0);
    expect(resolveHistoryApprovalPackConcurrency(undefined)).toBe(
      DEFAULT_HISTORY_APPROVAL_PACK_CONCURRENCY
    );
  });

  it("rejects invalid concurrency values", () => {
    expect(() => resolveHistoryApprovalPackConcurrency(0)).toThrow(
      /positive integer/u
    );
  });

  it("preserves result order under parallel execution", async () => {
    const results = await runWithHistoryApprovalPackConcurrency(
      [1, 2, 3, 4, 5],
      3,
      async (value) => {
        await new Promise((resolve) => setTimeout(resolve, 5 - value));
        return value * 10;
      }
    );
    expect(results).toEqual([10, 20, 30, 40, 50]);
  });
});
