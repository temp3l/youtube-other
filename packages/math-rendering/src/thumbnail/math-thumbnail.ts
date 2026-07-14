import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hashFile, hashText, writeBinaryAtomic, writeJsonAtomic } from "@mediaforge/shared";
import {
  canonicalHash,
  createVerifierRequest,
  exactValueSchema,
  expressionNodeSchema,
  expressionToLatex,
  lessonVariantSpecificationSchema,
  lessonFactSchema,
  loadWorkflowManifest,
  localizedDisplayChecks,
  localizedNarrationSchema,
  mathLanguageSchema,
  mathMetadataSchema,
  readAuthoritativeStageArtifact,
  verifierRequestSchema,
  verifierResponseSchema,
  VERIFIER_PROTOCOL_VERSION,
  VERIFIER_VERSION,
  type MathArtifactSchemaVersion,
  type MathStage,
  type WorkflowManifest,
} from "@mediaforge/math-education";
import { z } from "zod";
import { loadTeacherPose } from "../assets/teacher.js";
import { grades57Profile, grades810Profile } from "../profiles/profiles.js";

export const MATH_THUMBNAIL_RENDERER_VERSION = "math-thumbnail-renderer.v3";
export const MATH_THUMBNAIL_SPEC_VERSION = "math-thumbnail-spec.v2";
export const MATH_THUMBNAIL_FONT_PROFILE = {
  id: "math-thumbnail-fonts.v1",
  textFamily: "MathThumbnailText",
  formulaFamily: "MathThumbnailFormula",
  textFontFile: "KaTeX_SansSerif-Bold.woff2",
  formulaFontFile: "KaTeX_Main-Regular.woff2",
  measurementModel: "unicode-conservative.v1",
} as const;
const fontRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../node_modules/katex/dist/fonts"
);
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/u);
const thumbnailSpecAuthority = new WeakMap<object, string>();
const wordTextSchema = z.string().min(2).max(60).superRefine((value, context) => {
  const words = value.trim().split(/\s+/u).filter(Boolean).length;
  if (words < 2 || words > 5)
    context.addIssue({ code: "custom", message: "Thumbnail text must contain 2-5 Unicode words." });
});

export const mathThumbnailVerificationEvidenceSchema = z.strictObject({
  artifactVersion: z.literal("math-thumbnail-verification-evidence.v1"),
  lessonId: z.string().min(1),
  skillId: z.string().min(1),
  variant: z.enum(["foundation", "standard", "challenge"]),
  language: mathLanguageSchema,
  request: verifierRequestSchema,
  response: verifierResponseSchema,
  requestContentHash: hashSchema,
  responseContentHash: hashSchema,
  referencedFactIds: z.array(z.string().min(1)).length(1),
  referencedCheckIds: z.array(z.string().min(1)).length(1),
  source: z.strictObject({
    producedBy: z.literal("math-verification"),
    producer: z.literal("sympy-verifier-adapter"),
    producerVersion: z.literal(VERIFIER_VERSION),
    parentFingerprints: z.array(hashSchema).length(1),
  }),
});

export const mathThumbnailSpecSchema = z.strictObject({
  artifactVersion: z.literal("math-thumbnail-spec.v2"),
  lessonId: z.string().min(1),
  skillId: z.string().min(1),
  language: mathLanguageSchema,
  variant: z.enum(["foundation", "standard", "challenge"]),
  grade: z.number().int().min(5).max(10),
  profile: z.enum(["grades-5-7-v1", "grades-8-10-v1"]),
  curriculumReleaseId: z.string().min(1),
  curriculumReleaseHash: hashSchema,
  lessonContentHash: hashSchema,
  localizationHash: hashSchema,
  metadataHash: hashSchema,
  outputAssetName: z.string().regex(/^[a-z0-9][a-z0-9.-]*\.svg$/u),
  fontProfile: z.strictObject({
    id: z.literal("math-thumbnail-fonts.v1"),
    textFamily: z.literal("MathThumbnailText"),
    formulaFamily: z.literal("MathThumbnailFormula"),
    textFontFile: z.literal("KaTeX_SansSerif-Bold.woff2"),
    formulaFontFile: z.literal("KaTeX_Main-Regular.woff2"),
    textFontHash: hashSchema,
    formulaFontHash: hashSchema,
    measurementModel: z.literal("unicode-conservative.v1"),
  }),
  text: wordTextSchema,
  fact: z.strictObject({
    factId: z.string().min(1),
    semantic: exactValueSchema,
    expression: expressionNodeSchema,
    checkIds: z.array(z.string().min(1)).min(1),
  }),
  lessonFacts: z.array(lessonFactSchema).min(1),
  verification: mathThumbnailVerificationEvidenceSchema,
  teacher: z.strictObject({
    manifestPath: z.string().min(1),
    manifestContentHash: hashSchema,
    assetVersion: z.string().min(1),
    poseId: z.string().min(1),
    areaRatio: z.number().positive().max(0.25),
  }),
  sources: z.strictObject({
    lesson: z.strictObject({
      stage: z.literal("lesson-spec"), relativePath: z.literal("canonical/lesson-spec.json"),
      schemaVersion: z.literal("lesson-spec.v1"), contentHash: hashSchema,
      producer: z.literal("lesson-specification-builder"), producerVersion: z.literal("reviewed-fixtures.v1"),
      parentFingerprints: z.array(hashSchema).length(1),
    }),
    verification: z.strictObject({
      stage: z.literal("math-verification"), relativePath: z.literal("canonical/verification.json"),
      schemaVersion: z.literal(VERIFIER_PROTOCOL_VERSION), contentHash: hashSchema,
      producer: z.literal("sympy-verifier-adapter"), producerVersion: z.literal(VERIFIER_VERSION),
      parentFingerprints: z.array(hashSchema).length(1),
    }),
    localization: z.strictObject({
      stage: z.literal("localization"), relativePath: z.string().min(1),
      schemaVersion: z.literal("math-narration.v2"), contentHash: hashSchema,
      producer: z.literal("locked-fact-localizer"), producerVersion: z.literal("locked-facts.v2"),
      parentFingerprints: z.array(hashSchema).length(1),
    }),
    localizedVerification: z.strictObject({
      stage: z.literal("localization"), relativePath: z.string().min(1),
      schemaVersion: z.literal(VERIFIER_PROTOCOL_VERSION), contentHash: hashSchema,
      producer: z.literal("sympy-verifier-adapter"), producerVersion: z.literal(VERIFIER_VERSION),
      parentFingerprints: z.array(hashSchema).length(1),
    }),
    metadata: z.strictObject({
      stage: z.literal("metadata-playlists"), relativePath: z.string().min(1),
      schemaVersion: z.literal("math-metadata.v2"), contentHash: hashSchema,
      producer: z.literal("math-metadata-generator"), producerVersion: z.literal("math-metadata-generator.v3"),
      parentFingerprints: z.array(hashSchema).length(1),
    }),
  }),
  workflow: z.strictObject({
    owningStage: z.literal("metadata-playlists"),
    producer: z.literal("math-thumbnail-renderer"),
    producerVersion: z.literal("math-thumbnail-renderer.v3"),
    parentFingerprints: z.array(hashSchema).length(1),
  }),
});
export type MathThumbnailSpec = z.infer<typeof mathThumbnailSpecSchema>;

export const mathThumbnailManifestSchema = z.strictObject({
  artifactVersion: z.literal("math-thumbnail.v1"),
  identity: z.strictObject({
    lessonId: z.string().min(1),
    skillId: z.string().min(1),
    language: mathLanguageSchema,
    variant: z.enum(["foundation", "standard", "challenge"]),
    grade: z.number().int().min(5).max(10),
    curriculumReleaseId: z.string().min(1),
    curriculumReleaseHash: hashSchema,
    localizationHash: hashSchema,
  }),
  specVersion: z.literal("math-thumbnail-spec.v2"),
  rendererVersion: z.literal("math-thumbnail-renderer.v3"),
  fontProfile: mathThumbnailSpecSchema.shape.fontProfile,
  profile: z.enum(["grades-5-7-v1", "grades-8-10-v1"]),
  teacherVersion: z.string().min(1),
  teacherManifestHash: hashSchema,
  teacherPoseId: z.string().min(1),
  teacherPoseHash: hashSchema,
  artwork: z.strictObject({
    status: z.enum(["simulation-placeholder", "approved-publish-artwork"]),
    publishReady: z.boolean(),
    blockers: z.array(z.string().min(1)),
    license: z.string().min(1),
    provenance: z.string().min(1),
  }).superRefine((artwork, context) => {
    if (artwork.status === "simulation-placeholder") {
      if (artwork.publishReady)
        context.addIssue({ code: "custom", path: ["publishReady"], message: "Simulation placeholders cannot be publish-ready." });
      if (artwork.blockers.length === 0)
        context.addIssue({ code: "custom", path: ["blockers"], message: "Simulation placeholders require an explicit publish blocker." });
    }
    if (artwork.status === "approved-publish-artwork") {
      if (!artwork.publishReady)
        context.addIssue({ code: "custom", path: ["publishReady"], message: "Approved artwork must be publish-ready." });
      if (artwork.blockers.length !== 0)
        context.addIssue({ code: "custom", path: ["blockers"], message: "Approved artwork cannot carry publish blockers." });
    }
  }),
  inputHashes: z.strictObject({
    lessonContent: hashSchema,
    metadata: hashSchema,
    fact: hashSchema,
    verification: hashSchema,
    spec: hashSchema,
  }),
  dimensions: z.strictObject({ width: z.literal(1920), height: z.literal(1080), aspectRatio: z.literal("16:9") }),
  safeArea: z.strictObject({ x: z.literal(96), y: z.literal(54), width: z.literal(1728), height: z.literal(972) }),
  readability: z.strictObject({
    wordCount: z.number().int().min(2).max(5),
    textFontPx: z.number().min(64),
    formulaFontPx: z.number().min(58),
    measuredTextWidth: z.number().positive().max(1200),
    measuredFormulaWidth: z.number().positive().max(1120),
    measuredFormulaHeight: z.number().positive().max(260),
    mobileReadable: z.literal(true),
  }),
  teacherAreaRatio: z.number().positive().max(0.25),
  formulaPriority: z.literal(true),
  factId: z.string().min(1),
  factSemanticHash: hashSchema,
  verification: z.strictObject({
    requestId: z.string().min(1),
    requestContentHash: hashSchema,
    responseContentHash: hashSchema,
    referencedFactIds: z.array(z.string().min(1)).length(1),
    referencedCheckIds: z.array(z.string().min(1)).length(1),
  }),
  sourceLineage: mathThumbnailSpecSchema.shape.sources,
  workflow: mathThumbnailSpecSchema.shape.workflow,
  outputPath: z.string().min(1),
  contentHash: hashSchema,
  byteLength: z.number().int().positive(),
});
export type MathThumbnailManifest = z.infer<typeof mathThumbnailManifestSchema>;

function authoritativeLineage(args: {
  manifest: WorkflowManifest;
  stage: MathStage;
  relativePath: string;
  schemaVersion: MathArtifactSchemaVersion;
  producer: string;
  producerVersion: string;
}) {
  const record = args.manifest.stages.find((candidate) => candidate.stage === args.stage);
  const matches = record?.outputArtifacts.filter((artifact) =>
    artifact.relativePath === args.relativePath &&
    artifact.schemaVersion === args.schemaVersion &&
    artifact.producedBy === args.stage
  ) ?? [];
  if (
    matches.length !== 1 ||
    matches[0]!.producer !== args.producer ||
    matches[0]!.producerVersion !== args.producerVersion
  ) throw new Error(`Thumbnail source is not owned by the authoritative ${args.stage} producer.`);
  const artifact = matches[0]!;
  return {
    stage: args.stage,
    relativePath: args.relativePath,
    schemaVersion: args.schemaVersion,
    contentHash: artifact.contentHash,
    producer: artifact.producer,
    producerVersion: artifact.producerVersion,
    parentFingerprints: artifact.parentHashes,
  };
}

function assertPassedVerifier(request: z.infer<typeof verifierRequestSchema>, response: z.infer<typeof verifierResponseSchema>): void {
  if (
    response.requestId !== request.requestId ||
    response.inputHash !== request.inputHash ||
    response.status !== "passed" ||
    response.checks.length !== request.checks.length ||
    response.checks.some((check, index) => check.checkId !== request.checks[index]?.checkId || check.status !== "passed")
  ) throw new Error("Thumbnail source verifier evidence is not an exact passed result.");
}

export async function loadAuthoritativeMathThumbnailSpec(args: {
  lessonRoot: string;
  lessonId: string;
  language: z.infer<typeof mathLanguageSchema>;
  teacherManifestPath: string;
  teacherPoseId: string;
  teacherAreaRatio: number;
  outputAssetName?: string;
}): Promise<MathThumbnailSpec> {
  const lessonRoot = path.resolve(args.lessonRoot);
  const manifest = await loadWorkflowManifest(path.join(lessonRoot, "manifest.json"));
  if (!manifest || manifest.lessonId !== args.lessonId)
    throw new Error("Thumbnail generation requires the lesson's authoritative workflow manifest.");
  const language = mathLanguageSchema.parse(args.language);
  const narrationPath = `locales/${language}/narration.json`;
  const localizedVerificationPath = `locales/${language}/display-verification.json`;
  const metadataPath = `locales/${language}/metadata.json`;
  const [lesson, verification, localization, localizedVerification, metadata] = await Promise.all([
    readAuthoritativeStageArtifact({ root: lessonRoot, manifest, stage: "lesson-spec", relativePath: "canonical/lesson-spec.json", schemaVersion: "lesson-spec.v1", schema: lessonVariantSpecificationSchema }),
    readAuthoritativeStageArtifact({ root: lessonRoot, manifest, stage: "math-verification", relativePath: "canonical/verification.json", schemaVersion: VERIFIER_PROTOCOL_VERSION, schema: verifierResponseSchema }),
    readAuthoritativeStageArtifact({ root: lessonRoot, manifest, stage: "localization", relativePath: narrationPath, schemaVersion: "math-narration.v2", schema: localizedNarrationSchema }),
    readAuthoritativeStageArtifact({ root: lessonRoot, manifest, stage: "localization", relativePath: localizedVerificationPath, schemaVersion: VERIFIER_PROTOCOL_VERSION, schema: verifierResponseSchema }),
    readAuthoritativeStageArtifact({ root: lessonRoot, manifest, stage: "metadata-playlists", relativePath: metadataPath, schemaVersion: "math-metadata.v2", schema: mathMetadataSchema }),
  ]);
  const request = createVerifierRequest(verification.requestId, lesson.checks);
  const displayRequest = createVerifierRequest(localizedVerification.requestId, localizedDisplayChecks(lesson, localization));
  assertPassedVerifier(request, verification);
  assertPassedVerifier(displayRequest, localizedVerification);
  if (
    lesson.lessonId !== args.lessonId ||
    localization.lessonId !== lesson.lessonId ||
    localization.language !== language ||
    metadata.identity.lessonId !== lesson.lessonId ||
    metadata.identity.skillId !== lesson.skillId ||
    metadata.identity.language !== language ||
    metadata.identity.variant !== lesson.variant ||
    metadata.identity.lessonContentHash !== lesson.contentHash ||
    metadata.identity.localizationHash !== localization.contentHash
  ) throw new Error("Thumbnail source artifact identity mismatch.");
  const factMatches = lesson.facts.filter((fact) => fact.factId === metadata.thumbnail.formulaFactId);
  if (factMatches.length !== 1 || !localization.resolvedFacts.some((fact) => fact.factId === factMatches[0]!.factId))
    throw new Error("Thumbnail metadata fact is not present in authoritative localized lesson evidence.");
  const fact = factMatches[0]!;
  const checkIds = fact.checkIds.filter((checkId) => lesson.checks.some((check) => check.checkId === checkId));
  if (checkIds.length !== fact.checkIds.length || checkIds.length === 0)
    throw new Error("Thumbnail fact lacks authoritative verifier checks.");
  const teacherRaw = JSON.parse(await fs.readFile(args.teacherManifestPath, "utf8")) as unknown;
  const teacherSchema = z.strictObject({
    assetVersion: z.string().min(1),
    license: z.string().min(1),
    provenance: z.string().min(1),
  }).passthrough();
  const teacherManifest = teacherSchema.parse(teacherRaw);
  await loadTeacherPose(args.teacherManifestPath, args.teacherPoseId, args.teacherAreaRatio);
  const sources = {
    lesson: authoritativeLineage({ manifest, stage: "lesson-spec", relativePath: "canonical/lesson-spec.json", schemaVersion: "lesson-spec.v1", producer: "lesson-specification-builder", producerVersion: "reviewed-fixtures.v1" }),
    verification: authoritativeLineage({ manifest, stage: "math-verification", relativePath: "canonical/verification.json", schemaVersion: VERIFIER_PROTOCOL_VERSION, producer: "sympy-verifier-adapter", producerVersion: VERIFIER_VERSION }),
    localization: authoritativeLineage({ manifest, stage: "localization", relativePath: narrationPath, schemaVersion: "math-narration.v2", producer: "locked-fact-localizer", producerVersion: "locked-facts.v2" }),
    localizedVerification: authoritativeLineage({ manifest, stage: "localization", relativePath: localizedVerificationPath, schemaVersion: VERIFIER_PROTOCOL_VERSION, producer: "sympy-verifier-adapter", producerVersion: VERIFIER_VERSION }),
    metadata: authoritativeLineage({ manifest, stage: "metadata-playlists", relativePath: metadataPath, schemaVersion: "math-metadata.v2", producer: "math-metadata-generator", producerVersion: "math-metadata-generator.v3" }),
  };
  const spec = mathThumbnailSpecSchema.parse({
    artifactVersion: MATH_THUMBNAIL_SPEC_VERSION,
    lessonId: lesson.lessonId,
    skillId: lesson.skillId,
    language,
    variant: lesson.variant,
    grade: metadata.identity.grade,
    profile: metadata.thumbnail.profile,
    curriculumReleaseId: metadata.identity.curriculumReleaseId,
    curriculumReleaseHash: metadata.identity.curriculumReleaseHash,
    lessonContentHash: lesson.contentHash,
    localizationHash: localization.contentHash,
    metadataHash: canonicalHash(metadata),
    outputAssetName: args.outputAssetName ?? "thumbnail.svg",
    fontProfile: {
      ...MATH_THUMBNAIL_FONT_PROFILE,
      textFontHash: await hashFile(path.join(fontRoot, MATH_THUMBNAIL_FONT_PROFILE.textFontFile)),
      formulaFontHash: await hashFile(path.join(fontRoot, MATH_THUMBNAIL_FONT_PROFILE.formulaFontFile)),
    },
    text: metadata.thumbnail.text,
    fact: { factId: fact.factId, semantic: fact.semantic, expression: exactExpression(fact.semantic), checkIds },
    lessonFacts: lesson.facts,
    verification: {
      artifactVersion: "math-thumbnail-verification-evidence.v1",
      lessonId: lesson.lessonId,
      skillId: lesson.skillId,
      variant: lesson.variant,
      language,
      request,
      response: verification,
      requestContentHash: canonicalHash(request),
      responseContentHash: canonicalHash(verification),
      referencedFactIds: [fact.factId],
      referencedCheckIds: [checkIds[0]],
      source: { producedBy: "math-verification", producer: "sympy-verifier-adapter", producerVersion: VERIFIER_VERSION, parentFingerprints: sources.verification.parentFingerprints },
    },
    teacher: {
      manifestPath: path.resolve(args.teacherManifestPath),
      manifestContentHash: canonicalHash(teacherRaw),
      assetVersion: teacherManifest.assetVersion,
      poseId: args.teacherPoseId,
      areaRatio: args.teacherAreaRatio,
    },
    sources,
    workflow: {
      owningStage: "metadata-playlists",
      producer: "math-thumbnail-renderer",
      producerVersion: MATH_THUMBNAIL_RENDERER_VERSION,
      parentFingerprints: manifest.stages.find((stage) => stage.stage === "metadata-playlists")!.parentFingerprints,
    },
  });
  thumbnailSpecAuthority.set(spec, canonicalHash(spec));
  return spec;
}

function escapeXml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function exactExpression(value: z.infer<typeof exactValueSchema>) {
  if (value.kind === "scalar") return value.expression;
  if (value.kind === "measurement") return value.value;
  throw new Error("Thumbnail facts must use scalar or measurement semantics.");
}

function verifierCheckSemantic(
  check: z.infer<typeof verifierRequestSchema>["checks"][number]
): z.infer<typeof exactValueSchema> {
  return "expected" in check
    ? check.expected
    : { kind: "scalar", expression: check.expression };
}

function expressionMetrics(expression: z.infer<typeof expressionNodeSchema>): {
  nodes: number;
  depth: number;
} {
  switch (expression.kind) {
    case "integer":
    case "rational":
    case "decimal":
    case "constant":
    case "symbol":
      return { nodes: 1, depth: 1 };
    case "negate": {
      const child = expressionMetrics(expression.operand);
      return { nodes: child.nodes + 1, depth: child.depth + 1 };
    }
    case "sum":
    case "product":
    case "tuple":
    case "set":
    case "matrix": {
      const children = ("operands" in expression ? expression.operands : expression.items).map(expressionMetrics);
      return {
        nodes: 1 + children.reduce((sum, child) => sum + child.nodes, 0),
        depth: 1 + Math.max(0, ...children.map((child) => child.depth)),
      };
    }
    case "quotient":
    case "power":
    case "relation": {
      const left = expressionMetrics(expression.left);
      const right = expressionMetrics(expression.right);
      return { nodes: left.nodes + right.nodes + 1, depth: Math.max(left.depth, right.depth) + 1 };
    }
    case "root": {
      const left = expressionMetrics(expression.radicand);
      const right = expressionMetrics(expression.degree);
      return { nodes: left.nodes + right.nodes + 1, depth: Math.max(left.depth, right.depth) + 1 };
    }
    case "function": {
      const children = expression.args.map(expressionMetrics);
      return {
        nodes: 1 + children.reduce((sum, child) => sum + child.nodes, 0),
        depth: 1 + Math.max(0, ...children.map((child) => child.depth)),
      };
    }
  }
}

function assertVerifierBoundFact(spec: MathThumbnailSpec): void {
  const verification = mathThumbnailVerificationEvidenceSchema.parse(spec.verification);
  const request = verifierRequestSchema.parse(verification.request);
  const response = verifierResponseSchema.parse(verification.response);
  const { inputHash: _inputHash, ...requestPayload } = request;
  const matchingFacts = spec.lessonFacts.filter((fact) => fact.factId === spec.fact.factId);
  if (
    matchingFacts.length !== 1 ||
    new Set(spec.lessonFacts.map((fact) => fact.factId)).size !== spec.lessonFacts.length
  )
    throw new Error("Thumbnail fact does not match exactly one authoritative lesson fact.");
  const lessonFact = matchingFacts[0]!;
  const referencedCheckId = verification.referencedCheckIds[0];
  const requestCheck = request.checks.find((check) => check.checkId === referencedCheckId);
  const responseCheck = response.checks.find((check) => check.checkId === referencedCheckId);
  if (
    verification.lessonId !== spec.lessonId ||
    verification.skillId !== spec.skillId ||
    verification.variant !== spec.variant ||
    verification.language !== spec.language ||
    verification.requestContentHash !== canonicalHash(request) ||
    verification.responseContentHash !== canonicalHash(response) ||
    request.inputHash !== canonicalHash(requestPayload) ||
    response.requestId !== request.requestId ||
    response.inputHash !== request.inputHash ||
    response.status !== "passed" ||
    response.checks.length !== request.checks.length ||
    response.checks.some((check, index) =>
      check.checkId !== request.checks[index]?.checkId || check.status !== "passed"
    ) ||
    verification.referencedFactIds[0] !== spec.fact.factId ||
    new Set(verification.referencedFactIds).size !== 1 ||
    new Set(verification.referencedCheckIds).size !== 1 ||
    !referencedCheckId ||
    !spec.fact.checkIds.includes(referencedCheckId) ||
    !lessonFact.checkIds.includes(referencedCheckId) ||
    !requestCheck ||
    responseCheck?.status !== "passed" ||
    canonicalHash(lessonFact.semantic) !== canonicalHash(spec.fact.semantic) ||
    canonicalHash(exactExpression(spec.fact.semantic)) !== canonicalHash(spec.fact.expression) ||
    canonicalHash(verifierCheckSemantic(requestCheck)) !==
      canonicalHash(spec.fact.semantic)
  )
    throw new Error("Thumbnail fact is not bound to authoritative passed verifier evidence.");
}

const visibleLabels = {
  de: { grade: "Klasse", variants: { foundation: "Grundlagen", standard: "Standard", challenge: "Herausforderung" } },
  en: { grade: "Grade", variants: { foundation: "Foundation", standard: "Standard", challenge: "Challenge" } },
  es: { grade: "Grado", variants: { foundation: "Fundamentos", standard: "Estándar", challenge: "Desafío" } },
  fr: { grade: "Classe", variants: { foundation: "Fondamentaux", standard: "Standard", challenge: "Défi" } },
  pt: { grade: "Ano", variants: { foundation: "Fundamentos", standard: "Padrão", challenge: "Desafio" } },
} as const;

function measuredTextWidth(text: string, fontPx: number): number {
  return Array.from(text).length * fontPx * 0.58;
}

function fitTextFontPx(text: string, preferredFontPx: number): {
  textFontPx: number;
  measuredTextWidth: number;
} {
  const widthAtPreferred = measuredTextWidth(text, preferredFontPx);
  if (widthAtPreferred <= 1200)
    return { textFontPx: preferredFontPx, measuredTextWidth: widthAtPreferred };
  const textFontPx = Math.floor(1200 / (Array.from(text).length * 0.58));
  if (textFontPx < 64)
    throw new Error("Thumbnail text overflows its safe area.");
  return { textFontPx, measuredTextWidth: measuredTextWidth(text, textFontPx) };
}

function measuredFormulaWidth(args: {
  latex: string;
  nodes: number;
  formulaFontPx: number;
}): number {
  return Math.max(
    args.formulaFontPx,
    Array.from(args.latex).length * args.formulaFontPx * 0.61 +
      args.nodes * args.formulaFontPx * 0.08
  );
}

function fitFormulaFontPx(args: {
  latex: string;
  nodes: number;
  depth: number;
  preferredFontPx: number;
  minFontPx: number;
}): {
  formulaFontPx: number;
  measuredFormulaWidth: number;
  measuredFormulaHeight: number;
} {
  if (args.nodes > 48 || args.depth > 8)
    throw new Error("Thumbnail formula bounds overflow the verified safe area.");
  const unitWidth = Array.from(args.latex).length * 0.61 + args.nodes * 0.08;
  const widthAtPreferred = measuredFormulaWidth({
    latex: args.latex,
    nodes: args.nodes,
    formulaFontPx: args.preferredFontPx,
  });
  const formulaFontPx =
    widthAtPreferred <= 1120
      ? args.preferredFontPx
      : Math.floor(1120 / unitWidth);
  const measuredFormulaHeight =
    formulaFontPx * (1.15 + Math.max(0, args.depth - 2) * 0.28);
  const finalWidth = measuredFormulaWidth({
    latex: args.latex,
    nodes: args.nodes,
    formulaFontPx,
  });
  if (
    formulaFontPx < args.minFontPx ||
    finalWidth > 1120 ||
    measuredFormulaHeight > 260
  )
    throw new Error("Thumbnail formula bounds overflow the verified safe area.");
  return { formulaFontPx, measuredFormulaWidth: finalWidth, measuredFormulaHeight };
}

export async function renderMathThumbnail(args: {
  spec: MathThumbnailSpec;
  outputDir: string;
}): Promise<{ assetPath: string; manifestPath: string; manifest: MathThumbnailManifest }> {
  if (
    !args.spec ||
    typeof args.spec !== "object" ||
    thumbnailSpecAuthority.get(args.spec) !== canonicalHash(args.spec)
  ) throw new Error("Thumbnail rendering requires unmodified workflow-loaded evidence.");
  const spec = mathThumbnailSpecSchema.parse(args.spec);
  const expectedProfile = spec.grade <= 7 ? grades57Profile : grades810Profile;
  if (spec.profile !== expectedProfile.id)
    throw new Error("Thumbnail grade profile mismatch.");
  assertVerifierBoundFact(spec);
  const teacher = await loadTeacherPose(spec.teacher.manifestPath, spec.teacher.poseId, spec.teacher.areaRatio);
  const teacherManifestRaw = JSON.parse(await fs.readFile(spec.teacher.manifestPath, "utf8")) as unknown;
  const teacherManifest = z.object({
    assetVersion: z.string().min(1),
    license: z.string().min(1),
    provenance: z.string().min(1),
  }).passthrough().parse(teacherManifestRaw);
  if (
    teacherManifest.assetVersion !== spec.teacher.assetVersion ||
    canonicalHash(teacherManifestRaw) !== spec.teacher.manifestContentHash
  ) throw new Error("Teacher asset manifest is stale or mismatched.");
  const words = spec.text.trim().split(/\s+/u).filter(Boolean);
  const { textFontPx, measuredTextWidth } = fitTextFontPx(
    spec.text,
    spec.profile === "grades-5-7-v1" ? 96 : 82
  );
  const latex = expressionToLatex(spec.fact.expression);
  const metrics = expressionMetrics(spec.fact.expression);
  const { formulaFontPx, measuredFormulaWidth, measuredFormulaHeight } =
    fitFormulaFontPx({
      latex,
      nodes: metrics.nodes,
      depth: metrics.depth,
      preferredFontPx: Math.max(expectedProfile.minFormulaPx, 92),
      minFontPx: expectedProfile.minFormulaPx,
    });
  const assetName = spec.outputAssetName;
  const outputRoot = path.resolve(args.outputDir);
  const assetPath = path.join(outputRoot, assetName);
  const manifestPath = path.join(outputRoot, `${assetName}.manifest.json`);
  const teacherData = Buffer.from(teacher.svg, "utf8").toString("base64");
  const [textFont, formulaFont] = await Promise.all([
    fs.readFile(path.join(fontRoot, spec.fontProfile.textFontFile)),
    fs.readFile(path.join(fontRoot, spec.fontProfile.formulaFontFile)),
  ]);
  if (
    await hashFile(path.join(fontRoot, spec.fontProfile.textFontFile)) !== spec.fontProfile.textFontHash ||
    await hashFile(path.join(fontRoot, spec.fontProfile.formulaFontFile)) !== spec.fontProfile.formulaFontHash
  ) throw new Error("Thumbnail embedded font profile hash mismatch.");
  const semanticSpec = {
    ...spec,
    teacher: {
      poseId: spec.teacher.poseId,
      areaRatio: spec.teacher.areaRatio,
      assetVersion: spec.teacher.assetVersion,
      manifestContentHash: spec.teacher.manifestContentHash,
    },
  };
  const semanticSpecHash = canonicalHash(semanticSpec);
  const boundHash = canonicalHash({ semanticSpecHash, rendererVersion: MATH_THUMBNAIL_RENDERER_VERSION, teacherHash: teacher.sha256, teacherVersion: spec.teacher.assetVersion, outputAssetName: assetName, fontProfile: spec.fontProfile });
  const footer = `${visibleLabels[spec.language].grade} ${spec.grade} · ${visibleLabels[spec.language].variants[spec.variant]}`;
  const placeholderTeacher = spec.teacher.assetVersion.includes("placeholder");
  const artwork = {
    status: placeholderTeacher ? "simulation-placeholder" as const : "approved-publish-artwork" as const,
    publishReady: !placeholderTeacher,
    blockers: placeholderTeacher ? ["placeholder-teacher-artwork-not-approved-for-public-release"] : [],
    license: teacherManifest.license,
    provenance: teacherManifest.provenance,
  };
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080" role="img" data-bound-hash="${boundHash}" data-renderer-version="${MATH_THUMBNAIL_RENDERER_VERSION}" data-font-profile="${spec.fontProfile.id}" data-output-name="${escapeXml(assetName)}" data-teacher-version="${escapeXml(spec.teacher.assetVersion)}"><defs><style>@font-face{font-family:'${spec.fontProfile.textFamily}';src:url(data:font/woff2;base64,${textFont.toString("base64")}) format('woff2');font-weight:800}@font-face{font-family:'${spec.fontProfile.formulaFamily}';src:url(data:font/woff2;base64,${formulaFont.toString("base64")}) format('woff2');font-weight:400}</style></defs><rect width="1920" height="1080" fill="#102a43"/><rect x="96" y="54" width="1728" height="972" rx="48" fill="#f0f4f8"/><text x="160" y="250" font-family="${spec.fontProfile.textFamily}" font-size="${textFontPx}" font-weight="800" fill="#102a43">${escapeXml(spec.text)}</text><g data-fact-id="${escapeXml(spec.fact.factId)}"><text x="160" y="600" font-family="${spec.fontProfile.formulaFamily}" font-size="${formulaFontPx}" fill="#d64545">${escapeXml(latex)}</text></g><text x="160" y="930" font-family="${spec.fontProfile.textFamily}" font-size="64" fill="#334e68">${escapeXml(footer)}</text><image x="1460" y="520" width="300" height="450" href="data:image/svg+xml;base64,${teacherData}"/></svg>`;
  await writeBinaryAtomic(assetPath, Buffer.from(svg, "utf8"));
  const contentHash = hashText(svg);
  if ((await hashFile(assetPath)) !== contentHash) throw new Error("Thumbnail content hash verification failed.");
  const manifest = mathThumbnailManifestSchema.parse({
    artifactVersion: "math-thumbnail.v1",
    identity: {
      lessonId: spec.lessonId,
      skillId: spec.skillId,
      language: spec.language,
      variant: spec.variant,
      grade: spec.grade,
      curriculumReleaseId: spec.curriculumReleaseId,
      curriculumReleaseHash: spec.curriculumReleaseHash,
      localizationHash: spec.localizationHash,
    },
    specVersion: MATH_THUMBNAIL_SPEC_VERSION,
    rendererVersion: MATH_THUMBNAIL_RENDERER_VERSION,
    fontProfile: spec.fontProfile,
    profile: spec.profile,
    teacherVersion: spec.teacher.assetVersion,
    teacherManifestHash: spec.teacher.manifestContentHash,
    teacherPoseId: teacher.poseId,
    teacherPoseHash: teacher.sha256,
    artwork,
    inputHashes: { lessonContent: spec.lessonContentHash, metadata: spec.metadataHash, fact: canonicalHash(spec.fact.semantic), verification: spec.verification.responseContentHash, spec: semanticSpecHash },
    dimensions: { width: 1920, height: 1080, aspectRatio: "16:9" },
    safeArea: { x: 96, y: 54, width: 1728, height: 972 },
    readability: { wordCount: words.length, textFontPx, formulaFontPx, measuredTextWidth, measuredFormulaWidth, measuredFormulaHeight, mobileReadable: true },
    teacherAreaRatio: spec.teacher.areaRatio,
    formulaPriority: true,
    factId: spec.fact.factId,
    factSemanticHash: canonicalHash(spec.fact.semantic),
    verification: {
      requestId: spec.verification.request.requestId,
      requestContentHash: spec.verification.requestContentHash,
      responseContentHash: spec.verification.responseContentHash,
      referencedFactIds: spec.verification.referencedFactIds,
      referencedCheckIds: spec.verification.referencedCheckIds,
    },
    sourceLineage: spec.sources,
    workflow: spec.workflow,
    outputPath: assetName,
    contentHash,
    byteLength: Buffer.byteLength(svg),
  });
  await writeJsonAtomic(manifestPath, manifest);
  return { assetPath, manifestPath, manifest };
}
