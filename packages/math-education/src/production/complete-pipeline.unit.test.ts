import { describe, expect, it } from "vitest";

import {
  assertCurrentMathLocaleApproval,
  assertMathPublicationReady,
  createMathLocaleApproval,
  createMathQuiz,
  createMathWorksheet,
  gradeBandFor,
  mathDistributionObjectKey,
  mathGradeProfile,
  requiredMathArtifacts,
  updateManagedLessonResources,
  type MathProductionIdentity,
} from "./complete-pipeline.js";

const hash = (character: string) => character.repeat(64);
const identity: MathProductionIdentity = {
  lessonId: "m7-al-001-standard",
  grade: 7,
  gradeBand: "intermediate",
  locale: "de",
  curriculumFramework: "de-gems-5-10-v1",
  curriculumSkillIds: ["M7-AL-001"],
  schemaVersion: "math-production-identity.v1",
  canonicalContentHash: hash("a"),
  localizationHash: hash("b"),
};

describe("complete mathematics production contract", () => {
  it("profiles every supported grade and requires the complete artifact set", () => {
    expect(
      [5, 6, 7, 8, 9, 10].map((grade) => gradeBandFor(grade as 5))
    ).toEqual([
      "foundation",
      "foundation",
      "intermediate",
      "intermediate",
      "upper-secondary",
      "upper-secondary",
    ]);
    expect(mathGradeProfile(5).minimumBoardGlyphPx).toBeGreaterThan(
      mathGradeProfile(10).minimumBoardGlyphPx
    );
    const artifacts = requiredMathArtifacts(identity);
    expect(artifacts.map((artifact) => artifact.kind)).toEqual(
      expect.arrayContaining([
        "full-video",
        "short-video",
        "worksheet-pdf",
        "answer-key-pdf",
        "quiz",
        "captions-srt",
        "publishing-manifest",
      ])
    );
    expect(
      artifacts.find((artifact) => artifact.kind === "answer-key-pdf")
        ?.defaultVisibility
    ).toBe("private");
  });

  it("requires differentiated worksheets and four-purpose quizzes", () => {
    const exercise = (level: "support" | "standard" | "advanced-transfer") => ({
      exerciseId: `exercise-${level}`,
      skillId: "M7-AL-001",
      level,
      prompt: `${level} prompt`,
      answer: "4",
      explanation: "Verified explanation",
      sourceReference: "fact-1",
      verification: "passed" as const,
    });
    const worksheet = createMathWorksheet({
      identity,
      exercises: [
        exercise("support"),
        exercise("standard"),
        exercise("advanced-transfer"),
      ],
    });
    expect(worksheet.answerKeyVisibility).toBe("private");
    expect(worksheet.advancedTransfer).toHaveLength(1);

    const base = {
      locale: "de" as const,
      grade: 7 as const,
      skillId: "M7-AL-001",
      prompt: "Frage",
      explanation: "Erklärung",
      sourceReference: "fact-1",
      validationResult: "passed" as const,
    };
    const quiz = createMathQuiz({
      identity,
      questions: [
        {
          ...base,
          questionId: "question-recall",
          type: "true-false",
          difficulty: "recall",
          correctAnswer: true,
        },
        {
          ...base,
          questionId: "question-standard",
          type: "numeric-answer",
          difficulty: "standard",
          correctAnswer: 4,
        },
        {
          ...base,
          questionId: "question-misconception",
          type: "error-analysis",
          difficulty: "misconception",
          correctAnswer: "Vorzeichen",
          incorrectWork: "x = -4",
        },
        {
          ...base,
          questionId: "question-transfer",
          type: "ordering",
          difficulty: "transfer",
          correctAnswer: ["modellieren", "lösen", "prüfen"],
        },
      ],
    });
    expect(quiz.questions).toHaveLength(4);
  });

  it("invalidates per-locale approval and fails closed before publication", () => {
    const artifactHashes = { video: hash("c"), captions: hash("d") };
    const contentApproval = createMathLocaleApproval({
      identity,
      scope: "content-artifacts",
      approver: "reviewer@example.test",
      approvedAt: "2026-07-24T12:00:00.000Z",
      artifactHashes,
    });
    const publicationApproval = createMathLocaleApproval({
      identity,
      scope: "publication",
      approver: "publisher@example.test",
      approvedAt: "2026-07-24T12:05:00.000Z",
      artifactHashes,
    });
    expect(
      assertCurrentMathLocaleApproval({
        approval: contentApproval,
        lessonId: identity.lessonId,
        locale: "de",
        scope: "content-artifacts",
        artifactHashes,
      })
    ).toEqual(contentApproval);
    expect(() =>
      assertCurrentMathLocaleApproval({
        approval: contentApproval,
        lessonId: identity.lessonId,
        locale: "de",
        scope: "content-artifacts",
        artifactHashes: { ...artifactHashes, video: hash("e") },
      })
    ).toThrow("STALE_LANGUAGE_APPROVAL");

    expect(() =>
      assertMathPublicationReady({
        identity,
        artifactHashes,
        contentApproval,
        publicationApproval,
        validationGreen: true,
        privateUpload: {
          completed: true,
          remoteFullVideoId: "full-id",
          remoteShortVideoId: "short-id",
          remoteVerificationPassed: true,
        },
        captionsPresent: true,
        thumbnailPresent: true,
        audienceSetting: null,
        externalWorksheetRequired: false,
      })
    ).toThrow("audience setting is unresolved");
  });

  it("uses stable distribution keys and preserves manual descriptions", () => {
    expect(
      mathDistributionObjectKey({
        identity,
        kind: "worksheet",
        contentHash: hash("f"),
      })
    ).toBe("math/m7-al-001-standard/de/worksheet/ffffffffffffffff");
    const initial = updateManagedLessonResources("Manual intro", [
      { label: "Arbeitsblatt", url: "https://example.test/a" },
    ]);
    const updated = updateManagedLessonResources(initial, [
      { label: "Arbeitsblatt", url: "https://example.test/b" },
    ]);
    expect(updated).toContain("Manual intro");
    expect(updated).toContain("https://example.test/b");
    expect(updated).not.toContain("https://example.test/a");
  });
});
