import type { ExplanatoryRelationV36 } from "./explanatory-relation-v36.js";

/** Shadow-only comparison envelope. V3.5 remains the production authority. */
export interface V35V36RelationDiffV36 {
  readonly episodeId: string;
  readonly claimIds: readonly string[];
  readonly v35?: {
    readonly geoFacts?: unknown;
    readonly diagrams?: unknown;
  };
  readonly v36Relations: readonly ExplanatoryRelationV36[];
  readonly classification:
    | "agree"
    | "v35-only"
    | "v36-only"
    | "semantic-conflict"
    | "unresolved-upstream-participant"
    | "taxonomy-extension-required"
    | "v36-fail-closed";
  readonly assessment:
    | "V3.5 likely correct"
    | "V3.6 likely correct"
    | "both plausible but semantically different"
    | "V3.6 fail-closed"
    | "needs review";
  readonly explanation: string;
}
