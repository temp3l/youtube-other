import path from "node:path";
import { hashText, writeJsonAtomic, writeTextAtomic } from "@mediaforge/shared";
import {
  NARRATION_ARTIFACT_SCHEMA_VERSION,
  narrationAssemblyManifestSchema,
  narrationChunkManifestSchema,
  narrationChunkValidationReportSchema,
  narrationGenerationMetadataSchema,
  narrationMasteringMetadataSchema,
  narrationQualityGateReportSchema,
  type NarrationAssemblyManifest,
  type NarrationChunkManifest,
  type NarrationChunkValidationReport,
  type NarrationGenerationMetadata,
  type NarrationMasteringMetadata,
  type NarrationQualityGateReport,
  type NarrationQualityOutcome,
} from "./narration-schemas.js";

export interface NarrationQualityGateRequest {
  readonly chunkManifest: NarrationChunkManifest;
  readonly validationReports: readonly NarrationChunkValidationReport[];
  readonly assemblyManifest?: NarrationAssemblyManifest | undefined;
  readonly masteringMetadata?: NarrationMasteringMetadata | undefined;
  readonly generationMetadata?: NarrationGenerationMetadata | undefined;
  readonly cleanNarrationPath: string;
  readonly masteredNarrationPath?: string | undefined;
  readonly reportJsonPath: string;
  readonly reportMarkdownPath: string;
  readonly narrationRoot: string;
  readonly compatibilityOutputStatus: "not_written" | "written" | "failed" | "skipped";
  readonly fallbackUsed?: boolean;
  readonly fallbackReasons?: readonly string[];
  readonly createdAt?: string;
  readonly logger?: {
    info(value: Record<string, unknown>, message?: string): void;
  };
}

type CheckStatus = "passed" | "warning" | "failed" | "skipped";
type CheckSeverity = "error" | "warning" | "info";

interface QualityCheck {
  readonly code: string;
  readonly status: CheckStatus;
  readonly severity: CheckSeverity;
  readonly message: string;
  readonly chunkId?: string;
}

function relative(root: string, target: string): string {
  return path.relative(root, target).replace(/\\/gu, "/");
}

function check(input: QualityCheck): QualityCheck {
  return input;
}

function outcomeFor(checks: readonly QualityCheck[], fallbackUsed: boolean): NarrationQualityOutcome {
  const errors = checks.filter((item) => item.severity === "error");
  if (errors.some((item) => item.code === "ASSEMBLY_MISSING" || item.code === "CHUNK_MISSING" || item.code === "CHUNK_ORDER_INVALID")) {
    return "BLOCKED";
  }
  if (errors.length > 0) {
    return "REGENERATION_RECOMMENDED";
  }
  if (fallbackUsed || checks.some((item) => item.severity === "warning")) {
    return "READY_WITH_WARNINGS";
  }
  return "READY";
}

function markdownReport(report: NarrationQualityGateReport): string {
  const lines = [
    `# Narration Quality Gate`,
    "",
    `Outcome: ${report.outcome}`,
    `Warnings: ${report.warningCount}`,
    `Errors: ${report.errorCount}`,
    `Fallback used: ${report.fallbackSummary.used ? "yes" : "no"}`,
    `Compatibility output: ${report.compatibilityOutputStatus}`,
    "",
    "## Checks",
    "",
    "| Code | Status | Severity | Message |",
    "| --- | --- | --- | --- |",
    ...report.checks.map((item) => `| ${item.code} | ${item.status} | ${item.severity} | ${item.message.replace(/\|/gu, "\\|")} |`),
    "",
  ];
  return lines.join("\n");
}

export async function runNarrationQualityGate(request: NarrationQualityGateRequest): Promise<NarrationQualityGateReport> {
  const checks: QualityCheck[] = [];
  const manifest = narrationChunkManifestSchema.parse(request.chunkManifest);
  const validations = request.validationReports.map((report) => narrationChunkValidationReportSchema.parse(report));
  const assembly = request.assemblyManifest ? narrationAssemblyManifestSchema.parse(request.assemblyManifest) : undefined;
  const mastering = request.masteringMetadata ? narrationMasteringMetadataSchema.parse(request.masteringMetadata) : undefined;
  const generation = request.generationMetadata ? narrationGenerationMetadataSchema.parse(request.generationMetadata) : undefined;
  const validationById = new Map(validations.map((report) => [report.chunkId, report] as const));
  const manifestIds = manifest.chunks.map((chunk) => chunk.chunkId);
  const validationIds = validations.map((report) => report.chunkId);
  if (new Set(validationIds).size !== validationIds.length) {
    checks.push(check({ code: "VALIDATION_DUPLICATE", status: "failed", severity: "error", message: "Duplicate chunk validation reports are present." }));
  }
  for (const chunk of manifest.chunks) {
    const validation = validationById.get(chunk.chunkId);
    if (!validation) {
      checks.push(check({ code: "CHUNK_MISSING", status: "failed", severity: "error", message: "Required chunk validation report is missing.", chunkId: chunk.chunkId }));
      continue;
    }
    if (validation.validationStatus === "failed") {
      checks.push(check({ code: "VALIDATION_FAILED", status: "failed", severity: "error", message: "Chunk validation failed.", chunkId: chunk.chunkId }));
    } else if (validation.validationStatus === "warning") {
      checks.push(check({ code: "VALIDATION_WARNING", status: "warning", severity: "warning", message: "Chunk validation completed with warnings.", chunkId: chunk.chunkId }));
    }
    if (validation.metrics.truePeakDb !== undefined && validation.metrics.truePeakDb > -0.5) {
      checks.push(check({ code: "LOUDNESS_TRUE_PEAK_HIGH", status: "warning", severity: "warning", message: "Chunk true peak is close to clipping.", chunkId: chunk.chunkId }));
    }
  }
  for (const validationId of validationIds) {
    if (!manifestIds.includes(validationId)) {
      checks.push(check({ code: "VALIDATION_UNEXPECTED", status: "warning", severity: "warning", message: "Validation report is not referenced by the chunk manifest.", chunkId: validationId }));
    }
  }
  if (manifest.chunks.some((chunk, index) => chunk.sequence !== index)) {
    checks.push(check({ code: "CHUNK_ORDER_INVALID", status: "failed", severity: "error", message: "Chunk manifest is not in contiguous explicit sequence order." }));
  }
  if (!assembly) {
    checks.push(check({ code: "ASSEMBLY_MISSING", status: "failed", severity: "error", message: "Assembly manifest is missing." }));
  } else {
    if (assembly.chunkManifestFingerprint !== manifest.manifestFingerprint) {
      checks.push(check({ code: "ASSEMBLY_FINGERPRINT_MISMATCH", status: "failed", severity: "error", message: "Assembly manifest was built from a different chunk manifest." }));
    }
    if (assembly.entries.map((entry) => entry.chunkId).join("|") !== manifestIds.join("|")) {
      checks.push(check({ code: "CHUNK_ORDER_INVALID", status: "failed", severity: "error", message: "Assembly entry order does not match chunk manifest order." }));
    }
  }
  if (!mastering) {
    checks.push(check({ code: "MASTERING_SKIPPED", status: "skipped", severity: "info", message: "No mastering metadata was supplied." }));
  } else if (mastering.status === "failed") {
    checks.push(check({ code: "MASTERING_FAILED", status: "warning", severity: "warning", message: "Mastering failed; clean narration remains the usable artifact." }));
  } else if (mastering.measuredLoudnessLufs !== undefined && Math.abs(mastering.measuredLoudnessLufs - mastering.targetLoudnessLufs) > 2) {
    checks.push(check({ code: "LOUDNESS_TARGET_MISS", status: "warning", severity: "warning", message: "Measured loudness is outside the preferred target window." }));
  }
  if (generation?.fallbackUsage.used || request.fallbackUsed) {
    checks.push(check({ code: "FALLBACK_USED", status: "warning", severity: "warning", message: "Narration generation used fallback behavior." }));
  }
  if (request.compatibilityOutputStatus !== "written") {
    checks.push(check({ code: "COMPATIBILITY_OUTPUT_NOT_WRITTEN", status: "warning", severity: "warning", message: "Compatibility narration output is not available as a written artifact." }));
  }
  const fallbackReasons = [
    ...(request.fallbackReasons ?? []),
    ...(generation?.fallbackUsage.reasons ?? []),
  ];
  const fallbackUsed = Boolean(request.fallbackUsed || generation?.fallbackUsage.used);
  const artifactFingerprints = [
    manifest.manifestFingerprint,
    ...(assembly ? [assembly.assemblyFingerprint] : []),
    ...(mastering ? [mastering.masteringConfigurationFingerprint] : []),
    ...(generation?.artifactFingerprints.map((artifact) => artifact.fingerprint) ?? []),
  ];
  const outcome = outcomeFor(checks, fallbackUsed);
  const reportWithoutFingerprint = {
    schemaVersion: NARRATION_ARTIFACT_SCHEMA_VERSION,
    episodeId: manifest.episodeId,
    locale: manifest.locale,
    variant: manifest.variant,
    outcome,
    inputArtifactFingerprints: artifactFingerprints.length > 0 ? artifactFingerprints : [hashText("missing-input-fingerprint")],
    checks,
    warningCount: checks.filter((item) => item.severity === "warning").length,
    errorCount: checks.filter((item) => item.severity === "error").length,
    fallbackSummary: {
      used: fallbackUsed,
      count: fallbackUsed ? Math.max(1, fallbackReasons.length) : 0,
      reasons: fallbackReasons,
    },
    compatibilityOutputStatus: request.compatibilityOutputStatus,
    cleanNarrationPath: relative(request.narrationRoot, request.cleanNarrationPath),
    ...(request.masteredNarrationPath ? { masteredNarrationPath: relative(request.narrationRoot, request.masteredNarrationPath) } : {}),
    reportFingerprint: hashText("pending"),
    createdAt: request.createdAt ?? new Date().toISOString(),
  };
  const report = narrationQualityGateReportSchema.parse({
    ...reportWithoutFingerprint,
    reportFingerprint: hashText(JSON.stringify(reportWithoutFingerprint)),
  });
  await writeJsonAtomic(request.reportJsonPath, report);
  await writeTextAtomic(request.reportMarkdownPath, markdownReport(report));
  request.logger?.info(
    {
      outcome: report.outcome,
      warningCount: report.warningCount,
      errorCount: report.errorCount,
      jsonPath: request.reportJsonPath,
      markdownPath: request.reportMarkdownPath,
    },
    "Wrote narration quality gate reports."
  );
  return report;
}
