import type { HistoryPlaceV34 } from "./history-v34-contracts.js";

const PLACE_CONTAINMENT: Readonly<Record<string, readonly string[]>> = {
  Smolensk: ["Russia", "Russian Empire"],
  Moscow: ["Russia", "Russian Empire"],
  Borodino: ["Russia", "Russian Empire"],
  "Berezina River": ["Russia", "Russian Empire"],
  Rome: ["Italy", "Europe"],
  Sicily: ["Italy"],
  Messina: ["Italy", "Sicily"],
  Genoa: ["Italy", "Europe"],
  Constantinople: ["Eastern Roman Empire", "Byzantine Empire", "Europe"],
};

const MACRO_PLACE_LABELS = new Set([
  "Russia",
  "Russian Empire",
  "Europe",
  "Italy",
  "Eastern Roman Empire",
  "Byzantine Empire",
]);

const NON_ROUTE_MOVEMENT_VERBS =
  /\b(?:captured|occupied|fought|besieged|defeated|held|took|seized)\b/iu;

export function placeIsContainedInV35(
  originLabel: string,
  destinationLabel: string
): boolean {
  const parents = PLACE_CONTAINMENT[originLabel];
  if (!parents) return false;
  const normalizedDestination = destinationLabel.trim();
  return parents.some(
    (parent) => parent.toLocaleLowerCase() === normalizedDestination.toLocaleLowerCase()
  );
}

export function isMacroCentroidPlace(label: string): boolean {
  return MACRO_PLACE_LABELS.has(label.trim());
}

export function claimHasExplicitRouteEndpoints(text: string): boolean {
  return /\bfrom\b.+\bto\b/iu.test(text);
}

export function claimUsesNonRouteMovementVerbOnly(text: string): boolean {
  return (
    NON_ROUTE_MOVEMENT_VERBS.test(text) &&
    !claimHasExplicitRouteEndpoints(text) &&
    !/\b(?:cross(?:ing|ed)|into|toward|towards|entered|reached|marched|advanced|retreat(?:ed|ing)?|sailed)\b/iu.test(
      text
    )
  );
}

export function validateMovementRouteSemanticsV35(input: {
  readonly claimText: string;
  readonly origin: HistoryPlaceV34 | null | undefined;
  readonly destination: HistoryPlaceV34 | null | undefined;
  readonly movingActor?: string | null;
}): readonly string[] {
  const blockers: string[] = [];
  const origin = input.origin;
  const destination = input.destination;
  if (!origin || !destination) return blockers;
  if (origin.id === destination.id) return blockers;

  if (placeIsContainedInV35(origin.label, destination.label)) {
    blockers.push("MAP_ROUTE_SEMANTIC_CONTAINMENT_CONFLICT");
  }

  const destinationPlace = destination.label;
  if (
    isMacroCentroidPlace(destinationPlace) &&
    (/\b(?:cross(?:ing|ed)|into)\b/iu.test(input.claimText) ||
      (!claimHasExplicitRouteEndpoints(input.claimText) &&
        !/\b(?:marched|advanced|retreat(?:ed|ing)?|sailed|departed|from)\b/iu.test(
          input.claimText
        )))
  ) {
    blockers.push("MAP_ROUTE_MACRO_CENTROID_DESTINATION");
  }

  if (claimUsesNonRouteMovementVerbOnly(input.claimText)) {
    blockers.push("MAP_ROUTE_MOVEMENT_PREDICATE_MISMATCH");
  }

  if (
    input.movingActor &&
    /\bnapoleon\b/iu.test(input.movingActor) &&
    /\b(?:russian army|army escaped|withdrew|retreat(?:ed|ing)?)\b/iu.test(input.claimText) &&
    !/\bnapoleon\b.+\b(?:marched|advanced|crossed|entered|reached|retreat(?:ed|ing)?)\b/iu.test(
      input.claimText
    )
  ) {
    blockers.push("MAP_ROUTE_ACTOR_MISMATCH");
  }

  return blockers;
}
