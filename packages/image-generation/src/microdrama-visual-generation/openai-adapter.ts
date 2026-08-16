import { createHash } from "node:crypto";

import { rewriteProviderBriefForViolenceRetry } from "@mediaforge/visual-planning";

import { loadOpenAiImageGenerationSettings } from "../openai-image.js";

import type {
  MicrodramaImageProviderPort,
  MicrodramaVisualGenerationRequest,
} from "./contracts.js";

export type OpenAiMicrodramaImageProviderOptions = {
  readonly apiKey: string;
  readonly model?: string;
  readonly size?: string;
  readonly quality?: "low" | "medium" | "high" | "auto";
  readonly baseUrl?: string;
  readonly organization?: string;
  readonly project?: string;
  readonly timeoutMs?: number;
  readonly estimatedCostMinor?: number;
  readonly providerId?: string;
  readonly onGenerated?: (bytes: Buffer) => void;
  readonly fetchImpl?: typeof fetch;
  readonly resolveProviderPrompt?: (input: {
    readonly request: MicrodramaVisualGenerationRequest;
    readonly cacheKey: string;
  }) => string;
};

type OpenAiImagesGenerateResponse = {
  readonly data?: Array<{
    readonly b64_json?: string;
    readonly revised_prompt?: string;
  }>;
  readonly id?: string;
};

export function createOpenAiMicrodramaImageProvider(
  options: OpenAiMicrodramaImageProviderOptions
): MicrodramaImageProviderPort {
  const providerId = options.providerId ?? "openai";
  const estimatedCostMinor = options.estimatedCostMinor ?? 25;
  const model = options.model ?? "gpt-image-2";
  const size = options.size ?? "1024x1536";
  const quality = options.quality ?? "medium";
  const timeoutMs = options.timeoutMs ?? 180_000;
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = (options.baseUrl ?? "https://api.openai.com").replace(/\/$/u, "");

  return {
    id: providerId,
    async generate(args: {
      readonly request: MicrodramaVisualGenerationRequest;
      readonly cacheKey: string;
      readonly abortSignal?: AbortSignal;
    }) {
      const endpoint = `${baseUrl}/v1/images/generations`;
      let promptText =
        options.resolveProviderPrompt?.({
          request: args.request,
          cacheKey: args.cacheKey,
        }) ?? args.request.promptText;

      let parsed: OpenAiImagesGenerateResponse & {
        readonly error?: { readonly message?: string };
      } | undefined;

      for (let attempt = 0; attempt < 2; attempt += 1) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        const onAbort = () => controller.abort();
        args.abortSignal?.addEventListener("abort", onAbort, { once: true });

        let response: Response;
        try {
          response = await fetchImpl(endpoint, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${options.apiKey}`,
              "Content-Type": "application/json",
              ...(options.organization
                ? { "OpenAI-Organization": options.organization }
                : {}),
              ...(options.project ? { "OpenAI-Project": options.project } : {}),
            },
            body: JSON.stringify({
              model,
              prompt: promptText,
              size,
              quality,
              n: 1,
            }),
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeout);
          args.abortSignal?.removeEventListener("abort", onAbort);
        }

        parsed = (await response.json()) as OpenAiImagesGenerateResponse & {
          readonly error?: { readonly message?: string };
        };
        if (response.ok) {
          break;
        }
        const message = parsed.error?.message ?? JSON.stringify(parsed);
        const violenceRefusal =
          response.status === 400 && /safety_violations=\s*\[\s*violence\s*\]/iu.test(message);
        if (attempt === 0 && violenceRefusal) {
          promptText = rewriteProviderBriefForViolenceRetry(promptText);
          continue;
        }
        throw new Error(
          `OpenAI image generation failed (${response.status}): ${message}`
        );
      }

      const b64 = parsed?.data?.[0]?.b64_json;
      if (!b64 || typeof b64 !== "string") {
        throw new Error("OpenAI image generation response missing b64_json.");
      }

      const bytes = Buffer.from(b64, "base64");
      if (bytes.byteLength === 0) {
        throw new Error("OpenAI image generation returned empty image bytes.");
      }

      options.onGenerated?.(bytes);

      const artifactHash = createHash("sha256").update(bytes).digest("hex");
      return {
        artifactHash,
        storageUri: `openai://visual/${args.request.sourcePlateSemanticId}/${artifactHash}.png`,
        providerRequestId:
          typeof parsed?.id === "string" && parsed.id.length > 0
            ? parsed.id
            : `openai-req-${artifactHash.slice(0, 12)}`,
        estimatedCostMinor,
      };
    },
  };
}

export function createOpenAiMicrodramaImageProviderFromEnv(input?: {
  readonly estimatedCostMinor?: number;
  readonly onGenerated?: (bytes: Buffer) => void;
  readonly fetchImpl?: typeof fetch;
  readonly resolveProviderPrompt?: OpenAiMicrodramaImageProviderOptions["resolveProviderPrompt"];
}): MicrodramaImageProviderPort {
  const settings = loadOpenAiImageGenerationSettings(process.env, {
    profile: "short",
  });
  return createOpenAiMicrodramaImageProvider({
    apiKey: settings.apiKey,
    model: settings.model,
    size: settings.requestedSize,
    quality: settings.quality,
    baseUrl: settings.baseUrl,
    organization: settings.organization,
    project: settings.project,
    timeoutMs: settings.timeoutMs,
    estimatedCostMinor: input?.estimatedCostMinor,
    onGenerated: input?.onGenerated,
    fetchImpl: input?.fetchImpl,
    resolveProviderPrompt: input?.resolveProviderPrompt,
  });
}
