/**
 * Model availability validation for History V3.3 live research.
 * Treat configured names as strings; fail clearly before paid work when
 * availability cannot be confirmed.
 */

export class HistoryModelAvailabilityErrorV33 extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HistoryModelAvailabilityErrorV33";
  }
}

export interface ModelAvailabilityClientV3_3 {
  readonly models: {
    retrieve(model: string): Promise<{ readonly id: string }>;
  };
}

export async function assertHistoryModelsAvailableV33(input: {
  readonly models: readonly string[];
  readonly client?: ModelAvailabilityClientV3_3;
  readonly skip?: boolean;
}): Promise<{ readonly validated: readonly string[]; readonly skipped: boolean }> {
  const unique = [...new Set(input.models.map((model) => model.trim()).filter(Boolean))];
  if (unique.length === 0)
    throw new HistoryModelAvailabilityErrorV33(
      "No History V3.3 semantic models configured."
    );
  if (input.skip || !input.client)
    return { validated: unique, skipped: true };
  const validated: string[] = [];
  for (const model of unique) {
    try {
      const retrieved = await input.client.models.retrieve(model);
      if (!retrieved?.id)
        throw new HistoryModelAvailabilityErrorV33(
          `Configured History model is unavailable: ${model}`
        );
      validated.push(retrieved.id);
    } catch (error) {
      if (error instanceof HistoryModelAvailabilityErrorV33) throw error;
      throw new HistoryModelAvailabilityErrorV33(
        `Configured History model is unavailable: ${model}. ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
  return { validated, skipped: false };
}
