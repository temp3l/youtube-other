import path from "node:path";
import { writeJsonAtomic } from "@mediaforge/shared";
import { type Transcript } from "@mediaforge/domain";

export const fixtureTranscript: Transcript = {
  sourceId: "episode-fixture" as never,
  language: "en",
  text: "This is a local fixture. It exercises the pipeline. The rendered output should validate.",
  segments: [
    {
      id: "scene-001" as never,
      startSeconds: 0,
      endSeconds: 4,
      text: "This is a local fixture.",
      words: []
    },
    {
      id: "scene-002" as never,
      startSeconds: 4,
      endSeconds: 8,
      text: "It exercises the pipeline.",
      words: []
    },
    {
      id: "scene-003" as never,
      startSeconds: 8,
      endSeconds: 12,
      text: "The rendered output should validate.",
      words: []
    }
  ],
  words: []
};

export async function writeFixtureTranscript(filePath: string): Promise<void> {
  await writeJsonAtomic(filePath, fixtureTranscript);
}

export async function createFixtureEpisodeFiles(baseDir: string): Promise<void> {
  await writeFixtureTranscript(path.join(baseDir, "fixture.transcript.json"));
}

