import { SpeechDomainError } from "./errors.js";
import type {
  SpeechGenerationCommand,
  SpeechGenerationResult,
} from "./service.js";

export interface SpeechWorkflowApplication {
  generate(command: SpeechGenerationCommand): Promise<SpeechGenerationResult>;
}

export interface SpeechWorkflowJournalEntry {
  readonly task: "speech-generate";
  readonly provider: "openai" | "elevenlabs" | "unresolved";
  readonly voiceProfileVersionId: string;
  readonly generationId: string;
  readonly cacheHit: boolean;
  readonly status:
    | "SUCCEEDED"
    | "RETRYABLE_FAILURE"
    | "BLOCKED"
    | "FAILED_PERMANENT";
  readonly artifacts: {
    readonly raw: readonly string[];
    readonly master?: string;
  };
  readonly errorCode?: string;
  readonly nextAction: string;
}

/** Durable workflow seam; callers append the returned value to their existing journal. */
export class SpeechWorkflowTaskAdapter {
  public constructor(private readonly application: SpeechWorkflowApplication) {}

  public async execute(
    command: SpeechGenerationCommand
  ): Promise<SpeechWorkflowJournalEntry> {
    try {
      const result = await this.application.generate(command);
      return {
        task: "speech-generate",
        provider: result.profile.configuration.provider,
        voiceProfileVersionId: result.profile.profileVersionId,
        generationId: result.generationId,
        cacheHit: result.cacheHit,
        status: "SUCCEEDED",
        artifacts: {
          raw: result.rawArtifacts.map((artifact) => artifact.artifactId),
          master: result.masterArtifact.artifactId,
        },
        nextAction: "Continue with narration-aware rendering.",
      };
    } catch (error: unknown) {
      if (!(error instanceof SpeechDomainError)) throw error;
      const status =
        error.retryClass === "retryable"
          ? "RETRYABLE_FAILURE"
          : error.retryClass === "blocked"
            ? "BLOCKED"
            : "FAILED_PERMANENT";
      return {
        task: "speech-generate",
        provider: "unresolved",
        voiceProfileVersionId:
          command.replacementProfileVersionId ?? "unresolved",
        generationId: command.generationId,
        cacheHit: false,
        status,
        artifacts: { raw: [] },
        errorCode: error.code,
        nextAction:
          status === "RETRYABLE_FAILURE"
            ? "Retry the same generation after the provider recovers."
            : status === "BLOCKED"
              ? "Resolve the reported quota, configuration, or consent block before creating a replacement."
              : "Inspect the permanent failure and explicitly select a replacement profile if appropriate.",
      };
    }
  }
}
