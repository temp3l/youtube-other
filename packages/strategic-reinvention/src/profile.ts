import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  type ContentPolicyPermissions,
  resolveEffectiveContentPolicy,
} from "@mediaforge/config";
import {
  creatorProfileSchema,
  genreDefinitionSchema,
  type CreatorProfile,
  type EffectiveContentPolicy,
  type GenreDefinition,
} from "@mediaforge/domain";
import { load } from "js-yaml";
import { z } from "zod";

const supportedLocales = ["it", "en", "es", "de", "fr", "pt"] as const;
const gates = ["source", "canonical-script", "localization", "voice", "final-render", "publish"] as const;
const text = z.string().trim().min(1);
const uniqueStrings = z.array(text).min(1).refine((values) => new Set(values).size === values.length, "Values must be unique.");
const duration = z.strictObject({ min: z.number().int().positive(), max: z.number().int().positive() }).superRefine((value, ctx) => {
  if (value.min > value.max) ctx.addIssue({ code: "custom", path: ["min"], message: "Minimum must not exceed maximum." });
});

const genreSourceSchema = z.strictObject({
  schemaVersion: z.literal("1.0"),
  id: z.literal("strategic-reinvention"),
  displayName: z.string().trim().min(1),
  description: z.string().trim().min(1),
  version: z.string().trim().min(1),
  audience: z.strictObject({ primary: uniqueStrings, exclusions: uniqueStrings }),
  editorialPromise: z.strictObject({ pattern: uniqueStrings, requirements: z.strictObject({ sourceLed: z.literal(true), firstPersonRequiresCreatorSource: z.literal(true), claimsRequireEvidenceWhenApplicable: z.literal(true), premiumBoundaryRequired: z.literal(true) }) }),
  episodeModes: z.array(z.strictObject({ id: z.enum(["story-to-strategy", "tactical-lesson", "position-essay", "myth-reality", "decision-framework", "case-diagnosis", "q-and-a", "guided-exercise"]), fullDurationSeconds: duration })).length(8).superRefine((values, ctx) => { if (new Set(values.map((value) => value.id)).size !== values.length) ctx.addIssue({ code: "custom", message: "Episode mode ids must be unique." }); }),
  shorts: z.strictObject({ durationSeconds: duration, required: uniqueStrings, forbidden: uniqueStrings }),
  visualSystem: z.strictObject({ defaultMode: z.literal("editorial-documentary"), allowed: uniqueStrings, avoid: uniqueStrings }),
  sourcePolicy: z.strictObject({ accepted: uniqueStrings, rejectedByDefault: uniqueStrings }),
  approvalPolicy: z.strictObject({ requiredGates: z.array(z.enum(gates)).length(6).superRefine((values, ctx) => { if (new Set(values).size !== values.length) ctx.addIssue({ code: "custom", message: "Approval gates must be unique." }); }), autoPublish: z.literal(false) }),
  metrics: z.strictObject({ primary: uniqueStrings, secondary: uniqueStrings }),
});
const creatorSourceSchema = z.strictObject({
  schemaVersion: z.literal("1.0"),
  id: z.literal("veronica-benini"),
  displayName: z.string().trim().min(1),
  publicAlias: z.string().trim().min(1),
  genreId: z.literal("strategic-reinvention"),
  version: z.string().trim().min(1),
  status: z.literal("discovery"),
  locale: z.strictObject({ canonical: z.literal("it"), supported: z.array(z.enum(supportedLocales)).length(6).superRefine((values, ctx) => { if (new Set(values).size !== values.length) ctx.addIssue({ code: "custom", message: "Locales must be unique." }); }), localizationOrder: z.array(z.enum(["en", "es", "de", "fr", "pt"])).length(5) }),
  authorship: z.strictObject({ mode: z.literal("human-source-led"), generativeFirstPersonDrafting: z.literal(false), generativeOpinionDrafting: z.literal(false), allowStructuralAdaptation: z.literal(true), allowShortExtraction: z.literal(true), allowTranslation: z.literal(true), creatorApprovalRequired: z.literal(true), note: text }),
  voice: z.strictObject({ canonical: z.strictObject({ preferred: z.literal("creator-recorded") }), cloning: z.strictObject({ enabled: z.literal(false), requiresSeparateWrittenConsent: z.literal(true) }), syntheticNarration: z.strictObject({ enabled: z.literal(false), requiresExplicitApproval: z.literal(true) }), dub: z.strictObject({ allowedModes: z.array(z.enum(["approved-human-actor", "approved-synthetic-voice", "reviewed-youtube-auto-dub"])).length(3), manualReviewRequired: z.literal(true) }) }),
  likeness: z.strictObject({ syntheticAvatarEnabled: z.literal(false), generatedLikenessEnabled: z.literal(false), suppliedFootageAllowed: z.literal(true), suppliedPhotographyAllowed: z.literal(true), writtenConsentRequiredForSyntheticUse: z.literal(true) }),
  positioning: z.strictObject({ mission: uniqueStrings, pillars: uniqueStrings, avoid: uniqueStrings }),
  protectedTerms: z.strictObject({ preserve: uniqueStrings, localizationRequiresApproval: z.literal(true) }),
  tone: z.strictObject({ attributes: uniqueStrings, rules: uniqueStrings, prohibited: uniqueStrings }),
  contentBoundary: z.strictObject({ public: uniqueStrings, premium: uniqueStrings, blockedByDefault: uniqueStrings }),
  offers: z.strictObject({ requiresLiveCatalogueValidation: z.literal(true), knownPublicExamples: uniqueStrings }),
  publishing: z.strictObject({ autoPublish: z.literal(false), primaryChannelLanguage: z.literal("it"), preferredMultilingualModel: z.literal("single-video-with-reviewed-audio-tracks"), separateChannelsRequireBusinessCase: z.literal(true) }),
  approval: z.strictObject({ creatorFinalApproval: z.literal(true), highRiskTopicSecondReview: z.literal(true), revokeOnSourceChange: z.literal(true) }),
});

export interface StrategicReinventionProfile {
  readonly genre: GenreDefinition;
  readonly creatorProfile: CreatorProfile;
  readonly effectivePolicy: EffectiveContentPolicy;
  readonly productionReadiness: { readonly status: "PRODUCTION_BLOCKED"; readonly blockers: readonly string[] };
}

const systemPermissions: ContentPolicyPermissions = {
  supportedLocales: [...supportedLocales], permittedContentTiers: ["public", "lead-generation", "premium", "private"], requiredApprovalGates: [...gates], autoPublish: false, syntheticNarrationEnabled: false, generatedLikenessEnabled: false,
};

function parseYaml<T>(source: string, schema: z.ZodType<T>): T {
  return schema.parse(load(source));
}

export function parseStrategicReinventionProfile(genreYaml: string, creatorYaml: string): StrategicReinventionProfile {
  const sourceGenre = parseYaml(genreYaml, genreSourceSchema);
  const sourceCreator = parseYaml(creatorYaml, creatorSourceSchema);
  const genre = genreDefinitionSchema.parse({
    schemaVersion: "1.1", id: sourceGenre.id, displayName: sourceGenre.displayName, description: sourceGenre.description,
    version: sourceGenre.version, canonicalLocale: "it", episodeModes: sourceGenre.episodeModes.map(({ id }) => id),
    requiredApprovalGates: sourceGenre.approvalPolicy.requiredGates, autoPublish: false,
  });
  const creatorProfile = creatorProfileSchema.parse({
    schemaVersion: "1.1", id: sourceCreator.id, displayName: sourceCreator.displayName, genreId: sourceCreator.genreId,
    status: sourceCreator.status, canonicalLocale: sourceCreator.locale.canonical, supportedLocales: sourceCreator.locale.supported,
    autoPublish: false, syntheticNarrationEnabled: false, generatedLikenessEnabled: false,
  });
  const genrePermissions: ContentPolicyPermissions = {
    supportedLocales: [...supportedLocales], permittedContentTiers: ["public", "lead-generation"], requiredApprovalGates: [...sourceGenre.approvalPolicy.requiredGates], autoPublish: false, syntheticNarrationEnabled: false, generatedLikenessEnabled: false,
  };
  const creatorPermissions: ContentPolicyPermissions = {
    supportedLocales: [...sourceCreator.locale.supported], permittedContentTiers: ["public", "lead-generation"], requiredApprovalGates: [...sourceGenre.approvalPolicy.requiredGates], autoPublish: false, syntheticNarrationEnabled: false, generatedLikenessEnabled: false,
  };
  const effectivePolicy = resolveEffectiveContentPolicy({ genre, creatorProfile, system: systemPermissions, genrePermissions, creatorPermissions });
  return {
    genre, creatorProfile, effectivePolicy,
    productionReadiness: { status: "PRODUCTION_BLOCKED", blockers: ["Creator profile status is discovery.", "Written activation and rights evidence are required before production."] },
  };
}

export async function loadStrategicReinventionProfile(): Promise<StrategicReinventionProfile> {
  const genreUrl = new URL("../config/genre.strategic-reinvention.yaml", import.meta.url);
  const creatorUrl = new URL("../config/creator.veronica-benini.yaml", import.meta.url);
  const [genreYaml, creatorYaml] = await Promise.all([
    fs.readFile(fileURLToPath(genreUrl), "utf8"), fs.readFile(fileURLToPath(creatorUrl), "utf8"),
  ]);
  return parseStrategicReinventionProfile(genreYaml, creatorYaml);
}
