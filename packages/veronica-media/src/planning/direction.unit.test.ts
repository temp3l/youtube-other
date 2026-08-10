import { describe, expect, it } from "vitest";
import { createInMemoryPersistedVisualDirectionStore } from "@mediaforge/visual-planning";
import { resolvePersistedVeronicaCameraDirection } from "./direction.js";

describe("Veronica persisted camera direction adapter", () => {
  it("normalizes the canonical Veronica identity and reuses the generic artifact", async () => {
    const store = createInMemoryPersistedVisualDirectionStore();
    const direction = {
      contentProfileId: "veronica-benini" as const,
      episodeId: "episode-001",
      narrationRevisionId: "revision-001",
      effectiveConfigurationHash: "a".repeat(64),
      dependencyIdentity: { source: "b".repeat(64) },
      timePeriod: { label: "contemporary" },
      geography: ["Italy"],
      topics: ["strategy"],
      sourceContextIds: ["source-001"],
      genreVisualPolicy: "editorial-documentary",
      scenes: [{ sceneId: "scene-001", entityIds: ["veronica"] }],
      referenceCandidates: [
        { referenceId: "veronica", entityId: "veronica", purpose: "identity" as const, provenanceId: "prov-001" },
        { referenceId: "other", entityId: "other", purpose: "identity" as const, provenanceId: "prov-002" },
      ],
    };
    const first = await resolvePersistedVeronicaCameraDirection({
      direction: { ...direction, locale: "it", operation: "episode" },
      store,
    });
    const localized = await resolvePersistedVeronicaCameraDirection({
      direction: { ...direction, locale: "en", operation: "locale" },
      store,
    });

    expect(first.artifact.contentProfileId).toBe("veronicabenini");
    expect(first.artifact.attachedReferences).toHaveLength(1);
    expect(localized).toMatchObject({ reused: true, rationale: "cache-compatible" });
  });
});
