import fs from "node:fs/promises";
import path from "node:path";
import {
  createFixturePdf,
  createFixturePng,
  createFixturePptx,
  createFixtureSvg,
  exportBulkVeronicaApprovalReview,
  veronicaEpisodeStateDir,
  type BulkApprovalReviewResult,
} from "@mediaforge/veronica-media";
import { runStrategicSupplementalMediaBridge } from "./supplemental-media-bridge.js";

export const VERONICA_BENINI_CREATOR_ID = "veronica-benini" as const;

export interface VeronicaContentMatrixRow {
  readonly matrixId: string;
  readonly episodeId: string;
  readonly pillar: string;
  readonly workingTitle: string;
  readonly mode: string;
  readonly primaryCta: string;
  readonly reviewRisk: string;
}

export interface VeronicaReviewPackEpisodeResult {
  readonly episodeId: string;
  readonly approvalPackDir: string;
  readonly contentHash: string;
  readonly renderEligible: boolean;
  readonly resumed: boolean;
}

export interface GenerateVeronicaBeniniReviewPacksResult {
  readonly workspaceRoot: string;
  readonly bulk: BulkApprovalReviewResult;
  readonly episodes: readonly VeronicaReviewPackEpisodeResult[];
}

const defaultBeats = [
  { beatId: "beat-001", type: "hook", purpose: "Open with tension", sourceIds: ["source-primary"] },
  { beatId: "beat-002", type: "situation", purpose: "Describe context", sourceIds: ["source-primary"] },
  { beatId: "beat-003", type: "story", purpose: "Tell the case", sourceIds: ["source-primary"] },
  { beatId: "beat-004", type: "conventional-view", purpose: "Name the default", sourceIds: ["source-primary"] },
  { beatId: "beat-005", type: "reframe", purpose: "Offer the shift", sourceIds: ["source-primary"] },
  { beatId: "beat-006", type: "framework", purpose: "Give the model", sourceIds: ["source-primary"] },
] as const;

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 48);
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

export function parseVeronicaContentMatrix(csv: string): readonly VeronicaContentMatrixRow[] {
  const lines = csv
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) {
    return [];
  }
  return lines.slice(1).map((line) => {
    const [matrixId, pillar, workingTitle, mode, primaryCta, , reviewRisk] = parseCsvLine(line);
    if (!matrixId || !workingTitle) {
      throw new Error(`Invalid content-matrix row: ${line}`);
    }
    const episodeId = `${matrixId.toLowerCase()}-${slugify(workingTitle)}`;
    return {
      matrixId,
      episodeId,
      pillar: pillar ?? "",
      workingTitle,
      mode: mode ?? "story-to-strategy",
      primaryCta: primaryCta ?? "consultation",
      reviewRisk: reviewRisk ?? "medium",
    };
  });
}

export async function discoverVeronicaBeniniEpisodes(
  workspaceRoot: string,
): Promise<readonly string[]> {
  const entries = await fs.readdir(workspaceRoot, { withFileTypes: true });
  const episodeIds: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const blueprintPath = path.join(workspaceRoot, entry.name, "blueprint.json");
    try {
      const raw = JSON.parse(await fs.readFile(blueprintPath, "utf8")) as {
        creatorProfileId?: string;
      };
      if (raw.creatorProfileId === VERONICA_BENINI_CREATOR_ID) {
        episodeIds.push(entry.name);
      }
    } catch {
      continue;
    }
  }
  return episodeIds.sort((left, right) => left.localeCompare(right));
}

async function writeEpisodeScaffold(input: {
  readonly workspaceRoot: string;
  readonly row: VeronicaContentMatrixRow;
}): Promise<void> {
  const episodeRoot = path.join(input.workspaceRoot, input.row.episodeId);
  const sourceText =
    `${input.row.workingTitle}. ` +
    `Questo episodio esplora ${input.row.pillar.toLowerCase()} con un percorso pratico per Veronica Benini.`;
  await fs.mkdir(path.join(episodeRoot, "sources", "content"), { recursive: true });
  await fs.mkdir(path.join(episodeRoot, "languages"), { recursive: true });
  await fs.writeFile(
    path.join(episodeRoot, "blueprint.json"),
    `${JSON.stringify(
      {
        schemaVersion: "1.1",
        episodeId: input.row.episodeId,
        genreId: "strategic-reinvention",
        creatorProfileId: VERONICA_BENINI_CREATOR_ID,
        canonicalLocale: "it",
        mode: input.row.mode,
        sources: ["source-primary"],
        contentTier: "public",
        thesis: `${input.row.workingTitle} — ${input.row.pillar}.`,
        beats: defaultBeats,
        cta: {
          kind: "consultation",
          destination: "https://example.com/consultation",
          campaignId: input.row.matrixId.toLowerCase(),
        },
        requiredApprovalGates: ["source", "canonical-script", "localization", "voice", "render-qa", "publish"],
      },
      null,
      2,
    )}\n`,
  );
  await fs.writeFile(path.join(episodeRoot, "languages", "script-it.md"), sourceText, "utf8");
  await fs.writeFile(
    path.join(episodeRoot, "sources", "content", "source-primary.md"),
    sourceText,
    "utf8",
  );
  await fs.writeFile(
    path.join(episodeRoot, "sources", "content", `${input.row.matrixId.toLowerCase()}-deck.pptx`),
    createFixturePptx(3),
  );
  await fs.writeFile(
    path.join(episodeRoot, "sources", "content", `${input.row.matrixId.toLowerCase()}-handout.pdf`),
    createFixturePdf(2),
  );
  await fs.writeFile(
    path.join(episodeRoot, "sources", "content", `${input.row.matrixId.toLowerCase()}-chart.png`),
    createFixturePng(input.row.episodeId),
  );
  await fs.writeFile(
    path.join(episodeRoot, "sources", "content", `${input.row.matrixId.toLowerCase()}-framework.svg`),
    createFixtureSvg(input.row.workingTitle.slice(0, 40)),
  );
}

export async function scaffoldVeronicaBeniniEpisodesFromContentMatrix(input: {
  readonly workspaceRoot: string;
  readonly contentMatrixPath: string;
  readonly overwrite?: boolean;
}): Promise<readonly VeronicaContentMatrixRow[]> {
  const csv = await fs.readFile(input.contentMatrixPath, "utf8");
  const rows = parseVeronicaContentMatrix(csv);
  await fs.mkdir(input.workspaceRoot, { recursive: true });
  for (const row of rows) {
    const episodeRoot = path.join(input.workspaceRoot, row.episodeId);
    if (!input.overwrite) {
      try {
        await fs.access(path.join(episodeRoot, "blueprint.json"));
        continue;
      } catch {
        // Scaffold missing episode.
      }
    }
    await writeEpisodeScaffold({ workspaceRoot: input.workspaceRoot, row });
  }
  return rows;
}

export async function generateVeronicaBeniniReviewPacks(input: {
  readonly workspaceRoot: string;
  readonly bulkOutputDir: string;
  readonly episodeIds?: readonly string[];
  readonly contentMatrixPath?: string;
  readonly scaffoldMissing?: boolean;
  readonly resume?: boolean;
}): Promise<GenerateVeronicaBeniniReviewPacksResult> {
  const workspaceRoot = path.resolve(input.workspaceRoot);
  await fs.mkdir(workspaceRoot, { recursive: true });

  if (input.scaffoldMissing && input.contentMatrixPath) {
    await scaffoldVeronicaBeniniEpisodesFromContentMatrix({
      workspaceRoot,
      contentMatrixPath: input.contentMatrixPath,
    });
  }

  const discovered = await discoverVeronicaBeniniEpisodes(workspaceRoot);
  const episodeIds = [...(input.episodeIds ?? discovered)].sort((left, right) =>
    left.localeCompare(right),
  );
  if (episodeIds.length === 0) {
    throw new Error(
      `No veronica-benini episodes found under ${workspaceRoot}. Pass --scaffold-missing with a content matrix path.`,
    );
  }

  const episodes: VeronicaReviewPackEpisodeResult[] = [];
  for (const episodeId of episodeIds) {
    const result = await runStrategicSupplementalMediaBridge({
      workspaceRoot,
      episodeId,
      resume: input.resume ?? false,
    });
    episodes.push({
      episodeId,
      approvalPackDir: result.approvalPackDir,
      contentHash: result.plan.contentHash,
      renderEligible: result.plan.approvalEligibility.renderEligible,
      resumed: result.resumed ?? false,
    });
  }

  const bulk = await exportBulkVeronicaApprovalReview({
    outputDir: path.resolve(input.bulkOutputDir),
    episodes: episodes.map((episode) => ({
      episodeId: episode.episodeId,
      packRoot: episode.approvalPackDir,
    })),
  });

  return { workspaceRoot, bulk, episodes };
}

export function veronicaApprovalPackDir(workspaceRoot: string, episodeId: string): string {
  return path.join(veronicaEpisodeStateDir(workspaceRoot, episodeId), "approval-pack");
}
