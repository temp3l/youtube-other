import { type MathProductionStatus } from "../domain/index.js";

const priority: readonly MathProductionStatus[] = [
  "MATHEMATICAL_ERROR",
  "CURRICULUM_ERROR",
  "LOCALIZATION_ERROR",
  "TIMING_ERROR",
  "RENDER_BLOCKED",
  "PUBLISH_BLOCKED",
  "REVISION_REQUIRED",
  "READY_WITH_MINOR_EDITS",
  "READY",
];
export interface MathQualityCheck {
  checkId: string;
  status: MathProductionStatus;
  passed: boolean;
  message: string;
}
export interface MathQualityReport {
  artifactVersion: "math-quality.v1";
  status: MathProductionStatus;
  publishable: boolean;
  checks: readonly MathQualityCheck[];
}

export function deriveMathQuality(
  checks: readonly MathQualityCheck[],
  approvedMinorEdits = false
): MathQualityReport {
  const failed = checks
    .filter((check) => !check.passed)
    .map((check) => check.status);
  const status =
    priority.find((candidate) => failed.includes(candidate)) ?? "READY";
  return {
    artifactVersion: "math-quality.v1",
    status,
    publishable:
      status === "READY" ||
      (status === "READY_WITH_MINOR_EDITS" && approvedMinorEdits),
    checks,
  };
}

export function assertRenderAllowed(report: MathQualityReport): void {
  if (report.status === "MATHEMATICAL_ERROR")
    throw new Error("Rendering is blocked by MATHEMATICAL_ERROR.");
}

export function assertPublishAllowed(
  report: MathQualityReport,
  publishingEnabled: boolean,
  explicitPublish: boolean
): void {
  if (!publishingEnabled || !explicitPublish || !report.publishable)
    throw new Error(`Publishing blocked: ${report.status}.`);
}
