export interface AuditFact {
  readonly id: string;
  readonly workspaceId: string;
  readonly action: string;
  readonly subjectId: string;
  readonly correlationId: string;
  readonly occurredAt: string;
}

export interface BudgetReservation { readonly id: string; readonly workspaceId: string; readonly amount: number; readonly state: "reserved" | "settled" | "released"; }

/** Deterministic contract implementation; production persistence supplies transactionality. */
export class UsageAuditLedger {
  private readonly facts: AuditFact[] = [];
  private readonly reservations = new Map<string, BudgetReservation>();
  public append(fact: AuditFact): void { this.facts.push(Object.freeze({ ...fact })); }
  public audit(workspaceId: string): readonly AuditFact[] { return this.facts.filter((fact) => fact.workspaceId === workspaceId).map((fact) => ({ ...fact })); }
  public reserve(input: Omit<BudgetReservation, "state">, limit: number): BudgetReservation {
    const active = [...this.reservations.values()].filter((entry) => entry.workspaceId === input.workspaceId && entry.state === "reserved").reduce((total, entry) => total + entry.amount, 0);
    if (active + input.amount > limit) throw new Error("quota_exceeded");
    const reservation: BudgetReservation = { ...input, state: "reserved" }; this.reservations.set(input.id, reservation); return reservation;
  }
  public settle(id: string): BudgetReservation { return this.update(id, "settled"); }
  public release(id: string): BudgetReservation { return this.update(id, "released"); }
  private update(id: string, state: "settled" | "released"): BudgetReservation {
    const current = this.reservations.get(id); if (!current || current.state !== "reserved") throw new Error("reservation_not_active");
    const next = { ...current, state }; this.reservations.set(id, next); return next;
  }
}
