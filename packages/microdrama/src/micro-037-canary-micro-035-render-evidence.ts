import { DEFAULT_MICRO_035_EXECUTION_EVIDENCE_JSON_PATH } from "./micro-036-batch-micro-035-evidence.js";
import {
  loadMicro034CanaryExecutionEvidence,
  type Micro034CanaryExecutionEvidence,
} from "./micro-035-canary-micro-034-evidence.js";
import {
  loadMicro035CanaryExecutionEvidence,
  type Micro035CanaryExecutionEvidence,
} from "./micro-036-batch-micro-035-evidence.js";
import type { MicrodramaSQLiteRepository } from "@mediaforge/persistence";

export const DEFAULT_MICRO_037_RENDER_EVIDENCE_JSON_PATH =
  DEFAULT_MICRO_035_EXECUTION_EVIDENCE_JSON_PATH;

export const MICRO_037_CANARY_LOCALE = "en-US";
export const MICRO_037_CANARY_EPISODE_ID = "E001";

export type Micro037RenderBinding = {
  readonly locale: typeof MICRO_037_CANARY_LOCALE;
  readonly episodeId: typeof MICRO_037_CANARY_EPISODE_ID;
  readonly renderOutputPath: string;
  readonly visualRenderHash: string;
  readonly scriptRevisionId?: string;
  readonly evidenceSource: "micro-035" | "micro-034";
};

function findEnUsE001InMicro035Evidence(
  evidence: Micro035CanaryExecutionEvidence
): Micro037RenderBinding | null {
  const episode = evidence.episodes.find(
    (entry) =>
      entry.episodeId === MICRO_037_CANARY_EPISODE_ID &&
      entry.locale.toLowerCase() === MICRO_037_CANARY_LOCALE.toLowerCase()
  );
  if (!episode) {
    return null;
  }
  return {
    locale: MICRO_037_CANARY_LOCALE,
    episodeId: MICRO_037_CANARY_EPISODE_ID,
    renderOutputPath: episode.renderOutputPath,
    visualRenderHash: episode.visualRenderHash,
    scriptRevisionId: episode.scriptRevisionId,
    evidenceSource: "micro-035",
  };
}

function findEnUsE001InMicro034Evidence(
  evidence: Micro034CanaryExecutionEvidence
): Micro037RenderBinding | null {
  const episode = evidence.episodes.find(
    (entry) => entry.episodeId === MICRO_037_CANARY_EPISODE_ID
  );
  if (!episode?.renderOutputPath || !episode.visualRenderHash) {
    return null;
  }
  return {
    locale: MICRO_037_CANARY_LOCALE,
    episodeId: MICRO_037_CANARY_EPISODE_ID,
    renderOutputPath: episode.renderOutputPath,
    visualRenderHash: episode.visualRenderHash,
    scriptRevisionId: episode.scriptRevisionId,
    evidenceSource: "micro-034",
  };
}

export function resolveMicro037RenderBindingFromCanaryEvidence(input: {
  readonly repository?: MicrodramaSQLiteRepository;
  readonly micro035EvidenceJsonPath?: string;
  readonly micro034EvidenceJsonPath?: string;
}): Micro037RenderBinding | null {
  const micro035Evidence = loadMicro035CanaryExecutionEvidence({
    ...(input.repository ? { repository: input.repository } : {}),
    ...(input.micro035EvidenceJsonPath
      ? { jsonFilePath: input.micro035EvidenceJsonPath }
      : input.micro035EvidenceJsonPath === undefined
        ? { jsonFilePath: DEFAULT_MICRO_037_RENDER_EVIDENCE_JSON_PATH }
        : {}),
  });

  if (micro035Evidence?.status === "DONE") {
    const from035 = findEnUsE001InMicro035Evidence(micro035Evidence);
    if (from035) {
      return from035;
    }
  }

  const micro034Evidence = loadMicro034CanaryExecutionEvidence({
    ...(input.repository ? { repository: input.repository } : {}),
    ...(input.micro034EvidenceJsonPath
      ? { jsonFilePath: input.micro034EvidenceJsonPath }
      : {}),
  });

  if (micro034Evidence?.status === "DONE") {
    return findEnUsE001InMicro034Evidence(micro034Evidence);
  }

  return null;
}
