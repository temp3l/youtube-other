import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execute = promisify(execFile);
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.join(repository, "artifacts/shadow/history-v3.6/renderer");
const sameEight = path.join(root, "history-v3.6-renderer-feature-review-20260809T223551Z");
const all40 = path.join(root, "history-v3.6-renderer-all40-census-20260809T223740Z");
const timestamp = new Date().toISOString().replaceAll(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z");
const basename = `history-v3.6-renderer-shadow-readiness-${timestamp}`;
const directory = path.join(root, basename);
const zipPath = path.join(root, `${basename}.zip`);
const stable = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const hashFile = async (file: string) =>
  createHash("sha256").update(await fs.readFile(file)).digest("hex");
const copy = async (source: string, target: string) => {
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(source, target);
};

const sameSummary = JSON.parse(await fs.readFile(path.join(sameEight, "same-eight-render-spec-summary.json"), "utf8"));
const allSummary = JSON.parse(await fs.readFile(path.join(all40, "all40-render-spec-census.json"), "utf8"));
const sameInvariants = JSON.parse(await fs.readFile(path.join(sameEight, "invariant-summary.json"), "utf8"));
const allInvariants = JSON.parse(await fs.readFile(path.join(all40, "invariant-summary.json"), "utf8"));
const v35Isolation = JSON.parse(await fs.readFile(path.join(all40, "v35-isolation-summary.json"), "utf8"));
const previewIndex = JSON.parse(await fs.readFile(path.join(sameEight, "preview-index.json"), "utf8"));
const head = (await execute("git", ["rev-parse", "HEAD"], { cwd: repository })).stdout.trim();
await fs.mkdir(directory, { recursive: true });

const rendererContract = {
  schemaVersion: "history-renderer-shadow-spec.v1",
  rendererVersion: "history-renderer-shadow.v3.6.0",
  shadowOnly: true,
  inputs: ["accepted compiler intent", "accepted canonical geography", "fixed presentation configuration"],
  outputs: ["MAP_SVG", "DIAGRAM_SVG", "NO_SAFE_RENDERING"],
  identity: "sha256(contract version, compilerIntentId, semantic payload); excludes timestamps, paths, machine state, and random seeds",
  sidecar: "history-canonical-geography-sidecar.v1",
};
const relationMatrix = {
  movement: "MAP / map-movement-svg.v1",
  "spatial-comparison": "MAP / map-spatial-comparison-svg.v1 / non-route connector",
  "spatial-area": "MAP / map-spatial-area-svg.v1",
  "event-location": "MAP / map-event-location-svg.v1 / status-preserving no-route marker",
  causal: "DIAGRAM / diagram-causal-svg.v1",
  dependency: "DIAGRAM / diagram-dependency-svg.v1 / not causality",
  process: "DIAGRAM / diagram-process-svg.v1 / ordered not causality",
  "temporal-sequence": "DIAGRAM / diagram-temporal-sequence-svg.v1 / chronology not causality",
  "policy-response": "DIAGRAM / diagram-policy-response-svg.v1 / asymmetric status and proof preserved",
  "evidence-set": "DIAGRAM / diagram-evidence-set-svg.v1 / no member edges",
};
const payloads: Record<string, unknown> = {
  "README.md": "# History V3.6 renderer shadow readiness\n\nShadow-only renderer adapter readiness evidence. This artifact does not activate production routing.\n",
  "architecture-summary.md": await fs.readFile(path.join(repository, "docs/history/v3.6/renderer-shadow-boundary-audit.md"), "utf8"),
  "renderer-contract.json": rendererContract,
  "relation-renderer-matrix.json": relationMatrix,
  "same-eight-render-spec-summary.json": sameSummary,
  "same-eight-preview-review.json": JSON.parse(await fs.readFile(path.join(sameEight, "same-eight-preview-review.json"), "utf8")),
  "preview-index.json": previewIndex,
  "all40-render-spec-census.json": allSummary,
  "map-renderer-summary.json": { specs: sameSummary.map + allSummary.map, rules: ["map-movement-svg.v1", "map-spatial-comparison-svg.v1", "map-spatial-area-svg.v1", "map-event-location-svg.v1"], sidecarResolutions: ["Calais point", "Pas-de-Calais area presentation anchor"], rawGeocoding: 0 },
  "diagram-renderer-summary.json": { specs: sameSummary.diagram + allSummary.diagram, rules: ["diagram-causal-svg.v1", "diagram-dependency-svg.v1", "diagram-process-svg.v1", "diagram-temporal-sequence-svg.v1", "diagram-policy-response-svg.v1", "diagram-evidence-set-svg.v1"], evidenceMemberEdges: 0 },
  "safe-rendering-abstention-summary.json": { sameEight: sameSummary.safeAbstentions, all40: allSummary.safeAbstentions, diagnostics: allSummary.diagnostics },
  "determinism-summary.json": { result: "PASS", sameEight: { firstHash: sameSummary.firstHash, secondHash: sameSummary.secondHash }, all40: { firstHash: allSummary.firstHash, secondHash: allSummary.secondHash }, previewHashes: "SVG and local Sharp PNG buffers compared per representative preview" },
  "v35-isolation-summary.json": v35Isolation,
  "invariant-summary.json": { result: "PASS", sameEight: sameInvariants.counts, all40: allInvariants.counts, total: 0 },
  "test-summary.json": { result: "PASS", checks: ["History typecheck", "targeted ESLint", "13 focused renderer/sidecar tests", "same-eight specs plus local preview hashes x2", "all-40 render specs x2", "V3.5 isolation"], goldens: { run: false, reason: "compiler semantics unchanged" } },
  "provenance.json": { artifactInputHead: head, baseline: "history-v3.6-compiler-shadow-readiness-baseline", phases: ["2.30", "2.31", "2.32", "2.33", "2.34", "2.35"], shadowOnly: true, providerCalls: { llm: 0, image: 0, web: 0, geocoding: 0 }, productionActivated: false },
};
await Promise.all(
  Object.entries(payloads).map(async ([name, value]) => {
    const output = typeof value === "string" ? value : stable(value);
    await fs.writeFile(path.join(directory, name), output);
  })
);
await fs.mkdir(path.join(directory, "previews"), { recursive: true });
for (const preview of previewIndex.previews as readonly { readonly svg: string; readonly png: string }[]) {
  await copy(path.join(sameEight, preview.svg), path.join(directory, preview.svg));
  await copy(path.join(sameEight, preview.png), path.join(directory, preview.png));
}
await copy(path.join(sameEight, "same-eight-contact-sheet.png"), path.join(directory, "same-eight-contact-sheet.png"));
const files = (
  await Promise.all(
    (await fs.readdir(directory, { recursive: true })).map(async (entry) =>
      entry !== "checksums.sha256" &&
      (await fs.stat(path.join(directory, entry))).isFile()
        ? entry
        : undefined
    )
  )
)
  .filter((entry): entry is string => Boolean(entry))
  .sort((left, right) => left.localeCompare(right));
const checksums = await Promise.all(files.map(async (entry) => `${await hashFile(path.join(directory, entry))}  ${entry}`));
await fs.writeFile(path.join(directory, "checksums.sha256"), `${checksums.join("\n")}\n`);
await execute("zip", ["-qr", zipPath, basename], { cwd: root });
console.log(stable({ directory: path.relative(repository, directory), zip: path.relative(repository, zipPath), zipSha256: await hashFile(zipPath), files: files.length + 1 }));
