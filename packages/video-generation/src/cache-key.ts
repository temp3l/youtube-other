import { createHash } from "node:crypto";

import {
  VIDEO_GENERATION_CACHE_KEY_VERSION,
  type VideoGenerationRequest,
} from "./contracts.js";

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function buildVideoGenerationCacheKey(
  request: VideoGenerationRequest
): string {
  const material = {
    version: VIDEO_GENERATION_CACHE_KEY_VERSION,
    episodeId: request.episodeId,
    shotSemanticId: request.shotSemanticId,
    shotPlanRevisionId: request.shotPlanRevisionId,
    clipKind: request.clipKind,
    providerCapabilityId: request.providerCapabilityId,
    promptHash: request.promptHash,
    sourceImageHash: request.sourceImageHash,
    durationSeconds: request.durationSeconds,
  };
  return createHash("sha256").update(stableJson(material)).digest("hex");
}
