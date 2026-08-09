import {
  canonicalVisualDirectionProfileId,
  resolvePersistedVisualDirection,
  type PersistedVisualDirectionInput,
  type PersistedVisualDirectionResolution,
  type PersistedVisualDirectionStore,
} from "@mediaforge/visual-planning";

export interface VeronicaCameraDirectionInput extends Omit<PersistedVisualDirectionInput, "contentProfileId"> {
  readonly contentProfileId?:
    | "veronicabenini"
    | "veronica-benini"
    | "strategic-reinvention";
}

/**
 * Veronica adapter for the shared language-independent persisted direction contract.
 * It never invokes a provider; callers supply the durable artifact store from VRI-04.
 */
export async function resolvePersistedVeronicaCameraDirection(input: {
  readonly direction: VeronicaCameraDirectionInput;
  readonly store: PersistedVisualDirectionStore;
}): Promise<PersistedVisualDirectionResolution> {
  return resolvePersistedVisualDirection({
    direction: {
      ...input.direction,
      contentProfileId: canonicalVisualDirectionProfileId(
        input.direction.contentProfileId ?? "veronicabenini",
      ),
    },
    store: input.store,
  });
}
