import { Command } from "commander";

export function mergeCommandOptions<T extends object>(
  command: Command | undefined,
  options: T
): T {
  const lineage: Command[] = [];
  let current = command;
  while (current) {
    lineage.unshift(current);
    current = current.parent ?? undefined;
  }
  const merged: Record<string, unknown> = {};
  for (const entry of lineage) {
    Object.assign(merged, entry.opts());
  }
  return {
    ...(merged as T),
    ...options,
  };
}
