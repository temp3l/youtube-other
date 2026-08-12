import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { ensurePortableRelativePath } from "@mediaforge/shared";
import { z } from "zod";
import {
  CANONICAL_SOURCE_EPISODE_SCHEMA_VERSION,
  canonicalSourceEpisodeSchema,
  type CanonicalSourceEpisode,
} from "./veronica-content-pack-2-ingestion.js";

export const FULL_TRANSCRIPTED_PACK_ADAPTER_VERSION =
  "full-transcripted-pack-adapter.v1" as const;
export const FULL_TRANSCRIPTED_PACK_ID = "full-transcripted-pack" as const;

const storyIdSchema = z.string().regex(/^[SL][0-9]{3}$/u);
const sourceQualitySchema = z.enum(["clean", "noisy", "review"]);
const waveQaEntrySchema = z
  .object({
    storyId: storyIdSchema,
    title: z.string().min(1),
    format: z.enum(["short", "long"]),
    sourceIds: z.array(z.string().min(1)).min(1),
    sourceQualities: z.record(z.string(), sourceQualitySchema),
    timingPass: z.boolean(),
    originalityPass: z.boolean(),
    plainNarrationOnly: z.boolean(),
    qaPass: z.boolean(),
  })
  .passthrough();

function sha256(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

function slugifyStory(input: { readonly storyId: string; readonly title: string }): string {
  return `${input.storyId}-${input.title}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "");
}

function scriptDirectory(format: "short" | "long"): "shorts" | "longs" {
  return format === "short" ? "shorts" : "longs";
}

/**
 * Discovers finished Wave 01 narrations. Editorial briefs without a Wave 01
 * script are intentionally excluded: a brief is not safe input for TTS or
 * media generation until it has passed script and source-grounding QA.
 */
export async function discoverFullTranscriptedPackEpisodes(input: {
  readonly packDir: string;
  readonly format?: "short" | "long";
}): Promise<readonly CanonicalSourceEpisode[]> {
  const packDir = path.resolve(input.packDir);
  const qaPath = path.join(packDir, "production-wave-01", "qa.json");
  const qaEntries = z.array(waveQaEntrySchema).parse(
    JSON.parse(await fs.readFile(qaPath, "utf8")) as unknown,
  );
  const episodes: CanonicalSourceEpisode[] = [];
  for (const qa of qaEntries) {
    if (input.format && qa.format !== input.format) continue;
    if (!qa.qaPass || !qa.timingPass || !qa.originalityPass || !qa.plainNarrationOnly) {
      throw new Error(`Full-transcripted Pack Wave 01 story ${qa.storyId} is not approved for production.`);
    }
    const directory = scriptDirectory(qa.format);
    const relativeScriptPath = path.posix.join(
      "production-wave-01",
      "scripts",
      directory,
      `${qa.storyId}.txt`,
    );
    const scriptPath = path.join(packDir, ...relativeScriptPath.split("/"));
    const bytes = await fs.readFile(scriptPath);
    const narration = bytes.toString("utf8");
    const episodeId = slugifyStory(qa);
    episodes.push(
      canonicalSourceEpisodeSchema.parse({
        schemaVersion: CANONICAL_SOURCE_EPISODE_SCHEMA_VERSION,
        ingestionAdapterVersion: FULL_TRANSCRIPTED_PACK_ADAPTER_VERSION,
        sourcePackId: FULL_TRANSCRIPTED_PACK_ID,
        episodeId,
        authoredEpisodeKey: episodeId,
        canonicalSlug: episodeId,
        title: qa.title,
        contentProfileId: "veronicabenini",
        format: qa.format,
        localeSources: [
          {
            locale: "en",
            sourcePath: ensurePortableRelativePath(relativeScriptPath),
            sourceSha256: sha256(bytes),
            narration,
          },
        ],
        sourceRevisionHash: sha256(
          JSON.stringify({
            authoredEpisodeKey: episodeId,
            sources: [{ locale: "en", sourcePath: relativeScriptPath, sourceSha256: sha256(bytes) }],
          }),
        ),
        declaredReusableAssets: [],
        sourceGrounding: {
          storyId: qa.storyId,
          sourceIds: qa.sourceIds,
          sourceQualities: qa.sourceQualities,
          timingPass: qa.timingPass,
          originalityPass: qa.originalityPass,
          plainNarrationOnly: qa.plainNarrationOnly,
          qaPass: qa.qaPass,
        },
      }),
    );
  }
  return episodes.sort((left, right) => left.episodeId.localeCompare(right.episodeId));
}
