import {
  computePerformanceObservationFingerprint,
  markPerformanceObservationReplay,
  validateMicrodramaPerformanceObservation,
  type MicrodramaPerformanceObservation,
} from "@mediaforge/domain";

import {
  type AppendPerformanceObservationInput,
  type AppendPerformanceObservationResult,
  type MicrodramaPerformancePort,
  MicrodramaPerformanceConflictError,
} from "./microdrama-performance-port.js";

function observationFingerprint(
  observation: MicrodramaPerformanceObservation
): string {
  return computePerformanceObservationFingerprint({
    identity: observation.identity,
    raw: observation.raw,
    baseline: observation.baseline,
    observedAt: observation.observedAt,
    idempotencyKey: observation.idempotencyKey,
  });
}

export class FakeMicrodramaPerformanceRepository implements MicrodramaPerformancePort {
  private readonly observationsById = new Map<string, MicrodramaPerformanceObservation>();
  private readonly observationsByIdempotencyKey = new Map<
    string,
    MicrodramaPerformanceObservation
  >();
  private migrated = false;

  public migratePerformance(): void {
    this.migrated = true;
  }

  public appendObservation(
    input: AppendPerformanceObservationInput
  ): AppendPerformanceObservationResult {
    this.requireMigrated();
    const observation = validateMicrodramaPerformanceObservation({
      ...input.observation,
      regenerationRationale: "new-observation",
    });
    const fingerprint = observationFingerprint(observation);
    if (fingerprint !== observation.fingerprint) {
      throw new Error("Performance observation fingerprint mismatch.");
    }

    const existingByKey = this.observationsByIdempotencyKey.get(
      observation.idempotencyKey
    );
    if (existingByKey) {
      if (observationFingerprint(existingByKey) !== fingerprint) {
        throw new MicrodramaPerformanceConflictError(
          "Performance idempotency key conflicts with another request."
        );
      }
      return {
        observation: markPerformanceObservationReplay(existingByKey),
        replayed: true,
      };
    }

    const duplicate = [...this.observationsById.values()].find(
      (candidate) =>
        candidate.identity.publicationId === observation.identity.publicationId &&
        candidate.identity.publicationRevision ===
          observation.identity.publicationRevision &&
        candidate.identity.observationWindow.windowStart ===
          observation.identity.observationWindow.windowStart &&
        candidate.identity.observationWindow.windowEnd ===
          observation.identity.observationWindow.windowEnd &&
        observationFingerprint(candidate) === fingerprint
    );
    if (duplicate) {
      this.observationsByIdempotencyKey.set(
        observation.idempotencyKey,
        duplicate
      );
      return {
        observation: markPerformanceObservationReplay(duplicate),
        replayed: true,
      };
    }

    this.observationsById.set(observation.observationId, observation);
    this.observationsByIdempotencyKey.set(
      observation.idempotencyKey,
      observation
    );
    return { observation, replayed: false };
  }

  public getObservationById(
    observationId: string
  ): MicrodramaPerformanceObservation | null {
    return this.observationsById.get(observationId) ?? null;
  }

  public getObservationByIdempotencyKey(
    idempotencyKey: string
  ): MicrodramaPerformanceObservation | null {
    return this.observationsByIdempotencyKey.get(idempotencyKey) ?? null;
  }

  public listObservationsByEpisode(input: {
    readonly seriesId: string;
    readonly episodeId: string;
    readonly locale?: string;
  }): readonly MicrodramaPerformanceObservation[] {
    return [...this.observationsById.values()]
      .filter((observation) => {
        if (observation.identity.seriesId !== input.seriesId) {
          return false;
        }
        if (observation.identity.episodeId !== input.episodeId) {
          return false;
        }
        if (
          input.locale !== undefined &&
          observation.identity.locale !== input.locale
        ) {
          return false;
        }
        return true;
      })
      .sort((left, right) =>
        left.observedAt.localeCompare(right.observedAt)
      );
  }

  private requireMigrated(): void {
    if (!this.migrated) {
      throw new Error("Microdrama performance repository is not migrated.");
    }
  }
}
