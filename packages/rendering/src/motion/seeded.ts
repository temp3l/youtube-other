import { hashText } from "@mediaforge/shared";

const motionSeedNamespace = "render-motion-selection-v1";

export function stableUnit(seed: string): number {
  const hex = hashText(`${motionSeedNamespace}\u0000${seed}`).slice(0, 12);
  return Number.parseInt(hex, 16) / 0xffffffffffff;
}

export function stableSignedUnit(seed: string): number {
  return stableUnit(seed) * 2 - 1;
}

export function weightedChoice<T>(
  values: readonly {
    readonly value: T;
    readonly weight: number;
  }[],
  seed: string
): T {
  const eligible = values.filter(
    (item) => Number.isFinite(item.weight) && item.weight > 0
  );
  if (eligible.length === 0) {
    throw new Error("Cannot choose from an empty weighted set.");
  }
  const totalWeight = eligible.reduce((sum, item) => sum + item.weight, 0);
  const target = stableUnit(seed) * totalWeight;
  let cursor = 0;
  for (const item of eligible) {
    cursor += item.weight;
    if (target <= cursor) {
      return item.value;
    }
  }
  return eligible[eligible.length - 1]?.value as T;
}
