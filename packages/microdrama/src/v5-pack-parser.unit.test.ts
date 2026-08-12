import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  SEVEN_MINUTES_AHEAD_SERIES_ID,
  V5_REMEDIATED_PACK_VERSION,
  validateAndImportV5Pack,
} from "./index.js";

const V5_PACK_ROOT = path.resolve(
  import.meta.dirname,
  "../../../content-packs/seven-minutes-ahead-content-pack-v5-remediated"
);

describe("V5 pack parser", () => {
  it("validates the checked-in V5 remediated corpus", () => {
    const result = validateAndImportV5Pack(V5_PACK_ROOT, "2026-08-12T03:10:00.000Z");
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.issues.map((issue) => issue.message).join("\n"));
    }

    expect(result.result.fileCount).toBe(434);
    expect(result.result.hashCoverageCount).toBe(433);
    expect(result.result.episodeImports.length).toBe(100);
    expect(result.result.localizedScriptImports.length).toBe(400);
    expect(result.result.seriesImport.seriesId).toBe(SEVEN_MINUTES_AHEAD_SERIES_ID);
    expect(result.result.seriesImport.packVersion).toBe(V5_REMEDIATED_PACK_VERSION);
    expect(result.result.seriesImport.locales).toEqual([
      "en-US",
      "de-DE",
      "es-ES",
      "pt-BR",
    ]);
    expect(
      new Set(result.result.localizedScriptImports.map((item) => item.episodeId)).size
    ).toBe(100);
  });

  it("rejects unsafe traversal paths", () => {
    const result = validateAndImportV5Pack("/tmp/../../../etc");
    expect(result.ok).toBe(false);
  });

  it("rejects tampered hash fixtures", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "microdrama-v5-tamper-"));
    fs.cpSync(V5_PACK_ROOT, tempRoot, { recursive: true });
    const tamperedScript = path.join(
      tempRoot,
      "languages/en/episodes/e001-seven-minutes.md"
    );
    fs.appendFileSync(tamperedScript, "\nTAMPER", "utf8");

    const result = validateAndImportV5Pack(tempRoot);
    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected tampered pack to fail");
    }
    expect(result.issues.some((issue) => issue.code === "hash_mismatch")).toBe(true);
  });
});
