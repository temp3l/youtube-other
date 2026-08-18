import { createHash } from "node:crypto";
import type { VeronicaPipelineInput } from "./orchestrator.js";
import { hashCanonical } from "../canonical-json.js";

export function computeVeronicaPipelineInputFingerprint(
  input: Pick<
    VeronicaPipelineInput,
    "canonicalContentIdentity" | "episodeId" | "originalNarration" | "revisedNarration" | "targetLanguage" | "sourceLanguage" | "supplementalFiles"
  >,
): string {
  return hashCanonical({
    canonicalContentIdentity: input.canonicalContentIdentity,
    episodeId: input.episodeId,
    originalNarration: input.originalNarration,
    revisedNarration: input.revisedNarration ?? null,
    targetLanguage: input.targetLanguage,
    sourceLanguage: input.sourceLanguage ?? null,
    supplementalFiles: input.supplementalFiles.map((file) => ({
      assetId: file.assetId,
      filename: file.filename,
      checksum: createHash("sha256").update(file.bytes).digest("hex"),
    })),
  });
}
