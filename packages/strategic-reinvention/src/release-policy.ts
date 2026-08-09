import { resolveExecutionPolicy, type ExecutionPolicy } from "@mediaforge/config";

/** Canonical Veronica adapter: declares policy only; it never activates a provider. */
export function veronicaExecutionPolicy(input: {
  readonly configurationRevision: string;
  readonly dependencyIdentity: Readonly<Record<string, string>>;
  readonly maximumMinor: bigint;
}): ExecutionPolicy {
  return resolveExecutionPolicy({
    schemaVersion: "execution-policy.v1",
    contentProfileId: "veronicabenini",
    policyVersion: "veronicabenini.execution-policy.v1",
    configurationRevision: input.configurationRevision,
    dependencyIdentity: input.dependencyIdentity,
    provider: { id: "none", configurationVersion: "veronica-human-supplied.v1", dispatchEnabled: false },
    budget: { currency: "EUR", maximumMinor: input.maximumMinor, reservationRequired: true },
    requiredApprovalGates: ["source", "voice", "final-render", "publish"],
    preflightRequired: true,
  });
}
