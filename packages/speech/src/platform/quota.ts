import type { SpeechProviderId } from "./contracts.js";
import { SpeechDomainError } from "./errors.js";
import type { SpeechQuotaGuard } from "./service.js";

export interface SpeechQuotaPolicy {
  readonly scope: "provider" | "genre";
  readonly scopeId: string;
  readonly monthlyHardLimitCharacters: number;
}

export interface SpeechQuotaStatus {
  readonly scope: "provider" | "genre";
  readonly scopeId: string;
  readonly usedCharacters: number;
  readonly reservedCharacters: number;
  readonly hardLimitCharacters: number;
  readonly warning: boolean;
}

interface Reservation {
  readonly id: string;
  readonly keys: readonly string[];
  readonly estimatedCharacters: number;
  state: "reserved" | "settled" | "released";
  actualCharacters?: number;
}

const quotaKey = (scope: "provider" | "genre", scopeId: string): string =>
  `${scope}:${scopeId}`;

/** In-process conformance implementation; production adapters use the same atomic port in PostgreSQL. */
export class AtomicSpeechQuotaGuard implements SpeechQuotaGuard {
  private readonly policies = new Map<string, SpeechQuotaPolicy>();
  private readonly reservations = new Map<string, Reservation>();
  private sequence = Promise.resolve();

  public constructor(policies: readonly SpeechQuotaPolicy[]) {
    for (const policy of policies) {
      if (
        !Number.isSafeInteger(policy.monthlyHardLimitCharacters) ||
        policy.monthlyHardLimitCharacters < 1
      ) {
        throw new Error("Speech quota limits must be positive integers.");
      }
      this.policies.set(quotaKey(policy.scope, policy.scopeId), policy);
    }
  }

  public reserve(input: {
    readonly generationId: string;
    readonly genreId?: string;
    readonly provider: SpeechProviderId;
    readonly estimate: { readonly billableCharacters: number };
  }): Promise<{ readonly reservationId: string }> {
    return this.exclusive(async () => {
      const reservationId = `speech-quota:${input.generationId}`;
      if (this.reservations.has(reservationId)) return { reservationId };
      const keys = [
        quotaKey("provider", input.provider),
        ...(input.genreId ? [quotaKey("genre", input.genreId)] : []),
      ].filter((key) => this.policies.has(key));
      for (const key of keys) {
        const status = this.statusFor(key);
        if (
          status.usedCharacters +
            status.reservedCharacters +
            input.estimate.billableCharacters >
          status.hardLimitCharacters
        ) {
          throw new SpeechDomainError(
            "SPEECH_QUOTA_EXCEEDED",
            `Speech quota is exhausted for ${status.scope} ${status.scopeId}.`
          );
        }
      }
      this.reservations.set(reservationId, {
        id: reservationId,
        keys,
        estimatedCharacters: input.estimate.billableCharacters,
        state: "reserved",
      });
      return { reservationId };
    });
  }

  public reconcile(input: {
    readonly reservationId: string;
    readonly actualBillableCharacters: number;
  }): Promise<void> {
    return this.exclusive(async () => {
      const reservation = this.required(input.reservationId);
      if (reservation.state !== "reserved") return;
      reservation.state = "settled";
      reservation.actualCharacters = input.actualBillableCharacters;
    });
  }

  public release(reservationId: string): Promise<void> {
    return this.exclusive(async () => {
      const reservation = this.required(reservationId);
      if (reservation.state === "reserved") reservation.state = "released";
    });
  }

  public statuses(): readonly SpeechQuotaStatus[] {
    return [...this.policies.keys()].sort().map((key) => this.statusFor(key));
  }

  private statusFor(key: string): SpeechQuotaStatus {
    const policy = this.policies.get(key);
    if (!policy) throw new Error("Speech quota policy was not found.");
    let usedCharacters = 0;
    let reservedCharacters = 0;
    for (const reservation of this.reservations.values()) {
      if (!reservation.keys.includes(key)) continue;
      if (reservation.state === "settled")
        usedCharacters +=
          reservation.actualCharacters ?? reservation.estimatedCharacters;
      if (reservation.state === "reserved")
        reservedCharacters += reservation.estimatedCharacters;
    }
    return {
      ...policy,
      usedCharacters,
      reservedCharacters,
      hardLimitCharacters: policy.monthlyHardLimitCharacters,
      warning:
        (usedCharacters + reservedCharacters) /
          policy.monthlyHardLimitCharacters >=
        0.8,
    };
  }

  private required(id: string): Reservation {
    const reservation = this.reservations.get(id);
    if (!reservation)
      throw new Error("Speech quota reservation was not found.");
    return reservation;
  }

  private async exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const prior = this.sequence;
    let release: () => void = () => undefined;
    this.sequence = new Promise<void>((resolve) => {
      release = resolve;
    });
    await prior;
    try {
      return await operation();
    } finally {
      release();
    }
  }
}
