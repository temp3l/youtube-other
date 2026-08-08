export interface HistoryApprovalPackProgressEventV35 {
  readonly completed: number;
  readonly total: number;
  readonly episodeId?: string;
  readonly phase?: "verification" | "episodes" | "bundle";
}

export function formatHistoryApprovalPackProgressPercent(
  completed: number,
  total: number
): string {
  if (total <= 0) {
    return "0%";
  }
  const percent = Math.min(100, Math.round((completed / total) * 100));
  return `${percent}%`;
}

export function formatHistoryApprovalPackProgressLine(
  event: HistoryApprovalPackProgressEventV35
): string {
  const percent = formatHistoryApprovalPackProgressPercent(
    event.completed,
    event.total
  );
  const phaseLabel =
    event.phase === "verification"
      ? "verification"
      : event.phase === "bundle"
        ? "bundle"
        : "episodes";
  const episodeSuffix = event.episodeId ? ` ${event.episodeId}` : "";
  return `History approval packs: ${percent} (${event.completed}/${event.total} ${phaseLabel})${episodeSuffix}`;
}

export function reportHistoryApprovalPackProgress(
  event: HistoryApprovalPackProgressEventV35,
  stream: NodeJS.WritableStream = process.stderr
): void {
  const line = formatHistoryApprovalPackProgressLine(event);
  const isComplete = event.completed >= event.total && event.total > 0;
  stream.write(isComplete ? `${line}\n` : `\r${line}`);
}
