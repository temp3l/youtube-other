export type RemoteJobState =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "partial"
  | "unknown";

export interface RemoteClipStatusRecord {
  readonly clipId: string;
  readonly status?: string;
  readonly errorMessage?: string;
  readonly attempt?: number;
  readonly durationMs?: number;
}

export interface RawRemoteLogEntry {
  readonly clipId: string;
  readonly text: string;
}

export interface RawRemoteStatusJob {
  readonly jobId: string;
  readonly episodeId?: string;
  readonly generatedAt?: string;
  readonly totalClips?: number;
  readonly clipIds?: readonly string[];
  readonly clipResults?: readonly RemoteClipStatusRecord[];
  readonly logCount?: number;
  readonly logs?: readonly RawRemoteLogEntry[];
  readonly updatedAtMs?: number;
  readonly parseErrors?: readonly string[];
}

export interface RemoteStatusCounts {
  readonly total: number;
  readonly succeeded: number;
  readonly failed: number;
  readonly missing: number;
}

export interface RemoteStatusJobSummary {
  readonly jobId: string;
  readonly episodeId?: string;
  readonly generatedAt?: string;
  readonly state: RemoteJobState;
  readonly counts: RemoteStatusCounts;
  readonly logCount: number;
  readonly logs?: readonly RawRemoteLogEntry[];
  readonly updatedAtMs?: number;
  readonly parseErrors: readonly string[];
}

function normalizeCount(value: number | undefined): number {
  return Number.isInteger(value) && value !== undefined && value > 0 ? value : 0;
}

export function summarizeRemoteStatusJob(
  job: RawRemoteStatusJob
): RemoteStatusJobSummary {
  const clipResults = [...(job.clipResults ?? [])];
  const total =
    normalizeCount(job.totalClips) ||
    Math.max(job.clipIds?.length ?? 0, clipResults.length);
  const succeeded = clipResults.filter(
    (result) => result.status === "succeeded"
  ).length;
  const failed = clipResults.filter((result) => result.status === "failed").length;
  const missing = Math.max(total - succeeded - failed, 0);
  const parseErrors = [...(job.parseErrors ?? [])];

  let state: RemoteJobState = "unknown";
  if (total > 0) {
    if (succeeded === total) {
      state = "succeeded";
    } else if (failed === total) {
      state = "failed";
    } else if (succeeded === 0 && failed === 0) {
      state = "queued";
    } else if (failed > 0) {
      state = "partial";
    } else if (succeeded > 0 && missing > 0) {
      state = "running";
    }
  } else if (parseErrors.length > 0) {
    state = "unknown";
  }

  return {
    jobId: job.jobId,
    ...(job.episodeId ? { episodeId: job.episodeId } : {}),
    ...(job.generatedAt ? { generatedAt: job.generatedAt } : {}),
    state,
    counts: {
      total,
      succeeded,
      failed,
      missing,
    },
    logCount: job.logCount ?? job.logs?.length ?? 0,
    ...(job.logs ? { logs: job.logs } : {}),
    ...(job.updatedAtMs ? { updatedAtMs: job.updatedAtMs } : {}),
    parseErrors,
  };
}

