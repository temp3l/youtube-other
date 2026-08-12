import type { NormalizedCrop } from "@mediaforge/domain";
import {
  blockingOverlayRegionsForElement,
  resolvePlatformSafeZoneProfile,
  type SafeZoneElementKind,
  type VerticalPublicationTarget,
} from "@mediaforge/domain";
import { rectangleIntersectionArea, rectanglesOverlap } from "./crop-overlap.js";

export type SafeZoneLayoutElement = {
  readonly id: string;
  readonly kind: SafeZoneElementKind;
  readonly bounds: NormalizedCrop;
};

export type SafeZoneLayoutIssue = {
  readonly code:
    | "SAFE_ZONE_CONTENT_OVERFLOW"
    | "SAFE_ZONE_PLATFORM_COLLISION"
    | "SAFE_ZONE_CRITICAL_REVEAL_BLOCKED";
  readonly severity: "error";
  readonly elementId: string;
  readonly elementKind: SafeZoneElementKind;
  readonly target: VerticalPublicationTarget;
  readonly regionId?: string;
  readonly intersectionArea: number;
  readonly repairSuggestion: Readonly<{
    readonly action: "move-element" | "shrink-element" | "split-subtitles";
    readonly target: string;
  }>;
};

export type SafeZoneLayoutValidationResult = {
  readonly target: VerticalPublicationTarget;
  readonly issues: readonly SafeZoneLayoutIssue[];
};

export type ValidateSafeZoneLayoutInput = {
  readonly target: VerticalPublicationTarget;
  readonly elements: readonly SafeZoneLayoutElement[];
};

function rectangleArea(bounds: NormalizedCrop): number {
  return Math.max(0, bounds.width) * Math.max(0, bounds.height);
}

function isInsideContentSafe(
  bounds: NormalizedCrop,
  contentSafeArea: NormalizedCrop,
): boolean {
  return (
    bounds.x >= contentSafeArea.x &&
    bounds.y >= contentSafeArea.y &&
    bounds.x + bounds.width <= contentSafeArea.x + contentSafeArea.width &&
    bounds.y + bounds.height <= contentSafeArea.y + contentSafeArea.height
  );
}

export function validateSafeZoneLayout(
  input: ValidateSafeZoneLayoutInput,
): SafeZoneLayoutValidationResult {
  const profile = resolvePlatformSafeZoneProfile(input.target);
  const issues: SafeZoneLayoutIssue[] = [];

  for (const element of input.elements) {
    if (!isInsideContentSafe(element.bounds, profile.contentSafeArea)) {
      issues.push({
        code: "SAFE_ZONE_CONTENT_OVERFLOW",
        severity: "error",
        elementId: element.id,
        elementKind: element.kind,
        target: input.target,
        intersectionArea: rectangleArea(element.bounds),
        repairSuggestion: {
          action: "move-element",
          target: element.id,
        },
      });
    }

    for (const overlay of blockingOverlayRegionsForElement(profile, element.kind)) {
      if (!rectanglesOverlap(element.bounds, overlay.bounds)) {
        continue;
      }
      issues.push({
        code:
          element.kind === "critical-reveals"
            ? "SAFE_ZONE_CRITICAL_REVEAL_BLOCKED"
            : "SAFE_ZONE_PLATFORM_COLLISION",
        severity: "error",
        elementId: element.id,
        elementKind: element.kind,
        target: input.target,
        regionId: overlay.id,
        intersectionArea: rectangleIntersectionArea(element.bounds, overlay.bounds),
        repairSuggestion: {
          action: element.kind === "subtitles" ? "split-subtitles" : "move-element",
          target: element.id,
        },
      });
    }
  }

  return {
    target: input.target,
    issues: issues.sort((left, right) => left.elementId.localeCompare(right.elementId)),
  };
}

export function fixtureSafeZoneLayout(
  target: VerticalPublicationTarget,
): SafeZoneLayoutValidationResult {
  return validateSafeZoneLayout({
    target,
    elements: [
      {
        id: "signal-ui.phone-screen",
        kind: "ui",
        bounds: { x: 0.18, y: 0.16, width: 0.64, height: 0.58 },
      },
      {
        id: "subtitle.segment-001",
        kind: "subtitles",
        bounds: { x: 0.12, y: 0.58, width: 0.7, height: 0.1 },
      },
      {
        id: "face.maya-primary",
        kind: "faces",
        bounds: { x: 0.34, y: 0.24, width: 0.32, height: 0.18 },
      },
      {
        id: "reveal.countdown-digits",
        kind: "critical-reveals",
        bounds: { x: 0.38, y: 0.34, width: 0.24, height: 0.08 },
      },
    ],
  });
}
