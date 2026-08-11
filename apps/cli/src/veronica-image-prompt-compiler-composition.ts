import path from "node:path";
import { serializeOpenAIError, writeOpenAIDebugLog } from "@mediaforge/shared";
import {
  DeterministicVeronicaImagePromptCompiler,
  FileVeronicaImagePromptCompilationCache,
  veronicaImagePromptCompilationBatchSchema,
  type VeronicaImagePromptCompilerPort,
} from "@mediaforge/strategic-reinvention";

const PRICING: Readonly<Record<string, { readonly input: number; readonly output: number }>> = {
  "gpt-5.6-terra": { input: 2, output: 12 },
  "gpt-5.6-sol": { input: 5, output: 30 },
};

interface OpenAiCompilerResponse {
  readonly id?: string;
  readonly output_text?: string;
  readonly usage?: {
    readonly input_tokens?: number;
    readonly output_tokens?: number;
    readonly input_tokens_details?: { readonly cached_tokens?: number };
  };
}

interface OpenAiCompilerClient {
  readonly responses: {
    create(request: Record<string, unknown>): Promise<OpenAiCompilerResponse>;
  };
}

export class OpenAiVeronicaImagePromptCompilerAdapter
  implements VeronicaImagePromptCompilerPort
{
  constructor(
    private readonly client: OpenAiCompilerClient,
    private readonly episodeRoot: string,
  ) {}

  async compileBatch(input: Parameters<VeronicaImagePromptCompilerPort["compileBatch"]>[0]) {
    const request = {
      model: input.model.model,
      reasoning: { effort: input.model.reasoningEffort },
      max_output_tokens: input.model.maxOutputTokens ?? Math.max(2_000, input.items.length * 900),
      input: [
        { role: "system", content: [{ type: "input_text", text: input.instructions }] },
        {
          role: "user",
          content: [{
            type: "input_text",
            text: JSON.stringify({
              episodeId: input.episodeId,
              scenes: input.items.map((item, index) => ({
                compilationInputHash: input.inputHashes[index],
                ...item,
              })),
            }),
          }],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "veronica_image_prompt_compilation_batch",
          strict: true,
          schema: input.jsonSchema,
        },
      },
    };
    const startedAt = Date.now();
    const caller = {
      file: "apps/cli/src/veronica-image-prompt-compiler-composition.ts",
      function: "OpenAiVeronicaImagePromptCompilerAdapter.compileBatch",
      stage: input.instructionVersion,
    };
    await writeOpenAIDebugLog({
      episodeRoot: this.episodeRoot,
      operation: "veronica-image-prompt-compilation",
      mode: "real",
      paidProviderCalled: false,
      model: input.model.model,
      endpoint: "/v1/responses",
      request,
      durationMs: 0,
      status: "pre-dispatch",
      caller,
    }).catch(() => undefined);
    try {
      const response = await this.client.responses.create(request);
      const parsed = veronicaImagePromptCompilationBatchSchema.parse(
        JSON.parse(response.output_text ?? "null") as unknown,
      );
      const usage = {
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
        cachedInputTokens: response.usage?.input_tokens_details?.cached_tokens ?? 0,
      };
      const price = PRICING[input.model.model];
      const estimatedCostUsd = price
        ? ((usage.inputTokens - usage.cachedInputTokens) * price.input
          + usage.cachedInputTokens * price.input * 0.5
          + usage.outputTokens * price.output) / 1_000_000
        : 0;
      await writeOpenAIDebugLog({
        episodeRoot: this.episodeRoot,
        operation: "veronica-image-prompt-compilation",
        mode: "real",
        paidProviderCalled: true,
        model: input.model.model,
        endpoint: "/v1/responses",
        request,
        response,
        durationMs: Date.now() - startedAt,
        status: "success",
        caller,
      }).catch(() => undefined);
      return {
        output: parsed,
        ...(response.id ? { requestId: response.id } : {}),
        usage,
        latencyMs: Date.now() - startedAt,
        estimatedCostUsd,
      };
    } catch (error) {
      await writeOpenAIDebugLog({
        episodeRoot: this.episodeRoot,
        operation: "veronica-image-prompt-compilation",
        mode: "real",
        paidProviderCalled: true,
        model: input.model.model,
        endpoint: "/v1/responses",
        request,
        durationMs: Date.now() - startedAt,
        status: "error",
        error: serializeOpenAIError(error),
        caller,
      }).catch(() => undefined);
      throw error;
    }
  }
}

export async function createVeronicaImagePromptCompilerComposition(input: {
  readonly workspaceRoot: string;
  readonly episodeDir: string;
}) {
  return {
    strategy: "deterministic-v1" as const,
    compiler: new DeterministicVeronicaImagePromptCompiler(),
    cache: new FileVeronicaImagePromptCompilationCache(
      path.join(input.episodeDir, ".cache", "image-prompt-compilation"),
    ),
    model: {
      model: "deterministic-template",
      reasoningEffort: "none" as const,
      maxOutputTokens: 0,
    },
  };
}
