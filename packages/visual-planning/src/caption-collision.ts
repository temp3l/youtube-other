import type {
  CaptionAnchor,
  CaptionPlan,
  CaptionPlanSegment,
  EvidenceInsert,
  FocalRegion,
  RenderShot,
  ShotPlan,
} from "@mediaforge/domain";
import {
  rectangleIntersectionArea,
  rectanglesOverlap,
  type NormalizedRectangle,
} from "./crop-overlap.js";

export interface CaptionProtectedRegion {
  readonly id: string;
  readonly bounds: NormalizedRectangle;
  readonly kind:
    | "face"
    | "primary-subject"
    | "evidence-object"
    | "evidence-insert"
    | "branding"
    | "platform-ui";
}

export interface CaptionCollision {
  readonly captionId: string;
  readonly protectedRegionId: string;
  readonly protectedRegionKind: CaptionProtectedRegion["kind"];
  readonly intersectionArea: number;
  readonly intersectionOverCaptionArea: number;
  readonly intersectionOverRegionArea: number;
}

export interface CaptionCollisionIssue {
  readonly code: "CAPTION_VISUAL_COLLISION";
  readonly severity: "error";
  readonly captionId: string;
  readonly shotIds: readonly string[];
  readonly collisions: readonly CaptionCollision[];
  readonly repairSuggestion: Readonly<{
    readonly action: "move-caption-or-split-phrase";
    readonly target: string;
  }>;
}

export interface CaptionPlacementResult {
  readonly captionPlan: CaptionPlan;
  readonly issues: readonly CaptionCollisionIssue[];
}

export interface ResolveCaptionPlacementInput {
  readonly captionPlan: CaptionPlan;
  readonly shotPlan?: ShotPlan;
  readonly evidenceInserts?: readonly EvidenceInsert[];
  readonly brandingSafeAreas?: readonly NormalizedRectangle[];
  readonly platformSafeAreas?: readonly NormalizedRectangle[];
  readonly safetyPadding?: number;
  readonly collisionThreshold?: number;
}

interface CandidatePlacement {
  readonly anchor: CaptionAnchor;
  readonly bounds: NormalizedRectangle;
}

const defaultCollisionThreshold = 0;
const defaultSafetyPadding = 0.015;
const candidatePlacements: readonly CandidatePlacement[] = [
  {
    anchor: "lower-middle",
    bounds: { x: 0.12, y: 0.68, width: 0.76, height: 0.16 },
  },
  {
    anchor: "center-lower",
    bounds: { x: 0.12, y: 0.54, width: 0.76, height: 0.16 },
  },
  {
    anchor: "upper-middle",
    bounds: { x: 0.12, y: 0.12, width: 0.76, height: 0.16 },
  },
  {
    anchor: "safe-left",
    bounds: { x: 0.04, y: 0.42, width: 0.46, height: 0.16 },
  },
  {
    anchor: "safe-right",
    bounds: { x: 0.5, y: 0.42, width: 0.46, height: 0.16 },
  },
];

export function resolveCaptionPlacements(
  input: ResolveCaptionPlacementInput,
): CaptionPlacementResult {
  const safetyPadding = input.safetyPadding ?? defaultSafetyPadding;
  const collisionThreshold = input.collisionThreshold ?? defaultCollisionThreshold;
  const issues: CaptionCollisionIssue[] = [];
  const placedSegments = input.captionPlan.segments.map((segment, index) => {
    const previous = index > 0 ? input.captionPlan.segments[index - 1] : undefined;
    const protectedRegions = collectProtectedRegionsForCaption({
      segment,
      ...(input.shotPlan === undefined ? {} : { shotPlan: input.shotPlan }),
      ...(input.evidenceInserts === undefined
        ? {}
        : { evidenceInserts: input.evidenceInserts }),
      brandingSafeAreas: input.brandingSafeAreas ?? input.captionPlan.brandingSafeAreas,
      platformSafeAreas: input.platformSafeAreas ?? input.captionPlan.platformSafeAreas,
    });
    const placement = choosePlacement({
      protectedRegions,
      preferredAnchor: previous?.anchor,
      safetyPadding,
      collisionThreshold,
    });
    const chosenBounds = placement?.bounds ?? segment.layoutRegion;
    const shotIds = shotIdsForSegment(segment, input.shotPlan);
    const collisions = captionCollisions({
      captionId: segment.id,
      captionBounds: chosenBounds,
      protectedRegions,
      safetyPadding,
      collisionThreshold,
    });
    if (placement === undefined || collisions.length > 0) {
      issues.push({
        code: "CAPTION_VISUAL_COLLISION",
        severity: "error",
        captionId: segment.id,
        shotIds,
        collisions,
        repairSuggestion: {
          action: "move-caption-or-split-phrase",
          target: segment.id,
        },
      });
    }
    return {
      ...segment,
      layoutRegion: chosenBounds,
      anchor: placement?.anchor ?? segment.anchor,
      shotIds,
      collision:
        collisions.length === 0
          ? { status: placement === undefined ? "unresolved" : "resolved" }
          : { status: "unresolved", reason: "protected-region-overlap" },
    } satisfies CaptionPlanSegment;
  });

  return {
    captionPlan: {
      ...input.captionPlan,
      segments: placedSegments,
    },
    issues,
  };
}

export function captionCollisions(args: {
  readonly captionId: string;
  readonly captionBounds: NormalizedRectangle;
  readonly protectedRegions: readonly CaptionProtectedRegion[];
  readonly safetyPadding?: number;
  readonly collisionThreshold?: number;
}): readonly CaptionCollision[] {
  const safetyPadding = args.safetyPadding ?? defaultSafetyPadding;
  const threshold = args.collisionThreshold ?? defaultCollisionThreshold;
  const paddedCaption = padRectangle(args.captionBounds, safetyPadding);
  const captionArea = rectangleArea(paddedCaption);
  return [...args.protectedRegions]
    .sort((left, right) => left.id.localeCompare(right.id))
    .flatMap((region) => {
      if (!rectanglesOverlap(paddedCaption, region.bounds)) {
        return [];
      }
      const intersectionArea = rectangleIntersectionArea(paddedCaption, region.bounds);
      const regionArea = rectangleArea(region.bounds);
      const collision: CaptionCollision = {
        captionId: args.captionId,
        protectedRegionId: region.id,
        protectedRegionKind: region.kind,
        intersectionArea,
        intersectionOverCaptionArea:
          captionArea === 0 ? 0 : intersectionArea / captionArea,
        intersectionOverRegionArea:
          regionArea === 0 ? 0 : intersectionArea / regionArea,
      };
      return collision.intersectionOverCaptionArea > threshold ? [collision] : [];
    });
}

export function collectProtectedRegionsForCaption(args: {
  readonly segment: CaptionPlanSegment;
  readonly shotPlan?: ShotPlan;
  readonly evidenceInserts?: readonly EvidenceInsert[];
  readonly brandingSafeAreas?: readonly NormalizedRectangle[];
  readonly platformSafeAreas?: readonly NormalizedRectangle[];
}): readonly CaptionProtectedRegion[] {
  const regions: CaptionProtectedRegion[] = [];
  for (const shot of shotsForCaption(args.segment, args.shotPlan)) {
    for (const region of focalRegionsForShot(shot, args.shotPlan)) {
      const kind = protectedKind(region);
      if (kind !== undefined) {
        regions.push({ id: region.id, bounds: region.bounds, kind });
      }
    }
  }
  for (const insert of args.evidenceInserts ?? []) {
    if (insertAppliesToCaption(insert, args.segment)) {
      regions.push({
        id: insert.id,
        bounds: insert.layout.captionSafeExclusion ?? insert.layout.bounds,
        kind: "evidence-insert",
      });
      for (const [index, subregion] of insert.layout.protectedSubregions.entries()) {
        regions.push({
          id: `${insert.id}-protected-${String(index + 1).padStart(2, "0")}`,
          bounds: subregion,
          kind: "evidence-insert",
        });
      }
    }
  }
  for (const [index, bounds] of (args.brandingSafeAreas ?? []).entries()) {
    regions.push({
      id: `branding-safe-area-${String(index + 1).padStart(2, "0")}`,
      bounds,
      kind: "branding",
    });
  }
  for (const [index, bounds] of (args.platformSafeAreas ?? []).entries()) {
    regions.push({
      id: `platform-safe-area-${String(index + 1).padStart(2, "0")}`,
      bounds,
      kind: "platform-ui",
    });
  }
  return regions.sort((left, right) => left.id.localeCompare(right.id));
}

function choosePlacement(args: {
  readonly protectedRegions: readonly CaptionProtectedRegion[];
  readonly preferredAnchor?: CaptionAnchor | undefined;
  readonly safetyPadding: number;
  readonly collisionThreshold: number;
}): CandidatePlacement | undefined {
  const ordered = [...candidatePlacements].sort((left, right) => {
    if (args.preferredAnchor !== undefined) {
      if (left.anchor === args.preferredAnchor) {
        return -1;
      }
      if (right.anchor === args.preferredAnchor) {
        return 1;
      }
    }
    return 0;
  });
  let best:
    | Readonly<{
        placement: CandidatePlacement;
        score: number;
      }>
    | undefined;
  for (const placement of ordered) {
    const collisions = captionCollisions({
      captionId: "candidate",
      captionBounds: placement.bounds,
      protectedRegions: args.protectedRegions,
      safetyPadding: args.safetyPadding,
      collisionThreshold: args.collisionThreshold,
    });
    const score = collisions.reduce(
      (sum, collision) => sum + collision.intersectionOverCaptionArea,
      0,
    );
    if (score === 0) {
      return placement;
    }
    if (best === undefined || score < best.score) {
      best = { placement, score };
    }
  }
  return undefined;
}

function shotsForCaption(
  segment: CaptionPlanSegment,
  shotPlan: ShotPlan | undefined,
): readonly RenderShot[] {
  if (shotPlan === undefined) {
    return [];
  }
  return shotPlan.shots.filter(
    (shot) => segment.startMs < shot.endMs && segment.endMs > shot.startMs,
  );
}

function shotIdsForSegment(
  segment: CaptionPlanSegment,
  shotPlan: ShotPlan | undefined,
): CaptionPlanSegment["shotIds"] {
  return shotsForCaption(segment, shotPlan)
    .map((shot) => shot.shotId)
    .sort();
}

function focalRegionsForShot(
  shot: RenderShot,
  shotPlan: ShotPlan | undefined,
): readonly FocalRegion[] {
  const sourceScene = shotPlan?.sourceScenes.find(
    (scene) => scene.sourceSceneId === shot.sourceSceneId,
  );
  return [...(sourceScene?.focalRegions ?? [])].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
}

function protectedKind(
  region: FocalRegion,
): CaptionProtectedRegion["kind"] | undefined {
  if (region.kind === "face") {
    return "face";
  }
  if (region.kind === "primary-subject") {
    return "primary-subject";
  }
  if (region.kind === "evidence-object") {
    return "evidence-object";
  }
  return undefined;
}

function insertAppliesToCaption(
  insert: EvidenceInsert,
  segment: CaptionPlanSegment,
): boolean {
  const insertStartMs = insert.startMs ?? segment.startMs;
  const insertEndMs = insert.endMs ?? segment.endMs;
  return insertStartMs < segment.endMs && insertEndMs > segment.startMs;
}

function padRectangle(
  rectangle: NormalizedRectangle,
  padding: number,
): NormalizedRectangle {
  const x = Math.max(0, rectangle.x - padding);
  const y = Math.max(0, rectangle.y - padding);
  const right = Math.min(1, rectangle.x + rectangle.width + padding);
  const bottom = Math.min(1, rectangle.y + rectangle.height + padding);
  return {
    x,
    y,
    width: Math.max(0, right - x),
    height: Math.max(0, bottom - y),
  };
}

function rectangleArea(rectangle: NormalizedRectangle): number {
  return Math.max(0, rectangle.width) * Math.max(0, rectangle.height);
}
