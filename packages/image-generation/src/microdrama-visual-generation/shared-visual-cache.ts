import type { MicrodramaVisualGenerationEffect } from "./contracts.js";

export type SharedVisualCacheEntry = {
  readonly cacheKey: string;
  readonly dependencies: readonly {
    readonly kind: string;
    readonly id: string;
    readonly fingerprint: string;
  }[];
  readonly effect: MicrodramaVisualGenerationEffect;
};

export type SharedVisualCacheLookup =
  | { readonly status: "hit"; readonly entry: SharedVisualCacheEntry }
  | { readonly status: "miss" }
  | { readonly status: "invalidated"; readonly reasons: readonly string[] };

export class InMemorySharedVisualCache {
  private readonly entries = new Map<string, SharedVisualCacheEntry>();
  private readonly invalidated = new Map<string, readonly string[]>();

  public get(cacheKey: string): SharedVisualCacheLookup {
    const reasons = this.invalidated.get(cacheKey);
    if (reasons) {
      return { status: "invalidated", reasons };
    }
    const entry = this.entries.get(cacheKey);
    if (!entry) {
      return { status: "miss" };
    }
    return { status: "hit", entry };
  }

  public put(entry: SharedVisualCacheEntry): void {
    this.invalidated.delete(entry.cacheKey);
    this.entries.set(entry.cacheKey, entry);
  }

  public invalidateByDependencyChanges(input: {
    readonly changes: readonly {
      readonly kind: string;
      readonly id: string;
      readonly fingerprint: string;
    }[];
  }): readonly { readonly cacheKey: string; readonly reasons: readonly string[] }[] {
    const changeMap = new Map(
      input.changes.map((change) => [`${change.kind}:${change.id}`, change])
    );
    const invalidated: Array<{ cacheKey: string; reasons: string[] }> = [];

    for (const entry of this.entries.values()) {
      const reasons = entry.dependencies
        .filter((dependency) => {
          const change = changeMap.get(`${dependency.kind}:${dependency.id}`);
          return (
            change !== undefined && change.fingerprint !== dependency.fingerprint
          );
        })
        .map((dependency) => `dependency-changed:${dependency.kind}:${dependency.id}`)
        .sort();
      if (reasons.length === 0) {
        continue;
      }
      this.invalidated.set(entry.cacheKey, reasons);
      this.entries.delete(entry.cacheKey);
      invalidated.push({ cacheKey: entry.cacheKey, reasons });
    }

    return invalidated.sort((left, right) =>
      left.cacheKey.localeCompare(right.cacheKey)
    );
  }
}
