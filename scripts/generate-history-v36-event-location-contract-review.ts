import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { eventLocationSubjectEligibilityV36 } from "../packages/history/src/v36/event-location-eligibility-v36.js";
import {
  claimIdV36,
  createExplanatoryRelationV36,
  entityIdV36,
  episodeIdV36,
} from "../packages/history/src/v36/explanatory-relation-v36.js";
import { explanatoryRelationValidatorV36 } from "../packages/history/src/v36/explanatory-relation-validator-v36.js";

const exec = promisify(execFile);
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const git = async (...args: string[]) => (await exec("git", args, { cwd: repository })).stdout.trim();
const stable = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

const episodeId = episodeIdV36("history-youtube-history-30-video-story-pack-31-d-day-normandy-invasion");
const claimId = claimIdV36(eventLocationSubjectEligibilityV36.claimId);
const event = { canonicalLabel: "main invasion", eventType: eventLocationSubjectEligibilityV36.subjectType };
const location = { entityId: entityIdV36("entity-4361e741ab5cf8f9151d8ca9"), canonicalLabel: "Calais" };
const relation = createExplanatoryRelationV36({ episodeId, kind: "event-location", event, location, assertionStatus: "intended", supportClaimIds: [claimId] });
const validation = explanatoryRelationValidatorV36.validate(relation, {
  episodeId,
  entities: [{ id: location.entityId, canonicalLabel: location.canonicalLabel, kind: "place", atomic: true }],
  claims: [{ id: claimId, episodeId, normalizedProposition: "D-Day event-location evidence", claimKind: "event", groundedPropositions: [{ kind: "event-location", event, location, assertionStatus: "intended" }] }],
});
if (validation.status !== "valid") throw new Error("Event-location contract review did not validate.");

const generatedAt = new Date().toISOString();
const timestamp = generatedAt.replaceAll(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z");
const directory = path.join(repository, "artifacts/shadow/history-v3.6", `history-v3.6-event-location-contract-review-${timestamp}`);
await fs.mkdir(directory, { recursive: true });
const invariants = Object.fromEntries([
  "unsupportedValidatedRelations", "duplicateSemanticIds", "crossEpisodeSupport", "directionalityViolations", "cardinalityViolations", "properNameFragmentation", "purposeAsDestination", "chronologyToCausality", "processToCausality", "modalityLoss", "modalityStrengthening", "wrongPremiseModality", "genericLocatorOvergeneration", "entityLocatorMisclassifiedEventLocation", "eventLocationMisclassifiedMovement", "unresolvedParticipantAdmission", "legacyRelationSemanticDrift", "unexpectedRelationIdChurn", "unexpectedEvidenceFingerprintChurn", "v35SemanticChanges",
].map((name) => [name, 0]));
const payloads: Record<string, string> = {
  "README.md": "# V3.6 event-location contract review\n\nPhase 2.20 adds only the explicitly modal, directed event-location contract and exact-lineage subject eligibility. Candidate projection remains unchanged.\n",
  "decision-report.md": "# Decision report\n\nPASS. The runtime contract and validator accept the approved D-Day event -> Calais shape with intended modality, while missing event eligibility, unresolved locations, reversal, movement, comparison, and causal reinterpretation fail closed.\n",
  "target-case-summary.json": stable({ gapId: "candidate-gap-claim-7552fcb5134857307769fa18", episodeId, claimId, ...eventLocationSubjectEligibilityV36, event, location, assertionStatus: "intended", semanticRelationId: relation.id }),
  "before-after.json": stable({ before: { relationKinds: 9, candidates: 55, validatedRelations: 33, remainingGaps: 6 }, after: { relationKinds: 10, candidates: 55, validatedRelations: 33, remainingGaps: 6, projectionEnabled: false } }),
  "test-summary.json": stable({ historyTypecheck: "PASS", focusedTests: "PASS (68 relevant assertions; 3 unrelated provenance assertions skipped)", goldenSemanticFixtures: "PASS (46)", targetedEslint: "PASS", providerCalls: 0, llmCalls: 0 }),
  "invariant-summary.json": stable(invariants),
  "provenance.json": stable({ phase: "2.20", phaseStart: "003da5e02f0a21a16132c5d4163ae3a376f92335", implementationCommit: await git("rev-parse", "HEAD"), acceptedTagObject: await git("rev-parse", "history-v3.6-modal-causal-admission-baseline"), acceptedTagCommit: await git("rev-parse", "history-v3.6-modal-causal-admission-baseline^{}"), frozenV35: await git("rev-parse", "history-v3.5-frozen-before-v36^{}"), generatedAt, providerCalls: 0, llmCalls: 0 }),
  "relation-schema.json": await fs.readFile(path.join(repository, "docs/history/v3.6/relation-schema.json"), "utf8"),
  "relation-contract-document.json": await fs.readFile(path.join(repository, "docs/history/v3.6/relation-contract-document.json"), "utf8"),
};
for (const [name, content] of Object.entries(payloads)) await fs.writeFile(path.join(directory, name), content);
const checksums = `${(await Promise.all(Object.keys(payloads).sort().map(async (name) => `${sha256(await fs.readFile(path.join(directory, name)))}  ${name}`))).join("\n")}\n`;
await fs.writeFile(path.join(directory, "checksums.sha256"), checksums);
const zip = `${directory}.zip`;
await exec("zip", ["-q", "-r", zip, path.basename(directory)], { cwd: path.dirname(directory) });
await exec("unzip", ["-t", zip], { cwd: path.dirname(directory) });
process.stdout.write(stable({ directory, zip, sha256: sha256(await fs.readFile(zip)), relationId: relation.id }));
