import type { ContentProfileId } from "@mediaforge/domain";

export class StrategicPublishRoutingError extends Error {
  public readonly code: string;

  public constructor(code: string, message: string) {
    super(message);
    this.name = "StrategicPublishRoutingError";
    this.code = code;
  }
}

export function assertLegacyUploaderAllowedForProfile(
  profileId: ContentProfileId,
): void {
  if (profileId === "strategic-reinvention") {
    throw new StrategicPublishRoutingError(
      "STRATEGIC_LEGACY_UPLOADER_FORBIDDEN",
      "The legacy episode uploader is forbidden for strategic-reinvention. Use the strategic multilingual publish seam.",
    );
  }
}

export function isStrategicReinventionProfile(profileId: string): boolean {
  return profileId === "strategic-reinvention";
}
