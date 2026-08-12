import { z } from "zod";

import {
  DEFAULT_OPENAI_CAPABILITY_POLICY,
  requireOpenAiResponsesPolicy,
} from "@mediaforge/shared";

import {
  retryHistoryProviderCallV33,
  type OpenAiResponsesClientV3_3,
} from "../history-research-v33.js";
import { HISTORY_EXPLANATORY_RELATIONS_SCHEMA_V36 } from "./explanatory-relation-v36.js";
import {
  buildRelationProposalCacheRecordV36,
  type RelationProposalCacheV36,
} from "./relation-proposer-cache-v36.js";

export const HISTORY_V36_RELATION_PROPOSER_PROMPT_VERSION =
  "history-v36-relation-proposer-v1" as const;
export const HISTORY_V36_LLM_MAX_WINDOW_SIZE = 2 as const;
export const HISTORY_V36_LLM_MAX_CALLS_PER_RUN = 40 as const;
export const HISTORY_V36_LLM_MAX_CALLS_PER_EPISODE = 8 as const;

export const HISTORY_V36_RELATION_PROPOSER_SYSTEM_PROMPT = `You propose relation candidates from only the supplied bounded claims and participant bindings.
Allowed relation kinds are supplied in the packet. Return strict JSON matching the schema.
Do not use historical knowledge. Do not infer facts not stated in the provided claims.
Do not treat co-occurrence as a relation. Do not convert purpose into destination.
Do not infer causality from chronology. Do not infer movement from opposition or comparison.
Do not split proper names. Use only supplied participant IDs and support claim IDs.
Return no candidate if evidence is insufficient. Confidence and self-rating are not accepted.`;

export const allowedRelationKindsV36 = [
  "movement",
  "spatial-comparison",
  "spatial-area",
  "causal",
  "dependency",
  "process",
  "temporal-sequence",
  "policy-response",
  "evidence-set",
] as const;

const identifier = z.string().trim().min(1);
const commonProposal = {
  supportClaimIds: z.array(identifier).min(1).max(HISTORY_V36_LLM_MAX_WINDOW_SIZE),
  evidenceMapping: z.array(identifier).max(4).default([]),
};

const relationProposalSchemaV36 = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("movement"), fromParticipantId: identifier, toParticipantId: identifier, viaParticipantIds: z.array(identifier).max(4).default([]), ...commonProposal }).strict(),
  z.object({ kind: z.literal("spatial-comparison"), placeParticipantIds: z.array(identifier).min(2).max(4), ...commonProposal }).strict(),
  z.object({ kind: z.literal("spatial-area"), placeParticipantId: identifier, ...commonProposal }).strict(),
  z.object({ kind: z.literal("causal"), causeParticipantId: identifier, effectParticipantId: identifier, ...commonProposal }).strict(),
  z.object({ kind: z.literal("dependency"), dependencyParticipantId: identifier, dependentParticipantId: identifier, ...commonProposal }).strict(),
  z.object({ kind: z.literal("process"), stepParticipantIds: z.array(identifier).min(2).max(6), ...commonProposal }).strict(),
  z.object({ kind: z.literal("temporal-sequence"), stepParticipantIds: z.array(identifier).min(2).max(6), ...commonProposal }).strict(),
  z.object({ kind: z.literal("policy-response"), conditionParticipantId: identifier, responseParticipantId: identifier, ...commonProposal }).strict(),
  z.object({ kind: z.literal("evidence-set"), subjectParticipantId: identifier.optional(), evidenceParticipantIds: z.array(identifier).min(2).max(6), ...commonProposal }).strict(),
]);

export const boundedLlmRelationProposerOutputSchemaV36 = z.object({
  proposals: z.array(relationProposalSchemaV36).max(8),
}).strict();

export const boundedLlmRelationProposerOutputJsonSchemaV36 =
  z.toJSONSchema(boundedLlmRelationProposerOutputSchemaV36);

export type BoundedLlmRelationProposalV36 = z.infer<typeof relationProposalSchemaV36>;
export type BoundedLlmRelationProposerOutputV36 = z.infer<typeof boundedLlmRelationProposerOutputSchemaV36>;

export interface BoundedLlmParticipantBindingV36 {
  readonly id: string;
  readonly type: "place" | "concept";
  readonly canonicalLabel: string;
  readonly entityId?: string;
}

export interface BoundedLlmClaimPacketV36 {
  readonly claimId: string;
  readonly normalizedProposition: string;
  readonly kind: string;
  readonly resolvedEntityIds: readonly string[];
  readonly resolvedPlaceIds: readonly string[];
}

export interface BoundedLlmRelationPacketV36 {
  readonly episodeId: string;
  readonly claims: readonly BoundedLlmClaimPacketV36[];
  readonly participantBindings: readonly BoundedLlmParticipantBindingV36[];
  readonly allowedRelationKinds: typeof allowedRelationKindsV36;
  readonly relationSchemaVersion: typeof HISTORY_EXPLANATORY_RELATIONS_SCHEMA_V36;
  readonly promptVersion: typeof HISTORY_V36_RELATION_PROPOSER_PROMPT_VERSION;
}

export interface BoundedLlmUsageV36 {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
}

export interface BoundedLlmProviderResultV36 {
  readonly output: unknown;
  readonly requestId?: string;
  readonly usage: BoundedLlmUsageV36;
}

export interface BoundedLlmRelationProviderV36 {
  readonly providerIdentity: string;
  readonly model: string;
  propose(packet: BoundedLlmRelationPacketV36): Promise<BoundedLlmProviderResultV36>;
}

export interface BoundedLlmProposerConfigV36 {
  readonly enabled: boolean;
  readonly model: string;
  readonly providerIdentity: string;
  readonly timeoutMs: number;
  readonly maxRetries: number;
  readonly maxOutputTokens: number;
  readonly maxCallsPerRun: number;
  readonly maxCallsPerEpisode: number;
}

function boundedInteger(value: string | undefined, fallback: number, minimum: number, maximum: number): number {
  const parsed = Number(value ?? fallback);
  return Number.isInteger(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

export function boundedLlmProposerConfigFromEnvV36(
  environment: NodeJS.ProcessEnv = process.env
): BoundedLlmProposerConfigV36 {
  const policy = requireOpenAiResponsesPolicy(
    DEFAULT_OPENAI_CAPABILITY_POLICY["history-escalation"]
  );
  const configuredModel = environment["HISTORY_V36_RELATION_PROPOSER_MODEL"]?.trim();
  if (configuredModel && configuredModel !== policy.model) {
    throw new Error(
      "HISTORY_V36_RELATION_PROPOSER_MODEL is no longer an independent model selector; use the history-escalation capability."
    );
  }
  return {
    enabled: environment["HISTORY_V36_LLM_SHADOW_PROPOSER"] === "1",
    model: policy.model,
    providerIdentity: environment["HISTORY_V36_RELATION_PROPOSER_PROVIDER"]?.trim() || "openai-compatible",
    timeoutMs: boundedInteger(environment["HISTORY_V36_RELATION_PROPOSER_TIMEOUT_MS"], 30_000, 1_000, 120_000),
    maxRetries: boundedInteger(environment["HISTORY_V36_RELATION_PROPOSER_MAX_RETRIES"], 1, 0, 2),
    maxOutputTokens: boundedInteger(environment["HISTORY_V36_RELATION_PROPOSER_MAX_OUTPUT_TOKENS"], 1_200, 128, 2_500),
    maxCallsPerRun: boundedInteger(environment["HISTORY_V36_LLM_MAX_CALLS_PER_RUN"], HISTORY_V36_LLM_MAX_CALLS_PER_RUN, 1, HISTORY_V36_LLM_MAX_CALLS_PER_RUN),
    maxCallsPerEpisode: boundedInteger(environment["HISTORY_V36_LLM_MAX_CALLS_PER_EPISODE"], HISTORY_V36_LLM_MAX_CALLS_PER_EPISODE, 1, HISTORY_V36_LLM_MAX_CALLS_PER_EPISODE),
  };
}

export class OpenAiBoundedLlmRelationProviderV36 implements BoundedLlmRelationProviderV36 {
  readonly providerIdentity: string;
  readonly model: string;

  constructor(
    private readonly client: OpenAiResponsesClientV3_3,
    config: Pick<BoundedLlmProposerConfigV36, "model" | "providerIdentity" | "timeoutMs" | "maxRetries" | "maxOutputTokens">
  ) {
    this.providerIdentity = config.providerIdentity;
    this.model = config.model;
    this.timeoutMs = config.timeoutMs;
    this.maxRetries = config.maxRetries;
    this.maxOutputTokens = config.maxOutputTokens;
  }

  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly maxOutputTokens: number;

  async propose(packet: BoundedLlmRelationPacketV36): Promise<BoundedLlmProviderResultV36> {
    const policy = requireOpenAiResponsesPolicy(
      DEFAULT_OPENAI_CAPABILITY_POLICY["history-escalation"]
    );
    if (this.model !== policy.model) {
      throw new Error("The V36 relation proposer must use the history-escalation capability model.");
    }
    const executed = await retryHistoryProviderCallV33({
      maxRetries: this.maxRetries,
      operation: async () => this.client.responses.create({
        model: this.model,
        reasoning: { effort: policy.reasoning },
        temperature: 0,
        max_output_tokens: this.maxOutputTokens,
        input: [
          { role: "system", content: [{ type: "input_text", text: HISTORY_V36_RELATION_PROPOSER_SYSTEM_PROMPT }] },
          { role: "user", content: [{ type: "input_text", text: JSON.stringify(packet) }] },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "history_v36_bounded_relation_proposals",
            strict: true,
            schema: boundedLlmRelationProposerOutputJsonSchemaV36,
          },
        },
      }, {
        signal: AbortSignal.timeout(this.timeoutMs),
        // retryHistoryProviderCallV33 is the sole transport retry owner.
        maxRetries: 0,
      }),
    });
    const response = executed.value;
    let output: unknown;
    try {
      output = JSON.parse(response.output_text ?? "null") as unknown;
    } catch {
      output = response.output_text;
    }
    const inputTokens = response.usage?.input_tokens ?? 0;
    const outputTokens = response.usage?.output_tokens ?? 0;
    return { output, requestId: response.id, usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens } };
  }
}

export class BoundedLlmCallBudgetV36 {
  #runCalls = 0;
  readonly #episodeCalls = new Map<string, number>();

  constructor(
    readonly maxCallsPerRun: number,
    readonly maxCallsPerEpisode: number
  ) {}

  canCall(episodeId: string): boolean {
    return this.#runCalls < this.maxCallsPerRun && (this.#episodeCalls.get(episodeId) ?? 0) < this.maxCallsPerEpisode;
  }

  recordCall(episodeId: string): void {
    if (!this.canCall(episodeId)) throw new Error("Bounded LLM call budget is exhausted.");
    this.#runCalls += 1;
    this.#episodeCalls.set(episodeId, (this.#episodeCalls.get(episodeId) ?? 0) + 1);
  }

  snapshot(): { readonly runCalls: number; readonly episodeCalls: Readonly<Record<string, number>> } {
    return { runCalls: this.#runCalls, episodeCalls: Object.fromEntries([...this.#episodeCalls.entries()].sort()) };
  }
}

export type BoundedLlmCallDiagnosticCodeV36 =
  | "SHADOW_LLM_OUTPUT_SCHEMA_INVALID"
  | "SHADOW_LLM_CALL_BUDGET_EXHAUSTED"
  | "SHADOW_LLM_PROVIDER_FAILURE";

export interface BoundedLlmCallDiagnosticV36 {
  readonly code: BoundedLlmCallDiagnosticCodeV36;
  readonly message: string;
  readonly affectedIds: readonly string[];
}

export interface BoundedLlmCallResultV36 {
  readonly output: BoundedLlmRelationProposerOutputV36 | null;
  readonly cacheKey: string;
  readonly cacheHit: boolean;
  readonly providerCall: boolean;
  readonly usage: BoundedLlmUsageV36;
  readonly diagnostics: readonly BoundedLlmCallDiagnosticV36[];
}

const zeroUsage: BoundedLlmUsageV36 = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

export async function callBoundedLlmRelationProposerV36(input: {
  readonly packet: BoundedLlmRelationPacketV36;
  readonly provider: BoundedLlmRelationProviderV36;
  readonly cache: RelationProposalCacheV36<BoundedLlmRelationProposerOutputV36>;
  readonly budget: BoundedLlmCallBudgetV36;
}): Promise<BoundedLlmCallResultV36> {
  const keyInput = {
    episodeId: input.packet.episodeId,
    orderedSupportClaimIds: input.packet.claims.map((claim) => claim.claimId),
    normalizedStructuredClaimContent: input.packet.claims.map(({ claimId, normalizedProposition, kind }) => ({ claimId, normalizedProposition, kind })),
    resolvedParticipantBindings: input.packet.participantBindings,
    relationSchemaVersion: input.packet.relationSchemaVersion,
    promptVersion: input.packet.promptVersion,
    model: input.provider.model,
    providerIdentity: input.provider.providerIdentity,
  };
  const emptyRecord = buildRelationProposalCacheRecordV36(keyInput, { proposals: [] });
  const cached = await input.cache.get(emptyRecord.cacheKey);
  if (cached) return { output: cached.output, cacheKey: cached.cacheKey, cacheHit: true, providerCall: false, usage: zeroUsage, diagnostics: [] };
  if (!input.budget.canCall(input.packet.episodeId)) {
    return { output: null, cacheKey: emptyRecord.cacheKey, cacheHit: false, providerCall: false, usage: zeroUsage, diagnostics: [{ code: "SHADOW_LLM_CALL_BUDGET_EXHAUSTED", message: "The bounded LLM call budget was exhausted; deterministic shadow output continues.", affectedIds: input.packet.claims.map((claim) => claim.claimId) }] };
  }
  input.budget.recordCall(input.packet.episodeId);
  let result: BoundedLlmProviderResultV36;
  try {
    result = await input.provider.propose(input.packet);
  } catch (error) {
    return { output: null, cacheKey: emptyRecord.cacheKey, cacheHit: false, providerCall: true, usage: zeroUsage, diagnostics: [{ code: "SHADOW_LLM_PROVIDER_FAILURE", message: `Bounded relation proposer failed open: ${error instanceof Error ? error.message : "provider error"}`, affectedIds: input.packet.claims.map((claim) => claim.claimId) }] };
  }
  const parsed = boundedLlmRelationProposerOutputSchemaV36.safeParse(result.output);
  if (!parsed.success) {
    return { output: null, cacheKey: emptyRecord.cacheKey, cacheHit: false, providerCall: true, usage: result.usage, diagnostics: [{ code: "SHADOW_LLM_OUTPUT_SCHEMA_INVALID", message: "Bounded relation proposer output failed the strict structured-output schema.", affectedIds: input.packet.claims.map((claim) => claim.claimId) }] };
  }
  const record = buildRelationProposalCacheRecordV36(keyInput, parsed.data);
  await input.cache.set(record);
  return { output: parsed.data, cacheKey: record.cacheKey, cacheHit: false, providerCall: true, usage: result.usage, diagnostics: [] };
}
