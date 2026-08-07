import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import type { VeronicaMediaPlan } from "../contracts/media-plan.v1.js";
import { canonicalJson } from "../canonical-json.js";

const unsafePattern =
  /(?:\b(?:api[_-]?key|authorization|password|secret|token)\b|(?:^|[/])(?:home|users)(?:[/]|$))/iu;

export interface VeronicaApprovalPack {
  readonly packRoot: string;
  readonly manifestPath: string;
  readonly checksumPath: string;
}

export async function exportVeronicaApprovalPack(input: {
  readonly outputDir: string;
  readonly plan: VeronicaMediaPlan;
  readonly contactSheetPaths?: Readonly<{
    readonly landscape?: string;
    readonly portrait?: string;
  }>;
}): Promise<VeronicaApprovalPack> {
  const packRoot = path.join(input.outputDir, "approval-pack");
  await fs.mkdir(packRoot, { recursive: true });
  const redactedPlan = {
    ...input.plan,
    narrationRevision: {
      ...input.plan.narrationRevision,
      originalScript: input.plan.narrationRevision.originalScript,
      revisedScript: input.plan.narrationRevision.revisedScript,
    },
  };
  const files: Record<string, unknown> = {
    "revised-narration.json": {
      revisionId: input.plan.narrationRevision.revisionId,
      revisedScript: input.plan.narrationRevision.revisedScript,
      durationStatus: input.plan.narrationRevision.durationStatus,
    },
    "semantic-plan.json": redactedPlan,
    "claim-source-mapping.json": {
      claims: input.plan.claims,
      provenance: input.plan.provenance,
    },
    "asset-inventory.json": {
      sourceAssets: input.plan.sourceAssets,
      preparedAssets: input.plan.preparedAssets.map((asset) => ({
        ...asset,
        relativePath: path.basename(asset.relativePath),
      })),
    },
    "approval-eligibility.json": input.plan.approvalEligibility,
    "planner-metrics.json": input.plan.metrics,
    "translations.json": input.plan.preparedAssets
      .map((asset) => asset.translationStatus)
      .filter(Boolean),
    "versions.json": {
      schemaVersion: input.plan.schemaVersion,
      plannerVersion: input.plan.plannerVersion,
      promptRevision: input.plan.promptRevision,
      modelRevision: input.plan.modelRevision,
      designSystemRevision: input.plan.designSystemRevision,
      rendererProfile: input.plan.rendererProfile,
    },
  };
  if (input.contactSheetPaths?.landscape) {
    files["landscape-contact-sheet.json"] = {
      path: path.basename(input.contactSheetPaths.landscape),
    };
  }
  if (input.contactSheetPaths?.portrait) {
    files["portrait-contact-sheet.json"] = {
      path: path.basename(input.contactSheetPaths.portrait),
    };
  }
  const written: Array<{ readonly name: string; readonly checksum: string }> = [];
  for (const [name, value] of Object.entries(files)) {
    const serialized = `${JSON.stringify(value, null, 2)}\n`;
    if (unsafePattern.test(serialized)) {
      throw new Error(`Approval pack would leak unsafe content in ${name}.`);
    }
    const target = path.join(packRoot, name);
    await fs.writeFile(target, serialized, "utf8");
    written.push({
      name,
      checksum: createHash("sha256").update(serialized).digest("hex"),
    });
  }
  const checksums = {
    generatedAt: new Date().toISOString(),
    files: written,
    planContentHash: input.plan.contentHash,
  };
  const checksumPath = path.join(packRoot, "checksums.json");
  await fs.writeFile(checksumPath, `${JSON.stringify(checksums, null, 2)}\n`, "utf8");
  const manifestPath = path.join(packRoot, "aggregate-review.json");
  await fs.writeFile(
    manifestPath,
    `${JSON.stringify(
      {
        schemaVersion: "veronica-aggregate-review.v1",
        episodeId: input.plan.episodeId,
        eligibility: input.plan.approvalEligibility.renderEligible,
        packChecksum: createHash("sha256").update(canonicalJson(checksums)).digest("hex"),
        files: written.map((entry) => entry.name),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  return { packRoot, manifestPath, checksumPath };
}
