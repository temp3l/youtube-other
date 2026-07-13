import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadMathRuntimeConfig,
  mathRuntimeConfigSchema,
  validateMathBrandPolicy,
} from "./math-config.js";

describe("math runtime config", () => {
  it("uses an isolated default workspace without changing episode config", () => {
    expect(loadMathRuntimeConfig({}, "/repo")).toEqual({
      workspaceDir: path.resolve("/repo/math-episodes"),
      brandConfigPath: path.resolve("/repo/config/math-brand.json"),
      enabled: true,
      renderingEnabled: true,
      publishingEnabled: false,
    });
  });

  it("rejects unknown fields and malformed flags", () => {
    expect(() =>
      mathRuntimeConfigSchema.parse({ workspaceDir: "x", extra: true })
    ).toThrow();
    expect(() =>
      loadMathRuntimeConfig({ MEDIAFORGE_MATH_ENABLED: "maybe" }, "/repo")
    ).toThrow(/MEDIAFORGE_MATH_ENABLED/u);
  });
});

describe("math brand policy", () => {
  const valid = () => ({
    artifactVersion: "math-brand-policy.v1",
    privacyStatus: "private",
    madeForKids: false,
    containsSyntheticMedia: true,
    channels: (["de", "en", "es", "fr", "pt"] as const).map((language) => ({
      language,
      channelId: `math-${language}`,
      playlists: { "grade-5": `${language}-grade`, "topic-zo": `${language}-topic`, "variant-standard": `${language}-variant` },
    })),
  });

  it("requires explicit unique five-language channels and policy without secrets", () => {
    expect(validateMathBrandPolicy(valid()).status).toBe("READY");
    expect(validateMathBrandPolicy({ ...valid(), privacyStatus: "public" }).status).toBe("PUBLISH_BLOCKED");
    expect(validateMathBrandPolicy({ ...valid(), madeForKids: undefined }).status).toBe("PUBLISH_BLOCKED");
    expect(validateMathBrandPolicy({ ...valid(), oauthToken: "secret" }).status).toBe("PUBLISH_BLOCKED");
    const duplicate = valid();
    duplicate.channels[1]!.channelId = duplicate.channels[0]!.channelId;
    expect(validateMathBrandPolicy(duplicate).status).toBe("PUBLISH_BLOCKED");
  });
});
