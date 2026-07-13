import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  MATH_STAGES,
  VERIFIER_PROTOCOL_VERSION,
  VERIFIER_VERSION,
  SYMPY_VERSION,
  buildLessonVariant,
  canonicalHash,
  createArtifactLineage,
  createMathMetadataEvidence,
  createMetadataTimingEvidence,
  createMetadataWorkflowEvidence,
  createReviewedMetadataContext,
  createTimingManifest,
  createVerifierRequest,
  generateMathMetadata,
  lessonVariantSpecificationSchema,
  localizeNarration,
  localizedDisplayChecks,
  mathPlaylistCatalog,
  saveWorkflowManifest,
  type ExpressionNode,
  type MathLanguage,
  type WorkflowManifest,
} from "@mediaforge/math-education";
import { createReviewedCurriculumFixture } from "../../../math-education/dist/testing/reviewed-curriculum-fixture.js";
import { hashFile, hashText, writeJsonAtomic } from "@mediaforge/shared";
import { describe, expect, it } from "vitest";
import {
  MATH_THUMBNAIL_FONT_PROFILE,
  loadAuthoritativeMathThumbnailSpec,
  renderMathThumbnail,
  type MathThumbnailSpec,
} from "./math-thumbnail.js";

async function approvedTeacher(root: string, assetVersion = "alex.v1-approved"): Promise<string> {
  const assetRoot = path.join(root, "teacher");
  await fs.mkdir(assetRoot, { recursive: true });
  const poses = [];
  for (const [index, poseId] of ["neutral", "explain-left", "explain-right", "question", "think", "celebrate", "warning"].entries()) {
    const file = `${poseId}.svg`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1200"><rect width="800" height="1200" fill="#${String(index + 1).repeat(6)}"/></svg>`;
    await fs.writeFile(path.join(assetRoot, file), svg);
    poses.push({ poseId, file, sha256: hashText(svg), width: 800, height: 1200, safeArea: { left: 0.1, right: 0.1, top: 0.05, bottom: 0.03 } });
  }
  const manifestPath = path.join(assetRoot, "manifest.json");
  await writeJsonAtomic(manifestPath, {
    assetVersion,
    characterId: "alex",
    license: "Test-only approved deterministic fixture.",
    provenance: "Unit-test workspace.",
    maxFrameAreaRatio: 0.25,
    poses,
  });
  return manifestPath;
}

function passed(request: ReturnType<typeof createVerifierRequest>) {
  return {
    protocolVersion: VERIFIER_PROTOCOL_VERSION,
    requestId: request.requestId,
    inputHash: request.inputHash,
    verifierVersion: VERIFIER_VERSION,
    sympyVersion: SYMPY_VERSION,
    status: "passed" as const,
    checks: request.checks.map((check) => ({ checkId: check.checkId, status: "passed" as const })),
  };
}

async function authoritativeFixture(options: {
  root?: string;
  thumbnailText?: string;
  expression?: ExpressionNode;
  outputAssetName?: string;
  teacherVersion?: string;
  language?: MathLanguage;
} = {}): Promise<{ root: string; spec: MathThumbnailSpec; teacherManifestPath: string }> {
  const root = options.root ?? await fs.mkdtemp(path.join(os.tmpdir(), "math-thumbnail-authority-"));
  const curriculum = await createReviewedCurriculumFixture(path.join(root, "curriculum"));
  const skill = curriculum.skills.find((candidate) => candidate.skillId === "M5-ZO-001")!;
  const baseLesson = buildLessonVariant(skill, "standard");
  const lesson = options.expression
    ? (() => {
        const fact = baseLesson.facts[0]!;
        const semantic = { kind: "scalar" as const, expression: options.expression! };
        const raw = {
          ...baseLesson,
          facts: [{ ...fact, semantic, displayLatex: "bounded-by-renderer" }, ...baseLesson.facts.slice(1)],
          checks: baseLesson.checks.map((check) =>
            fact.checkIds.includes(check.checkId)
              ? { ...check, expression: options.expression!, expected: semantic }
              : check
          ),
        };
        const { contentHash: _contentHash, ...payload } = raw;
        return lessonVariantSpecificationSchema.parse({ ...payload, contentHash: canonicalHash(payload) });
      })()
    : baseLesson;
  const language = options.language ?? "en";
  const localization = localizeNarration(lesson, language);
  const timing = createTimingManifest(lesson, localization);
  const timingEvidence = createMetadataTimingEvidence(lesson, localization, timing);
  const fingerprints = new Map(MATH_STAGES.map((stage) => [stage, canonicalHash({ stage })]));
  const parents = new Map(MATH_STAGES.map((stage, index) => [stage, index === 0 ? [] : [fingerprints.get(MATH_STAGES[index - 1]!)!]]));
  const metadata = generateMathMetadata({
    reviewedContext: createReviewedMetadataContext(curriculum, skill.skillId),
    skill,
    lesson,
    localization,
    timingEvidence,
    workflowEvidence: createMetadataWorkflowEvidence({
      lesson,
      localization,
      timingEvidence,
      parentFingerprints: {
        lesson: parents.get("lesson-spec") as [string],
        localization: parents.get("localization") as [string],
        timing: parents.get("scene-timing") as [string],
        output: parents.get("metadata-playlists") as [string],
      },
    }),
    evidence: createMathMetadataEvidence(skill, lesson, localization),
    catalog: mathPlaylistCatalog,
  });
  const metadataValue = options.thumbnailText
    ? { ...metadata, thumbnail: { ...metadata.thumbnail, text: options.thumbnailText } }
    : metadata;
  const verificationRequest = createVerifierRequest(`${lesson.lessonId}-canonical`, lesson.checks);
  const displayRequest = createVerifierRequest(`${lesson.lessonId}-${language}-display`, localizedDisplayChecks(lesson, localization));
  const files = [
    ["canonical/lesson-spec.json", lesson],
    ["canonical/verification.json", passed(verificationRequest)],
    [`locales/${language}/narration.json`, localization],
    [`locales/${language}/display-verification.json`, passed(displayRequest)],
    [`locales/${language}/metadata.json`, metadataValue],
  ] as const;
  for (const [relativePath, value] of files)
    await writeJsonAtomic(path.join(root, relativePath), value);
  const outputs = [
    await createArtifactLineage({ root, relativePath: files[0][0], schemaVersion: "lesson-spec.v1", parentHashes: parents.get("lesson-spec")!, producedBy: "lesson-spec", producer: "lesson-specification-builder", producerVersion: "reviewed-fixtures.v1" }),
    await createArtifactLineage({ root, relativePath: files[1][0], schemaVersion: "math-verifier.v2", parentHashes: parents.get("math-verification")!, producedBy: "math-verification", producer: "sympy-verifier-adapter", producerVersion: VERIFIER_VERSION }),
    await createArtifactLineage({ root, relativePath: files[2][0], schemaVersion: "math-narration.v2", parentHashes: parents.get("localization")!, producedBy: "localization", producer: "locked-fact-localizer", producerVersion: "locked-facts.v2" }),
    await createArtifactLineage({ root, relativePath: files[3][0], schemaVersion: "math-verifier.v2", parentHashes: parents.get("localization")!, producedBy: "localization", producer: "sympy-verifier-adapter", producerVersion: VERIFIER_VERSION }),
    await createArtifactLineage({ root, relativePath: files[4][0], schemaVersion: "math-metadata.v2", parentHashes: parents.get("metadata-playlists")!, producedBy: "metadata-playlists", producer: "math-metadata-generator", producerVersion: "math-metadata-generator.v3" }),
  ];
  const now = new Date(0).toISOString();
  const manifest: WorkflowManifest = {
    artifactVersion: "math-workflow.v2",
    lessonId: lesson.lessonId,
    curriculumReleaseId: "de-gems-5-10-v1",
    simulated: true,
    paidProviderCalled: false,
    stages: MATH_STAGES.map((stage) => ({
      stage,
      status: outputs.some((output) => output.producedBy === stage) ? "succeeded" : "planned",
      fingerprint: fingerprints.get(stage)!,
      parentFingerprints: parents.get(stage)!,
      outputArtifacts: outputs.filter((output) => output.producedBy === stage),
      updatedAt: now,
    })),
    failures: [],
  };
  await saveWorkflowManifest(path.join(root, "manifest.json"), manifest);
  const teacherManifestPath = await approvedTeacher(root, options.teacherVersion);
  const spec = await loadAuthoritativeMathThumbnailSpec({
    lessonRoot: root,
    lessonId: lesson.lessonId,
    language,
    teacherManifestPath,
    teacherPoseId: "neutral",
    teacherAreaRatio: 0.2,
    ...(options.outputAssetName ? { outputAssetName: options.outputAssetName } : {}),
  });
  return { root, spec, teacherManifestPath };
}

describe("math thumbnail renderer", () => {
  it("writes deterministic workflow-bound 16:9 bytes and a strict readability manifest", async () => {
    const firstFixture = await authoritativeFixture();
    const secondFixture = await authoritativeFixture();
    const first = await renderMathThumbnail({ spec: firstFixture.spec, outputDir: path.join(firstFixture.root, "one") });
    const second = await renderMathThumbnail({ spec: secondFixture.spec, outputDir: path.join(secondFixture.root, "two") });
    expect(await fs.readFile(first.assetPath)).toEqual(await fs.readFile(second.assetPath));
    expect(first.manifest.contentHash).toBe(await hashFile(first.assetPath));
    expect(first.manifest.dimensions).toEqual({ width: 1920, height: 1080, aspectRatio: "16:9" });
    expect(first.manifest.readability).toMatchObject({ mobileReadable: true });
    expect(first.manifest.fontProfile).toMatchObject(MATH_THUMBNAIL_FONT_PROFILE);
    expect(first.manifest.teacherVersion).toBe("alex.v1-approved");
    expect(first.manifest.artwork).toMatchObject({
      status: "approved-publish-artwork",
      publishReady: true,
      blockers: [],
    });
    expect(first.manifest.byteLength).toBe((await fs.stat(first.assetPath)).size);
  });

  it("rejects caller-constructed, cloned, mutated, and recomputed verifier evidence", async () => {
    const fixture = await authoritativeFixture();
    const clone = structuredClone(fixture.spec);
    const attacks = [
      clone,
      { ...fixture.spec, metadataHash: "c".repeat(64) },
      { ...fixture.spec, verification: { ...fixture.spec.verification, responseContentHash: canonicalHash(fixture.spec.verification.response) } },
      { ...fixture.spec, verification: { ...fixture.spec.verification, lessonId: "m5-zo-002-standard" } },
      { ...fixture.spec, fact: { ...fixture.spec.fact, expression: { kind: "integer" as const, value: "1" } } },
    ];
    for (const [index, attack] of attacks.entries())
      await expect(renderMathThumbnail({ spec: attack, outputDir: path.join(fixture.root, `forged-${index}`) })).rejects.toThrow(/workflow-loaded|authoritative/u);
  });

  it("rejects schema-valid long text and formula overflow before writing output", async () => {
    const longText = await authoritativeFixture({ thumbnailText: "abcdefghij abcdefghij abcdefghij abcdefghij abcdefghij" });
    await expect(renderMathThumbnail({ spec: longText.spec, outputDir: path.join(longText.root, "long-text") })).rejects.toThrow(/overflow/u);
    const hugeExpression = {
      kind: "product" as const,
      operands: Array.from({ length: 80 }, (_, index) => ({ kind: "integer" as const, value: String(index + 10) })),
    };
    const huge = await authoritativeFixture({ expression: hugeExpression });
    await expect(renderMathThumbnail({ spec: huge.spec, outputDir: path.join(huge.root, "formula") })).rejects.toThrow(/formula|overflow|bounds/u);
  });

  it("binds font profile, teacher version, and output name into deterministic bytes", async () => {
    const firstFixture = await authoritativeFixture({ outputAssetName: "thumbnail.svg" });
    const namedFixture = await authoritativeFixture({ outputAssetName: "thumbnail-alt.svg" });
    const first = await renderMathThumbnail({ spec: firstFixture.spec, outputDir: path.join(firstFixture.root, "out") });
    const named = await renderMathThumbnail({ spec: namedFixture.spec, outputDir: path.join(namedFixture.root, "out") });
    expect(named.manifest.outputPath).toBe("thumbnail-alt.svg");
    expect(named.manifest.contentHash).not.toBe(first.manifest.contentHash);
    const source = await fs.readFile(first.assetPath, "utf8");
    expect(source).toContain('data-font-profile="math-thumbnail-fonts.v1"');
    expect(source).toContain('font-family="MathThumbnailText"');
    expect(source).toContain("data:font/woff2;base64,");
    expect(source).not.toMatch(/system-ui|font-family="serif"/u);
  });

  it.each([
    ["de", "Klasse 5 · Standard"],
    ["en", "Grade 5 · Standard"],
    ["es", "Grado 5 · Estándar"],
    ["fr", "Classe 5 · Standard"],
    ["pt", "Ano 5 · Padrão"],
  ] as const)("localizes every visible %s label", async (language, footer) => {
    const fixture = await authoritativeFixture({ language });
    const rendered = await renderMathThumbnail({ spec: fixture.spec, outputDir: path.join(fixture.root, "localized") });
    expect(await fs.readFile(rendered.assetPath, "utf8")).toContain(footer);
  });

  it("rejects stale teacher assets, classifies placeholder simulations, and has no horror dependency", async () => {
    const fixture = await authoritativeFixture();
    const raw = JSON.parse(await fs.readFile(fixture.teacherManifestPath, "utf8"));
    raw.assetVersion = "alex.v2-swapped";
    await writeJsonAtomic(fixture.teacherManifestPath, raw);
    await expect(renderMathThumbnail({ spec: fixture.spec, outputDir: path.join(fixture.root, "stale") })).rejects.toThrow(/stale|mismatched|Invalid option/u);
    const symlinkFixture = await authoritativeFixture();
    const posePath = path.join(path.dirname(symlinkFixture.teacherManifestPath), "neutral.svg");
    const poseTarget = `${posePath}.real`;
    await fs.rename(posePath, poseTarget);
    await fs.symlink(poseTarget, posePath);
    await expect(renderMathThumbnail({ spec: symlinkFixture.spec, outputDir: path.join(symlinkFixture.root, "symlink") })).rejects.toThrow(/regular owned file|symlink/u);
    const placeholderFixture = await authoritativeFixture({ teacherVersion: "alex.v1-placeholder" });
    const placeholder = await renderMathThumbnail({
      spec: placeholderFixture.spec,
      outputDir: path.join(placeholderFixture.root, "placeholder"),
    });
    expect(placeholder.manifest.teacherVersion).toBe("alex.v1-placeholder");
    expect(placeholder.manifest.artwork).toMatchObject({
      status: "simulation-placeholder",
      publishReady: false,
      blockers: ["placeholder-teacher-artwork-not-approved-for-public-release"],
    });
    const source = await fs.readFile("packages/math-rendering/src/thumbnail/math-thumbnail.ts", "utf8");
    expect(source).not.toMatch(/dark-truth|horror|image-generation/u);
  });
});
