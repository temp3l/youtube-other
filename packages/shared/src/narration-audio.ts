import path from "node:path";
import { fileExists } from "./index.js";

export const EPISODE_NARRATION_ELEVENLABS_BASENAME = "narration_elevenlabs.mp3";
export const EPISODE_NARRATION_WAV_BASENAME = "narration.wav";

export function episodeNarrationAudioCandidates(
  audioDir: string,
  options?: { readonly basename?: string }
): readonly string[] {
  const candidates: string[] = [];
  if (options?.basename) {
    candidates.push(path.join(audioDir, options.basename));
  } else {
    candidates.push(path.join(audioDir, EPISODE_NARRATION_ELEVENLABS_BASENAME));
  }
  candidates.push(
    path.join(audioDir, EPISODE_NARRATION_WAV_BASENAME),
    path.join(audioDir, "narration-en.wav")
  );
  return candidates;
}

export async function resolveEpisodeNarrationAudioPath(
  audioDir: string,
  options?: { readonly basename?: string }
): Promise<string | undefined> {
  for (const candidate of episodeNarrationAudioCandidates(audioDir, options)) {
    if (await fileExists(candidate)) {
      return candidate;
    }
  }
  return undefined;
}
