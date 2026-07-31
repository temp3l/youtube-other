import type {
  ApplicationCommandHandler,
  ApplicationQueryHandler,
} from "./contracts.js";
import type { ApplicationPorts } from "./ports.js";

export interface ApplicationHandlers {
  readonly startWorkflow: ApplicationCommandHandler<unknown, unknown>;
  readonly getWorkflow: ApplicationQueryHandler<unknown, unknown>;
  readonly recordApproval: ApplicationCommandHandler<unknown, unknown>;
}

export interface ApplicationComposition {
  readonly ports: ApplicationPorts;
  readonly handlers: ApplicationHandlers;
}

/**
 * The sole application construction boundary. Adapters receive selected
 * handlers; they never locate dependencies by name or construct providers.
 */
export function createApplicationComposition(input: {
  readonly ports: ApplicationPorts;
  readonly handlers: ApplicationHandlers;
}): ApplicationComposition {
  return Object.freeze({
    ports: Object.freeze({ ...input.ports }),
    handlers: Object.freeze({ ...input.handlers }),
  });
}
