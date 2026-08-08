import {
  type QuotaLimitEnforcement,
  type ReservationAdmission,
  type ReservationState,
  type ReservationTransition,
  reservationAdmissionSchema,
} from "./usage-quota-contracts.js";

const VALID_RESERVATION_TRANSITIONS: Readonly<
  Record<ReservationState, readonly ReservationState[]>
> = {
  reserved: ["settled", "released"],
  settled: [],
  released: [],
};

export function evaluateReservationAdmission(input: {
  readonly limitUnits: number;
  readonly reservedUnits: number;
  readonly settledUnits: number;
  readonly requestedUnits: number;
  readonly enforcement: QuotaLimitEnforcement;
}): ReservationAdmission {
  const committed = input.reservedUnits + input.settledUnits;
  const remaining = Math.max(0, input.limitUnits - committed);
  const wouldExceed = committed + input.requestedUnits > input.limitUnits;

  if (!wouldExceed) {
    return reservationAdmissionSchema.parse({
      allowed: true,
      warning: remaining < input.requestedUnits * 2,
      enforcement: input.enforcement,
      remainingUnits: remaining,
    });
  }

  if (input.enforcement === "soft") {
    return reservationAdmissionSchema.parse({
      allowed: true,
      warning: true,
      enforcement: input.enforcement,
      remainingUnits: remaining,
      reason: "soft_limit_exceeded",
    });
  }

  return reservationAdmissionSchema.parse({
    allowed: false,
    warning: true,
    enforcement: input.enforcement,
    remainingUnits: remaining,
    reason: "hard_limit_exceeded",
  });
}

export function canTransitionReservation(
  fromState: ReservationState,
  toState: ReservationState
): boolean {
  return VALID_RESERVATION_TRANSITIONS[fromState].includes(toState);
}

export function reconcileReservationTransition(input: {
  readonly reservationId: string;
  readonly fromState: ReservationState;
  readonly reservedUnits: number;
  readonly actualUnits: number;
}): ReservationTransition {
  if (input.fromState !== "reserved") {
    throw new Error("Only reserved reservations can be reconciled.");
  }
  const settledUnits = Math.max(1, input.actualUnits);
  return {
    reservationId: input.reservationId,
    fromState: "reserved",
    toState: "settled",
    reservedUnits: input.reservedUnits,
    settledUnits,
  };
}

export function releaseReservationTransition(input: {
  readonly reservationId: string;
  readonly fromState: ReservationState;
  readonly reservedUnits: number;
}): ReservationTransition {
  if (!canTransitionReservation(input.fromState, "released")) {
    throw new Error("Reservation cannot be released from its current state.");
  }
  return {
    reservationId: input.reservationId,
    fromState: input.fromState,
    toState: "released",
    reservedUnits: input.reservedUnits,
  };
}
