import { AsyncLocalStorage } from "node:async_hooks";

import type { TaskDefinition, TaskId } from "@mediaforge/domain";

import type { TaskRegistry } from "./task-registry.js";

export const PRODUCTION_CALLER_ADAPTER_VERSION =
  "mediaforge.production-caller-adapter.v1" as const;

export interface ProductionCallerInvocation {
  readonly adapterVersion: typeof PRODUCTION_CALLER_ADAPTER_VERSION;
  readonly caller: string;
  readonly taskId: TaskId;
  readonly implementationOwner: `@mediaforge/${string}`;
  readonly implementationVersion: string;
  /** Legacy callers may only project their filesystem-owned state. */
  readonly authority: "filesystem-legacy" | "database-v1";
}

export interface ProductionCallerMigrationRoute {
  readonly caller: string;
  readonly taskId: TaskId;
  readonly compatibility: "legacy-cli" | "legacy-script" | "package-bin";
  readonly removeWhen: string;
  readonly authority?: "filesystem-legacy" | "database-v1";
}

const invocationStorage = new AsyncLocalStorage<ProductionCallerInvocation>();

/** Returns the canonical task identity while a migrated compatibility caller runs. */
export function currentProductionCallerInvocation():
  | ProductionCallerInvocation
  | undefined {
  return invocationStorage.getStore();
}

/**
 * Keeps a legacy caller's arguments, output and exit behavior while moving its
 * invocation boundary behind the canonical task registry. The callback remains
 * the owning capability implementation; this adapter adds no task policy.
 */
export class ProductionTaskCallerAdapter {
  public constructor(private readonly registry: TaskRegistry) {}

  public definition(taskId: TaskId | string): TaskDefinition {
    return this.registry.get(taskId).definition;
  }

  public invoke<TResult>(
    route: ProductionCallerMigrationRoute,
    callback: () => TResult | Promise<TResult>
  ): Promise<TResult> {
    const registration = this.registry.get(route.taskId);
    const invocation: ProductionCallerInvocation = {
      adapterVersion: PRODUCTION_CALLER_ADAPTER_VERSION,
      caller: route.caller,
      taskId: registration.definition.id,
      implementationOwner: registration.implementation.owner,
      implementationVersion: registration.definition.implementationVersion,
      authority: route.authority ?? "filesystem-legacy",
    };
    return invocationStorage.run(invocation, async () => callback());
  }
}
