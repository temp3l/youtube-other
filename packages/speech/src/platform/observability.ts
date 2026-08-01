import { currentExecutionTelemetry } from "@mediaforge/observability";
import type { SpeechInstrumentation } from "./service.js";

const safeDetailKeys = new Set([
  "generationId",
  "videoId",
  "genreId",
  "provider",
  "profileVersionId",
  "textHash",
  "characterCount",
  "durationMs",
  "cacheHit",
  "status",
  "errorCode",
]);

function safeDetails(
  value: Readonly<Record<string, unknown>>
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(
      ([key, item]) =>
        safeDetailKeys.has(key) &&
        (item === undefined ||
          typeof item === "string" ||
          typeof item === "number" ||
          typeof item === "boolean")
    )
  );
}

/** Existing execution telemetry binding with bounded labels and no narration/provider configuration. */
export class ExecutionSpeechInstrumentation implements SpeechInstrumentation {
  public log(event: Record<string, unknown>, message: string): void {
    currentExecutionTelemetry()?.recordEvent({
      name: "speech.log",
      at: new Date().toISOString(),
      details: { message: message.slice(0, 160), ...safeDetails(event) },
    });
  }

  public metric(
    name: string,
    value: number,
    labels: Readonly<Record<string, string>>
  ): void {
    currentExecutionTelemetry()?.recordEvent({
      name: "speech.metric",
      at: new Date().toISOString(),
      details: {
        metric: name.slice(0, 120),
        value,
        labels: Object.fromEntries(
          Object.entries(labels)
            .slice(0, 8)
            .map(([key, item]) => [key.slice(0, 40), item.slice(0, 80)])
        ),
      },
    });
  }

  public async span<T>(
    name: string,
    attributes: Readonly<Record<string, string | number | boolean>>,
    work: () => Promise<T>
  ): Promise<T> {
    const startedAt = Date.now();
    try {
      const result = await work();
      this.spanEvent(name, attributes, startedAt, "succeeded");
      return result;
    } catch (error) {
      this.spanEvent(name, attributes, startedAt, "failed");
      throw error;
    }
  }

  private spanEvent(
    name: string,
    attributes: Readonly<Record<string, string | number | boolean>>,
    startedAt: number,
    status: string
  ): void {
    currentExecutionTelemetry()?.recordEvent({
      name: "speech.span",
      at: new Date().toISOString(),
      details: {
        span: name.slice(0, 120),
        status,
        durationMs: Date.now() - startedAt,
        attributes,
      },
    });
  }
}
