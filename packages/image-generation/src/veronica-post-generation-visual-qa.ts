import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  fileExists,
  hashFile,
  hashText,
  writeJsonAtomic,
} from "@mediaforge/shared";

/** Pixel-level gate for Veronica only.  Prompt approval never implies this result. */
export const VERONICA_POST_GENERATION_VISUAL_REVIEW_VERSION =
  "veronica-post-generation-visual-review.v1" as const;
export const veronicaVisualDriftSchema = z.enum(["none", "warning", "severe"]);
const score = z.number().min(0).max(1);
export const veronicaPostGenerationVisualReviewSchema = z.strictObject({
  schemaVersion: z.literal(VERONICA_POST_GENERATION_VISUAL_REVIEW_VERSION),
  contentId: z.string().min(1),
  assetId: z.string().min(1),
  imageFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
  semanticBriefHash: z.string().regex(/^[a-f0-9]{64}$/u),
  finalPromptHash: z.string().regex(/^[a-f0-9]{64}$/u),
  evaluatorModel: z.string().min(1),
  evaluatorConfigHash: z.string().regex(/^[a-f0-9]{64}$/u),
  visualDirectionVersion: z.string().min(1),
  createdAt: z.string().min(1),
  semanticAlignmentScore: score,
  instantReadScore: score,
  buyerActionVisibilityScore: score,
  causeEffectVisibilityScore: score,
  narrationSupportScore: score,
  visualQualityScore: score,
  mustShowCoverage: z.enum(["pass", "partial", "fail"]),
  mustNotShowViolations: z.array(z.string()),
  occupationProxyDrift: veronicaVisualDriftSchema,
  abstractPropDrift: veronicaVisualDriftSchema,
  genericBusinessStockDrift: veronicaVisualDriftSchema,
  passivePortraitDrift: veronicaVisualDriftSchema,
  decorativeConceptDrift: veronicaVisualDriftSchema,
  textInImageViolation: z.boolean(),
  syntheticVeronicaLikenessRisk: z.boolean(),
  visibleBuyerDecision: z.boolean(),
  visibleHumanAction: z.boolean(),
  requiresNarrationToDecode: z.boolean(),
  regenerationRequired: z.boolean(),
  findings: z.array(
    z.strictObject({
      code: z.string().min(1),
      severity: z.enum(["info", "warning", "blocking"]),
      message: z.string().min(1),
    })
  ),
  failedRequirements: z.array(z.string()),
  successfulRequirements: z.array(z.string()),
  regenerationInstructions: z.array(z.string()),
});
export type VeronicaPostGenerationVisualReview = z.infer<
  typeof veronicaPostGenerationVisualReviewSchema
>;

export interface VeronicaVisualQaBrief {
  readonly contentId: string;
  readonly assetId: string;
  readonly locale: string;
  readonly variant: "short" | "full";
  readonly canonicalNarration: string;
  readonly spokenMeaning: string;
  readonly viewerTakeaway: string;
  readonly narrativePurpose: string;
  readonly visualRelationship: string;
  readonly mustShow: readonly string[];
  readonly mustNotShow: readonly string[];
  readonly relevanceAnchors: readonly string[];
  readonly genericDriftRisks: readonly string[];
  readonly finalPrompt: string;
  readonly visualDirectionRules: readonly string[];
  readonly semanticBriefHash: string;
  readonly visualDirectionVersion: string;
}
export interface VeronicaVisualQaPolicy {
  readonly minimumSemanticAlignment: number;
  readonly minimumInstantRead: number;
  readonly minimumNarrationSupport: number;
  readonly maxRegenerationAttempts: number;
}
export const defaultVeronicaVisualQaPolicy: VeronicaVisualQaPolicy = {
  minimumSemanticAlignment: 0.8,
  minimumInstantRead: 0.75,
  minimumNarrationSupport: 0.8,
  maxRegenerationAttempts: 2,
};
export interface VeronicaVisualQaEvaluator {
  readonly model: string;
  readonly config: Readonly<Record<string, unknown>>;
  evaluate(input: {
    readonly imagePath: string;
    readonly brief: VeronicaVisualQaBrief;
    readonly imageFingerprint: string;
    readonly evaluatorConfigHash: string;
  }): Promise<unknown>;
}
export interface VeronicaVisualQaResult {
  readonly review: VeronicaPostGenerationVisualReview;
  readonly cacheStatus: "hit" | "miss";
  readonly approved: boolean;
  readonly manualReviewRequired: boolean;
}

export interface OpenAiVisionResponsesClient {
  readonly responses: {
    create(request: {
      readonly model: string;
      readonly input: readonly {
        readonly role: "system" | "user";
        readonly content: readonly (
          | { readonly type: "input_text"; readonly text: string }
          | { readonly type: "input_image"; readonly image_url: string }
        )[];
      }[];
      readonly max_output_tokens?: number;
      readonly temperature?: number;
    }): Promise<{ readonly output_text?: string }>;
  };
}

function imageMimeType(
  imagePath: string
): "image/jpeg" | "image/png" | "image/webp" {
  const extension = path.extname(imagePath).toLowerCase();
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  return "image/png";
}

function parseJsonResponse(value: string | undefined): unknown {
  if (!value) throw new Error("Veronica visual QA returned no output.");
  const normalized = value
    .trim()
    .replace(/^```(?:json)?\s*/iu, "")
    .replace(/\s*```$/u, "");
  try {
    return JSON.parse(normalized) as unknown;
  } catch {
    throw new Error("Veronica visual QA returned malformed JSON.");
  }
}

/** Uses the configured Responses client; it never creates a provider client itself. */
export function createOpenAiVeronicaVisualQaEvaluator(input: {
  readonly client: OpenAiVisionResponsesClient;
  readonly model: string;
  readonly config?: Readonly<Record<string, unknown>>;
}): VeronicaVisualQaEvaluator {
  const config = {
    temperature: 0,
    maxOutputTokens: 2200,
    ...(input.config ?? {}),
  };
  const maxOutputTokens =
    typeof config.maxOutputTokens === "number" ? config.maxOutputTokens : 2200;
  const temperature =
    typeof config.temperature === "number" ? config.temperature : 0;
  const reasoningEffort =
    config.reasoningEffort === "none" ||
    config.reasoningEffort === "low" ||
    config.reasoningEffort === "medium" ||
    config.reasoningEffort === "high"
      ? config.reasoningEffort
      : undefined;
  return {
    model: input.model,
    config,
    async evaluate({
      imagePath,
      brief,
      imageFingerprint,
      evaluatorConfigHash,
    }) {
      const image = await fs.readFile(imagePath);
      const contract = {
        ...brief,
        imageFingerprint,
        finalPromptHash: hashText(brief.finalPrompt),
        evaluatorModel: input.model,
        evaluatorConfigHash,
        schemaVersion: VERONICA_POST_GENERATION_VISUAL_REVIEW_VERSION,
      };
      const response = await input.client.responses.create({
        model: input.model,
        ...(reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {}),
        temperature,
        max_output_tokens: maxOutputTokens,
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text: "You are a strict Veronica production visual QA evaluator. Review the supplied pixels against the supplied semantic contract; do not infer missing episode context. Return only one JSON object matching the requested schema. Copy all supplied identity fields exactly. A passing image must communicate the principal relationship in one to two seconds with muted narration. Treat readable text, synthetic Veronica likeness, severe drift, missing mandatory buyer action, and narration-dependent metaphors as blocking.",
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: `Evaluate this image. Contract and required response schema: ${JSON.stringify({ contract, requiredFields: ["semanticAlignmentScore", "instantReadScore", "buyerActionVisibilityScore", "causeEffectVisibilityScore", "narrationSupportScore", "visualQualityScore", "mustShowCoverage", "mustNotShowViolations", "occupationProxyDrift", "abstractPropDrift", "genericBusinessStockDrift", "passivePortraitDrift", "decorativeConceptDrift", "textInImageViolation", "syntheticVeronicaLikenessRisk", "visibleBuyerDecision", "visibleHumanAction", "requiresNarrationToDecode", "regenerationRequired", "findings", "failedRequirements", "successfulRequirements", "regenerationInstructions"] })}`,
              },
              {
                type: "input_image",
                image_url: `data:${imageMimeType(imagePath)};base64,${image.toString("base64")}`,
              },
            ],
          },
        ],
      });
      return parseJsonResponse(response.output_text);
    },
  };
}

export function buildVeronicaVisualQaCacheKey(input: {
  readonly imageFingerprint: string;
  readonly brief: VeronicaVisualQaBrief;
  readonly evaluator: Pick<VeronicaVisualQaEvaluator, "model" | "config">;
}): string {
  return hashText(
    JSON.stringify({
      schemaVersion: VERONICA_POST_GENERATION_VISUAL_REVIEW_VERSION,
      imageFingerprint: input.imageFingerprint,
      semanticBriefHash: input.brief.semanticBriefHash,
      finalPromptHash: hashText(input.brief.finalPrompt),
      visualDirectionVersion: input.brief.visualDirectionVersion,
      evaluatorModel: input.evaluator.model,
      evaluatorConfig: input.evaluator.config,
    })
  );
}
export function isVeronicaVisualReviewApproved(
  review: VeronicaPostGenerationVisualReview,
  policy: VeronicaVisualQaPolicy = defaultVeronicaVisualQaPolicy
): boolean {
  const severe = [
    review.occupationProxyDrift,
    review.abstractPropDrift,
    review.genericBusinessStockDrift,
    review.passivePortraitDrift,
    review.decorativeConceptDrift,
  ].includes("severe");
  return (
    !review.regenerationRequired &&
    !review.textInImageViolation &&
    !review.syntheticVeronicaLikenessRisk &&
    !severe &&
    review.mustShowCoverage === "pass" &&
    review.mustNotShowViolations.length === 0 &&
    !review.requiresNarrationToDecode &&
    review.semanticAlignmentScore >= policy.minimumSemanticAlignment &&
    review.instantReadScore >= policy.minimumInstantRead &&
    review.narrationSupportScore >= policy.minimumNarrationSupport
  );
}
export function buildVeronicaVisualRemediationPrompt(input: {
  readonly brief: VeronicaVisualQaBrief;
  readonly review: VeronicaPostGenerationVisualReview;
}): string {
  return [
    input.brief.finalPrompt,
    "SEMANTIC REMEDIATION — preserve subject, continuity, environment, era, camera direction, aspect ratio, and approved visual style.",
    `Fix: ${[...input.review.failedRequirements, ...input.review.findings.filter((f) => f.severity === "blocking").map((f) => f.message)].join("; ")}.`,
    `Must show: ${input.brief.mustShow.join("; ")}.`,
    `Must not show: ${input.brief.mustNotShow.join("; ")}.`,
    `Instructions: ${input.review.regenerationInstructions.join("; ")}.`,
  ].join(" ");
}

export async function reviewVeronicaGeneratedImage(input: {
  readonly cacheDir: string;
  readonly imagePath: string;
  readonly brief: VeronicaVisualQaBrief;
  readonly evaluator: VeronicaVisualQaEvaluator;
  readonly policy?: VeronicaVisualQaPolicy;
  readonly now?: () => string;
}): Promise<VeronicaVisualQaResult> {
  if (!(await fileExists(input.imagePath)))
    throw new Error(
      `Visual QA cannot inspect missing image: ${input.imagePath}`
    );
  const imageFingerprint = await hashFile(input.imagePath);
  const evaluatorConfigHash = hashText(JSON.stringify(input.evaluator.config));
  const key = buildVeronicaVisualQaCacheKey({
    imageFingerprint,
    brief: input.brief,
    evaluator: input.evaluator,
  });
  const cachePath = path.join(
    input.cacheDir,
    `${input.brief.assetId}.${key}.json`
  );
  if (await fileExists(cachePath)) {
    try {
      const cached = veronicaPostGenerationVisualReviewSchema.parse(
        JSON.parse(await fs.readFile(cachePath, "utf8")) as unknown
      );
      return {
        review: cached,
        cacheStatus: "hit",
        approved: isVeronicaVisualReviewApproved(cached, input.policy),
        manualReviewRequired: !isVeronicaVisualReviewApproved(
          cached,
          input.policy
        ),
      };
    } catch {
      /* corrupt QA is never trusted */
    }
  }
  const raw = await input.evaluator.evaluate({
    imagePath: input.imagePath,
    brief: input.brief,
    imageFingerprint,
    evaluatorConfigHash,
  });
  const parsed = veronicaPostGenerationVisualReviewSchema.safeParse(raw);
  if (!parsed.success)
    throw new Error(
      `Veronica visual QA returned malformed output for ${input.brief.assetId}; refusing approval.`
    );
  const review = parsed.data;
  if (
    review.contentId !== input.brief.contentId ||
    review.assetId !== input.brief.assetId ||
    review.imageFingerprint !== imageFingerprint ||
    review.semanticBriefHash !== input.brief.semanticBriefHash ||
    review.finalPromptHash !== hashText(input.brief.finalPrompt) ||
    review.evaluatorModel !== input.evaluator.model ||
    review.evaluatorConfigHash !== evaluatorConfigHash ||
    review.visualDirectionVersion !== input.brief.visualDirectionVersion
  )
    throw new Error(
      `Veronica visual QA identity mismatch for ${input.brief.assetId}; refusing approval.`
    );
  await writeJsonAtomic(cachePath, review);
  const approved = isVeronicaVisualReviewApproved(review, input.policy);
  return {
    review,
    cacheStatus: "miss",
    approved,
    manualReviewRequired: !approved,
  };
}
