import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  EPISODE_NARRATION_ELEVENLABS_BASENAME,
  EPISODE_NARRATION_WAV_BASENAME,
  resolveEpisodeNarrationAudioPath,
} from "./narration-audio.js";

describe("resolveEpisodeNarrationAudioPath", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
  });

  it("prefers narration_elevenlabs.mp3 over narration.wav by default", async () => {
    const audioDir = await fs.mkdtemp(path.join(os.tmpdir(), "narration-audio-"));
    tempDirs.push(audioDir);
    await fs.writeFile(path.join(audioDir, EPISODE_NARRATION_WAV_BASENAME), "wav");
    await fs.writeFile(path.join(audioDir, EPISODE_NARRATION_ELEVENLABS_BASENAME), "mp3");
    await expect(resolveEpisodeNarrationAudioPath(audioDir)).resolves.toBe(
      path.join(audioDir, EPISODE_NARRATION_ELEVENLABS_BASENAME)
    );
  });

  it("falls back to narration.wav when the ElevenLabs file is absent", async () => {
    const audioDir = await fs.mkdtemp(path.join(os.tmpdir(), "narration-audio-"));
    tempDirs.push(audioDir);
    await fs.writeFile(path.join(audioDir, EPISODE_NARRATION_WAV_BASENAME), "wav");
    await expect(resolveEpisodeNarrationAudioPath(audioDir)).resolves.toBe(
      path.join(audioDir, EPISODE_NARRATION_WAV_BASENAME)
    );
  });

  it("honors an explicit basename override when provided", async () => {
    const audioDir = await fs.mkdtemp(path.join(os.tmpdir(), "narration-audio-"));
    tempDirs.push(audioDir);
    await fs.writeFile(path.join(audioDir, EPISODE_NARRATION_WAV_BASENAME), "wav");
    await fs.writeFile(path.join(audioDir, EPISODE_NARRATION_ELEVENLABS_BASENAME), "mp3");
    await fs.writeFile(path.join(audioDir, "custom-narration.mp3"), "custom");
    await expect(
      resolveEpisodeNarrationAudioPath(audioDir, {
        basename: "custom-narration.mp3",
      })
    ).resolves.toBe(path.join(audioDir, "custom-narration.mp3"));
  });
});
