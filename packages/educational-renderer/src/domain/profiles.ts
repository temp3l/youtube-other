import { renderProfileInputSchema, type NormalizedRenderProfile, type RenderProfileInput } from "../contracts.js";

const profiles = {
  preview: { name: "preview", width: 960, height: 540, frameRate: 15, encoder: "libx264", preset: "ultrafast", pixelFormat: "yuv420p" },
  draft: { name: "draft", width: 1280, height: 720, frameRate: 24, encoder: "libx264", preset: "veryfast", pixelFormat: "yuv420p" },
  "youtube-full": { name: "youtube-full", width: 1920, height: 1080, frameRate: 24, encoder: "libx264", preset: "veryfast", pixelFormat: "yuv420p" },
  "youtube-short": { name: "youtube-short", width: 1080, height: 1920, frameRate: 24, encoder: "libx264", preset: "veryfast", pixelFormat: "yuv420p" },
} as const satisfies Record<string, NormalizedRenderProfile>;

export function normalizeProfile(input: RenderProfileInput): NormalizedRenderProfile {
  const parsed = renderProfileInputSchema.parse(input);
  const name = typeof parsed === "string" ? parsed : parsed.name;
  const base = profiles[name];
  if (typeof parsed === "string") return base;
  return { ...base, ...(parsed.frameRate === undefined ? {} : { frameRate: parsed.frameRate }), ...(parsed.encoder === undefined ? {} : { encoder: parsed.encoder }), ...(parsed.preset === undefined ? {} : { preset: parsed.preset }) };
}
