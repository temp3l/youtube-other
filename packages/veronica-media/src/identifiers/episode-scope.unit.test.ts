import { describe, expect, it } from "vitest";
import { episodeScopedLookupKey } from "./episode-scope.js";

describe("episodeScopedLookupKey", () => {
  it("scopes identical local IDs to different episodes", () => {
    const localId = "prep-abc123";
    expect(episodeScopedLookupKey("episode-a", localId)).not.toBe(
      episodeScopedLookupKey("episode-b", localId),
    );
  });
});
