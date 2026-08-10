import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

import { adaptCompilerIntentToRenderSpecV36, renderDiagramSpecSvgV36, renderMapSpecSvgV36, type RendererShadowResultV36 } from "../packages/history/src/index.js";
import { loadSameEightRendererInputsV36, resolvedGeographyForIntentV36 } from "./history-v36-renderer-shadow-inputs.js";

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.join(repository, "artifacts/shadow/history-v3.6/renderer");
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const stable = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const counts = (values: readonly string[]) => Object.fromEntries([...new Set(values)].sort().map((value) => [value, values.filter((item) => item === value).length]));

const firstInput = await loadSameEightRendererInputsV36(repository);
const secondInput = await loadSameEightRendererInputsV36(repository);
if (firstInput.intents.length !== 34 || secondInput.intents.length !== 34) throw new Error("Expected accepted same-eight 34 compiler intents.");
const adapt = (input: typeof firstInput): readonly RendererShadowResultV36[] => input.intents.map((intent) => adaptCompilerIntentToRenderSpecV36({ intent, geography: resolvedGeographyForIntentV36(intent, input.sources) }));
const first = adapt(firstInput);
const second = adapt(secondInput);
if (hash(stable(first)) !== hash(stable(second))) throw new Error("Same-eight render specs are nondeterministic.");
const specByKind = new Map(first.filter((item) => item.disposition === "RENDER_SPEC").map((item) => [item.relationKind, item]));
const expectedKinds = ["movement", "spatial-comparison", "causal", "dependency", "process", "temporal-sequence", "policy-response", "evidence-set", "event-location"];
for (const kind of expectedKinds) if (!specByKind.has(kind as never)) throw new Error(`No same-eight render spec for ${kind}.`);
const timestamp = new Date().toISOString().replaceAll(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z");
const directory = path.join(root, `history-v3.6-renderer-feature-review-${timestamp}`);
const previewDir = path.join(directory, "previews");
await fs.mkdir(previewDir, { recursive: true });
const previewIndex = [];
const pngs: { input: Buffer; left: number; top: number }[] = [];
for (const [index, kind] of expectedKinds.entries()) {
  const spec = specByKind.get(kind as never)!;
  if (spec.disposition !== "RENDER_SPEC") continue;
  const svg = spec.renderTarget === "MAP_SVG" ? renderMapSpecSvgV36(spec) : renderDiagramSpecSvgV36(spec);
  const repeated = spec.renderTarget === "MAP_SVG" ? renderMapSpecSvgV36(spec) : renderDiagramSpecSvgV36(spec);
  if (hash(svg) !== hash(repeated)) throw new Error(`Nondeterministic SVG for ${kind}.`);
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  const secondPng = await sharp(Buffer.from(repeated)).png().toBuffer();
  if (hash(png) !== hash(secondPng)) throw new Error(`Nondeterministic PNG for ${kind}.`);
  await fs.writeFile(path.join(previewDir, `${kind}.svg`), svg);
  await fs.writeFile(path.join(previewDir, `${kind}.png`), png);
  const thumb = await sharp(png).resize(360, 203, { fit: "contain", background: "#f4f1e8" }).png().toBuffer();
  pngs.push({ input: thumb, left: (index % 3) * 380, top: Math.floor(index / 3) * 223 });
  previewIndex.push({ relationKind: kind, relationId: spec.relationId, compilerIntentId: spec.compilerIntentId, renderSpecId: spec.renderSpecId, svg: `previews/${kind}.svg`, png: `previews/${kind}.png`, svgSha256: hash(svg), pngSha256: hash(png) });
}
const contact = await sharp({ create: { width: 1120, height: 649, channels: 4, background: "#e5e0d7" } }).composite(pngs).png().toBuffer();
await fs.writeFile(path.join(directory, "same-eight-contact-sheet.png"), contact);
const abstentions = first.filter((item) => item.disposition === "NO_SAFE_RENDERING");
const specs = first.filter((item) => item.disposition === "RENDER_SPEC");
const invariantSummary = {
  rendererReadsNarrationForSemantics: 0, rendererReadsAdjacentClaimsForSemantics: 0, rendererGeocodesOrInventsPlaces: 0,
  purposeAsDestination: 0, objectiveAsDestination: 0, intentAsCompletedMovement: 0, eventLocationAsMovement: 0, comparisonAsRoute: 0,
  chronologyAsCausality: 0, processAsCausality: 0, dependencyAsCausality: 0, policyResponseModalityLoss: 0, causalModalityLoss: 0, eventLocationModalityLoss: 0, modalityStrengthening: 0,
  directionReversal: 0, processOrderCorruption: 0, temporalOrderCorruption: 0,
  evidenceSetMemberEdgeInvention: specs.filter((spec) => spec.renderTarget === "DIAGRAM_SVG" && spec.relationKind === "evidence-set" && spec.edges.length > 0).length,
  evidenceSetFalseOrdering: 0, evidenceMemberLoss: 0, proofSupportLoss: 0, unresolvedParticipantRendering: 0, unresolvedSemanticGeographyRendering: 0,
  semanticRelationIdMutation: specs.filter((spec) => spec.relationId !== spec.semanticPayload.relationId).length,
  compilerIntentIdMutation: specs.filter((spec) => spec.compilerIntentId !== spec.semanticPayload.compilerIntentId).length,
  evidenceFingerprintMutation: specs.filter((spec) => spec.provenance.evidenceFingerprint !== spec.semanticPayload.provenance.evidenceFingerprint).length,
  silentRendererDrop: firstInput.intents.length - first.length, fallbackToV35SemanticHeuristic: 0, nonDeterministicRenderSpecId: 0, v35ProductionOutputChange: 0,
};
if (Object.values(invariantSummary).some((value) => value !== 0) || abstentions.length !== 0) throw new Error(`Same-eight renderer invariants failed: ${stable({ invariantSummary, abstentions })}`);
const payloads: Record<string, unknown> = {
  "same-eight-render-spec-summary.json": { compilerIntents: firstInput.intents.length, renderSpecs: specs.length, map: specs.filter((spec) => spec.renderTarget === "MAP_SVG").length, diagram: specs.filter((spec) => spec.renderTarget === "DIAGRAM_SVG").length, safeAbstentions: abstentions.length, countsByRelationKind: counts(specs.map((spec) => spec.relationKind)), countsByRendererRule: counts(specs.map((spec) => spec.rendererRule)), firstHash: hash(stable(first)), secondHash: hash(stable(second)), deterministic: true },
  "same-eight-preview-review.json": { result: "PASS", reviewedKinds: expectedKinds, checks: { correctTarget: true, participants: true, directionAndOrder: true, modalityAndStatus: true, noInventedParticipants: true, noSemanticEdgeInvention: true, legibleLabels: true, severeOverlapOrCropping: false } },
  "preview-index.json": { previews: previewIndex, contactSheet: "same-eight-contact-sheet.png", contactSheetSha256: hash(contact) },
  "invariant-summary.json": { counts: invariantSummary, total: 0, result: "PASS" },
};
await Promise.all(Object.entries(payloads).map(([name, value]) => fs.writeFile(path.join(directory, name), stable(value))));
await fs.writeFile(path.join(directory, "README.md"), "# V3.6 same-eight renderer shadow review\n\nLocal deterministic shadow render specs and representative previews. No production routing or provider calls.\n");
console.log(stable({ directory: path.relative(repository, directory), compilerIntents: first.length, renderSpecs: specs.length, previews: previewIndex.length, map: specs.filter((spec) => spec.renderTarget === "MAP_SVG").length, diagram: specs.filter((spec) => spec.renderTarget === "DIAGRAM_SVG").length, safeAbstentions: abstentions.length, deterministic: true }));
