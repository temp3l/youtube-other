import path from "node:path";
import { describe, expect, it } from "vitest";

import { compileV5CanonAdmission } from "./v5-canon-admission.js";
import { readAdmittedLocalizedScriptText } from "./audio-tts-readiness.js";
import {
  MICRO_036_AUTHORIZATION_PACK_SCRIPT_FILE_HASHES,
  MICRO_036_AUTHORIZATION_PACK_SCRIPT_REVISIONS,
  MICRO_036_BATCH_EPISODE_BILLABLE_CHARACTERS,
  MICRO_036_BATCH_EPISODE_IDS,
  MICRO_036_BATCH_LOCALES,
  MICRO_036_BATCH_TOTAL_BILLABLE_CHARACTERS,
  resolveMicro036BatchEpisodeCostMinorAllocations,
} from "./micro-036-batch-bindings.js";

const ADMITTED_AT = "2026-08-12T04:00:00.000Z";
const packRoot = path.resolve(
  import.meta.dirname,
  "../../../content-packs/seven-minutes-ahead-content-pack-v5-remediated"
);

describe("MICRO-036 batch bindings", () => {
  it("anchors pack script revisions, hashes and cost allocations", () => {
    const admission = compileV5CanonAdmission(packRoot, ADMITTED_AT);
    expect(admission.ok).toBe(true);

    let totalBillable = 0;
    for (const locale of MICRO_036_BATCH_LOCALES) {
      for (const episodeId of MICRO_036_BATCH_EPISODE_IDS) {
        const script = admission.bundle!.admittedScripts.find(
          (entry) => entry.episodeId === episodeId && entry.locale === locale
        );
        expect(script?.scriptRevisionId).toBe(
          MICRO_036_AUTHORIZATION_PACK_SCRIPT_REVISIONS[locale][episodeId]
        );
        expect(script?.contentHash).toBe(
          MICRO_036_AUTHORIZATION_PACK_SCRIPT_FILE_HASHES[locale][episodeId]
        );
        const text = readAdmittedLocalizedScriptText({ packRoot, script: script! });
        const billable = [...text].length;
        expect(MICRO_036_BATCH_EPISODE_BILLABLE_CHARACTERS[locale][episodeId]).toBe(
          billable
        );
        totalBillable += billable;
      }
    }

    expect(MICRO_036_BATCH_TOTAL_BILLABLE_CHARACTERS).toBe(totalBillable);

    const allocations = resolveMicro036BatchEpisodeCostMinorAllocations();
    expect(
      Object.values(allocations).reduce((sum, value) => sum + value, 0)
    ).toBe(9_999);
  });
});
