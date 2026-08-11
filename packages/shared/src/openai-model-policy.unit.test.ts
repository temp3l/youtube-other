import { describe, expect, it } from "vitest";
import {
  DEFAULT_OPENAI_CAPABILITY_POLICY,
  OPENAI_CAPABILITY_POLICY_VERSION,
  requireOpenAiResponsesPolicy,
} from "./openai-model-policy.js";

describe("production OpenAI capability policy", () => {
  it("pins authoring, routine validation, and metadata defaults", () => {
    expect(DEFAULT_OPENAI_CAPABILITY_POLICY["story-rewrite"]).toMatchObject({ model: "gpt-5.6-terra", reasoning: "high" });
    expect(DEFAULT_OPENAI_CAPABILITY_POLICY.localization).toMatchObject({ model: "gpt-5.6-terra", reasoning: "medium" });
    expect(DEFAULT_OPENAI_CAPABILITY_POLICY["short-rewrite"]).toMatchObject({ model: "gpt-5.6-terra", reasoning: "medium" });
    expect(DEFAULT_OPENAI_CAPABILITY_POLICY.validation).toMatchObject({ model: "gpt-5.4-mini", reasoning: "low" });
    expect(DEFAULT_OPENAI_CAPABILITY_POLICY["youtube-metadata"]).toMatchObject({ model: "gpt-5.4-mini", reasoning: "none" });
    expect(DEFAULT_OPENAI_CAPABILITY_POLICY["metadata-repair"]).toMatchObject({ model: "gpt-5.4-mini", reasoning: "low" });
  });

  it("encodes the bounded Veronica Mini → Terra → Sol hierarchy", () => {
    expect(DEFAULT_OPENAI_CAPABILITY_POLICY["veronica-visual-qa-scene"]).toMatchObject({ model: "gpt-5.4-mini", reasoning: "low" });
    expect(DEFAULT_OPENAI_CAPABILITY_POLICY["veronica-visual-qa-escalation"]).toMatchObject({ model: "gpt-5.6-terra", reasoning: "medium" });
    expect(DEFAULT_OPENAI_CAPABILITY_POLICY["veronica-visual-qa-final-adjudication"]).toMatchObject({ model: "gpt-5.6-sol", reasoning: "medium" });
  });

  it("makes endpoint support explicit", () => {
    expect(requireOpenAiResponsesPolicy(DEFAULT_OPENAI_CAPABILITY_POLICY["history-research"]).reasoning).toBe("none");
    expect(DEFAULT_OPENAI_CAPABILITY_POLICY["history-visual-direction"]).toMatchObject({ model: "gpt-4.1-mini", reasoning: null });
    expect(DEFAULT_OPENAI_CAPABILITY_POLICY["image-generation"].reasoning).toBeNull();
    expect(OPENAI_CAPABILITY_POLICY_VERSION).toBe("openai-capability-policy-v1");
  });
});
