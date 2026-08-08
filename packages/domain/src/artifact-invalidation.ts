import {
  ARTIFACT_LINEAGE_SCHEMA_VERSION,
  type GateEvidenceUpdate,
  type InvalidationPreview,
  type ProductionUnitAddress,
  type ProductionUnitChange,
  type ProductionUnitSnapshot,
  compareProductionInputFingerprints,
  invalidationPreviewSchema,
  productionUnitAddressKey,
} from "./artifact-lineage-contracts.js";
import {
  isCohortInvalidatedProductionUnitKind,
  isIndependentlyAddressableProductionUnitKind,
  listDependentProductionUnitKinds,
} from "./production-unit-graph.js";

function indexSnapshots(
  units: readonly ProductionUnitSnapshot[]
): Map<string, ProductionUnitSnapshot> {
  const index = new Map<string, ProductionUnitSnapshot>();
  for (const unit of units) {
    index.set(productionUnitAddressKey(unit.address), unit);
  }
  return index;
}

function collectAddressesByKind(
  units: readonly ProductionUnitSnapshot[],
  kind: ProductionUnitSnapshot["address"]["kind"]
): readonly ProductionUnitAddress[] {
  return units
    .filter((unit) => unit.address.kind === kind)
    .map((unit) => unit.address);
}

function resolvePropagationTargets(
  source: ProductionUnitAddress,
  dependentKind: ProductionUnitSnapshot["address"]["kind"],
  units: readonly ProductionUnitSnapshot[]
): readonly ProductionUnitAddress[] {
  if (
    isCohortInvalidatedProductionUnitKind(dependentKind) &&
    source.kind === "visual_plan"
  ) {
    return collectAddressesByKind(units, dependentKind);
  }

  if (
    isIndependentlyAddressableProductionUnitKind(dependentKind) &&
    isIndependentlyAddressableProductionUnitKind(source.kind) &&
    source.unitKey
  ) {
    return [{ kind: dependentKind, unitKey: source.unitKey }];
  }

  if (isIndependentlyAddressableProductionUnitKind(dependentKind)) {
    return collectAddressesByKind(units, dependentKind);
  }

  return [{ kind: dependentKind }];
}

export function previewProductionUnitInvalidation(input: {
  readonly units: readonly ProductionUnitSnapshot[];
  readonly changes: readonly ProductionUnitChange[];
  readonly projectedAt: string;
}): InvalidationPreview {
  const index = indexSnapshots(input.units);
  const invalidated = new Map<string, InvalidationPreview["invalidatedUnits"][number]>();
  const queue: ProductionUnitAddress[] = [];

  for (const change of input.changes) {
    const key = productionUnitAddressKey(change.address);
    const current = index.get(key);
    const fingerprintChanged =
      !current ||
      !compareProductionInputFingerprints(
        current.inputFingerprint,
        change.nextInputFingerprint
      );
    const contentChanged =
      change.nextContentHash !== undefined &&
      current?.contentHash !== change.nextContentHash;

    if (!fingerprintChanged && !contentChanged) {
      continue;
    }

    invalidated.set(key, {
      address: change.address,
      previousStatus: current?.status ?? "missing",
      reason:
        change.reason ??
        (fingerprintChanged
          ? "input_fingerprint_changed"
          : "content_hash_changed"),
      preservedUpstream: false,
    });
    queue.push(change.address);
  }

  while (queue.length > 0) {
    const source = queue.shift();
    if (!source) continue;

    for (const dependentKind of listDependentProductionUnitKinds(source.kind)) {
      const targets = resolvePropagationTargets(
        source,
        dependentKind,
        input.units
      );
      for (const target of targets) {
        const targetKey = productionUnitAddressKey(target);
        if (invalidated.has(targetKey)) continue;
        const current = index.get(targetKey);
        invalidated.set(targetKey, {
          address: target,
          previousStatus: current?.status ?? "missing",
          reason: `invalidated_by_${source.kind}`,
          preservedUpstream: true,
        });
        queue.push(target);
      }
    }
  }

  const invalidatedUnits = [...invalidated.values()];
  const invalidatedKeys = new Set(invalidated.keys());
  const preservedUnits = input.units
    .filter(
      (unit) => !invalidatedKeys.has(productionUnitAddressKey(unit.address))
    )
    .map((unit) => unit.address);

  const regenerationTargets = invalidatedUnits
    .filter((unit) => unit.address.kind !== "review_readiness")
    .filter((unit) => unit.address.kind !== "publish_readiness")
    .map((unit) => unit.address);

  const staleReviewReadiness = invalidatedKeys.has(
    productionUnitAddressKey({ kind: "review_readiness" })
  );
  const stalePublishReadiness = invalidatedKeys.has(
    productionUnitAddressKey({ kind: "publish_readiness" })
  );

  return invalidationPreviewSchema.parse({
    schemaVersion: ARTIFACT_LINEAGE_SCHEMA_VERSION,
    changedAddresses: input.changes.map((change) => change.address),
    invalidatedUnits,
    preservedUnits,
    regenerationTargets,
    staleReviewReadiness,
    stalePublishReadiness,
    projectedAt: input.projectedAt,
  });
}

export function deriveGateEvidenceUpdates(
  preview: InvalidationPreview
): readonly GateEvidenceUpdate[] {
  const updates: GateEvidenceUpdate[] = [];
  const invalidatedKinds = new Set(
    preview.invalidatedUnits.map((unit) => unit.address.kind)
  );

  if (
    invalidatedKinds.has("render") ||
    invalidatedKinds.has("scene_visual") ||
    invalidatedKinds.has("map") ||
    invalidatedKinds.has("diagram") ||
    invalidatedKinds.has("tts") ||
    invalidatedKinds.has("subtitles")
  ) {
    updates.push({
      code: "render_stale",
      message: "Upstream media artifacts changed and render evidence is stale.",
      affectedUnitAddresses: preview.invalidatedUnits
        .filter((unit) =>
          ["render", "scene_visual", "map", "diagram", "tts", "subtitles"].includes(
            unit.address.kind
          )
        )
        .map((unit) => unit.address),
      contentHashes: [],
    });
  }

  if (preview.staleReviewReadiness) {
    updates.push({
      code: "approval_stale",
      message: "Review readiness must be re-evaluated after upstream evidence changed.",
      affectedUnitAddresses: [{ kind: "review_readiness" }],
      contentHashes: [],
    });
  }

  if (preview.stalePublishReadiness) {
    updates.push({
      code: "evidence_changed",
      message: "Publish readiness blocked until regenerated evidence is current.",
      affectedUnitAddresses: [{ kind: "publish_readiness" }],
      contentHashes: [],
    });
  }

  return updates;
}
