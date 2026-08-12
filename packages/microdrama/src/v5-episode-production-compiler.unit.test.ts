import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  BEAT_CATEGORIES,
  parseBeatPlanPayload,
  parseEpisodeSpecPayload,
} from "@mediaforge/narrative-core";

import {
  compileEpisodeProductionFromBoundary,
  compileV5CanonAdmission,
  compileV5EpisodeProduction,
  FORBIDDEN_OPEN_LOOP_RESOLUTION,
  validateV5EpisodeProductionBundle,
} from "./index.js";
import type { EpisodeBoundaryContract } from "./v5-canon-admission-contracts.js";

const V5_PACK_ROOT = path.resolve(
  import.meta.dirname,
  "../../../content-packs/seven-minutes-ahead-content-pack-v5-remediated"
);
const ADMITTED_AT = "2026-08-12T03:45:00.000Z";

function boundaryFixture(
  overrides: Partial<EpisodeBoundaryContract> = {}
): EpisodeBoundaryContract {
  return {
    schemaVersion: "mediaforge.microdrama-pack.v1",
    episodeId: "E099",
    episodeNumber: 99,
    arcId: "10",
    arcName: "Finale",
    title: "Finale setup",
    newInformation: "Maya faces the final non-predictive choice.",
    openLoop: "Only the +7 YEARS hook may remain unresolved.",
    hook: "Seven minutes remain before the loop closes forever.",
    cliffhangerBeat: "The countdown resets with a +7 YEARS stamp.",
    characters: ["Maya Vale"],
    location: "relay chamber",
    nextOpeningObligation: "Season 2 may begin seven years later.",
    provenance: {
      sourceKind: "import",
      sourcePackVersion: "v5-remediated",
      sourceRelativePath: "languages/en/episodes/e099-example.md",
      sourceArtifactHash: "b".repeat(64),
      importedAt: ADMITTED_AT,
    },
    ...overrides,
  };
}

function enScriptFixture(episodeId: string) {
  return {
    schemaVersion: "mediaforge.microdrama-pack.v1" as const,
    episodeId,
    locale: "en-US" as const,
    sourceLocaleAlias: "en" as const,
    scriptRelativePath: `languages/en/episodes/${episodeId.toLowerCase()}.md`,
    contentHash: "c".repeat(64),
    manifestEntry: {
      episode: String(Number.parseInt(episodeId.slice(1), 10)),
      id: episodeId,
      arc: "1",
      arc_name: "Arc",
      title: "Title",
      hook: "Hook",
      cliffhanger_beat: "Cliff",
      characters: "Maya Vale",
      location: "apartment",
      locale: "en-US" as const,
      wpm: 155,
      word_count: 154,
      estimated_seconds: 59.6,
      timing_gate: "PASS" as const,
      editorial_score: 9.7,
      editorial_gate: "PASS" as const,
      source_authority: "EN-v5",
    },
    provenance: {
      sourceKind: "import" as const,
      sourcePackVersion: "v5-remediated",
      sourceRelativePath: `languages/en/episodes/${episodeId.toLowerCase()}.md`,
      sourceArtifactHash: "c".repeat(64),
      importedAt: ADMITTED_AT,
    },
    importStatus: "IMPORTED_APPROVED_LOCALIZED_SCRIPT" as const,
    scriptRevisionId: `rev.script.en-us.${episodeId.toLowerCase()}`,
  };
}

describe("imported V5 EpisodeSpec and BeatPlan compiler", () => {
  it("compiles typed production contracts for all 100 imported episodes without rolling planning", () => {
    const admission = compileV5CanonAdmission(V5_PACK_ROOT, ADMITTED_AT);
    expect(admission.ok).toBe(true);
    if (!admission.ok) {
      throw new Error(admission.issues.map((issue) => issue.message).join("\n"));
    }

    const production = compileV5EpisodeProduction(admission.bundle, ADMITTED_AT);
    expect(production.ok).toBe(true);
    if (!production.ok) {
      throw new Error(production.issues.map((issue) => issue.message).join("\n"));
    }

    const bundle = validateV5EpisodeProductionBundle(production.bundle);
    expect(bundle.records).toHaveLength(100);
    for (const record of bundle.records) {
      parseEpisodeSpecPayload(record.episodeSpec);
      parseBeatPlanPayload(record.beatPlan);
      expect(record.episodeSpecRevisionId).toBe(
        `rev.episode-spec.${record.episodeId.toLowerCase()}`
      );
      expect(record.beatPlanRevisionId).toBe(
        `rev.beat-plan.${record.episodeId.toLowerCase()}`
      );
    }
  });

  it("preserves E001-E003 boundary obligations, required events, and hook lineage", () => {
    const admission = compileV5CanonAdmission(V5_PACK_ROOT, ADMITTED_AT);
    if (!admission.ok) {
      throw new Error("expected successful admission");
    }
    const production = compileV5EpisodeProduction(admission.bundle, ADMITTED_AT);
    if (!production.ok) {
      throw new Error("expected successful production compile");
    }

    const e001 = production.bundle.records.find((record) => record.episodeId === "E001");
    const e002 = production.bundle.records.find((record) => record.episodeId === "E002");
    const e003 = production.bundle.records.find((record) => record.episodeId === "E003");
    expect(e001 && e002 && e003).toBeTruthy();

    expect(e001!.episodeSpec.requiredEvents).toEqual(
      expect.arrayContaining([
        e001!.episodeSpec.hook.canonicalIntent,
        e001!.episodeSpec.endingState.newInformation,
        e001!.episodeSpec.cliffhanger.canonicalIntent,
      ])
    );
    expect(e001!.episodeSpec.forbiddenEvents).toContain(
      FORBIDDEN_OPEN_LOOP_RESOLUTION
    );
    expect(e001!.beatPlan.boundaryObligations.nextOpeningObligation).toBe(
      e002!.episodeSpec.hook.canonicalIntent
    );
    expect(e002!.beatPlan.boundaryObligations.priorOpeningObligation).toBe(
      e001!.beatPlan.boundaryObligations.nextOpeningObligation
    );
    expect(e002!.beatPlan.beats[0]?.boundaryObligation).toBe("hook");
    expect(e003!.beatPlan.beats.at(-1)?.boundaryObligation).toBe("cliffhanger");
    expect(e003!.beatPlan.beats.map((beat) => beat.category)).toEqual([
      ...BEAT_CATEGORIES,
    ]);
  });

  it("keeps season boundary obligations explicit in boundary fixtures", () => {
    const prior = boundaryFixture({
      episodeId: "E099",
      episodeNumber: 99,
      nextOpeningObligation: "Season 2 may begin seven years later.",
    });
    const finale = boundaryFixture({
      episodeId: "E100",
      episodeNumber: 100,
      nextOpeningObligation: undefined,
    });

    const compiled = compileEpisodeProductionFromBoundary({
      boundary: finale,
      enScript: enScriptFixture("E100"),
      priorBoundary: prior,
    });

    expect(compiled.beatPlan.boundaryObligations.priorOpeningObligation).toBe(
      prior.nextOpeningObligation
    );
    expect(compiled.episodeSpec.requiredEvents).toContain(
      prior.nextOpeningObligation!
    );
    expect(compiled.beatPlan.beats.at(-1)?.event).toBe(finale.cliffhangerBeat);
  });
});
