import { loadStrategicReinventionProfile } from "./profile.js";
import {
  buildStrategicMultilingualPackage,
  type StrategicMultilingualPackage,
} from "./multilingual-package.js";
import { strategicPublicationBlockedByCapability } from "@mediaforge/youtube-upload/multilingual-audio-capability";

export interface StrategicPublishDryRunInput {
  readonly workspaceRoot: string;
  readonly episodeId: string;
  readonly locale?: "it" | "en" | "es";
  readonly variant?: "full" | "short";
}

export interface StrategicPublishDryRunResult {
  readonly status: "dry-run-blocked";
  readonly package: StrategicMultilingualPackage;
  readonly blockers: readonly string[];
  readonly providerMutations: 0;
}

export async function runStrategicPublishDryRun(
  input: StrategicPublishDryRunInput,
): Promise<StrategicPublishDryRunResult> {
  const profile = await loadStrategicReinventionProfile();
  const blockers: string[] = [];
  if (profile.productionReadiness.status === "PRODUCTION_BLOCKED") {
    blockers.push(...profile.productionReadiness.blockers);
  }
  if (profile.creatorProfile.autoPublish) {
    blockers.push("STRATEGIC_AUTO_PUBLISH_FORBIDDEN");
  }

  const pkg = await buildStrategicMultilingualPackage({
    workspaceRoot: input.workspaceRoot,
    episodeId: input.episodeId,
    locale: input.locale ?? "it",
    variant: input.variant ?? "full",
    localizedLocales: ["en", "es"],
    cta: {
      campaignId: "fixture-campaign",
      destination: "https://example.com/cta",
      localizedDestinations: {
        en: "https://example.com/cta-en",
        es: "https://example.com/cta-es",
      },
    },
  });
  blockers.push(...strategicPublicationBlockedByCapability(pkg.capabilityReport));

  return {
    status: "dry-run-blocked",
    package: pkg,
    blockers,
    providerMutations: 0,
  };
}
