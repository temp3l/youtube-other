import { z } from "zod";

import {
  lessonIdSchema,
  mathGradeSchema,
  mathLanguageSchema,
  skillIdSchema,
} from "../domain/identity.js";
import { canonicalHash } from "../verification/canonical-json.js";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);

export const mathGradeBandSchema = z.enum([
  "foundation",
  "intermediate",
  "upper-secondary",
]);
export type MathGradeBand = z.infer<typeof mathGradeBandSchema>;

export function gradeBandFor(
  grade: z.infer<typeof mathGradeSchema>
): MathGradeBand {
  if (grade <= 6) return "foundation";
  if (grade <= 8) return "intermediate";
  return "upper-secondary";
}

export const mathGradeProfileSchema = z.strictObject({
  grade: mathGradeSchema,
  gradeBand: mathGradeBandSchema,
  maximumActiveBoardObjects: z.number().int().positive(),
  maximumFormulaDensity: z.number().positive().max(1),
  minimumBoardGlyphPx: z.number().positive(),
  scaffolding: z.enum(["high", "moderate", "low"]),
  maximumWorkedSteps: z.number().int().positive(),
  transferComplexity: z.enum(["single-step", "multi-step", "modelling"]),
});

export function mathGradeProfile(
  grade: z.infer<typeof mathGradeSchema>
): z.infer<typeof mathGradeProfileSchema> {
  const gradeBand = gradeBandFor(grade);
  return mathGradeProfileSchema.parse({
    grade,
    gradeBand,
    maximumActiveBoardObjects:
      gradeBand === "foundation" ? 3 : gradeBand === "intermediate" ? 4 : 5,
    maximumFormulaDensity:
      gradeBand === "foundation"
        ? 0.3
        : gradeBand === "intermediate"
          ? 0.45
          : 0.6,
    minimumBoardGlyphPx:
      gradeBand === "foundation" ? 72 : gradeBand === "intermediate" ? 64 : 58,
    scaffolding:
      gradeBand === "foundation"
        ? "high"
        : gradeBand === "intermediate"
          ? "moderate"
          : "low",
    maximumWorkedSteps:
      gradeBand === "foundation" ? 5 : gradeBand === "intermediate" ? 7 : 9,
    transferComplexity:
      gradeBand === "foundation"
        ? "single-step"
        : gradeBand === "intermediate"
          ? "multi-step"
          : "modelling",
  });
}

export const mathProductionIdentitySchema = z
  .strictObject({
    lessonId: lessonIdSchema,
    grade: mathGradeSchema,
    gradeBand: mathGradeBandSchema,
    locale: mathLanguageSchema,
    curriculumFramework: z.string().min(1),
    curriculumSkillIds: z.array(skillIdSchema).min(1),
    schemaVersion: z.literal("math-production-identity.v1"),
    canonicalContentHash: sha256Schema,
    localizationHash: sha256Schema,
  })
  .superRefine((identity, context) => {
    if (identity.gradeBand !== gradeBandFor(identity.grade))
      context.addIssue({
        code: "custom",
        path: ["gradeBand"],
        message: "Grade band does not match the selected grade.",
      });
    if (
      identity.curriculumSkillIds.some(
        (skillId) =>
          Number(/^M(\d+)-/u.exec(skillId)?.[1] ?? Number.NaN) !==
          identity.grade
      )
    )
      context.addIssue({
        code: "custom",
        path: ["curriculumSkillIds"],
        message: "Every curriculum skill must belong to the selected grade.",
      });
  });

export type MathProductionIdentity = z.infer<
  typeof mathProductionIdentitySchema
>;

export const answerKeyVisibilitySchema = z.enum([
  "private",
  "unlisted-link",
  "public-link",
]);

export const mathArtifactKindSchema = z.enum([
  "full-video",
  "short-video",
  "full-thumbnail",
  "short-cover-metadata",
  "audio",
  "captions-srt",
  "captions-vtt",
  "worksheet-data",
  "worksheet-pdf",
  "answer-key-data",
  "answer-key-pdf",
  "quiz",
  "quiz-answers",
  "youtube-metadata",
  "chapters",
  "playlist-mapping",
  "curriculum-metadata",
  "render-manifest",
  "quality-report",
  "publishing-manifest",
  "workflow-state",
]);
export type MathArtifactKind = z.infer<typeof mathArtifactKindSchema>;

const artifactPaths: Readonly<Record<MathArtifactKind, string>> = {
  "full-video": "render/full.mp4",
  "short-video": "short/render/short.mp4",
  "full-thumbnail": "thumbnail/full.png",
  "short-cover-metadata": "short/cover.json",
  audio: "audio/narration.wav",
  "captions-srt": "captions/full.srt",
  "captions-vtt": "captions/full.vtt",
  "worksheet-data": "resources/worksheet.json",
  "worksheet-pdf": "resources/worksheet.pdf",
  "answer-key-data": "resources/answer-key.json",
  "answer-key-pdf": "resources/answer-key.pdf",
  quiz: "resources/quiz.json",
  "quiz-answers": "resources/quiz-answers.json",
  "youtube-metadata": "metadata/youtube.json",
  chapters: "metadata/chapters.json",
  "playlist-mapping": "metadata/playlists.json",
  "curriculum-metadata": "metadata/curriculum.json",
  "render-manifest": "render/manifest.json",
  "quality-report": "quality/report.json",
  "publishing-manifest": "publishing/manifest.json",
  "workflow-state": "state/workflow.json",
};

export const mathArtifactRequirementSchema = z.strictObject({
  kind: mathArtifactKindSchema,
  relativePath: z.string().min(1),
  requiredForPrivateUpload: z.boolean(),
  requiredForPublication: z.boolean(),
  defaultVisibility: z.enum(["private", "public-link", "youtube-private"]),
});

export function requiredMathArtifacts(
  identityInput: MathProductionIdentity
): z.infer<typeof mathArtifactRequirementSchema>[] {
  const identity = mathProductionIdentitySchema.parse(identityInput);
  const localeRoot = `locales/${identity.locale}`;
  return mathArtifactKindSchema.options.map((kind) =>
    mathArtifactRequirementSchema.parse({
      kind,
      relativePath: `${localeRoot}/${artifactPaths[kind]}`,
      requiredForPrivateUpload: [
        "full-video",
        "short-video",
        "full-thumbnail",
        "audio",
        "captions-srt",
        "youtube-metadata",
        "quality-report",
        "publishing-manifest",
        "workflow-state",
      ].includes(kind),
      requiredForPublication: true,
      defaultVisibility:
        kind === "full-video" || kind === "short-video"
          ? "youtube-private"
          : kind === "worksheet-pdf" || kind === "quiz"
            ? "public-link"
            : "private",
    })
  );
}

export const worksheetExerciseSchema = z.strictObject({
  exerciseId: z.string().regex(/^exercise-[a-z0-9-]+$/u),
  skillId: skillIdSchema,
  level: z.enum(["support", "standard", "advanced-transfer"]),
  prompt: z.string().min(1),
  answer: z.string().min(1),
  explanation: z.string().min(1),
  hint: z.string().min(1).optional(),
  sourceReference: z.string().min(1),
  verification: z.enum(["passed", "unsupported"]),
});

export const mathWorksheetSchema = z.strictObject({
  artifactVersion: z.literal("math-worksheet.v1"),
  identity: mathProductionIdentitySchema,
  support: z.array(worksheetExerciseSchema).min(1),
  standard: z.array(worksheetExerciseSchema).min(1),
  advancedTransfer: z.array(worksheetExerciseSchema).min(1),
  answerKeyVisibility: answerKeyVisibilitySchema.default("private"),
  contentHash: sha256Schema,
});
export type MathWorksheet = z.infer<typeof mathWorksheetSchema>;

const questionBase = {
  questionId: z.string().regex(/^question-[a-z0-9-]+$/u),
  locale: mathLanguageSchema,
  grade: mathGradeSchema,
  skillId: skillIdSchema,
  prompt: z.string().min(1),
  explanation: z.string().min(1),
  difficulty: z.enum(["recall", "standard", "misconception", "transfer"]),
  sourceReference: z.string().min(1),
  validationResult: z.literal("passed"),
};

export const quizQuestionSchema = z.discriminatedUnion("type", [
  z.strictObject({
    ...questionBase,
    type: z.literal("multiple-choice"),
    correctAnswer: z.string().min(1),
    distractors: z.array(z.string().min(1)).min(2),
  }),
  z.strictObject({
    ...questionBase,
    type: z.literal("numeric-answer"),
    correctAnswer: z.number(),
    tolerance: z.number().nonnegative().default(0),
  }),
  z.strictObject({
    ...questionBase,
    type: z.literal("true-false"),
    correctAnswer: z.boolean(),
  }),
  z.strictObject({
    ...questionBase,
    type: z.literal("ordering"),
    correctAnswer: z.array(z.string().min(1)).min(2),
  }),
  z.strictObject({
    ...questionBase,
    type: z.literal("error-analysis"),
    correctAnswer: z.string().min(1),
    incorrectWork: z.string().min(1),
  }),
]);

export const mathQuizSchema = z
  .strictObject({
    artifactVersion: z.literal("math-quiz.v1"),
    identity: mathProductionIdentitySchema,
    questions: z.array(quizQuestionSchema).min(4),
    contentHash: sha256Schema,
  })
  .superRefine((quiz, context) => {
    const difficulties = new Set(
      quiz.questions.map((question) => question.difficulty)
    );
    for (const required of [
      "recall",
      "standard",
      "misconception",
      "transfer",
    ] as const)
      if (!difficulties.has(required))
        context.addIssue({
          code: "custom",
          path: ["questions"],
          message: `Quiz is missing the ${required} question.`,
        });
    if (
      new Set(quiz.questions.map((question) => question.questionId)).size !==
      quiz.questions.length
    )
      context.addIssue({
        code: "custom",
        path: ["questions"],
        message: "Quiz question IDs must be unique.",
      });
  });
export type MathQuiz = z.infer<typeof mathQuizSchema>;

export function createMathWorksheet(input: {
  readonly identity: MathProductionIdentity;
  readonly exercises: readonly z.input<typeof worksheetExerciseSchema>[];
  readonly answerKeyVisibility?: z.infer<typeof answerKeyVisibilitySchema>;
}): MathWorksheet {
  const identity = mathProductionIdentitySchema.parse(input.identity);
  const exercises = input.exercises.map((exercise) =>
    worksheetExerciseSchema.parse(exercise)
  );
  const grouped = {
    support: exercises.filter((exercise) => exercise.level === "support"),
    standard: exercises.filter((exercise) => exercise.level === "standard"),
    advancedTransfer: exercises.filter(
      (exercise) => exercise.level === "advanced-transfer"
    ),
  };
  const content = {
    artifactVersion: "math-worksheet.v1" as const,
    identity,
    ...grouped,
    answerKeyVisibility: input.answerKeyVisibility ?? ("private" as const),
  };
  return mathWorksheetSchema.parse({
    ...content,
    contentHash: canonicalHash(content),
  });
}

export function createMathQuiz(input: {
  readonly identity: MathProductionIdentity;
  readonly questions: readonly z.input<typeof quizQuestionSchema>[];
}): MathQuiz {
  const identity = mathProductionIdentitySchema.parse(input.identity);
  const questions = input.questions.map((question) =>
    quizQuestionSchema.parse(question)
  );
  const content = {
    artifactVersion: "math-quiz.v1" as const,
    identity,
    questions,
  };
  return mathQuizSchema.parse({
    ...content,
    contentHash: canonicalHash(content),
  });
}

export const mathApprovalScopeSchema = z.enum([
  "content-artifacts",
  "publication",
]);

export const mathLocaleApprovalSchema = z.strictObject({
  artifactVersion: z.literal("math-locale-approval.v1"),
  lessonId: lessonIdSchema,
  locale: mathLanguageSchema,
  scope: mathApprovalScopeSchema,
  approver: z.string().min(1),
  approvedAt: z.string().datetime(),
  approvedArtifactHashes: z.record(z.string(), sha256Schema),
  notes: z.string(),
  approvalFingerprint: sha256Schema,
});
export type MathLocaleApproval = z.infer<typeof mathLocaleApprovalSchema>;

export function createMathLocaleApproval(input: {
  readonly identity: MathProductionIdentity;
  readonly scope: z.infer<typeof mathApprovalScopeSchema>;
  readonly approver: string;
  readonly approvedAt?: string;
  readonly artifactHashes: Readonly<Record<string, string>>;
  readonly notes?: string;
}): MathLocaleApproval {
  const identity = mathProductionIdentitySchema.parse(input.identity);
  const base = {
    artifactVersion: "math-locale-approval.v1" as const,
    lessonId: identity.lessonId,
    locale: identity.locale,
    scope: input.scope,
    approver: input.approver,
    approvedAt: input.approvedAt ?? new Date().toISOString(),
    approvedArtifactHashes: { ...input.artifactHashes },
    notes: input.notes ?? "",
  };
  return mathLocaleApprovalSchema.parse({
    ...base,
    approvalFingerprint: canonicalHash(base),
  });
}

export function assertCurrentMathLocaleApproval(input: {
  readonly approval: unknown;
  readonly lessonId: string;
  readonly locale: z.infer<typeof mathLanguageSchema>;
  readonly scope: z.infer<typeof mathApprovalScopeSchema>;
  readonly artifactHashes: Readonly<Record<string, string>>;
}): MathLocaleApproval {
  const approval = mathLocaleApprovalSchema.parse(input.approval);
  if (
    approval.lessonId !== input.lessonId ||
    approval.locale !== input.locale ||
    approval.scope !== input.scope ||
    canonicalHash(approval.approvedArtifactHashes) !==
      canonicalHash(input.artifactHashes)
  )
    throw new Error(
      "STALE_LANGUAGE_APPROVAL: approval does not match current locale artifacts."
    );
  const { approvalFingerprint: _fingerprint, ...base } = approval;
  if (approval.approvalFingerprint !== canonicalHash(base))
    throw new Error("STALE_LANGUAGE_APPROVAL: approval evidence was changed.");
  return approval;
}

export const privateUploadStateSchema = z.strictObject({
  completed: z.boolean(),
  remoteFullVideoId: z.string().min(1).optional(),
  remoteShortVideoId: z.string().min(1).optional(),
  remoteVerificationPassed: z.boolean(),
});

export interface MathPublicationReadinessInput {
  readonly identity: MathProductionIdentity;
  readonly artifactHashes: Readonly<Record<string, string>>;
  readonly contentApproval: unknown;
  readonly publicationApproval: unknown;
  readonly validationGreen: boolean;
  readonly privateUpload: z.input<typeof privateUploadStateSchema>;
  readonly captionsPresent: boolean;
  readonly thumbnailPresent: boolean;
  readonly audienceSetting: "made-for-kids" | "not-made-for-kids" | null;
  readonly externalWorksheetRequired: boolean;
  readonly externalWorksheetUrl?: string;
}

export function assertMathPublicationReady(
  input: MathPublicationReadinessInput
): void {
  const identity = mathProductionIdentitySchema.parse(input.identity);
  assertCurrentMathLocaleApproval({
    approval: input.contentApproval,
    lessonId: identity.lessonId,
    locale: identity.locale,
    scope: "content-artifacts",
    artifactHashes: input.artifactHashes,
  });
  assertCurrentMathLocaleApproval({
    approval: input.publicationApproval,
    lessonId: identity.lessonId,
    locale: identity.locale,
    scope: "publication",
    artifactHashes: input.artifactHashes,
  });
  const upload = privateUploadStateSchema.parse(input.privateUpload);
  const blockers = [
    !input.validationGreen ? "validation is not green" : null,
    !upload.completed ? "private upload is incomplete" : null,
    !upload.remoteFullVideoId || !upload.remoteShortVideoId
      ? "remote IDs are missing"
      : null,
    !upload.remoteVerificationPassed ? "remote verification failed" : null,
    !input.captionsPresent ? "captions are missing" : null,
    !input.thumbnailPresent ? "thumbnail is missing" : null,
    input.audienceSetting === null ? "audience setting is unresolved" : null,
    input.externalWorksheetRequired && !input.externalWorksheetUrl
      ? "required worksheet URL is missing"
      : null,
  ].filter((value): value is string => value !== null);
  if (blockers.length > 0)
    throw new Error(`PUBLISH_BLOCKED: ${blockers.join("; ")}.`);
}

export interface ArtefactDistributionPutRequest {
  readonly objectKey: string;
  readonly body: Uint8Array;
  readonly contentType: string;
  readonly visibility: "private" | "public";
  readonly cacheControl: string;
  readonly contentHash: string;
  readonly dryRun: boolean;
}

export interface ArtefactDistributionResult {
  readonly objectKey: string;
  readonly stableUrl: string | null;
  readonly contentHash: string;
  readonly changed: boolean;
}

export interface ArtefactDistributionProvider {
  readonly id: string;
  put(
    request: ArtefactDistributionPutRequest
  ): Promise<ArtefactDistributionResult>;
}

export function mathDistributionObjectKey(input: {
  readonly identity: MathProductionIdentity;
  readonly kind: "worksheet" | "quiz" | "answer-key";
  readonly contentHash: string;
}): string {
  const identity = mathProductionIdentitySchema.parse(input.identity);
  sha256Schema.parse(input.contentHash);
  return [
    "math",
    identity.lessonId,
    identity.locale,
    input.kind,
    input.contentHash.slice(0, 16),
  ].join("/");
}

const BEGIN_RESOURCES = "<!-- BEGIN GENERATED LESSON RESOURCES -->";
const END_RESOURCES = "<!-- END GENERATED LESSON RESOURCES -->";

export function updateManagedLessonResources(
  description: string,
  links: readonly { readonly label: string; readonly url: string }[]
): string {
  const block = [
    BEGIN_RESOURCES,
    ...links.map((link) => `${link.label}: ${link.url}`),
    END_RESOURCES,
  ].join("\n");
  const start = description.indexOf(BEGIN_RESOURCES);
  const end = description.indexOf(END_RESOURCES);
  if (start < 0 && end < 0) return `${description.trimEnd()}\n\n${block}\n`;
  if (start < 0 || end < start)
    throw new Error("Managed lesson resource block is malformed.");
  return `${description.slice(0, start)}${block}${description.slice(
    end + END_RESOURCES.length
  )}`;
}

export const MATH_COMPLETE_WORKFLOW_TASKS = [
  "lesson-plan",
  "script",
  "localisation",
  "audio",
  "alignment",
  "scene-plan",
  "chalk-layout",
  "full-render",
  "short-plan",
  "short-render",
  "thumbnail",
  "worksheet-data",
  "worksheet-pdf",
  "answer-key",
  "quiz",
  "captions",
  "metadata",
  "curriculum-metadata",
  "validation",
  "language-approval",
  "private-upload",
  "thumbnail-upload",
  "caption-upload",
  "playlist-insert",
  "remote-verification",
  "publication-approval",
  "scheduled-publication",
  "external-artefact-publication",
] as const;

export const mathProductionTaskRecordSchema = z.strictObject({
  task: z.enum(MATH_COMPLETE_WORKFLOW_TASKS),
  status: z.enum([
    "planned",
    "running",
    "succeeded",
    "failed",
    "blocked",
    "cached",
    "stale",
  ]),
  startedAt: z.string().datetime().optional(),
  finishedAt: z.string().datetime().optional(),
  command: z.string(),
  exitCode: z.number().int().nullable(),
  error: z.string().nullable(),
  inputHashes: z.record(z.string(), sha256Schema),
  outputHashes: z.record(z.string(), sha256Schema),
  cache: z.enum(["hit", "miss", "not-applicable"]),
  retryCount: z.number().int().nonnegative(),
  dependencies: z.array(z.enum(MATH_COMPLETE_WORKFLOW_TASKS)),
  nextRecommendedTasks: z.array(z.enum(MATH_COMPLETE_WORKFLOW_TASKS)),
});
