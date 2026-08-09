import { describe, expect, it } from "vitest";
import {
  assertCreatorVoiceDispatchAllowed,
  canonicalCreatorVoiceProfileId,
  cleanCreatorSpokenPayload,
} from "./creator-voice-policy.js";

describe("creator voice policy", () => {
  it("normalizes the Veronica alias before policy comparison", () => {
    expect(canonicalCreatorVoiceProfileId("strategic-reinvention")).toBe("veronicabenini");
    expect(() => assertCreatorVoiceDispatchAllowed("veronicabenini", { kind: "legacy-noncreator" })).toThrow("Veronica creator voice");
  });

  it("cleans the provider-bound spoken payload", () => {
    expect(cleanCreatorSpokenPayload("  Ciao <em>Veronica</em>\n")).toBe("Ciao Veronica");
    expect(() => cleanCreatorSpokenPayload("<br>\u0000")).toThrow("non-empty");
  });
});
