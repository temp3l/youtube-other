import path from "node:path";
import sharp from "sharp";
import type {
  ScenePlan,
  ShotPlan,
  ShotPlanValidationIssue,
} from "@mediaforge/domain";

export interface ShotStoryboardEntry {
  readonly shotId: string;
  readonly timestampMs: number;
  readonly durationMs: number;
  readonly sourceImagePath: string;
  readonly sourceSceneId: string;
  readonly sourceScene: string;
  readonly crop: string;
  readonly motion: string;
  readonly treatment: string;
  readonly transition: string;
  readonly narrationExcerpt: string;
  readonly captionExcerpt: string;
  readonly evidenceInsertSummary: string;
  readonly validationWarnings: readonly string[];
}

export interface ShotPreviewArtifacts {
  readonly storyboardHtml: string;
  readonly contactSheetPng: Buffer;
  readonly entries: readonly ShotStoryboardEntry[];
}

export function buildStoryboardEntries(args: {
  readonly shotPlan: ShotPlan;
  readonly scenePlan: ScenePlan;
  readonly episodeDir: string;
  readonly validationIssues: readonly ShotPlanValidationIssue[];
}): readonly ShotStoryboardEntry[] {
  const sceneById = new Map(
    args.scenePlan.scenes.map((scene) => [scene.id, scene])
  );
  return [...args.shotPlan.shots]
    .sort((left, right) => {
      if (left.startMs !== right.startMs) {
        return left.startMs - right.startMs;
      }
      return left.shotId.localeCompare(right.shotId);
    })
    .map((shot) => {
      const sourceScene = args.shotPlan.sourceScenes.find(
        (scene) => scene.sourceSceneId === shot.sourceSceneId
      );
      const scene = sceneById.get(shot.sceneId);
      const warnings = args.validationIssues
        .filter(
          (issue) =>
            issue.severity === "warning" &&
            (issue.shotId === shot.shotId || issue.sceneId === shot.sceneId)
        )
        .map((issue) => `${issue.code}: ${issue.message}`);
      return {
        shotId: shot.shotId,
        timestampMs: shot.startMs,
        durationMs: shot.endMs - shot.startMs,
        sourceImagePath: toRelativeAssetPath(
          path.resolve(args.episodeDir, sourceScene?.sourceImagePath ?? "")
        ),
        sourceSceneId: shot.sourceSceneId,
        sourceScene: shot.sceneId,
        crop: formatCrop(shot.crop),
        motion: formatMotion(shot.motion),
        treatment: shot.treatment.treatmentId,
        transition: shot.transition?.kind ?? "none",
        narrationExcerpt: excerpt(scene?.canonicalNarration ?? ""),
        captionExcerpt: "n/a",
        evidenceInsertSummary: summarizeEvidenceInserts(shot.overlays),
        validationWarnings: warnings,
      };
    });
}

export async function buildShotPreviewArtifacts(args: {
  readonly shotPlan: ShotPlan;
  readonly scenePlan: ScenePlan;
  readonly episodeDir: string;
  readonly validationIssues: readonly ShotPlanValidationIssue[];
  readonly storyboardPath: string;
}): Promise<ShotPreviewArtifacts> {
  const entries = buildStoryboardEntries(args);
  const storyboardHtml = buildStoryboardHtml({
    entries,
    storyboardPath: args.storyboardPath,
    episodeId: args.shotPlan.sourceId,
    locale: args.shotPlan.locale ?? "und",
    variant: args.shotPlan.variant,
  });
  const contactSheetPng = await buildContactSheet(entries, args.storyboardPath);
  return {
    storyboardHtml,
    contactSheetPng,
    entries,
  };
}

function buildStoryboardHtml(args: {
  readonly entries: readonly ShotStoryboardEntry[];
  readonly storyboardPath: string;
  readonly episodeId: string;
  readonly locale: string;
  readonly variant: string;
}): string {
  const baseDir = path.dirname(args.storyboardPath);
  const cards = args.entries
    .map((entry, index) => {
      const imagePath = path.relative(
        baseDir,
        path.resolve(baseDir, entry.sourceImagePath)
      );
      return [
        `<article class="card">`,
        `<div class="meta">#${index + 1} ${escapeHtml(entry.shotId)} · ${escapeHtml(formatSeconds(entry.timestampMs))} · ${escapeHtml(formatSeconds(entry.durationMs))}</div>`,
        `<img src="${escapeHtml(toRelativeAssetPath(imagePath))}" alt="${escapeHtml(entry.shotId)}" loading="lazy">`,
        `<dl>`,
        `<div><dt>Source</dt><dd>${escapeHtml(entry.sourceScene)} / ${escapeHtml(entry.sourceSceneId)}</dd></div>`,
        `<div><dt>Crop</dt><dd>${escapeHtml(entry.crop)}</dd></div>`,
        `<div><dt>Motion</dt><dd>${escapeHtml(entry.motion)}</dd></div>`,
        `<div><dt>Treatment</dt><dd>${escapeHtml(entry.treatment)}</dd></div>`,
        `<div><dt>Transition</dt><dd>${escapeHtml(entry.transition)}</dd></div>`,
        `<div><dt>Narration</dt><dd>${escapeHtml(entry.narrationExcerpt)}</dd></div>`,
        `<div><dt>Caption</dt><dd>${escapeHtml(entry.captionExcerpt)}</dd></div>`,
        `<div><dt>Evidence</dt><dd>${escapeHtml(entry.evidenceInsertSummary)}</dd></div>`,
        `<div><dt>Warnings</dt><dd>${escapeHtml(entry.validationWarnings.join(" | ") || "none")}</dd></div>`,
        `</dl>`,
        `</article>`,
      ].join("");
    })
    .join("");
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(args.episodeId)} storyboard</title>`,
    "<style>",
    "body{margin:0;font:14px/1.5 system-ui,sans-serif;background:#f4f1ea;color:#17130f;}",
    "main{max-width:1200px;margin:0 auto;padding:24px;}",
    "h1{margin:0 0 8px;font-size:28px;}p{margin:0 0 24px;color:#5c5147;}",
    ".grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px;}",
    ".card{background:#fff;border:1px solid #d8cfc3;border-radius:12px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,0.06);}",
    ".meta{padding:10px 12px;font:12px/1.4 ui-monospace,monospace;background:#17130f;color:#f4f1ea;}",
    "img{display:block;width:100%;aspect-ratio:9/16;object-fit:cover;background:#d9d3cb;}",
    "dl{margin:0;padding:12px;display:grid;gap:8px;}dt{font-weight:700;}dd{margin:2px 0 0;color:#3b342d;}",
    "</style>",
    "</head>",
    "<body>",
    "<main>",
    `<h1>${escapeHtml(args.episodeId)} storyboard</h1>`,
    `<p>${escapeHtml(args.variant)} / ${escapeHtml(args.locale)} · ${args.entries.length} shots</p>`,
    `<section class="grid">${cards}</section>`,
    "</main>",
    "</body>",
    "</html>",
  ].join("");
}

async function buildContactSheet(
  entries: readonly ShotStoryboardEntry[],
  storyboardPath: string
): Promise<Buffer> {
  const cellWidth = 180;
  const cellHeight = 320;
  const columns = entries.length >= 20 ? 4 : 3;
  const gutter = 12;
  const labelHeight = 56;
  const rows = Math.max(1, Math.ceil(entries.length / columns));
  const width = columns * cellWidth + (columns + 1) * gutter;
  const height = rows * (cellHeight + labelHeight) + (rows + 1) * gutter;
  const base = sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 244, g: 241, b: 234, alpha: 1 },
    },
  });
  const baseDir = path.dirname(storyboardPath);
  const composites: sharp.OverlayOptions[] = [];
  for (const [index, entry] of entries.entries()) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const left = gutter + column * (cellWidth + gutter);
    const top = gutter + row * (cellHeight + labelHeight + gutter);
    const absoluteImagePath = path.resolve(baseDir, entry.sourceImagePath);
    const image = await sharp(absoluteImagePath)
      .resize(cellWidth, cellHeight, { fit: "cover", position: "centre" })
      .png()
      .toBuffer();
    const label = contactSheetLabel({
      width: cellWidth,
      height: labelHeight,
      title: `#${index + 1} ${formatSeconds(entry.timestampMs)}`,
      subtitle: entry.treatment,
    });
    composites.push({ input: image, left, top });
    composites.push({ input: label, left, top: top + cellHeight });
  }
  return base.composite(composites).png().toBuffer();
}

function contactSheetLabel(args: {
  readonly width: number;
  readonly height: number;
  readonly title: string;
  readonly subtitle: string;
}): Buffer {
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${args.width}" height="${args.height}">`,
    `<rect width="100%" height="100%" fill="#17130f"/>`,
    `<text x="10" y="20" fill="#f4f1ea" font-size="14" font-family="monospace">${escapeHtml(args.title)}</text>`,
    `<text x="10" y="40" fill="#c7b9a7" font-size="12" font-family="monospace">${escapeHtml(excerpt(args.subtitle, 28))}</text>`,
    "</svg>",
  ].join("");
  return Buffer.from(svg, "utf8");
}

function summarizeEvidenceInserts(
  overlays: ShotPlan["shots"][number]["overlays"]
): string {
  const inserts = overlays
    .filter((overlay) => overlay.kind === "evidence-insert")
    .map((overlay) => overlay.sourceFactId ?? overlay.id);
  return inserts.length === 0 ? "none" : inserts.join(", ");
}

function formatCrop(
  crop: ShotPlan["shots"][number]["crop"] | undefined
): string {
  if (!crop) {
    return "full frame";
  }
  return `x=${crop.x.toFixed(2)} y=${crop.y.toFixed(2)} w=${crop.width.toFixed(2)} h=${crop.height.toFixed(2)}`;
}

function formatMotion(
  motion: ShotPlan["shots"][number]["motion"] | undefined
): string {
  if (!motion) {
    return "static";
  }
  return motion.kind;
}

function excerpt(value: string, maxLength = 72): string {
  const normalized = value.replace(/\s+/gu, " ").trim();
  if (normalized.length === 0) {
    return "n/a";
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;");
}

function toRelativeAssetPath(value: string): string {
  return value.split(path.sep).join("/");
}

function formatSeconds(milliseconds: number): string {
  return `${(milliseconds / 1000).toFixed(2)}s`;
}
