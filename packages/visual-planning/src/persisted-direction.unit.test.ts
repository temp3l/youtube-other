import { describe, expect, it } from "vitest";
import {
  buildPersistedVisualDirectionFingerprint,
  createInMemoryPersistedVisualDirectionStore,
  resolvePersistedVisualDirection,
} from "./persisted-direction.js";

const direction = {
  contentProfileId: "strategic-reinvention",
  episodeId: "episode-001",
  narrationRevisionId: "revision-001",
  effectiveConfigurationHash: "a".repeat(64),
  dependencyIdentity: { source: "b".repeat(64), policy: "c".repeat(64) },
  timePeriod: { label: "contemporary", year: 2026 },
  geography: ["Milan", "Italy"],
  topics: ["brand strategy"],
  sourceContextIds: ["source-deck"],
  genreVisualPolicy: "editorial-documentary with direct, practical framing",
  scenes: [
    { sceneId: "scene-001", entityIds: ["veronica"], topics: ["brand strategy"] },
    { sceneId: "scene-002", entityIds: ["audience"] },
  ],
  referenceCandidates: [
    { referenceId: "veronica-identity", entityId: "veronica", purpose: "identity" as const, provenanceId: "prov-veronica" },
    { referenceId: "scene-context", sceneIds: ["scene-002"], purpose: "scene" as const, provenanceId: "prov-scene" },
    { referenceId: "topic-context", topics: ["brand strategy"], purpose: "entity" as const, provenanceId: "prov-topic" },
    { referenceId: "unrelated", entityId: "unrelated", purpose: "identity" as const, provenanceId: "prov-unrelated" },
  ],
} as const;

describe("persisted visual direction", () => {
  it("reuses a revision-bound artifact across episode, scene, render, and locale operations", async () => {
    const store = createInMemoryPersistedVisualDirectionStore();
    const first = await resolvePersistedVisualDirection({
      direction: { ...direction, operation: "episode", locale: "it" },
      store,
    });
    const second = await resolvePersistedVisualDirection({
      direction: { ...direction, operation: "scene", locale: "en" },
      store,
    });
    const third = await resolvePersistedVisualDirection({
      direction: { ...direction, operation: "render", locale: "de" },
      store,
    });

    expect(first.reused).toBe(false);
    expect(second).toMatchObject({ reused: true, rationale: "cache-compatible" });
    expect(third.artifact.semanticFingerprint).toBe(first.artifact.semanticFingerprint);
    expect(first.artifact).toMatchObject({
      contentProfileId: "veronicabenini",
      narrationRevisionId: "revision-001",
      effectiveConfigurationHash: "a".repeat(64),
      provenance: { dependencyIdentity: direction.dependencyIdentity },
    });
  });

  it("attaches only deterministic references with entity, scene, topic, or source-context relevance", async () => {
    const result = await resolvePersistedVisualDirection({
      direction,
      store: createInMemoryPersistedVisualDirectionStore(),
    });

    expect(result.artifact.attachedReferences).toEqual([
      expect.objectContaining({ referenceId: "scene-context", matchedBy: "scene" }),
      expect.objectContaining({ referenceId: "topic-context", matchedBy: "topic" }),
      expect.objectContaining({ referenceId: "veronica-identity", matchedBy: "entity" }),
    ]);
    expect(result.artifact.attachedReferences.map((reference) => reference.referenceId)).not.toContain("unrelated");
  });

  it("changes identity when a semantic dependency changes but not when locale changes", () => {
    expect(buildPersistedVisualDirectionFingerprint({ ...direction, locale: "it" })).toBe(
      buildPersistedVisualDirectionFingerprint({ ...direction, locale: "pt", operation: "locale" }),
    );
    expect(buildPersistedVisualDirectionFingerprint({ ...direction, narrationRevisionId: "revision-002" })).not.toBe(
      buildPersistedVisualDirectionFingerprint(direction),
    );
  });
});
