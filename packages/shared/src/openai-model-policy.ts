/**
 * The only production defaults for OpenAI capability selection.
 *
 * Keep endpoint support in the type: callers cannot accidentally attach a
 * Responses reasoning option to image, speech, transcription, or chat calls.
 */
export type OpenAiReasoningEffort = "none" | "low" | "medium" | "high";

export type OpenAiResponsesModel =
  | "gpt-5.4-mini"
  | "gpt-5.6-luna"
  | "gpt-5.6-terra"
  | "gpt-5.6-sol";
export type OpenAiNonReasoningResponsesModel = "gpt-4.1-mini";
export type OpenAiImageModel = "gpt-image-2";
export type OpenAiSpeechModel = "gpt-4o-mini-tts";
export type OpenAiTranscriptionModel = "whisper-1";

export type OpenAiCapability =
  | "story-rewrite"
  | "localization"
  | "short-rewrite"
  | "validation"
  | "repair"
  | "dynamic-genre-analysis"
  | "youtube-metadata"
  | "metadata-repair"
  | "image-prompt-compiler"
  | "veronica-visual-qa-scene"
  | "veronica-visual-qa-sequence"
  | "veronica-visual-qa-escalation"
  | "veronica-visual-qa-remediation"
  | "veronica-visual-qa-final-adjudication"
  | "veronica-post-generation-visual-qa"
  | "history-research"
  | "history-escalation"
  | "history-visual-direction"
  | "image-generation"
  | "image-edit"
  | "thumbnail-generation"
  | "speech-synthesis"
  | "transcription"
  | "transcript-cleanup"
  | "script-rewrite";

export type OpenAiCapabilityPolicy =
  | Readonly<{
      endpoint: "responses";
      model: OpenAiResponsesModel;
      reasoning: OpenAiReasoningEffort;
    }>
  | Readonly<{
      endpoint: "responses" | "chat-completions";
      model: OpenAiNonReasoningResponsesModel;
      reasoning: null;
    }>
  | Readonly<{
      endpoint: "images";
      model: OpenAiImageModel;
      reasoning: null;
    }>
  | Readonly<{
      endpoint: "speech";
      model: OpenAiSpeechModel;
      reasoning: null;
    }>
  | Readonly<{
      endpoint: "transcription";
      model: OpenAiTranscriptionModel;
      reasoning: null;
    }>;

export type OpenAiCapabilityPolicyRegistry = Readonly<
  Record<OpenAiCapability, OpenAiCapabilityPolicy>
>;

const responses = (
  model: OpenAiResponsesModel,
  reasoning: OpenAiReasoningEffort
) => ({ endpoint: "responses" as const, model, reasoning });

/** Production policy version belongs in cache/request identities. */
export const OPENAI_CAPABILITY_POLICY_VERSION = "openai-capability-policy-v1";

export const DEFAULT_OPENAI_CAPABILITY_POLICY = {
  "story-rewrite": responses("gpt-5.6-terra", "high"),
  localization: responses("gpt-5.6-terra", "medium"),
  "short-rewrite": responses("gpt-5.6-terra", "medium"),
  validation: responses("gpt-5.4-mini", "low"),
  repair: responses("gpt-5.4-mini", "low"),
  "dynamic-genre-analysis": responses("gpt-5.4-mini", "low"),
  "youtube-metadata": responses("gpt-5.4-mini", "none"),
  "metadata-repair": responses("gpt-5.4-mini", "low"),
  "image-prompt-compiler": responses("gpt-5.6-terra", "low"),
  "veronica-visual-qa-scene": responses("gpt-5.4-mini", "low"),
  "veronica-visual-qa-sequence": responses("gpt-5.4-mini", "low"),
  "veronica-visual-qa-escalation": responses("gpt-5.6-terra", "medium"),
  "veronica-visual-qa-remediation": responses("gpt-5.6-terra", "medium"),
  "veronica-visual-qa-final-adjudication": responses("gpt-5.6-sol", "medium"),
  "veronica-post-generation-visual-qa": responses("gpt-5.4-mini", "low"),
  // The Responses API supports this explicit zero-reasoning mode for GPT-5.
  "history-research": responses("gpt-5.6-luna", "none"),
  "history-escalation": responses("gpt-5.6-terra", "medium"),
  // gpt-4.1-mini is deliberately benchmarkable against a future Responses policy.
  "history-visual-direction": {
    endpoint: "responses",
    model: "gpt-4.1-mini",
    reasoning: null,
  },
  "image-generation": { endpoint: "images", model: "gpt-image-2", reasoning: null },
  "image-edit": { endpoint: "images", model: "gpt-image-2", reasoning: null },
  "thumbnail-generation": { endpoint: "images", model: "gpt-image-2", reasoning: null },
  "speech-synthesis": { endpoint: "speech", model: "gpt-4o-mini-tts", reasoning: null },
  transcription: { endpoint: "transcription", model: "whisper-1", reasoning: null },
  // These legacy Chat Completions paths have no supported reasoning control.
  "transcript-cleanup": { endpoint: "chat-completions", model: "gpt-4.1-mini", reasoning: null },
  "script-rewrite": { endpoint: "chat-completions", model: "gpt-4.1-mini", reasoning: null },
} as const satisfies OpenAiCapabilityPolicyRegistry;

export function openAiResponsesReasoning(
  policy: OpenAiCapabilityPolicy
): { readonly reasoning: { readonly effort: OpenAiReasoningEffort } } | Record<never, never> {
  return policy.endpoint === "responses" && policy.reasoning !== null
    ? { reasoning: { effort: policy.reasoning } }
    : {};
}

export function requireOpenAiResponsesPolicy(
  policy: OpenAiCapabilityPolicy
): Extract<OpenAiCapabilityPolicy, { readonly endpoint: "responses" }> {
  if (policy.endpoint !== "responses" || policy.reasoning === null) {
    throw new Error(`OpenAI capability is not a reasoning-enabled Responses policy.`);
  }
  return policy;
}

export function isOpenAiCapability(value: string): value is OpenAiCapability {
  return value in DEFAULT_OPENAI_CAPABILITY_POLICY;
}
