import type { MicrodramaPerformanceObservation } from "@mediaforge/domain";

export type AppendPerformanceObservationInput = {
  readonly observation: MicrodramaPerformanceObservation;
};

export type AppendPerformanceObservationResult = {
  readonly observation: MicrodramaPerformanceObservation;
  readonly replayed: boolean;
};

export interface MicrodramaPerformancePort {
  migratePerformance(): void;
  appendObservation(
    input: AppendPerformanceObservationInput
  ): AppendPerformanceObservationResult;
  getObservationById(
    observationId: string
  ): MicrodramaPerformanceObservation | null;
  getObservationByIdempotencyKey(
    idempotencyKey: string
  ): MicrodramaPerformanceObservation | null;
  listObservationsByEpisode(input: {
    readonly seriesId: string;
    readonly episodeId: string;
    readonly locale?: string;
  }): readonly MicrodramaPerformanceObservation[];
}

export class MicrodramaPerformanceConflictError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "MicrodramaPerformanceConflictError";
  }
}
