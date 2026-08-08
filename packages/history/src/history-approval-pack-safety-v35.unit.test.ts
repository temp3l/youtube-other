import { describe, expect, it } from "vitest";
import { containsUnsafeApprovalPackTextV35 } from "./history-approval-pack-safety-v35.js";

describe("history approval-pack safety v35", () => {
  it("allows historical narration that uses authorization in ordinary English", () => {
    expect(
      containsUnsafeApprovalPackTextV35(
        "Cortés arrived from Cuba without authorization for an independent conquest."
      )
    ).toBe(false);
  });

  it("still blocks credential-like and absolute home path leaks", () => {
    expect(containsUnsafeApprovalPackTextV35("export API_KEY=abc")).toBe(true);
    expect(containsUnsafeApprovalPackTextV35("/home/box/workspace/fehmarn")).toBe(
      true
    );
  });
});
