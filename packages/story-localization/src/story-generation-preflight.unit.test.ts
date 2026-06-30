import { describe, expect, it } from "vitest";
import {
  estimateStoryComponent,
  estimateStoryTokens,
  runStoryGenerationPreflight,
  STORY_PREFLIGHT_POLICY_VERSION,
  type StoryPreflightRequest,
} from "./story-generation-preflight.js";

function baseRequest(
  overrides: Partial<StoryPreflightRequest> = {}
): StoryPreflightRequest {
  const system = estimateStoryComponent({
    name: "system-instructions",
    label: "system",
    text: "Rewrite the story as narration only.",
  });
  const user = estimateStoryComponent({
    name: "canonical-source-narration",
    label: "source",
    text: "A compact source story with stable facts.",
  });
  return {
    episodeNumber: "001",
    episodeSlug: "episode-one",
    operation: "generate",
    variant: "canonical-english-full",
    language: "en",
    locale: "en-US",
    model: "gpt-5.5",
    reasoningEffort: "high",
    maxOutputTokens: 2_000,
    retryCap: 0,
    promptVersion: "test-prompt-v1",
    promptFingerprint: "prompt-fingerprint",
    schemaName: "full_narration_story_package",
    schemaVersion: "schema-v1",
    schemaFingerprint: "schema-fingerprint",
    sourceHash: "a".repeat(64),
    targetWordRange: { min: 500, max: 900 },
    components: [
      system,
      user,
      {
        name: "response-schema-overhead",
        label: "schema",
        estimatedTokens: 100,
      },
      {
        name: "request-wrapper-overhead",
        label: "wrapper",
        estimatedTokens: 20,
      },
      {
        name: "expected-output",
        label: "expected",
        estimatedTokens: 1_500,
      },
    ],
    minimumOutputTokens: 1_500,
    ...overrides,
  };
}

describe("story generation preflight", () => {
  it("allows a fitting full-story request", () => {
    const result = runStoryGenerationPreflight(baseRequest());
    expect(result.status).toBe("allowed");
    expect(result.diagnostics.policyVersion).toBe(
      STORY_PREFLIGHT_POLICY_VERSION
    );
    expect(result.diagnostics.estimatedInputTokens).toBe(
      result.diagnostics.largestComponents.reduce(
        (total, component) =>
          ["expected-output", "safety-reserve"].includes(component.name)
            ? total
            : total + component.estimatedTokens,
        0
      )
    );
  });

  it("blocks when requested output exceeds the model output limit", () => {
    const result = runStoryGenerationPreflight(
      baseRequest({ model: "gpt-4o-mini", maxOutputTokens: 20_000 })
    );
    expect(result.status).toBe("blocked");
    if (result.status === "blocked") {
      expect(result.reason).toBe("output-limit");
      expect(result.failureCodes).toContain("OUTPUT_LIMIT_EXCEEDED");
    }
  });

  it("blocks when input plus output plus safety reserve exceeds context", () => {
    const huge = {
      name: "canonical-source-narration" as const,
      label: "huge source",
      estimatedTokens: 126_000,
    };
    const result = runStoryGenerationPreflight(
      baseRequest({
        model: "gpt-4o-mini",
        maxOutputTokens: 4_000,
        components: [huge, ...baseRequest().components.slice(2)],
      })
    );
    expect(result.status).toBe("blocked");
    if (result.status === "blocked") {
      expect(result.failureCodes).toContain("CONTEXT_WINDOW_EXCEEDED");
    }
  });

  it("blocks malformed output budget configuration", () => {
    const result = runStoryGenerationPreflight(
      baseRequest({ maxOutputTokens: 0 })
    );
    expect(result.status).toBe("blocked");
    if (result.status === "blocked") {
      expect(result.failureCodes).toContain("INVALID_TOKEN_BUDGET");
    }
  });

  it("uses conservative fallback diagnostics for unknown models", () => {
    const result = runStoryGenerationPreflight(
      baseRequest({ model: "unknown-future-model" })
    );
    expect(result.diagnostics.tokenizerStrategy).toBe("conservative-fallback");
    expect(result.diagnostics.warnings.join(" ")).toContain("Unknown model");
  });

  it("selects the supported local estimator for known model families", () => {
    expect(estimateStoryTokens("hello world", "openai-compatible-local-estimate")).toBeGreaterThan(0);
    const result = runStoryGenerationPreflight(baseRequest({ model: "gpt-5-mini" }));
    expect(result.diagnostics.tokenizerStrategy).toBe(
      "openai-compatible-local-estimate"
    );
  });

  it("reconciles component totals with the input estimate", () => {
    const request = baseRequest();
    const result = runStoryGenerationPreflight(request);
    const expected = request.components
      .filter((component) => component.name !== "expected-output")
      .reduce((total, component) => total + component.estimatedTokens, 0);
    expect(result.diagnostics.estimatedInputTokens).toBe(expected);
  });

  it("supports Spanish, German, Portuguese, and French localization preflight", () => {
    for (const language of ["es", "de", "pt", "fr"] as const) {
      const result = runStoryGenerationPreflight(
        baseRequest({
          operation: "localize",
          variant: "localized-full",
          language,
          locale:
            language === "es"
              ? "es-419"
              : language === "de"
                ? "de-DE"
                : language === "pt"
                  ? "pt-BR"
                  : "fr-FR",
          parentArtifact: {
            kind: "canonical-english-full",
            fingerprint: "c".repeat(64),
            sourceHash: "a".repeat(64),
            language: "en",
            locale: "en-US",
            variant: "full",
            storyIrHash: "d".repeat(64),
            contractHash: "e".repeat(64),
            contractBuildFingerprint: "f".repeat(64),
          },
        })
      );
      expect(result.status).toBe("allowed");
    }
  });

  it("rejects localized full requests without a validated canonical parent", () => {
    const result = runStoryGenerationPreflight(
      baseRequest({
        operation: "localize",
        variant: "localized-full",
        language: "es",
        locale: "es-419",
      })
    );
    expect(result.status).toBe("blocked");
    if (result.status === "blocked") {
      expect(result.failureCodes).toContain("MISSING_PARENT_FULL_STORY");
    }
  });

  it("rejects raw or sibling-locale parent descriptors for localized full requests", () => {
    const rawLike = runStoryGenerationPreflight(
      baseRequest({
        operation: "localize",
        variant: "localized-full",
        language: "es",
        locale: "es-419",
        parentArtifact: {
          kind: "canonical-english-full",
          fingerprint: "c".repeat(64),
          sourceHash: "a".repeat(64),
          language: "en",
          locale: "de-DE" as "en-US",
          variant: "full",
          storyIrHash: "d".repeat(64),
          contractHash: "e".repeat(64),
          contractBuildFingerprint: "f".repeat(64),
        },
      })
    );
    expect(rawLike.status).toBe("blocked");
    if (rawLike.status === "blocked") {
      expect(rawLike.failureCodes).toContain("INVALID_PARENT_FULL_STORY");
    }
  });

  it("rejects unsupported language values through the typed boundary", () => {
    const result = runStoryGenerationPreflight(
      baseRequest({ language: "it" as StoryPreflightRequest["language"] })
    );
    expect(result.status).toBe("blocked");
    if (result.status === "blocked") {
      expect(result.failureCodes).toContain("UNSUPPORTED_LANGUAGE");
    }
  });

  it("blocks duplicate failed request fingerprints", () => {
    const result = runStoryGenerationPreflight(
      baseRequest({ existingFailedFingerprint: true })
    );
    expect(result.status).toBe("blocked");
    if (result.status === "blocked") {
      expect(result.failureCodes).toContain("DUPLICATE_FAILED_REQUEST");
    }
  });

  it("changes the request fingerprint when parent hash, prompt fingerprint, model, or output cap changes", () => {
    const base = runStoryGenerationPreflight(
      baseRequest({
        operation: "localize",
        variant: "localized-full",
        language: "es",
        locale: "es-419",
        parentArtifact: {
          kind: "canonical-english-full",
          fingerprint: "c".repeat(64),
          sourceHash: "a".repeat(64),
          language: "en",
          locale: "en-US",
          variant: "full",
          storyIrHash: "d".repeat(64),
          contractHash: "e".repeat(64),
          contractBuildFingerprint: "f".repeat(64),
        },
      })
    );
    const changedParent = runStoryGenerationPreflight(
      baseRequest({
        operation: "localize",
        variant: "localized-full",
        language: "es",
        locale: "es-419",
        parentArtifact: {
          kind: "canonical-english-full",
          fingerprint: "9".repeat(64),
          sourceHash: "a".repeat(64),
          language: "en",
          locale: "en-US",
          variant: "full",
          storyIrHash: "d".repeat(64),
          contractHash: "e".repeat(64),
          contractBuildFingerprint: "f".repeat(64),
        },
      })
    );
    const changedPrompt = runStoryGenerationPreflight(
      baseRequest({ promptFingerprint: "other-prompt" })
    );
    const changedModel = runStoryGenerationPreflight(
      baseRequest({ model: "gpt-5-mini" })
    );
    const changedOutputCap = runStoryGenerationPreflight(
      baseRequest({ maxOutputTokens: 2200 })
    );
    expect(changedParent.requestFingerprint).not.toBe(base.requestFingerprint);
    expect(changedPrompt.requestFingerprint).not.toBe(base.requestFingerprint);
    expect(changedModel.requestFingerprint).not.toBe(base.requestFingerprint);
    expect(changedOutputCap.requestFingerprint).not.toBe(base.requestFingerprint);
  });
});
