import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseSlot, updateDotEnvFile } from "./youtube-auth.ts";

describe("youtube auth helpers", () => {
  it("parses portuguese slot aliases explicitly", () => {
    const parsed = parseSlot(["--slot", "portuguese"]);
    expect(parsed.slot).toBe("portuguese");
    expect(parsed.config.refreshTokenEnvVar).toBe(
      "YOUTUBE_REFRESH_TOKEN_PORTUGUESE",
    );
    expect(parsed.config.channelIdEnvVar).toBe("YOUTUBE_CHANNEL_ID_PORTUGUESE");
  });

  it("updates existing env keys and appends missing ones", async () => {
    const tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "mediaforge-youtube-auth-"),
    );
    const dotenvPath = path.join(tempDir, ".env");
    await fs.writeFile(
      dotenvPath,
      [
        "YOUTUBE_REFRESH_TOKEN=\"old-token\"",
        "# comment",
        "YOUTUBE_CHANNEL_ID=old-channel",
        "",
      ].join("\n"),
      "utf8",
    );

    await updateDotEnvFile({
      dotenvPath,
      updates: {
        YOUTUBE_REFRESH_TOKEN: "new-token",
        YOUTUBE_CHANNEL_ID_PORTUGUESE: "new-portuguese-channel",
      },
    });

    await expect(fs.readFile(dotenvPath, "utf8")).resolves.toBe(
      [
        "YOUTUBE_REFRESH_TOKEN=\"new-token\"",
        "# comment",
        "YOUTUBE_CHANNEL_ID=old-channel",
        "",
        "YOUTUBE_CHANNEL_ID_PORTUGUESE=\"new-portuguese-channel\"",
        "",
      ].join("\n"),
    );
  });
});
