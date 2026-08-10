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
  "mediaforge.artifact-path-resolver.v3" as const;
export const LEGACY_ARTIFACT_LAYOUT_VERSION =
  "mediaforge.legacy-artifact-layout.v1" as const;

export type LegacyArtifactProvenance =
  | "authored-root-compatibility"
  | "authored-language-compatibility"
  | "generated-locale-runtime"
  | "generated-language-runtime"
  | "source-lineage"
  | "shared-image-output"
  | "image-generation-state"
  | "canonical-scene-compatibility"
  | "strategic-source-compatibility"
  | "mathematics-compatibility";

export interface LegacyArtifactPathSpec {
  readonly relativePath: string;
  readonly layoutVersion: typeof LEGACY_ARTIFACT_LAYOUT_VERSION;
  readonly provenance: LegacyArtifactProvenance;
  readonly readOnly: true;
}

export interface ResolvedLegacyArtifactCandidate extends LegacyArtifactPathSpec {
  readonly absolutePath: string;
}

export interface ArtifactPathSet {
  readonly resolverVersion: typeof ARTIFACT_PATH_RESOLVER_VERSION;
  readonly unitRoot: string;
  readonly canonical: string;
  readonly canonicalRelativePath: string;
  readonly canonicalManifest: string;
  readonly canonicalManifestRelativePath: string;
  readonly legacyCandidates: readonly ResolvedLegacyArtifactCandidate[];
  /** @deprecated Read `legacyCandidates`; retained until migration gates pass. */
  readonly legacy: readonly string[];
  /** @deprecated Read `legacyCandidates`; retained until migration gates pass. */
  readonly legacyRelativePaths: readonly string[];
}

export interface ArtifactLayoutAdapter {
  readonly profileId: ContentProfileId;
  readonly adapterVersion: string;
  canonicalRelativePath(ref: ArtifactRef): string;
  legacyCandidates(ref: ArtifactRef): readonly LegacyArtifactPathSpec[];
}

function legacyCandidate(
  relativePath: string,
  provenance: LegacyArtifactProvenance
): LegacyArtifactPathSpec {
  return {
    relativePath,
    layoutVersion: LEGACY_ARTIFACT_LAYOUT_VERSION,
    provenance,
    readOnly: true,
  };
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
    case "source-manifest":
      return portablePath(
        "sources",
        "manifests",
        artifactFileName(ref, "source-manifest")
      );
    case "episode-blueprint":
      return portablePath("blueprint.json");
    case "provenance-report":
      return portablePath(
        localeRoot,
        "provenance",
        artifactFileName(ref, "report")
      );
    case "composition-plan":
      return portablePath(
        localeRoot,
        "composition",
        artifactFileName(ref, "composition")
      );
    case "audio-track-manifest":
      return portablePath(localeRoot, "audio", "tracks.json");
    case "capability-report":
      return portablePath(
        localeRoot,
        "capability-reports",
        artifactFileName(ref, "capability")
      );
    case "multilingual-package":
      return portablePath(
        localeRoot,
        "packages",
        artifactFileName(ref, "multilingual-package")
      );
    case "publish-package":
      return portablePath(
        localeRoot,
        "packages",
        artifactFileName(ref, "publish-package")
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

function episodeLegacyCandidates(
  ref: ArtifactRef
): readonly LegacyArtifactPathSpec[] {
  switch (ref.kind) {
    case "full-script":
      return [
        legacyCandidate(
          portablePath("locales", ref.locale, "full", "script.md"),
          "generated-locale-runtime"
        ),
        legacyCandidate(
          portablePath(ref.locale, "full", "script.md"),
          "generated-language-runtime"
        ),
        legacyCandidate(
          portablePath(ref.locale, "script.md"),
          "authored-language-compatibility"
        ),
        legacyCandidate(
          portablePath("source", `${ref.unitId}-${ref.locale}-full.md`),
          "source-lineage"
        ),
        ...(ref.locale === "en"
          ? [
              legacyCandidate(
                portablePath("script.md"),
                "authored-root-compatibility"
              ),
            ]
          : []),
      ];
    case "short-script":
      return [
        legacyCandidate(
          portablePath("locales", ref.locale, "short", "script.md"),
          "generated-locale-runtime"
        ),
        legacyCandidate(
          portablePath(ref.locale, "short", "script.md"),
          "generated-language-runtime"
        ),
        legacyCandidate(
          portablePath("source", `${ref.unitId}-${ref.locale}-short.md`),
          "source-lineage"
        ),
      ];
    case "image": {
      const fileName = artifactFileName(ref, "image");
      return ref.variant === "short"
        ? [
            legacyCandidate(
              portablePath("shared", "short", "images", "generated", fileName),
              "shared-image-output"
            ),
            legacyCandidate(
              portablePath("images", "generated", fileName),
              "shared-image-output"
            ),
          ]
        : [
            legacyCandidate(
              portablePath("shared", "images", "generated", fileName),
              "shared-image-output"
            ),
            legacyCandidate(
              portablePath("state", "image-generation", "images", fileName),
              "image-generation-state"
            ),
          ];
    }
    case "narration":
      return [
        legacyCandidate(
          portablePath(
            "languages",
            ref.locale,
            ref.variant,
            artifactFileName({ ...ref, format: ref.format ?? "mp3" }, "audio")
          ),
          "generated-language-runtime"
        ),
      ];
    case "scene-plan":
      return [
        legacyCandidate(
          portablePath("canonical", "scenes.json"),
          "canonical-scene-compatibility"
        ),
        legacyCandidate(
          portablePath("shared", "scenes.json"),
          "canonical-scene-compatibility"
        ),
      ];
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
      return portablePath("canonical", artifactFileName(ref, "curriculum"));
    case "lesson-specification":
      return portablePath("canonical", artifactFileName(ref, "lesson-spec"));
    case "math-verification":
      return portablePath("canonical", `verification.${extension(ref)}`);
    case "educational-visual-style":
      return portablePath("canonical", artifactFileName(ref, "visual-style"));
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
    case "source-manifest":
    case "episode-blueprint":
    case "provenance-report":
    case "composition-plan":
    case "audio-track-manifest":
    case "capability-report":
    case "multilingual-package":
    case "publish-package":
      throw new Error(
        `Artifact kind ${ref.kind} is not valid for the mathematics layout.`
      );
  }
}

function mathLegacyCandidates(
  ref: ArtifactRef
): readonly LegacyArtifactPathSpec[] {
  switch (ref.kind) {
    case "math-verification":
      return [
        legacyCandidate(
          portablePath("canonical", "verification.v2.json"),
          "mathematics-compatibility"
        ),
      ];
    case "narration":
      return ref.variant === "full"
        ? [
            legacyCandidate(
              portablePath("locales", ref.locale, "audio", "narration.wav"),
              "mathematics-compatibility"
            ),
          ]
        : [];
    case "thumbnail":
      return [
        legacyCandidate(
          portablePath("thumbnail.png"),
          "mathematics-compatibility"
        ),
      ];
    default:
      return [];
  }
}

export function createEpisodeArtifactLayoutAdapter(): ArtifactLayoutAdapter {
  return {
    profileId: "dark-truth",
    adapterVersion: "mediaforge.episode-artifact-layout.v3",
    canonicalRelativePath: episodeCanonicalRelativePath,
    legacyCandidates: episodeLegacyCandidates,
  };
}

export function createMathLessonArtifactLayoutAdapter(): ArtifactLayoutAdapter {
  return {
    profileId: "mathematics-education",
    adapterVersion: "mediaforge.math-artifact-layout.v2",
    canonicalRelativePath: mathCanonicalRelativePath,
    legacyCandidates: mathLegacyCandidates,
  };
}

export function createStrategicReinventionArtifactLayoutAdapter(): ArtifactLayoutAdapter {
  return {
    profileId: "veronicabenini",
    adapterVersion: "mediaforge.strategic-artifact-layout.v2",
    canonicalRelativePath: (ref) => {
      if (ref.kind === "source") {
        return portablePath(
          "sources",
          "content",
          ref.artifactKey ?? "source",
          artifactFileName(ref, "source")
        );
      }
      return episodeCanonicalRelativePath(ref);
    },
    legacyCandidates: (ref) => {
      const inherited = episodeLegacyCandidates(ref);
      if (ref.kind === "source") {
        const sourceId = ref.artifactKey ?? "source";
        return [
          ...inherited,
          // VRI-03 writes nested, immutable source originals. These flat paths
          // were emitted by earlier strategic commands and are read-only.
          legacyCandidate(
            portablePath("sources", "content", `${sourceId}.md`),
            "strategic-source-compatibility"
          ),
          legacyCandidate(
            portablePath("sources", "content", `${sourceId}.txt`),
            "strategic-source-compatibility"
          ),
          legacyCandidate(
            portablePath("sources", `${sourceId}.md`),
            "strategic-source-compatibility"
          ),
          legacyCandidate(
            portablePath("sources", `${sourceId}.txt`),
            "strategic-source-compatibility"
          ),
        ];
      }
      if (ref.kind === "source-manifest") {
        const sourceId = ref.artifactKey ?? "source-manifest";
        return [
          ...inherited,
          legacyCandidate(
            portablePath("sources", `${sourceId}.manifest.json`),
            "strategic-source-compatibility"
          ),
        ];
      }
      return inherited;
    },
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
    createStrategicReinventionArtifactLayoutAdapter(),
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
  const legacySpecs = adapter
    .legacyCandidates(ref)
    .filter((candidate) => candidate.relativePath !== canonicalRelativePath);
  const uniqueLegacySpecs = [
    ...new Map(
      legacySpecs.map((candidate) => [candidate.relativePath, candidate])
    ).values(),
  ];
  const legacyCandidates = uniqueLegacySpecs.map((candidate) => {
    const resolved = path.resolve(unitRoot, candidate.relativePath);
    assertLexicallyContained(unitRoot, resolved);
    return { ...candidate, absolutePath: resolved };
  });
  const legacy = legacyCandidates.map((candidate) => candidate.absolutePath);
  const legacyRelativePaths = legacyCandidates.map(
    (candidate) => candidate.relativePath
  );
  const canonicalManifestRelativePath = `${canonicalRelativePath}.artifact-manifest.json`;
  return {
    resolverVersion: ARTIFACT_PATH_RESOLVER_VERSION,
    unitRoot,
    canonical,
    canonicalRelativePath,
    canonicalManifest: path.resolve(unitRoot, canonicalManifestRelativePath),
    canonicalManifestRelativePath,
    legacyCandidates,
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
