import {
  normalizeContentProfileId,
  type ContentProfileId,
} from "@mediaforge/domain";

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
  if (profileId === "veronicabenini") {
    throw new StrategicPublishRoutingError(
      "STRATEGIC_LEGACY_UPLOADER_FORBIDDEN",
      "The legacy episode uploader is forbidden for veronicabenini. Use the canonical approval-gated publish seam.",
    );
  }
}

export function isStrategicReinventionProfile(profileId: string): boolean {
  return normalizeContentProfileId(profileId) === "veronicabenini";
}
