import { createDarkTruthTaskRegistrations } from "@mediaforge/dark-truth";
import { createMathTaskRegistrations } from "@mediaforge/math-education";
import {
  ProductionTaskCallerAdapter,
  createTaskRegistry,
} from "@mediaforge/workflow-engine";

/**
 * Transitional CLI composition point. It centralizes task-registry assembly
 * while command parsing and output remain in `apps/cli` until Task 08.
 */
export function createLegacyCliProductionCallerAdapter(): ProductionTaskCallerAdapter {
  return new ProductionTaskCallerAdapter(
    createTaskRegistry([
      ...createDarkTruthTaskRegistrations(),
      ...createMathTaskRegistrations(),
    ])
  );
}
