import fs from "node:fs/promises";
import path from "node:path";

import {
  admitProofAwarePolicyResponseV36,
  compileHistoryShadowArtifactV36,
  representativeNativeEpisodeFragmentsV36,
  runRepresentativeNativeStructuredClaimExperimentV36,
  runRepresentativeShadowExtractionV36,
  type CompilerIntentV36,
  type CompilerSourceProvenanceV36,
  type ExplanatoryRelationV36,
  type RepresentativeNativeExperimentRunV36,
  type RepresentativeShadowExtractionResultV36,
  type ResolvedGeographyV36,
} from "../packages/history/src/index.js";
import { canonicalGeographyByEntityIdV36 } from "../packages/history/src/v36/canonical-geography-sidecar-v36.js";

export interface RendererEpisodeSourceV36 {
  readonly episodeId: string;
  readonly title: string;
  readonly claims: readonly unknown[];
  readonly entities: readonly unknown[];
  readonly places: readonly {
    readonly id: string;
    readonly label: string;
    readonly aliases?: readonly string[];
    readonly coordinates?: { readonly latitude: number; readonly longitude: number };
    readonly geometrySource?: string;
  }[];
  readonly planPath: string;
}

async function loadEpisode(repository: string, episodeId: string): Promise<RendererEpisodeSourceV36> {
  const root = path.join(repository, "episodes", episodeId, "source/history-v3.5");
  const structured = JSON.parse(await fs.readFile(path.join(root, "structured-claims.json"), "utf8"));
  const planPath = path.join(root, "plan.json");
  const plan = JSON.parse(await fs.readFile(planPath, "utf8"));
  return { episodeId, title: String(plan.title ?? episodeId), claims: structured.claims, entities: structured.entities, places: plan.places ?? [], planPath };
}

async function episodeIds(repository: string): Promise<readonly string[]> {
  const entries = await fs.readdir(path.join(repository, "episodes"), { withFileTypes: true });
  const ids = await Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
    try {
      await fs.access(path.join(repository, "episodes", entry.name, "source/history-v3.5/structured-claims.json"));
      return entry.name;
    } catch { return undefined; }
  }));
  return ids.filter((id): id is string => Boolean(id)).sort((a, b) => a.localeCompare(b));
}

function proof(run: RepresentativeNativeExperimentRunV36, relation: ExplanatoryRelationV36): CompilerSourceProvenanceV36["proof"] | undefined {
  if (relation.kind !== "policy-response") return undefined;
  const admission = admitProofAwarePolicyResponseV36(run.native);
  if (admission.status !== "admitted" || admission.value.relation.id !== relation.id) return undefined;
  const value = admission.value.proofEvidence;
  return { proofEvidenceId: value.evidenceId, proofId: value.proofId, proofEvidenceFingerprint: value.proofEvidenceFingerprint, premises: value.premises.map((premise) => ({ premiseId: premise.premiseId, claimId: premise.claimId, structuredPropositionId: premise.structuredPropositionId, atomicGroundingId: premise.atomicGroundingId, assertionStatus: premise.assertionStatus })) };
}

function nativeProvenance(run: RepresentativeNativeExperimentRunV36, relation: ExplanatoryRelationV36): CompilerSourceProvenanceV36 {
  const candidates = run.native.candidates.filter((candidate) => candidate.semanticRelationId === relation.id);
  const proofValue = proof(run, relation);
  return { structuredPropositionIds: candidates.flatMap((candidate) => candidate.structuredPropositionIds ?? []), atomicGroundingIds: candidates.flatMap((candidate) => candidate.atomicGroundingIds ?? []), ...(proofValue ? { proof: proofValue } : {}) };
}

export async function loadSameEightRendererInputsV36(repository: string) {
  const ids = await episodeIds(repository);
  const sources = await Promise.all(representativeNativeEpisodeFragmentsV36.map(async (fragment) => {
    const episodeId = ids.find((id) => id.includes(fragment) && !id.endsWith("-v3.4"));
    if (!episodeId) throw new Error(`Missing representative episode ${fragment}.`);
    return loadEpisode(repository, episodeId);
  }));
  const experiment = runRepresentativeNativeStructuredClaimExperimentV36(
    sources.map((source) => ({
      shadow: {
        episodeId: source.episodeId,
        claims: source.claims,
        entities: source.entities,
        places: source.places,
      } as never,
      native: {
        episodeId: source.episodeId,
        claims: source.claims,
        entities: source.entities,
      } as never,
    }))
  );
  const runs = experiment.runs;
  const intents = runs.flatMap((run) => compileHistoryShadowArtifactV36({ episodeId: run.episodeId, relations: run.native.extraction.relations.map((relation) => ({ relation, provenance: nativeProvenance(run, relation) })) }).intents);
  return { sources, runs, intents };
}

function extractionProvenance(run: RepresentativeShadowExtractionResultV36, relation: ExplanatoryRelationV36): CompilerSourceProvenanceV36 {
  const candidates = run.candidates.filter((candidate) => candidate.semanticRelationId === relation.id);
  return { structuredPropositionIds: candidates.flatMap((candidate) => candidate.structuredPropositionIds ?? []), atomicGroundingIds: candidates.flatMap((candidate) => candidate.atomicGroundingIds ?? []) };
}

export async function loadAll40RendererInputsV36(repository: string) {
  const ids = await episodeIds(repository);
  if (ids.length !== 40) throw new Error(`Expected exact accepted all-40 inventory; found ${ids.length}.`);
  const sources = await Promise.all(ids.map((id) => loadEpisode(repository, id)));
  const runs = sources.map((source) => ({ source, run: runRepresentativeShadowExtractionV36(source as never) }));
  const intents = runs.flatMap(({ source, run }) => compileHistoryShadowArtifactV36({ episodeId: source.episodeId, relations: run.extraction.relations.map((relation) => ({ relation, provenance: extractionProvenance(run, relation) })) }).intents);
  return { sources, runs, intents };
}

const normalized = (value: string) => value.trim().toLocaleLowerCase();

/** Exact matching against upstream resolved canonical place labels/aliases only. */
export function resolvedGeographyForIntentV36(intent: CompilerIntentV36, sources: readonly RendererEpisodeSourceV36[]): readonly ResolvedGeographyV36[] {
  if (intent.disposition !== "MAP") return [];
  const source = sources.find((item) => item.episodeId === intent.episodeId);
  if (!source) return [];
  const refs = intent.relationKind === "movement" ? [intent.from, ...intent.via, intent.to] : intent.relationKind === "spatial-comparison" ? intent.places : intent.relationKind === "spatial-area" ? [intent.place] : [intent.location];
  return refs.flatMap((ref) => {
    const sidecar = canonicalGeographyByEntityIdV36(ref.entityId);
    if (sidecar)
      return [{
        entityId: ref.entityId,
        canonicalLabel: ref.canonicalLabel,
        latitude: sidecar.renderAnchor.latitude,
        longitude: sidecar.renderAnchor.longitude,
        geometrySource: sidecar.provenance.source,
        placeKind: sidecar.placeKind,
        renderAnchorPresentationOnly: sidecar.renderAnchor.presentationOnly,
      }];
    const candidates = source.places.filter((place) => [place.label, ...(place.aliases ?? [])].some((label) => normalized(label) === normalized(ref.canonicalLabel)) && place.coordinates);
    if (candidates.length !== 1) return [];
    const place = candidates[0]!;
    return [{ entityId: ref.entityId, canonicalLabel: ref.canonicalLabel, latitude: place.coordinates!.latitude, longitude: place.coordinates!.longitude, geometrySource: place.geometrySource ?? "accepted-upstream", placeKind: "point", renderAnchorPresentationOnly: false }];
  });
}
