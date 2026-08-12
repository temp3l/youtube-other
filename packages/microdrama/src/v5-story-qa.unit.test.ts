import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  compileV5CanonAdmission,
  compileV5EpisodeProduction,
  grantStoryApprovedEvidence,
  validateStoryApprovedEvidence,
  validateV5StoryDeterministicQa,
  validateV5StoryEpisodeDeterministicQa,
} from "./index.js";
import type { SemanticStoryQaAdapter } from "./v5-story-qa-contracts.js";

const V5_PACK_ROOT = path.resolve(
  import.meta.dirname,
  "../../../content-packs/seven-minutes-ahead-content-pack-v5-remediated"
);
const ADMITTED_AT = "2026-08-12T04:00:00.000Z";

function loadAdmissionAndProduction() {
  const admission = compileV5CanonAdmission(V5_PACK_ROOT, ADMITTED_AT);
  if (!admission.ok) {
    throw new Error(admission.issues.map((issue) => issue.message).join("\n"));
  }
  const production = compileV5EpisodeProduction(admission.bundle, ADMITTED_AT);
  if (!production.ok) {
    throw new Error(production.issues.map((issue) => issue.message).join("\n"));
  }
  return { admission: admission.bundle, production: production.bundle };
}

describe("V5 story continuity and locale parity QA", () => {
  it("passes deterministic QA for the full imported V5 corpus", () => {
    const { admission, production } = loadAdmissionAndProduction();
    const result = validateV5StoryDeterministicQa({
      canonBundle: admission,
      productionBundle: production,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.issues.map((issue) => issue.message).join("\n"));
    }
    expect(result.craftEvidence).toHaveLength(400);
    expect(
      result.craftEvidence.every(
        (entry) =>
          Number.isFinite(entry.editorialScore) && !("viralScore" in entry)
      )
    ).toBe(true);
  });

  it("passes boundary and parity checks for E024 and E038 across locales", () => {
    const { admission, production } = loadAdmissionAndProduction();
    for (const episodeId of ["E024", "E038"] as const) {
      const result = validateV5StoryEpisodeDeterministicQa(
        { canonBundle: admission, productionBundle: production },
        episodeId
      );
      expect(result.ok).toBe(true);
      if (!result.ok) {
        throw new Error(`${episodeId}: ${result.issues.map((i) => i.message).join("\n")}`);
      }
      const locales = new Set(
        admission.admittedScripts
          .filter((script) => script.episodeId === episodeId)
          .map((script) => script.locale)
      );
      expect(locales).toEqual(new Set(["en-US", "de-DE", "es-ES", "pt-BR"]));
    }
  });

  it("preserves season finale obligations for E088 through E100", () => {
    const { admission, production } = loadAdmissionAndProduction();
    for (let episodeNumber = 88; episodeNumber <= 100; episodeNumber += 1) {
      const episodeId = `E${String(episodeNumber).padStart(3, "0")}`;
      const result = validateV5StoryEpisodeDeterministicQa(
        { canonBundle: admission, productionBundle: production },
        episodeId
      );
      expect(result.ok).toBe(true);
    }

    const e100 = admission.episodeBoundaries.find((boundary) => boundary.episodeId === "E100");
    expect(e100?.openLoop.toLowerCase()).toContain("seven");
    expect(e100?.nextOpeningObligation).toBeUndefined();
    expect(
      production.records.find((record) => record.episodeId === "E100")?.beatPlan.beats.at(-1)
        ?.boundaryObligation
    ).toBe("cliffhanger");
  });

  it("grants STORY_APPROVED only for exact revisions and blocks force bypass", async () => {
    const { admission, production } = loadAdmissionAndProduction();
    const deterministic = validateV5StoryDeterministicQa({
      canonBundle: admission,
      productionBundle: production,
    });
    const record = production.records.find((entry) => entry.episodeId === "E001");
    const script = admission.admittedScripts.find(
      (entry) => entry.episodeId === "E001" && entry.locale === "en-US"
    );
    expect(record && script).toBeTruthy();

    const approved = await grantStoryApprovedEvidence(
      {
        canonBundle: admission,
        productionRecord: record!,
        locale: "en-US",
        scriptRevisionId: script!.scriptRevisionId,
        approvedAt: ADMITTED_AT,
      },
      { deterministicQa: deterministic }
    );
    expect(approved.ok).toBe(true);
    if (!approved.ok) {
      throw new Error("expected approval");
    }
    validateStoryApprovedEvidence(approved.evidence);

    const forced = await grantStoryApprovedEvidence(
      {
        canonBundle: admission,
        productionRecord: record!,
        locale: "en-US",
        scriptRevisionId: script!.scriptRevisionId,
        approvedAt: ADMITTED_AT,
        forceBypass: true,
      },
      { deterministicQa: deterministic }
    );
    expect(forced.ok).toBe(false);
    if (forced.ok) {
      throw new Error("expected force bypass rejection");
    }
    expect(forced.issues.some((issue) => issue.code === "approval_force_bypass_forbidden")).toBe(
      true
    );
  });

  it("does not treat intentional narrative deception as a deterministic defect", async () => {
    const { admission, production } = loadAdmissionAndProduction();
    const deterministic = validateV5StoryEpisodeDeterministicQa(
      { canonBundle: admission, productionBundle: production },
      "E032"
    );
    expect(deterministic.ok).toBe(true);

    const deceptiveSemanticAdapter: SemanticStoryQaAdapter = () => ({
      status: "ADVISORY",
      message: "Ambiguous Subject 17 labeling is intentional deception, not a canon defect.",
      episodeId: "E032",
      locale: "en-US",
    });

    const record = production.records.find((entry) => entry.episodeId === "E032");
    const script = admission.admittedScripts.find(
      (entry) => entry.episodeId === "E032" && entry.locale === "en-US"
    );
    const approved = await grantStoryApprovedEvidence(
      {
        canonBundle: admission,
        productionRecord: record!,
        locale: "en-US",
        scriptRevisionId: script!.scriptRevisionId,
        approvedAt: ADMITTED_AT,
      },
      {
        deterministicQa: deterministic,
        semanticAdapter: deceptiveSemanticAdapter,
      }
    );
    expect(approved.ok).toBe(true);
  });
});
