import { createHash } from "node:crypto";
import type { VeronicaRegenerationScope } from "../contracts/media-plan.v1.js";

const dependents: Readonly<Record<VeronicaRegenerationScope, readonly VeronicaRegenerationScope[]>> =
  {
    "re-plan": [
      "re-prepare-assets",
      "re-translate",
      "re-align-narration",
      "re-render",
    ],
    "re-prepare-assets": ["re-render"],
    "re-translate": ["re-prepare-assets", "re-render"],
    "re-align-narration": ["re-render"],
    "re-render": [],
    "full-regeneration": [
      "re-plan",
      "re-prepare-assets",
      "re-translate",
      "re-align-narration",
      "re-render",
    ],
  };

export function expandRegenerationScopes(
  changed: readonly VeronicaRegenerationScope[],
): VeronicaRegenerationScope[] {
  const expanded = new Set<VeronicaRegenerationScope>();
  const queue = [...changed];
  while (queue.length > 0) {
    const scope = queue.shift();
    if (!scope || expanded.has(scope)) continue;
    expanded.add(scope);
    queue.push(...dependents[scope]);
  }
  return [...expanded];
}

export function regenerationScopeForChange(input: {
  readonly narrationChanged: boolean;
  readonly glossaryChanged: boolean;
  readonly cropOverrideChanged: boolean;
  readonly bitrateChanged: boolean;
  readonly contentHashUnchanged: boolean;
}): VeronicaRegenerationScope[] {
  if (input.contentHashUnchanged && !input.cropOverrideChanged && !input.bitrateChanged) {
    return [];
  }
  if (input.bitrateChanged && !input.narrationChanged && !input.glossaryChanged) {
    return ["re-render"];
  }
  if (input.cropOverrideChanged && !input.narrationChanged && !input.glossaryChanged) {
    return expandRegenerationScopes(["re-prepare-assets"]);
  }
  if (input.glossaryChanged) {
    return expandRegenerationScopes(["re-translate"]);
  }
  if (input.narrationChanged) {
    return expandRegenerationScopes(["re-plan", "re-align-narration"]);
  }
  return expandRegenerationScopes(["full-regeneration"]);
}

export function buildVeronicaCacheKey(input: {
  readonly episodeId: string;
  readonly stage: string;
  readonly contentHash: string;
  readonly language: string;
  readonly aspectRatio: "16:9" | "9:16";
}): string {
  return createHash("sha256")
    .update(
      [
        "veronica-media",
        input.episodeId,
        input.stage,
        input.contentHash,
        input.language,
        input.aspectRatio,
      ].join(":"),
    )
    .digest("hex");
}
