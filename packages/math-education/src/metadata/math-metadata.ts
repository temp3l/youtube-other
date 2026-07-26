import { z } from "zod";
import {
  curriculumSkillSchema,
  lessonVariantSpecificationSchema,
  mathLanguageSchema,
  type CurriculumSkill,
  type LessonVariantSpecification,
  type MathLanguage,
} from "../domain/index.js";
import { timingManifestSchema, type TimingManifest } from "../lesson/timing.js";
import {
  metadataTimingEvidenceSchema,
  type MetadataTimingEvidence,
} from "../lesson/timing.js";
import {
  analyzePrerequisiteDag,
  prerequisitesFileSchema,
} from "../curriculum/dag.js";
import { isAuthoritativeLoadedCurriculumRelease } from "../curriculum/release.js";
import { lessonCapability } from "../lesson/capabilities.js";
import {
  assertPrivateOwnerCurriculumApproval,
  type PrivateOwnerAttestation,
} from "../review/private-owner-attestation.js";
import {
  localizedNarrationSchema,
  type LocalizedNarration,
} from "../localization/localization.js";
import { canonicalHash } from "../verification/canonical-json.js";

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/u);
const playlistKindSchema = z.enum(["grade", "topic", "variant"]);
const playlistKeySchema = z.enum([
  "grade-5",
  "grade-6",
  "grade-7",
  "grade-8",
  "grade-9",
  "grade-10",
  "topic-zo",
  "topic-gm",
  "topic-dz",
  "variant-foundation",
  "variant-standard",
  "variant-challenge",
]);

export const mathPlaylistCatalogSchema = z
  .strictObject({
    artifactVersion: z.literal("math-playlist-catalog.v1"),
    entries: z.array(
      z.strictObject({
        key: playlistKeySchema,
        kind: playlistKindSchema,
        localizedNames: z.strictObject({
          de: z.string().min(1),
          en: z.string().min(1),
          es: z.string().min(1),
          fr: z.string().min(1),
          pt: z.string().min(1),
        }),
      })
    ),
  })
  .superRefine((catalog, context) => {
    const keys = new Set<string>();
    for (const [index, entry] of catalog.entries.entries()) {
      if (keys.has(entry.key))
        context.addIssue({
          code: "custom",
          path: ["entries", index, "key"],
          message: `Duplicate playlist key: ${entry.key}`,
        });
      keys.add(entry.key);
    }
    for (const requiredKey of playlistKeySchema.options) {
      if (!keys.has(requiredKey))
        context.addIssue({
          code: "custom",
          path: ["entries"],
          message: `Missing required playlist key: ${requiredKey}`,
        });
    }
    if (catalog.entries.length !== playlistKeySchema.options.length)
      context.addIssue({
        code: "custom",
        path: ["entries"],
        message:
          "Playlist catalog must contain every supported key exactly once.",
      });
  });
export type MathPlaylistCatalog = z.infer<typeof mathPlaylistCatalogSchema>;

export const MATH_PLAYLIST_CATALOG_VERSION = "math-playlist-catalog.v1";
export const mathPlaylistCatalog: MathPlaylistCatalog =
  mathPlaylistCatalogSchema.parse({
    artifactVersion: MATH_PLAYLIST_CATALOG_VERSION,
    entries: [
      ...[5, 6, 7, 8, 9, 10].map((grade) => ({
        key: `grade-${grade}`,
        kind: "grade",
        localizedNames: {
          de: `Klasse ${grade}`,
          en: `Grade ${grade}`,
          es: `Grado ${grade}`,
          fr: `Classe ${grade}`,
          pt: `${grade}º ano`,
        },
      })),
      {
        key: "topic-zo",
        kind: "topic",
        localizedNames: {
          de: "Zahlen und Operationen",
          en: "Numbers and Operations",
          es: "Números y operaciones",
          fr: "Nombres et opérations",
          pt: "Números e operações",
        },
      },
      {
        key: "topic-gm",
        kind: "topic",
        localizedNames: {
          de: "Geometrie und Messen",
          en: "Geometry and Measurement",
          es: "Geometría y medida",
          fr: "Géométrie et mesure",
          pt: "Geometria e medição",
        },
      },
      {
        key: "topic-dz",
        kind: "topic",
        localizedNames: {
          de: "Daten und Zufall",
          en: "Data and Chance",
          es: "Datos y azar",
          fr: "Données et hasard",
          pt: "Dados e acaso",
        },
      },
      ...(["foundation", "standard", "challenge"] as const).map((variant) => ({
        key: `variant-${variant}`,
        kind: "variant",
        localizedNames: {
          de:
            variant === "foundation"
              ? "Grundlagen"
              : variant === "standard"
                ? "Standard"
                : "Herausforderung",
          en:
            variant === "foundation"
              ? "Foundation"
              : variant === "standard"
                ? "Standard"
                : "Challenge",
          es:
            variant === "foundation"
              ? "Fundamentos"
              : variant === "standard"
                ? "Estándar"
                : "Desafío",
          fr:
            variant === "foundation"
              ? "Fondamentaux"
              : variant === "standard"
                ? "Standard"
                : "Défi",
          pt:
            variant === "foundation"
              ? "Fundamentos"
              : variant === "standard"
                ? "Padrão"
                : "Desafio",
        },
      })),
    ],
  });

const metadataEvidenceSchema = z.strictObject({
  evidenceVersion: z.literal("math-metadata-evidence.v1"),
  language: mathLanguageSchema,
  lessonId: z.string().min(1),
  skillId: z.string().min(1),
  objectiveHash: hashSchema,
  localizedTopic: z.string().min(2).max(70),
  searchTerms: z.array(z.string().min(1).max(60)).min(3).max(12),
  thumbnailText: z.string().min(2).max(60),
  verifiedFormulaFactId: z.string().min(1),
});
export type MathMetadataEvidence = z.infer<typeof metadataEvidenceSchema>;

export const metadataWorkflowEvidenceSchema = z.strictObject({
  artifactVersion: z.literal("math-metadata-workflow-evidence.v1"),
  lessonId: z.string().min(1),
  skillId: z.string().min(1),
  variant: z.enum(["foundation", "standard", "challenge"]),
  language: mathLanguageSchema,
  sources: z.strictObject({
    lesson: z.strictObject({
      relativePath: z.literal("canonical/lesson-spec.json"),
      schemaVersion: z.literal("lesson-spec.v1"),
      producedBy: z.literal("lesson-spec"),
      producer: z.literal("lesson-specification-builder"),
      producerVersion: z.literal("reviewed-fixtures.v1"),
      contentHash: hashSchema,
      parentFingerprints: z.array(hashSchema).length(1),
    }),
    localization: z.strictObject({
      relativePath: z
        .string()
        .regex(/^locales\/(?:de|en|es|fr|pt)\/narration\.json$/u),
      schemaVersion: z.literal("math-narration.v2"),
      producedBy: z.literal("localization"),
      producer: z.literal("locked-fact-localizer"),
      producerVersion: z.literal("locked-facts.v2"),
      contentHash: hashSchema,
      parentFingerprints: z.array(hashSchema).length(1),
    }),
    timing: z.strictObject({
      relativePath: z
        .string()
        .regex(/^locales\/(?:de|en|es|fr|pt)\/timing\.json$/u),
      schemaVersion: z.literal("math-timing.v1"),
      producedBy: z.literal("scene-timing"),
      producer: z.literal("math-timing-reflow"),
      producerVersion: z.literal("math-timing.v1"),
      contentHash: hashSchema,
      parentFingerprints: z.array(hashSchema).length(1),
    }),
  }),
  output: z.strictObject({
    owningStage: z.literal("metadata-playlists"),
    producer: z.literal("math-metadata-generator"),
    producerVersion: z.literal("math-metadata-generator.v3"),
    parentFingerprints: z.array(hashSchema).length(1),
  }),
});
export type MetadataWorkflowEvidence = z.infer<
  typeof metadataWorkflowEvidenceSchema
>;
const metadataWorkflowAuthority = new WeakMap<object, string>();

export const reviewedMetadataContextSchema = z.strictObject({
  artifactVersion: z.literal("math-reviewed-metadata-context.v1"),
  releaseId: z.string().min(1),
  releaseHash: hashSchema,
  releaseContentHash: hashSchema,
  releaseStatus: z.enum(["draft", "reviewed", "published", "superseded"]),
  sourceProvenanceHash: hashSchema,
  sourceProvenanceComplete: z.boolean(),
  prerequisiteInputHash: hashSchema,
  prerequisiteReleaseId: z.string().min(1),
  prerequisites: prerequisitesFileSchema,
  skills: z.array(curriculumSkillSchema).min(1),
  stableTopologicalOrder: z.array(z.string().min(1)).min(1),
  stableTopologicalOrderHash: hashSchema,
  targetSkillId: z.string().min(1),
  targetSkillHash: hashSchema,
  sourceProducer: z.literal("curriculum-release-loader"),
  producerVersion: z.literal("curriculum-release-loader.v1"),
  rolloutCapability: z.strictObject({
    skillId: z.string().min(1),
    status: z.enum(["approved-simulation", "owner-attested-private"]),
    producerVersion: z.literal("reviewed-fixtures.v1"),
    variants: z
      .array(z.enum(["foundation", "standard", "challenge"]))
      .length(3),
  }),
});
export type ReviewedMetadataContext = z.infer<
  typeof reviewedMetadataContextSchema
>;
const reviewedMetadataAuthority = new WeakMap<object, string>();

function createMetadataContext(
  release: {
    release: {
      releaseId: string;
      status: "draft" | "reviewed" | "published" | "superseded";
    };
    releaseHash: string;
    skills: readonly CurriculumSkill[];
    prerequisites: unknown;
    provenance: { complete: boolean };
    graph: { order: readonly string[] };
  },
  targetSkillId: string,
  privateOwnerAttestation: PrivateOwnerAttestation | undefined,
  exactContentSimulation: boolean
): ReviewedMetadataContext {
  if (!isAuthoritativeLoadedCurriculumRelease(release))
    throw new Error(
      "Metadata curriculum evidence was not produced by the authoritative release loader."
    );
  const prerequisites = prerequisitesFileSchema.parse(release.prerequisites);
  const skill = release.skills.find(
    (candidate) => candidate.skillId === targetSkillId
  );
  const capability = lessonCapability(targetSkillId);
  const privateOwnerApproved = privateOwnerAttestation
    ? Boolean(
        assertPrivateOwnerCurriculumApproval(
          privateOwnerAttestation,
          release as Parameters<typeof assertPrivateOwnerCurriculumApproval>[1],
          targetSkillId
        )
      )
    : false;
  if (
    !skill ||
    (!privateOwnerApproved &&
      !exactContentSimulation &&
      !release.provenance.complete) ||
    (!privateOwnerApproved && prerequisites.reviewStatus !== "reviewed") ||
    (!privateOwnerApproved &&
      release.release.status !== "reviewed" &&
      release.release.status !== "published") ||
    !capability
  )
    throw new Error(`Metadata rollout is not reviewed for ${targetSkillId}.`);
  const recomputed = analyzePrerequisiteDag(
    release.skills,
    prerequisites.edges
  ).order;
  if (canonicalHash(recomputed) !== canonicalHash(release.graph.order))
    throw new Error("Loaded curriculum graph is not the reviewed DAG result.");
  const context = reviewedMetadataContextSchema.parse({
    artifactVersion: "math-reviewed-metadata-context.v1",
    releaseId: release.release.releaseId,
    releaseHash: release.releaseHash,
    releaseContentHash: canonicalHash(release.release),
    releaseStatus: release.release.status,
    sourceProvenanceHash: canonicalHash(release.provenance),
    sourceProvenanceComplete: release.provenance.complete,
    prerequisiteInputHash: canonicalHash(prerequisites),
    prerequisiteReleaseId: release.release.releaseId,
    prerequisites,
    skills: release.skills,
    stableTopologicalOrder: recomputed,
    stableTopologicalOrderHash: canonicalHash(recomputed),
    targetSkillId,
    targetSkillHash: canonicalHash(skill),
    sourceProducer: "curriculum-release-loader",
    producerVersion: "curriculum-release-loader.v1",
    rolloutCapability: privateOwnerApproved
      ? { ...capability, status: "owner-attested-private" }
      : capability,
  });
  reviewedMetadataAuthority.set(context, canonicalHash(context));
  return context;
}

export function createReviewedMetadataContext(
  release: Parameters<typeof createMetadataContext>[0],
  targetSkillId: string,
  privateOwnerAttestation?: PrivateOwnerAttestation
): ReviewedMetadataContext {
  return createMetadataContext(
    release,
    targetSkillId,
    privateOwnerAttestation,
    false
  );
}

export function createExactContentSimulationMetadataContext(
  release: Parameters<typeof createMetadataContext>[0],
  targetSkillId: string
): ReviewedMetadataContext {
  return createMetadataContext(release, targetSkillId, undefined, true);
}

export const mathMetadataSchema = z.strictObject({
  artifactVersion: z.literal("math-metadata.v2"),
  producer: z.literal("math-metadata-generator"),
  producerVersion: z.literal("math-metadata-generator.v3"),
  owningStage: z.literal("metadata-playlists"),
  parentFingerprints: z.array(hashSchema).length(1),
  sourceArtifactsHash: hashSchema,
  identity: z.strictObject({
    lessonId: z.string().min(1),
    skillId: z.string().min(1),
    curriculumReleaseId: z.string().min(1),
    curriculumReleaseHash: hashSchema,
    curriculumReleaseContentHash: hashSchema,
    grade: z.number().int().min(5).max(10),
    variant: z.enum(["foundation", "standard", "challenge"]),
    language: mathLanguageSchema,
    region: z.enum(["DE", "US", "419", "FR", "BR"]),
    objectiveHash: hashSchema,
    lessonContentHash: hashSchema,
    localizationHash: hashSchema,
    timingHash: hashSchema,
    timingEvidenceHash: hashSchema,
    prerequisiteInputHash: hashSchema,
    prerequisiteReleaseId: z.string().min(1),
    orderHash: hashSchema,
  }),
  title: z.string().min(1).max(100),
  description: z.string().min(1).max(5000),
  chapters: z
    .array(
      z.strictObject({
        beat: z.enum(["opening", "example", "challenge", "solution"]),
        seconds: z.number().nonnegative(),
        title: z.string().min(1),
      })
    )
    .length(4),
  tags: z.array(z.string().min(1)).min(3).max(12),
  searchTerms: z.array(z.string().min(1)).min(3).max(12),
  hashtags: z.array(z.string().regex(/^#[\p{L}\p{N}]+$/u)).min(2),
  thumbnail: z.strictObject({
    text: z.string().min(2),
    formulaFactId: z.string().min(1),
    profile: z.enum(["grades-5-7-v1", "grades-8-10-v1"]),
  }),
  dagNeighbors: z.strictObject({
    previousSkillId: z.string().min(1).nullable(),
    nextSkillId: z.string().min(1).nullable(),
    orderHash: hashSchema,
  }),
  catalogVersion: z.literal("math-playlist-catalog.v1"),
  catalogHash: hashSchema,
  playlists: z
    .array(
      z.strictObject({
        key: z.string().min(1),
        kind: playlistKindSchema,
        localizedName: z.string().min(1),
      })
    )
    .length(3),
});
export type MathMetadata = z.infer<typeof mathMetadataSchema>;

export interface GenerateMathMetadataInput {
  reviewedContext: ReviewedMetadataContext;
  skill: CurriculumSkill;
  lesson: LessonVariantSpecification;
  localization: LocalizedNarration;
  timingEvidence: MetadataTimingEvidence;
  workflowEvidence: MetadataWorkflowEvidence;
  evidence: MathMetadataEvidence;
  catalog?: MathPlaylistCatalog;
}

export function createMetadataWorkflowEvidence(args: {
  lesson: LessonVariantSpecification;
  localization: LocalizedNarration;
  timingEvidence: MetadataTimingEvidence;
  parentFingerprints: {
    lesson: readonly [string];
    localization: readonly [string];
    timing: readonly [string];
    output: readonly [string];
  };
}): MetadataWorkflowEvidence {
  const lesson = lessonVariantSpecificationSchema.parse(args.lesson);
  const localization = localizedNarrationSchema.parse(args.localization);
  const timing = metadataTimingEvidenceSchema.parse(args.timingEvidence);
  if (
    localization.lessonId !== lesson.lessonId ||
    localization.variant !== lesson.variant ||
    timing.lessonId !== lesson.lessonId ||
    timing.skillId !== lesson.skillId ||
    timing.language !== localization.language
  )
    throw new Error("Metadata workflow source identity mismatch.");
  const evidence = metadataWorkflowEvidenceSchema.parse({
    artifactVersion: "math-metadata-workflow-evidence.v1",
    lessonId: lesson.lessonId,
    skillId: lesson.skillId,
    variant: lesson.variant,
    language: localization.language,
    sources: {
      lesson: {
        relativePath: "canonical/lesson-spec.json",
        schemaVersion: "lesson-spec.v1",
        producedBy: "lesson-spec",
        producer: "lesson-specification-builder",
        producerVersion: "reviewed-fixtures.v1",
        contentHash: lesson.contentHash,
        parentFingerprints: args.parentFingerprints.lesson,
      },
      localization: {
        relativePath: `locales/${localization.language}/narration.json`,
        schemaVersion: "math-narration.v2",
        producedBy: "localization",
        producer: "locked-fact-localizer",
        producerVersion: "locked-facts.v2",
        contentHash: localization.contentHash,
        parentFingerprints: args.parentFingerprints.localization,
      },
      timing: {
        relativePath: `locales/${localization.language}/timing.json`,
        schemaVersion: "math-timing.v1",
        producedBy: "scene-timing",
        producer: "math-timing-reflow",
        producerVersion: "math-timing.v1",
        contentHash: timing.timingPayloadHash,
        parentFingerprints: args.parentFingerprints.timing,
      },
    },
    output: {
      owningStage: "metadata-playlists",
      producer: "math-metadata-generator",
      producerVersion: "math-metadata-generator.v3",
      parentFingerprints: args.parentFingerprints.output,
    },
  });
  metadataWorkflowAuthority.set(evidence, canonicalHash(evidence));
  return evidence;
}

const localeCopy = {
  de: {
    region: "DE",
    opening: "Heute untersuchen wir",
    conjunction: "und",
    description: "Geprüftes Beispiel, Denkaufgabe und vollständige Lösung.",
    chapters: ["Start", "Beispiel", "Denkaufgabe", "Lösung"],
    math: "Mathematik",
    grade: "Klasse",
  },
  en: {
    region: "US",
    opening: "Today we investigate",
    conjunction: "and",
    description: "Verified example, challenge, and complete solution.",
    chapters: ["Start", "Example", "Challenge", "Solution"],
    math: "Mathematics",
    grade: "Grade",
  },
  es: {
    region: "419",
    opening: "Hoy investigamos",
    conjunction: "y",
    description: "Ejemplo verificado, reto y solución completa.",
    chapters: ["Inicio", "Ejemplo", "Reto", "Solución"],
    math: "Matemáticas",
    grade: "Grado",
  },
  fr: {
    region: "FR",
    opening: "Aujourd'hui, nous étudions",
    conjunction: "et",
    description: "Exemple vérifié, défi et solution complète.",
    chapters: ["Début", "Exemple", "Défi", "Solution"],
    math: "Mathématiques",
    grade: "Classe",
  },
  pt: {
    region: "BR",
    opening: "Hoje investigamos",
    conjunction: "e",
    description: "Exemplo verificado, desafio e solução completa.",
    chapters: ["Início", "Exemplo", "Desafio", "Solução"],
    math: "Matemática",
    grade: "Ano",
  },
} as const;

function wordCount(value: string): number {
  return value.trim().split(/\s+/u).filter(Boolean).length;
}

export function createMathMetadataEvidence(
  skill: CurriculumSkill,
  lesson: LessonVariantSpecification,
  localization: LocalizedNarration
): MathMetadataEvidence {
  const parsedSkill = curriculumSkillSchema.parse(skill);
  const parsedLesson = lessonVariantSpecificationSchema.parse(lesson);
  const parsedLocalization = localizedNarrationSchema.parse(localization);
  if (
    parsedSkill.skillId !== parsedLesson.skillId ||
    parsedLesson.lessonId !== parsedLocalization.lessonId
  )
    throw new Error("Metadata source evidence identity mismatch.");
  const copy = localeCopy[parsedLocalization.language];
  const opening = parsedLocalization.segments[0]?.displayText;
  const canonicalOpening = `${copy.opening} `;
  const placeValueQuestOpening =
    parsedLocalization.language === "de" &&
    opening?.startsWith(
      "Heute knacken wir einen Zahlencode. Dabei untersuchen wir "
    )
      ? "Heute knacken wir einen Zahlencode. Dabei untersuchen wir "
      : undefined;
  const acceptedOpening = opening?.startsWith(canonicalOpening)
    ? canonicalOpening
    : placeValueQuestOpening;
  if (!opening || !acceptedOpening)
    throw new Error(
      "Localized topic evidence is missing from the opening beat."
    );
  const localizedTopic = opening
    .slice(acceptedOpening.length)
    .split(".", 1)[0]
    ?.trim()
    .replace(/ und /gu, ` ${copy.conjunction} `);
  if (
    !localizedTopic ||
    wordCount(localizedTopic) < 2 ||
    wordCount(localizedTopic) > 5
  )
    throw new Error("Localized topic evidence must contain 2-5 words.");
  const formulaFact = parsedLesson.facts.find((fact) =>
    parsedLocalization.resolvedFacts.some(
      (resolved) => resolved.factId === fact.factId
    )
  );
  if (!formulaFact)
    throw new Error("No localized verified fact evidence exists.");
  return metadataEvidenceSchema.parse({
    evidenceVersion: "math-metadata-evidence.v1",
    language: parsedLocalization.language,
    lessonId: parsedLesson.lessonId,
    skillId: parsedSkill.skillId,
    objectiveHash: parsedLocalization.objectiveHash,
    localizedTopic,
    searchTerms: [
      localizedTopic,
      copy.math,
      `${copy.grade} ${parsedSkill.canonicalGrade}`,
    ],
    thumbnailText: localizedTopic,
    verifiedFormulaFactId: formulaFact.factId,
  });
}

function resolvePlaylist(
  catalog: MathPlaylistCatalog,
  key: string,
  kind: z.infer<typeof playlistKindSchema>,
  language: MathLanguage
) {
  const matches = catalog.entries.filter((entry) => entry.key === key);
  if (matches.length !== 1)
    throw new Error(`Playlist catalog must resolve exactly one key: ${key}`);
  const entry = matches[0]!;
  if (entry.kind !== kind)
    throw new Error(
      `Playlist ${key} has wrong kind ${entry.kind}; expected ${kind}.`
    );
  return { key, kind, localizedName: entry.localizedNames[language] };
}

export function generateMathMetadata(
  input: GenerateMathMetadataInput
): MathMetadata {
  if (
    !input.reviewedContext ||
    typeof input.reviewedContext !== "object" ||
    reviewedMetadataAuthority.get(input.reviewedContext) !==
      canonicalHash(input.reviewedContext)
  )
    throw new Error(
      "Math metadata requires unmodified authoritative release-loader evidence."
    );
  const skill = curriculumSkillSchema.parse(input.skill);
  const lesson = lessonVariantSpecificationSchema.parse(input.lesson);
  const localization = localizedNarrationSchema.parse(input.localization);
  const context = reviewedMetadataContextSchema.parse(input.reviewedContext);
  const timingEvidence = metadataTimingEvidenceSchema.parse(
    input.timingEvidence
  );
  if (
    !input.workflowEvidence ||
    typeof input.workflowEvidence !== "object" ||
    metadataWorkflowAuthority.get(input.workflowEvidence) !==
      canonicalHash(input.workflowEvidence)
  )
    throw new Error(
      "Math metadata requires authoritative workflow-owned source evidence."
    );
  const workflowEvidence = metadataWorkflowEvidenceSchema.parse(
    input.workflowEvidence
  );
  const timing = timingManifestSchema.parse(timingEvidence.timing);
  const evidence = metadataEvidenceSchema.parse(input.evidence);
  const catalog = mathPlaylistCatalogSchema.parse(
    input.catalog ?? mathPlaylistCatalog
  );
  const language = evidence.language;
  const { contentHash: _lessonHash, ...lessonPayload } = lesson;
  const recomputedLessonHash = canonicalHash(lessonPayload);
  const recomputedOrder = analyzePrerequisiteDag(
    context.skills,
    context.prerequisites.edges
  ).order;
  const releaseSkill = context.skills.find(
    (candidate) => candidate.skillId === skill.skillId
  );
  if (
    lesson.skillId !== skill.skillId ||
    evidence.skillId !== skill.skillId ||
    evidence.lessonId !== lesson.lessonId ||
    localization.lessonId !== lesson.lessonId ||
    localization.language !== language ||
    localization.variant !== lesson.variant ||
    evidence.objectiveHash !== localization.objectiveHash ||
    lesson.contentHash !== recomputedLessonHash ||
    context.targetSkillId !== skill.skillId ||
    !releaseSkill ||
    context.targetSkillHash !== canonicalHash(skill) ||
    context.targetSkillHash !== canonicalHash(releaseSkill) ||
    context.prerequisiteInputHash !== canonicalHash(context.prerequisites) ||
    context.prerequisiteReleaseId !== context.releaseId ||
    workflowEvidence.lessonId !== lesson.lessonId ||
    workflowEvidence.skillId !== skill.skillId ||
    workflowEvidence.variant !== lesson.variant ||
    workflowEvidence.language !== language ||
    workflowEvidence.sources.lesson.contentHash !== lesson.contentHash ||
    workflowEvidence.sources.localization.contentHash !==
      localization.contentHash ||
    workflowEvidence.sources.timing.contentHash !== canonicalHash(timing) ||
    context.stableTopologicalOrderHash !==
      canonicalHash(context.stableTopologicalOrder) ||
    canonicalHash(context.stableTopologicalOrder) !==
      canonicalHash(recomputedOrder) ||
    new Set(context.stableTopologicalOrder).size !== context.skills.length ||
    context.stableTopologicalOrder.length !== context.skills.length ||
    timingEvidence.lessonId !== lesson.lessonId ||
    timingEvidence.skillId !== skill.skillId ||
    timingEvidence.variant !== lesson.variant ||
    timingEvidence.language !== language ||
    timingEvidence.lessonContentHash !== lesson.contentHash ||
    timingEvidence.localizationHash !== localization.contentHash ||
    timingEvidence.timingPayloadHash !== canonicalHash(timing) ||
    timingEvidence.durationSeconds !== timing.durationSeconds ||
    canonicalHash(timingEvidence.orderedSceneIds) !==
      canonicalHash(timing.scenes.map((scene) => scene.sceneId)) ||
    canonicalHash(timingEvidence.orderedSegmentIds) !==
      canonicalHash(timing.scenes.map((scene) => scene.segmentId))
  )
    throw new Error("Math metadata identity or objective evidence mismatch.");
  if (
    !lesson.facts.some((fact) => fact.factId === evidence.verifiedFormulaFactId)
  )
    throw new Error(
      "Metadata formula fact is not present in the authoritative lesson."
    );
  if (
    wordCount(evidence.thumbnailText) < 2 ||
    wordCount(evidence.thumbnailText) > 5
  )
    throw new Error("Thumbnail text must contain 2-5 Unicode words.");
  if (!context.rolloutCapability.variants.includes(lesson.variant))
    throw new Error(
      "Metadata rollout capability does not include the lesson variant."
    );
  const order = [...context.stableTopologicalOrder];
  const orderIndex = order.indexOf(skill.skillId);
  const topicCode = skill.skillId.split("-")[1]?.toLowerCase();
  if (!topicCode)
    throw new Error(`Unsupported skill identity: ${skill.skillId}`);
  const copy = localeCopy[language];
  const chapterIndexes = [0, 3, 6, 7] as const;
  const chapters = chapterIndexes.map((sceneIndex, index) => ({
    beat: (["opening", "example", "challenge", "solution"] as const)[index]!,
    seconds: timing.scenes[sceneIndex]!.startFrame / timing.fps,
    title: copy.chapters[index]!,
  }));
  if (
    chapters.some(
      (chapter, index) =>
        chapter.seconds >= timing.durationSeconds ||
        (index > 0 && chapter.seconds <= chapters[index - 1]!.seconds)
    )
  )
    throw new Error(
      "Metadata chapters must be monotone and within authoritative timing."
    );
  const title = `${evidence.localizedTopic} | ${copy.grade} ${skill.canonicalGrade}`;
  const playlistKeys = [
    [`grade-${skill.canonicalGrade}`, "grade"],
    [`topic-${topicCode}`, "topic"],
    [`variant-${lesson.variant}`, "variant"],
  ] as const;
  return mathMetadataSchema.parse({
    artifactVersion: "math-metadata.v2",
    producer: workflowEvidence.output.producer,
    producerVersion: workflowEvidence.output.producerVersion,
    owningStage: workflowEvidence.output.owningStage,
    parentFingerprints: workflowEvidence.output.parentFingerprints,
    sourceArtifactsHash: canonicalHash(workflowEvidence.sources),
    identity: {
      lessonId: lesson.lessonId,
      skillId: skill.skillId,
      curriculumReleaseId: context.releaseId,
      curriculumReleaseHash: context.releaseHash,
      curriculumReleaseContentHash: context.releaseContentHash,
      grade: skill.canonicalGrade,
      variant: lesson.variant,
      language,
      region: copy.region,
      objectiveHash: evidence.objectiveHash,
      lessonContentHash: lesson.contentHash,
      localizationHash: localization.contentHash,
      timingHash: canonicalHash(timing),
      timingEvidenceHash: canonicalHash(timingEvidence),
      prerequisiteInputHash: context.prerequisiteInputHash,
      prerequisiteReleaseId: context.prerequisiteReleaseId,
      orderHash: context.stableTopologicalOrderHash,
    },
    title,
    description: `${evidence.localizedTopic}. ${copy.description}`,
    chapters,
    tags: [
      copy.math,
      `${copy.grade} ${skill.canonicalGrade}`,
      ...evidence.searchTerms,
    ],
    searchTerms: evidence.searchTerms,
    hashtags: [`#${copy.math}`, `#${copy.grade}${skill.canonicalGrade}`],
    thumbnail: {
      text: evidence.thumbnailText,
      formulaFactId: evidence.verifiedFormulaFactId,
      profile: skill.canonicalGrade <= 7 ? "grades-5-7-v1" : "grades-8-10-v1",
    },
    dagNeighbors: {
      previousSkillId: order[orderIndex - 1] ?? null,
      nextSkillId: order[orderIndex + 1] ?? null,
      orderHash: canonicalHash(order),
    },
    catalogVersion: catalog.artifactVersion,
    catalogHash: canonicalHash(catalog),
    playlists: playlistKeys.map(([key, kind]) =>
      resolvePlaylist(catalog, key, kind, language)
    ),
  });
}
