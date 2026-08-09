import { describe, expect, it } from "vitest";
import { buildNarrationRevision, freezeNarrationRevision } from "./revision.js";

describe("narration revisions", () => {
  it("preserves an immutable revision with an actionable sentence diff", () => {
    const revision = buildNarrationRevision({
      revisionId: "revision-episode-001",
      originalScript: "La scelta conta. Il contesto cambia.",
      revisedScript: "La scelta consapevole conta. Il contesto cambia.",
    });
    const frozen = freezeNarrationRevision({
      revision,
      frozenAt: "2026-08-09T12:00:00.000Z",
      frozenBy: "editor-a",
    });
    expect(Object.isFrozen(frozen)).toBe(true);
    expect(Object.isFrozen(frozen.revision.mapping)).toBe(true);
    expect(Object.isFrozen(frozen.revision.mapping[0])).toBe(true);
    expect(Object.isFrozen(frozen.diffs[0])).toBe(true);
    expect(frozen.diffs[0]).toMatchObject({ changeKind: "expanded" });
    expect(frozen.diffs[1]).toMatchObject({ changeKind: "unchanged" });
  });
});
