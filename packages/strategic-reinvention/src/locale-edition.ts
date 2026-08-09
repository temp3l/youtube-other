import {
  planVeronicaLocaleEdition,
  type LocaleEditionArtifact,
  type PlanLocaleEditionInput,
} from "@mediaforge/veronica-media";
import { loadStrategicReinventionProfile } from "./profile.js";

export interface PlanStrategicLocaleEditionInput extends Omit<
  PlanLocaleEditionInput,
  "contentProfileId" | "canonicalLocale"
> {}

/**
 * Binds shared locale editions to the reviewed Veronica policy. It is a pure
 * planning gate: unsupported locales are rejected before dispatch or mutation.
 */
export async function planStrategicLocaleEdition(
  input: PlanStrategicLocaleEditionInput,
): Promise<{ readonly edition: LocaleEditionArtifact; readonly reused: boolean }> {
  const profile = await loadStrategicReinventionProfile();
  if (!profile.effectivePolicy.supportedLocales.includes(input.locale)) {
    throw new Error("STRATEGIC_LOCALE_EDITION_UNSUPPORTED_LOCALE");
  }
  if (input.locale === profile.effectivePolicy.canonicalLocale) {
    throw new Error("STRATEGIC_LOCALE_EDITION_CANONICAL_LOCALE");
  }
  return planVeronicaLocaleEdition({
    ...input,
    canonicalLocale: profile.effectivePolicy.canonicalLocale,
  });
}
