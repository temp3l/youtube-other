import { describe, expect, it } from "vitest";

import {
  parseTikTokSecretStoreEnvironment,
  redactTikTokSecretStoreConfigEvidence,
} from "./tiktok-secret-store-config.js";

describe("tiktok secret store config", () => {
  it("requires a configured encryption key and resolves the store root", () => {
    const resolved = parseTikTokSecretStoreEnvironment(
      {
        MEDIAFORGE_TIKTOK_SECRET_STORE_DIR: "/tmp/tiktok-secrets",
        MEDIAFORGE_TIKTOK_SECRET_ENCRYPTION_KEY: "x".repeat(32),
      },
      { workspaceRoot: "/srv/mediaforge" }
    );

    expect(resolved.config).toEqual({
      storeRoot: "/tmp/tiktok-secrets",
      encryptionKeyConfigured: true,
    });
  });

  it("redacts encryption material from config evidence", () => {
    expect(
      redactTikTokSecretStoreConfigEvidence({
        storeRoot: "/tmp/tiktok-secrets",
        encryptionKey: "x".repeat(32),
        nested: { refreshToken: "rft.secret" },
      })
    ).toEqual({
      storeRoot: "/tmp/tiktok-secrets",
      encryptionKey: "[REDACTED]",
      nested: { refreshToken: "[REDACTED]" },
    });
  });
});
