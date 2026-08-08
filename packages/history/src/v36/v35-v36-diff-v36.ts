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
  readonly classification: "agree" | "v35-only" | "v36-only" | "semantic-conflict";
  readonly explanation: string;
}
