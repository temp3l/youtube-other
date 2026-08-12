import { createHash } from "node:crypto";

import type {
  MicrodramaImageProviderPort,
  MicrodramaVisualGenerationRequest,
} from "./contracts.js";

export function createMockMicrodramaImageProvider(input?: {
  readonly providerId?: string;
  readonly estimatedCostMinor?: number;
}): MicrodramaImageProviderPort {
  const providerId = input?.providerId ?? "mock-image";
  const estimatedCostMinor = input?.estimatedCostMinor ?? 25;

  return {
    id: providerId,
    async generate(args: {
      readonly request: MicrodramaVisualGenerationRequest;
      readonly cacheKey: string;
    }) {
      const artifactHash = createHash("sha256")
        .update(
          [
            providerId,
            args.cacheKey,
            args.request.shotSemanticId,
            args.request.sourcePlateSemanticId,
            args.request.promptText,
          ].join("\n"),
          "utf8"
        )
        .digest("hex");
      return {
        artifactHash,
        storageUri: `mock://visual/${args.request.sourcePlateSemanticId}/${artifactHash}.png`,
        providerRequestId: `mock-req-${artifactHash.slice(0, 12)}`,
        estimatedCostMinor,
      };
    },
  };
}
