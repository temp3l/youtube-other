export type ShadowPresenceClassificationV36 =
  | "agree"
  | "v35-only"
  | "v36-only"
  | "semantic-conflict"
  | "unresolved-upstream-participant"
  | "taxonomy-extension-required"
  | "fail-closed";

export type ShadowSemanticAssessmentV36 =
  | "supported-by-current-claims"
  | "unsupported-by-current-claims"
  | "partially-supported"
  | "cannot-assess-deterministically"
  | "needs-manual-review";

/** Presence and semantic support are intentionally independent axes. */
export function assessShadowDifferentialV36(input: {
  readonly presenceClassification: ShadowPresenceClassificationV36;
  readonly exactClaimSupport: boolean;
  readonly canonicalMapping: "equivalent" | "non-equivalent" | "ambiguous" | "absent";
}): ShadowSemanticAssessmentV36 {
  if (input.presenceClassification === "fail-closed" || input.presenceClassification === "unresolved-upstream-participant" || input.presenceClassification === "taxonomy-extension-required") return "cannot-assess-deterministically";
  if (input.canonicalMapping === "ambiguous" || input.canonicalMapping === "non-equivalent") return "needs-manual-review";
  if (input.exactClaimSupport) return "supported-by-current-claims";
  if (input.presenceClassification === "v35-only") return "unsupported-by-current-claims";
  return "cannot-assess-deterministically";
}
