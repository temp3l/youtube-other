import pino from "pino";
export * from "./pricing.js";
export * from "./telemetry.js";

export interface LoggerContext {
  episodeId?: string;
  pipelineRunId?: string;
  stepName?: string;
  sceneId?: string;
  provider?: string;
  artifactId?: string;
  commandName?: string;
  executionId?: string;
  npmScript?: string;
}

export function createLogger(level: pino.LevelWithSilent = "info", destination = process.stdout): pino.Logger {
  return pino({
    level,
    redact: {
      paths: [
        "apiKey",
        "authorization",
        "*.apiKey",
        "*.authorization",
        "*.cookie",
        "cookie",
        "cookies",
        "accessToken",
        "signedUrl"
      ],
      censor: "[REDACTED]"
    }
  }, destination);
}

export function childLogger(logger: pino.Logger, context: LoggerContext): pino.Logger {
  return logger.child(context);
}

export function toLogContext(context: LoggerContext): Record<string, string | undefined> {
  return {
    episodeId: context.episodeId,
    pipelineRunId: context.pipelineRunId,
    stepName: context.stepName,
    sceneId: context.sceneId,
    provider: context.provider,
    artifactId: context.artifactId,
    commandName: context.commandName,
    executionId: context.executionId,
    npmScript: context.npmScript
  };
}
