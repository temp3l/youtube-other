import fs from "node:fs/promises";
import path from "node:path";

import {
  artifactRefSchema,
  type ArtifactFormat,
  type ArtifactKind,
  type ArtifactRef,
  type ContentProfileId,
} from "@mediaforge/domain";

export const ARTIFACT_PATH_RESOLVER_VERSION =
  "mediaforge.artifact-path-resolver.v1" as const;

export interface ArtifactPathSet {
  readonly resolverVersion: typeof ARTIFACT_PATH_RESOLVER_VERSION;
  readonly unitRoot: string;
  readonly canonical: string;
  readonly canonicalRelativePath: string;
  readonly canonicalManifest: string;
  readonly canonicalManifestRelativePath: string;
  readonly legacy: readonly string[];
  readonly legacyRelativePaths: readonly string[];
}

export interface ArtifactLayoutAdapter {
  readonly profileId: ContentProfileId;
  canonicalRelativePath(ref: ArtifactRef): string;
  legacyRelativePaths(ref: ArtifactRef): readonly string[];
}

function portablePath(...segments: readonly string[]): string {
  const candidate = path.posix.join(...segments);
  if (
    candidate.length === 0 ||
    path.posix.isAbsolute(candidate) ||
    candidate.split("/").some((segment) => segment === "..")
  ) {
    throw new Error(`Unsafe artifact path: ${candidate}`);
  }
  return candidate;
}

function defaultFormat(kind: ArtifactKind): ArtifactFormat {
  switch (kind) {
    case "source":
      return "txt";
    case "full-script":
    case "short-script":
      return "md";
    case "narration":
      return "wav";
    case "captions":
      return "srt";
    case "image":
    case "thumbnail":
      return "png";
    case "render":
      return "mp4";
    default:
      return "json";
  }
}

function extension(ref: ArtifactRef): ArtifactFormat {
  return ref.format ?? defaultFormat(ref.kind);
}

function artifactFileName(ref: ArtifactRef, fallback: string): string {
  return `${ref.artifactKey ?? fallback}.${extension(ref)}`;
}

function episodeCanonicalRelativePath(ref: ArtifactRef): string {
  const localeRoot = portablePath("locales", ref.locale, ref.variant);
  switch (ref.kind) {
    case "source":
      return portablePath("source", artifactFileName(ref, "source"));
    case "transcript":
      return portablePath(
        localeRoot,
        "transcript",
        artifactFileName(ref, "transcript")
      );
    case "story-bible":
      return portablePath("canonical", "story-bible.json");
    case "reference-manifest":
      return portablePath("shared", "references", "manifest.json");
    case "full-script":
      return portablePath("languages", `script-${ref.locale}.md`);
    case "short-script":
      return portablePath("languages", "short", `script-${ref.locale}.md`);
    case "scene-plan":
      return portablePath("visuals", ref.variant, "scene-plan.json");
    case "shot-plan":
      return portablePath(
        "state",
        "visual-retention",
        `shot-plan.${ref.variant}.${ref.locale}.json`
      );
    case "image":
      return portablePath(
        "visuals",
        ref.variant,
        "images",
        artifactFileName(ref, "image")
      );
    case "thumbnail":
      return portablePath(
        localeRoot,
        "thumbnails",
        artifactFileName(ref, "thumbnail")
      );
    case "narration":
      return portablePath(
        localeRoot,
        "audio",
        artifactFileName(ref, "narration")
      );
    case "captions":
      return portablePath(
        localeRoot,
        "captions",
        artifactFileName(ref, "captions")
      );
    case "render": {
      const profile = ref.renderProfile ?? "youtube";
      return portablePath(
        localeRoot,
        "renders",
        profile,
        artifactFileName(ref, `${profile}-final`)
      );
    }
    case "metadata":
      return portablePath(
        localeRoot,
        "metadata",
        artifactFileName(ref, "youtube")
      );
    case "publish-report":
      return portablePath(
        "state",
        "upload",
        ref.locale,
        ref.variant,
        artifactFileName(ref, "publish-report")
      );
    case "quality-assessment":
      return portablePath(
        "state",
        "quality",
        ref.locale,
        ref.variant,
        artifactFileName(ref, "assessment")
      );
    case "curriculum":
    case "lesson-specification":
    case "math-verification":
    case "educational-visual-style":
      throw new Error(
        `Artifact kind ${ref.kind} is not valid for the dark-truth layout.`
      );
  }
}

function episodeLegacyRelativePaths(ref: ArtifactRef): readonly string[] {
  switch (ref.kind) {
    case "full-script":
      return [
        portablePath("locales", ref.locale, "full", "script.md"),
        portablePath(ref.locale, "full", "script.md"),
        ...(ref.locale === "en" ? [portablePath("script.md")] : []),
      ];
    case "short-script":
      return [
        portablePath("locales", ref.locale, "short", "script.md"),
        portablePath(ref.locale, "short", "script.md"),
      ];
    case "image": {
      const fileName = artifactFileName(ref, "image");
      return ref.variant === "short"
        ? [
            portablePath("shared", "short", "images", "generated", fileName),
            portablePath("images", "generated", fileName),
          ]
        : [
            portablePath("shared", "images", "generated", fileName),
            portablePath("state", "image-generation", "images", fileName),
          ];
    }
    case "narration":
      return [
        portablePath(
          "languages",
          ref.locale,
          ref.variant,
          artifactFileName({ ...ref, format: ref.format ?? "mp3" }, "audio")
        ),
      ];
    case "scene-plan":
      return [portablePath("canonical", "scenes.json")];
    default:
      return [];
  }
}

function mathCanonicalRelativePath(ref: ArtifactRef): string {
  const localeRoot = portablePath("locales", ref.locale);
  const variantRoot =
    ref.variant === "full" ? localeRoot : portablePath(localeRoot, "short");
  switch (ref.kind) {
    case "source":
      return portablePath("source", artifactFileName(ref, "source"));
    case "curriculum":
      return portablePath("canonical", "curriculum.json");
    case "lesson-specification":
      return portablePath("canonical", "lesson-spec.json");
    case "math-verification":
      return portablePath("canonical", "verification.json");
    case "educational-visual-style":
      return portablePath("canonical", "visual-style.json");
    case "full-script":
    case "short-script":
      return portablePath(variantRoot, "narration.md");
    case "transcript":
      return portablePath(variantRoot, artifactFileName(ref, "transcript"));
    case "scene-plan":
      return portablePath(variantRoot, "visual-plan.json");
    case "shot-plan":
      return portablePath(variantRoot, "shot-plan.json");
    case "image":
      return portablePath(
        variantRoot,
        "images",
        artifactFileName(ref, "image")
      );
    case "thumbnail":
      return portablePath(variantRoot, artifactFileName(ref, "thumbnail"));
    case "narration":
      return portablePath(variantRoot, artifactFileName(ref, "narration"));
    case "captions":
      return portablePath(variantRoot, artifactFileName(ref, "captions"));
    case "render":
      return portablePath(
        variantRoot,
        "renders",
        artifactFileName(ref, ref.renderProfile ?? "educational")
      );
    case "metadata":
      return portablePath(variantRoot, artifactFileName(ref, "metadata"));
    case "publish-report":
      return portablePath(
        "state",
        "publish",
        ref.locale,
        ref.variant,
        artifactFileName(ref, "publish-report")
      );
    case "quality-assessment":
      return portablePath(
        "state",
        "quality",
        ref.locale,
        ref.variant,
        artifactFileName(ref, "assessment")
      );
    case "story-bible":
    case "reference-manifest":
      throw new Error(
        `Artifact kind ${ref.kind} is not valid for the mathematics layout.`
      );
  }
}

function mathLegacyRelativePaths(ref: ArtifactRef): readonly string[] {
  switch (ref.kind) {
    case "math-verification":
      return [portablePath("canonical", "verification.v2.json")];
    case "narration":
      return ref.variant === "full"
        ? [portablePath("locales", ref.locale, "audio", "narration.wav")]
        : [];
    case "thumbnail":
      return [portablePath("thumbnail.png")];
    default:
      return [];
  }
}

export function createEpisodeArtifactLayoutAdapter(): ArtifactLayoutAdapter {
  return {
    profileId: "dark-truth",
    canonicalRelativePath: episodeCanonicalRelativePath,
    legacyRelativePaths: episodeLegacyRelativePaths,
  };
}

export function createMathLessonArtifactLayoutAdapter(): ArtifactLayoutAdapter {
  return {
    profileId: "mathematics-education",
    canonicalRelativePath: mathCanonicalRelativePath,
    legacyRelativePaths: mathLegacyRelativePaths,
  };
}

export function resolveArtifactPathSet(args: {
  readonly workspaceRoot: string;
  readonly ref: ArtifactRef;
  readonly adapters?: readonly ArtifactLayoutAdapter[];
}): ArtifactPathSet {
  const ref = artifactRefSchema.parse(args.ref);
  const workspaceRoot = path.resolve(args.workspaceRoot);
  const adapters = args.adapters ?? [
    createEpisodeArtifactLayoutAdapter(),
    createMathLessonArtifactLayoutAdapter(),
  ];
  const adapter = adapters.find(
    (candidate) => candidate.profileId === ref.profileId
  );
  if (!adapter) {
    throw new Error(`No artifact layout adapter for profile ${ref.profileId}.`);
  }
  const unitRoot = path.resolve(workspaceRoot, ref.unitId);
  assertLexicallyContained(workspaceRoot, unitRoot);
  const canonicalRelativePath = adapter.canonicalRelativePath(ref);
  const canonical = path.resolve(unitRoot, canonicalRelativePath);
  assertLexicallyContained(unitRoot, canonical);
  const legacyRelativePaths = [
    ...new Set(adapter.legacyRelativePaths(ref)),
  ].filter((candidate) => candidate !== canonicalRelativePath);
  const legacy = legacyRelativePaths.map((candidate) => {
    const resolved = path.resolve(unitRoot, candidate);
    assertLexicallyContained(unitRoot, resolved);
    return resolved;
  });
  const canonicalManifestRelativePath = `${canonicalRelativePath}.artifact-manifest.json`;
  return {
    resolverVersion: ARTIFACT_PATH_RESOLVER_VERSION,
    unitRoot,
    canonical,
    canonicalRelativePath,
    canonicalManifest: path.resolve(unitRoot, canonicalManifestRelativePath),
    canonicalManifestRelativePath,
    legacy,
    legacyRelativePaths,
  };
}

export function artifactManifestPath(artifactPath: string): string {
  return `${artifactPath}.artifact-manifest.json`;
}

export function assertLexicallyContained(
  root: string,
  candidate: string
): string {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);
  if (
    resolvedCandidate !== resolvedRoot &&
    !resolvedCandidate.startsWith(`${resolvedRoot}${path.sep}`)
  ) {
    throw new Error(`Path escapes artifact root: ${candidate}`);
  }
  return resolvedCandidate;
}

export async function assertContainedRegularFile(
  root: string,
  candidate: string
): Promise<string> {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = assertLexicallyContained(resolvedRoot, candidate);
  const rootStat = await fs.lstat(resolvedRoot);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    throw new Error("Artifact root must be a real directory.");
  }
  const stat = await fs.lstat(resolvedCandidate);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error("Artifact must be a regular non-symlink file.");
  }
  const [rootReal, candidateReal] = await Promise.all([
    fs.realpath(resolvedRoot),
    fs.realpath(resolvedCandidate),
  ]);
  assertLexicallyContained(rootReal, candidateReal);
  return resolvedCandidate;
}

export async function assertContainedWritablePath(
  root: string,
  candidate: string
): Promise<string> {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = assertLexicallyContained(resolvedRoot, candidate);
  const rootStat = await fs.lstat(resolvedRoot);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    throw new Error("Artifact root must be a real directory.");
  }
  const relativeParent = path.relative(
    resolvedRoot,
    path.dirname(resolvedCandidate)
  );
  let current = resolvedRoot;
  for (const segment of relativeParent.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    try {
      const stat = await fs.lstat(current);
      if (stat.isSymbolicLink() || !stat.isDirectory()) {
        throw new Error(`Artifact path has an unsafe ancestor: ${current}`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }
  try {
    const targetStat = await fs.lstat(resolvedCandidate);
    if (targetStat.isSymbolicLink() || !targetStat.isFile()) {
      throw new Error("Artifact target must be a regular non-symlink file.");
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
  return resolvedCandidate;
}
