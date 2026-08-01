import { z } from "zod";
import type { SpeechRetryClass } from "./errors.js";

export const speechGenerationStateSchema = z.enum([
  "QUEUED",
  "PREFLIGHT",
  "GENERATING",
  "POST_PROCESSING",
  "SUCCEEDED",
  "RETRYABLE_FAILURE",
  "BLOCKED_QUOTA",
  "BLOCKED_CONFIGURATION",
  "BLOCKED_CONSENT",
  "FAILED_PERMANENT",
  "CANCELLED",
]);
export type SpeechGenerationState = z.infer<typeof speechGenerationStateSchema>;
const transitions: Readonly<
  Record<SpeechGenerationState, readonly SpeechGenerationState[]>
> = {
  QUEUED: ["PREFLIGHT", "CANCELLED"],
  PREFLIGHT: [
    "GENERATING",
    "BLOCKED_QUOTA",
    "BLOCKED_CONFIGURATION",
    "BLOCKED_CONSENT",
    "RETRYABLE_FAILURE",
    "FAILED_PERMANENT",
    "CANCELLED",
  ],
  GENERATING: [
    "POST_PROCESSING",
    "RETRYABLE_FAILURE",
    "FAILED_PERMANENT",
    "CANCELLED",
  ],
  POST_PROCESSING: [
    "SUCCEEDED",
    "RETRYABLE_FAILURE",
    "FAILED_PERMANENT",
    "CANCELLED",
  ],
  SUCCEEDED: [],
  RETRYABLE_FAILURE: ["QUEUED", "CANCELLED"],
  BLOCKED_QUOTA: [],
  BLOCKED_CONFIGURATION: [],
  BLOCKED_CONSENT: [],
  FAILED_PERMANENT: [],
  CANCELLED: [],
};
export function canTransitionSpeechGeneration(
  from: SpeechGenerationState,
  to: SpeechGenerationState
): boolean {
  return transitions[from].includes(to);
}
export function assertSpeechGenerationTransition(
  from: SpeechGenerationState,
  to: SpeechGenerationState
): void {
  if (!canTransitionSpeechGeneration(from, to))
    throw new Error(`Invalid speech generation transition: ${from} -> ${to}`);
}
export function failureStateForRetryClass(
  retryClass: SpeechRetryClass
): SpeechGenerationState {
  return retryClass === "retryable"
    ? "RETRYABLE_FAILURE"
    : retryClass === "cancelled"
      ? "CANCELLED"
      : "FAILED_PERMANENT";
}
