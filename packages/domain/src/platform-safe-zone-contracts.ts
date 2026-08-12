import { z } from "zod";

const normalizedUnitIntervalSchema = z.number().finite().min(0).max(1);
const positiveFiniteNumberSchema = z.number().finite().positive();

const normalizedCropSchema = z
  .object({
    x: normalizedUnitIntervalSchema,
    y: normalizedUnitIntervalSchema,
    width: positiveFiniteNumberSchema.max(1),
    height: positiveFiniteNumberSchema.max(1),
  })
  .superRefine((value, ctx) => {
    if (value.x + value.width > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["width"],
        message: "Crop width must stay within the normalized source bounds.",
      });
    }
    if (value.y + value.height > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["height"],
        message: "Crop height must stay within the normalized source bounds.",
      });
    }
  });

export type NormalizedCrop = z.infer<typeof normalizedCropSchema>;
export { normalizedCropSchema };

export const PLATFORM_SAFE_ZONE_SCHEMA_VERSION =
  "mediaforge.platform-safe-zone.v1" as const;

export const verticalPublicationTargetSchema = z.enum([
  "base-9x16",
  "tiktok",
  "youtube-shorts",
]);
export type VerticalPublicationTarget = z.infer<
  typeof verticalPublicationTargetSchema
>;

export const platformOverlayRegionSchema = z
  .object({
    id: z.string().trim().min(1).max(120),
    label: z.string().trim().min(1).max(160),
    bounds: normalizedCropSchema,
    kind: z.enum([
      "platform-chrome",
      "interaction-rail",
      "caption-band",
      "status-bar",
      "content-safe",
    ]),
    blocks: z
      .array(z.enum(["ui", "subtitles", "faces", "critical-reveals"]))
      .min(1),
  })
  .strict();
export type PlatformOverlayRegion = z.infer<typeof platformOverlayRegionSchema>;

export const platformSafeZoneProfileSchema = z
  .object({
    schemaVersion: z.literal(PLATFORM_SAFE_ZONE_SCHEMA_VERSION),
    target: verticalPublicationTargetSchema,
    aspectRatio: z.literal("9:16"),
    contentSafeArea: normalizedCropSchema,
    overlayRegions: z.array(platformOverlayRegionSchema).default([]),
  })
  .strict();
export type PlatformSafeZoneProfile = z.infer<
  typeof platformSafeZoneProfileSchema
>;

const BASE_9X16_CONTENT_SAFE: NormalizedCrop = {
  x: 0.05,
  y: 0.08,
  width: 0.9,
  height: 0.84,
};

const TIKTOK_OVERLAYS: readonly PlatformOverlayRegion[] = [
  {
    id: "tiktok.status-bar",
    label: "TikTok top status and creator chrome",
    bounds: { x: 0, y: 0, width: 1, height: 0.12 },
    kind: "status-bar",
    blocks: ["ui", "faces", "critical-reveals"],
  },
  {
    id: "tiktok.right-rail",
    label: "TikTok right-side interaction rail",
    bounds: { x: 0.82, y: 0.34, width: 0.18, height: 0.36 },
    kind: "interaction-rail",
    blocks: ["ui", "subtitles", "faces", "critical-reveals"],
  },
  {
    id: "tiktok.bottom-band",
    label: "TikTok caption, username, and sound chrome",
    bounds: { x: 0, y: 0.72, width: 1, height: 0.28 },
    kind: "caption-band",
    blocks: ["ui", "subtitles", "faces", "critical-reveals"],
  },
];

const YOUTUBE_SHORTS_OVERLAYS: readonly PlatformOverlayRegion[] = [
  {
    id: "youtube-shorts.top-band",
    label: "YouTube Shorts top title and subscription chrome",
    bounds: { x: 0, y: 0, width: 1, height: 0.1 },
    kind: "status-bar",
    blocks: ["ui", "faces", "critical-reveals"],
  },
  {
    id: "youtube-shorts.right-rail",
    label: "YouTube Shorts right-side action rail",
    bounds: { x: 0.85, y: 0.38, width: 0.15, height: 0.32 },
    kind: "interaction-rail",
    blocks: ["ui", "subtitles", "faces", "critical-reveals"],
  },
  {
    id: "youtube-shorts.bottom-band",
    label: "YouTube Shorts bottom metadata and progress chrome",
    bounds: { x: 0, y: 0.78, width: 1, height: 0.22 },
    kind: "caption-band",
    blocks: ["ui", "subtitles", "faces", "critical-reveals"],
  },
];

export const PLATFORM_SAFE_ZONE_PROFILES: Readonly<
  Record<VerticalPublicationTarget, PlatformSafeZoneProfile>
> = {
  "base-9x16": platformSafeZoneProfileSchema.parse({
    schemaVersion: PLATFORM_SAFE_ZONE_SCHEMA_VERSION,
    target: "base-9x16",
    aspectRatio: "9:16",
    contentSafeArea: BASE_9X16_CONTENT_SAFE,
    overlayRegions: [],
  }),
  tiktok: platformSafeZoneProfileSchema.parse({
    schemaVersion: PLATFORM_SAFE_ZONE_SCHEMA_VERSION,
    target: "tiktok",
    aspectRatio: "9:16",
    contentSafeArea: BASE_9X16_CONTENT_SAFE,
    overlayRegions: [...TIKTOK_OVERLAYS],
  }),
  "youtube-shorts": platformSafeZoneProfileSchema.parse({
    schemaVersion: PLATFORM_SAFE_ZONE_SCHEMA_VERSION,
    target: "youtube-shorts",
    aspectRatio: "9:16",
    contentSafeArea: BASE_9X16_CONTENT_SAFE,
    overlayRegions: [...YOUTUBE_SHORTS_OVERLAYS],
  }),
};

export type SafeZoneElementKind =
  | "ui"
  | "subtitles"
  | "faces"
  | "critical-reveals";

export function resolvePlatformSafeZoneProfile(
  target: VerticalPublicationTarget,
): PlatformSafeZoneProfile {
  return PLATFORM_SAFE_ZONE_PROFILES[target];
}

export function blockingOverlayRegionsForElement(
  profile: PlatformSafeZoneProfile,
  elementKind: SafeZoneElementKind,
): readonly PlatformOverlayRegion[] {
  return profile.overlayRegions.filter((region) =>
    region.blocks.includes(elementKind),
  );
}
