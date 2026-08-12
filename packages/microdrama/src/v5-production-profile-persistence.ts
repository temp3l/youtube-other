import { computePayloadHash } from "@mediaforge/narrative-core";

import type { V5CanonAdmissionRepository } from "./v5-canon-persistence.js";
import type { SevenMinutesAheadProductionProfile } from "./v5-production-profile-contracts.js";
import { validateSevenMinutesAheadProductionProfile } from "./v5-production-profile-contracts.js";

const PRODUCTION_PROFILE_PROJECTION_KEY = "production.profile.v5-remediated";

export function persistV5ProductionProfile(
  repository: V5CanonAdmissionRepository,
  profile: SevenMinutesAheadProductionProfile
): void {
  const validated = validateSevenMinutesAheadProductionProfile(profile);
  repository.replaceProjection({
    projectionKey: PRODUCTION_PROFILE_PROJECTION_KEY,
    projection: validated,
    contentHash: computePayloadHash(validated),
    updatedAt: validated.registeredAt,
  });
}

export function replayV5ProductionProfile(
  repository: V5CanonAdmissionRepository
): SevenMinutesAheadProductionProfile | null {
  const stored = repository.getProjection(PRODUCTION_PROFILE_PROJECTION_KEY);
  if (!stored) {
    return null;
  }
  return validateSevenMinutesAheadProductionProfile(stored.projection);
}
