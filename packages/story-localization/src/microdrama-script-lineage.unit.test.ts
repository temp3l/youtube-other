import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  compileV5CanonAdmission,
  compileV5EpisodeProduction,
} from "@mediaforge/microdrama";

import {
  assertProseIsNotCanonical,
  lineageUsesRevisionIdsOnly,
  resolveMicrodramaScriptLineage,
} from "./microdrama-script-lineage.js";

const V5_PACK_ROOT = path.resolve(
  import.meta.dirname,
  "../../../content-packs/seven-minutes-ahead-content-pack-v5-remediated"
);
const ADMITTED_AT = "2026-08-12T03:45:00.000Z";

describe("microdrama script lineage adapter", () => {
  it("consumes revision IDs for E001 without making prose canonical", () => {
    const admission = compileV5CanonAdmission(V5_PACK_ROOT, ADMITTED_AT);
    if (!admission.ok) {
      throw new Error("expected successful admission");
    }
    const production = compileV5EpisodeProduction(admission.bundle, ADMITTED_AT);
    if (!production.ok) {
      throw new Error("expected successful production compile");
    }

    const record = production.bundle.records.find((item) => item.episodeId === "E001");
    const script = admission.bundle.admittedScripts.find(
      (item) => item.episodeId === "E001" && item.locale === "de-DE"
    );
    expect(record && script).toBeTruthy();

    const lineage = resolveMicrodramaScriptLineage({
      episodeId: record!.episodeId,
      locale: "de-DE",
      episodeSpecRevisionId: record!.episodeSpecRevisionId,
      beatPlanRevisionId: record!.beatPlanRevisionId,
      scriptRevisionId: script!.scriptRevisionId,
      boundaryRevisionId: record!.boundaryRevisionId,
      episodeSpec: record!.episodeSpec,
      beatPlan: record!.beatPlan,
    });

    expect(lineage.proseAuthority).toBe("script_revision");
    expect(lineage.scriptRevisionId).toBe("rev.script.de-de.e001");
    expect(lineage.episodeSpecRevisionId).toBe("rev.episode-spec.e001");
    expect(lineageUsesRevisionIdsOnly(lineage)).toBe(true);
    expect(() => assertProseIsNotCanonical(lineage)).not.toThrow();
    expect(JSON.stringify(lineage)).not.toContain("Maya watches");
  });
});
