import fs from "node:fs/promises";
import path from "node:path";
import {
  veronicaApprovalEligibilitySchema,
  veronicaMediaPlanSchema,
  type VeronicaApprovalEligibility,
  type VeronicaMediaPlan,
  type VeronicaRenderManifest,
} from "../contracts/media-plan.v1.js";
import { hashCanonical } from "../canonical-json.js";
import { buildContactSheetTiles, renderContactSheetSvg } from "../review-pack/contact-sheet.js";
import {
  mergeIntegrityIssuesIntoEligibility,
  validateEpisodeApprovalPackIntegrity,
} from "../review-pack/integrity-validator.js";

export async function finalizeVeronicaEpisodePlan(input: {
  readonly episodeId: string;
  readonly stateDir: string;
  readonly plan: VeronicaMediaPlan;
  readonly approvalEligibility: VeronicaApprovalEligibility;
  readonly preparedAssetPaths: Readonly<Record<string, string>>;
  readonly preparedAssetBytes: Readonly<Record<string, Uint8Array>>;
  readonly landscapeManifest: VeronicaRenderManifest;
  readonly portraitManifest: VeronicaRenderManifest;
}): Promise<VeronicaMediaPlan> {
  const integrity = await validateEpisodeApprovalPackIntegrity({
    episodeId: input.episodeId,
    stateDir: input.stateDir,
    plan: input.plan,
    landscapeManifest: input.landscapeManifest,
    portraitManifest: input.portraitManifest,
  });
  const approvalEligibility = veronicaApprovalEligibilitySchema.parse(
    mergeIntegrityIssuesIntoEligibility({
      eligibility: input.approvalEligibility,
      integrityIssues: integrity.issues,
      approvalState: input.plan.approvalState,
    }),
  );
  const plan = veronicaMediaPlanSchema.parse({
    ...input.plan,
    approvalEligibility,
    contentHash: hashCanonical({ ...input.plan, approvalEligibility }),
  });
  const previewsDir = path.join(input.stateDir, "previews");
  await fs.mkdir(previewsDir, { recursive: true });
  await fs.writeFile(
    path.join(previewsDir, "landscape-contact-sheet.svg"),
    renderContactSheetSvg({
      episodeId: input.episodeId,
      aspectRatio: "16:9",
      tiles: buildContactSheetTiles(plan, "16:9", input.preparedAssetBytes),
    }),
    "utf8",
  );
  await fs.writeFile(
    path.join(previewsDir, "portrait-contact-sheet.svg"),
    renderContactSheetSvg({
      episodeId: input.episodeId,
      aspectRatio: "9:16",
      tiles: buildContactSheetTiles(plan, "9:16", input.preparedAssetBytes),
    }),
    "utf8",
  );
  await fs.writeFile(
    path.join(input.stateDir, "veronica-media-plan.json"),
    `${JSON.stringify(plan, null, 2)}\n`,
    "utf8",
  );
  return plan;
}
