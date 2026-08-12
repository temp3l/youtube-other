import {
  type ResolvedVisualRegistryReference,
  type ShotVisualRegistryReference,
  type VisualAssetRegistryReadPort,
  type VisualContinuityResolution,
  type VisualRegistryBcp47Locale,
  type VisualRegistryLocaleVariantReason,
  validateShotVisualRegistryReference,
  visualContinuityResolutionSchema,
} from "@mediaforge/domain";

export type VisualContinuityResolutionIssueCode =
  | "revision_not_found"
  | "revision_not_approved"
  | "entry_mismatch"
  | "series_mismatch"
  | "locale_variant_missing_reason";

export type VisualContinuityResolutionIssue = {
  readonly code: VisualContinuityResolutionIssueCode;
  readonly message: string;
  readonly reference: ShotVisualRegistryReference;
};

export type ResolveShotVisualContinuityInput = {
  readonly seriesId: string;
  readonly locale?: VisualRegistryBcp47Locale;
  readonly references: readonly ShotVisualRegistryReference[];
  readonly registry: VisualAssetRegistryReadPort;
};

export type VisualContinuityResolutionResult =
  | { readonly ok: true; readonly resolution: VisualContinuityResolution }
  | {
      readonly ok: false;
      readonly issues: readonly VisualContinuityResolutionIssue[];
    };

const APPROVED_STATUSES = new Set(["ACCEPTED", "QA_APPROVED"]);

function resolveLocaleVariantReason(
  locale: VisualRegistryBcp47Locale | undefined,
  localeVariant: VisualRegistryLocaleVariantReason | undefined
): VisualRegistryLocaleVariantReason | undefined {
  if (!localeVariant) {
    return undefined;
  }
  if (!locale) {
    return localeVariant;
  }
  if (localeVariant.locale === locale) {
    return localeVariant;
  }
  return undefined;
}

export function resolveShotVisualContinuity(
  input: ResolveShotVisualContinuityInput
): VisualContinuityResolutionResult {
  const references = input.references.map((reference) =>
    validateShotVisualRegistryReference(reference)
  );
  const issues: VisualContinuityResolutionIssue[] = [];
  const resolvedReferences: ResolvedVisualRegistryReference[] = [];

  for (const reference of references) {
    const revision = input.registry.getRevision(reference.revisionId);
    if (!revision) {
      issues.push({
        code: "revision_not_found",
        message: `Registry revision not found: ${reference.revisionId}`,
        reference,
      });
      continue;
    }

    if (revision.seriesId !== input.seriesId) {
      issues.push({
        code: "series_mismatch",
        message: `Revision ${reference.revisionId} belongs to ${revision.seriesId}, not ${input.seriesId}`,
        reference,
      });
      continue;
    }

    if (
      revision.entryId !== reference.entryId ||
      revision.entryKind !== reference.entryKind
    ) {
      issues.push({
        code: "entry_mismatch",
        message: `Revision ${reference.revisionId} does not match ${reference.entryKind}:${reference.entryId}`,
        reference,
      });
      continue;
    }

    if (!APPROVED_STATUSES.has(revision.status)) {
      issues.push({
        code: "revision_not_approved",
        message: `Revision ${reference.revisionId} has status ${revision.status}`,
        reference,
      });
      continue;
    }

    if (revision.localeVariant && !revision.localeVariant.reason.trim()) {
      issues.push({
        code: "locale_variant_missing_reason",
        message: `Revision ${reference.revisionId} declares a locale variant without an explicit reason`,
        reference,
      });
      continue;
    }

    resolvedReferences.push({
      reference,
      revision,
      localeVariantReason: resolveLocaleVariantReason(
        input.locale,
        revision.localeVariant
      ),
    });
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    resolution: visualContinuityResolutionSchema.parse({
      seriesId: input.seriesId,
      locale: input.locale,
      resolvedReferences,
    }),
  };
}
