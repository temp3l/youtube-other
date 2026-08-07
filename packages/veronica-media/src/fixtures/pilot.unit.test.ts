import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createFixturePng } from "./pilot.js";

function checksum(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

describe("createFixturePng", () => {
  it("embeds distinct labels so supplemental source changes invalidate fingerprints", () => {
    const pilotChart = createFixturePng("pilot-chart");
    const changedSource = createFixturePng("changed-source");
    expect(checksum(pilotChart)).not.toBe(checksum(changedSource));
  });
});
