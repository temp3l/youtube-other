import path from "node:path";
import {
  ensurePortableRelativePath,
  hashText,
  normalizeContentVariant,
  normalizeEpisodeId,
  normalizeLocaleCode,
  resolveEpisodeDirFromSceneOutputPath,
  toPortableRelativePath,
} from "@mediaforge/shared";
import type {
  ImageBatchAssetIdentity,
  ImageBatchAssetRole,
  ImageBatchDestinationIdentity,
  ImageBatchDestinationRoot,
  ImageBatchOperation,
  ImageBatchQuality,
  ImageBatchSubject,
} from "./image-batch.types.js";

const imageAssetIdentityVersion = "image-asset-identity-v1" as const;

function normalizeNonEmpty(value: string, fieldName: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new Error(`Image batch identity field ${fieldName} must not be empty.`);
  }
  return normalized;
}

function normalizeHashLike(value: string, fieldName: string): string {
  return normalizeNonEmpty(value, fieldName).toLowerCase();
}

function normalizeModel(value: string): string {
  return normalizeNonEmpty(value, "model");
}

function normalizeSize(value: string): string {
  return normalizeNonEmpty(value, "size").toLowerCase();
}

function normalizeQuality(value: ImageBatchQuality): ImageBatchQuality {
  return value;
}

function normalizeSubject(subject: ImageBatchSubject): ImageBatchSubject {
  const id = normalizeNonEmpty(subject.id, `${subject.kind} id`);
  return { ...subject, id };
}

function defaultDestinationRootForRole(
  assetRole: ImageBatchAssetRole
): ImageBatchDestinationRoot {
  switch (assetRole) {
    case "full-scene":
      return "shared-images-generated";
    case "short-scene":
      return "shared-short-images-generated";
    case "character-reference":
      return "shared-character-references";
    case "location-reference":
      return "shared-location-references";
    case "object-reference":
      return "shared-object-references";
    case "continuity-asset":
      return "shared-continuity-assets";
    case "thumbnail":
      return "locale-thumbnails";
    default: {
      const exhaustiveCheck: never = assetRole;
      return exhaustiveCheck;
    }
  }
}

function inferDestinationRootFromRelativePath(
  relativePath: string,
  assetRole: ImageBatchAssetRole
): ImageBatchDestinationRoot {
  if (relativePath.startsWith("shared/images/generated/")) {
    return "shared-images-generated";
  }
  if (relativePath.startsWith("shared/short/images/generated/")) {
    return "shared-short-images-generated";
  }
  if (relativePath.startsWith("shared/images/character-references/")) {
    return "shared-character-references";
  }
  if (relativePath.startsWith("shared/images/location-references/")) {
    return "shared-location-references";
  }
  if (relativePath.startsWith("shared/images/object-references/")) {
    return "shared-object-references";
  }
  if (relativePath.startsWith("shared/images/continuity-assets/")) {
    return "shared-continuity-assets";
  }
  if (
    relativePath.startsWith("locales/") &&
    relativePath.includes("/thumbnails/")
  ) {
    return "locale-thumbnails";
  }
  return defaultDestinationRootForRole(assetRole);
}

function normalizeDestination(args: {
  readonly destination: {
    readonly relativePath: string;
    readonly root?: ImageBatchDestinationRoot;
  };
  readonly assetRole: ImageBatchAssetRole;
}): ImageBatchDestinationIdentity {
  const relativePath = ensurePortableRelativePath(args.destination.relativePath);
  const root =
    args.destination.root ??
    inferDestinationRootFromRelativePath(relativePath, args.assetRole);
  return {
    root,
    relativePath,
  };
}

export function deriveImageBatchDestinationIdentity(args: {
  readonly assetRole: ImageBatchAssetRole;
  readonly outputPath: string;
  readonly episodeDir?: string;
}): ImageBatchDestinationIdentity {
  const resolvedEpisodeDir =
    args.episodeDir ??
    resolveEpisodeDirFromSceneOutputPath(args.outputPath) ??
    undefined;
  if (!resolvedEpisodeDir) {
    throw new Error(
      `Unable to derive a canonical destination identity for ${args.outputPath}.`
    );
  }
  return normalizeDestination({
    assetRole: args.assetRole,
    destination: {
      relativePath: toPortableRelativePath(resolvedEpisodeDir, args.outputPath),
    },
  });
}

function canonicalIdentityFields(args: {
  readonly episodeId: string;
  readonly language: string;
  readonly variant: string;
  readonly assetRole: ImageBatchAssetRole;
  readonly operation: ImageBatchOperation;
  readonly subject: ImageBatchSubject;
  readonly promptHash: string;
  readonly model: string;
  readonly size: string;
  readonly quality: ImageBatchQuality;
  readonly dependencyHashes: readonly string[];
  readonly destination: {
    readonly relativePath: string;
    readonly root?: ImageBatchDestinationRoot;
  };
}) {
  const dependencyHashes = [
    ...new Set(
      args.dependencyHashes.map((value) =>
        normalizeHashLike(value, "dependency hash")
      )
    ),
  ].sort((left, right) => left.localeCompare(right));
  const normalizedSubject = normalizeSubject(args.subject);
  const destination = normalizeDestination({
    assetRole: args.assetRole,
    destination: args.destination,
  });
  return {
    schemaVersion: imageAssetIdentityVersion,
    episodeId: normalizeEpisodeId(args.episodeId),
    language: normalizeLocaleCode(args.language),
    variant: normalizeContentVariant(args.variant),
    assetRole: args.assetRole,
    operation: args.operation,
    subject: normalizedSubject,
    promptHash: normalizeHashLike(args.promptHash, "promptHash"),
    model: normalizeModel(args.model),
    size: normalizeSize(args.size),
    quality: normalizeQuality(args.quality),
    dependencyHashes,
    destination,
  };
}

export function createImageBatchAssetIdentity(args: {
  readonly episodeId: string;
  readonly language: string;
  readonly variant: string;
  readonly assetRole: ImageBatchAssetRole;
  readonly operation: ImageBatchOperation;
  readonly subject: ImageBatchSubject;
  readonly promptHash: string;
  readonly model: string;
  readonly size: string;
  readonly quality: ImageBatchQuality;
  readonly dependencyHashes: readonly string[];
  readonly destination: {
    readonly relativePath: string;
    readonly root?: ImageBatchDestinationRoot;
  };
}): ImageBatchAssetIdentity {
  const canonical = canonicalIdentityFields(args);
  return {
    ...canonical,
    identityHash: hashText(JSON.stringify(canonical)),
  };
}

export function rebuildImageBatchAssetIdentity(
  identity: Omit<ImageBatchAssetIdentity, "identityHash">
): ImageBatchAssetIdentity {
  return createImageBatchAssetIdentity(identity);
}

function customIdSegment(value: string): string {
  return encodeURIComponent(normalizeNonEmpty(value, "custom id segment"));
}

export function buildImageBatchCustomId(
  identity: ImageBatchAssetIdentity
): string {
  return [
    "dte-img",
    "v2",
    customIdSegment(identity.episodeId),
    customIdSegment(identity.language),
    customIdSegment(identity.variant),
    customIdSegment(identity.assetRole),
    customIdSegment(identity.operation),
    customIdSegment(identity.subject.kind),
    customIdSegment(identity.subject.id),
    identity.identityHash.slice(0, 12),
  ].join(":");
}

export function endpointForImageBatchOperation(
  operation: ImageBatchOperation
): "/v1/images/generations" | "/v1/images/edits" | null {
  switch (operation) {
    case "generation":
      return "/v1/images/generations";
    case "edit":
      return "/v1/images/edits";
    case "deterministic-transform":
      return null;
    default: {
      const exhaustiveCheck: never = operation;
      return exhaustiveCheck;
    }
  }
}

export function assertOperationMatchesEndpoint(args: {
  readonly operation: ImageBatchOperation;
  readonly endpoint: "/v1/images/generations" | "/v1/images/edits";
}): void {
  const expectedEndpoint = endpointForImageBatchOperation(args.operation);
  if (!expectedEndpoint) {
    throw new Error(
      `Image batch operation ${args.operation} does not support provider batch submission.`
    );
  }
  if (expectedEndpoint !== args.endpoint) {
    throw new Error(
      `Image batch operation ${args.operation} is incompatible with endpoint ${args.endpoint}.`
    );
  }
}

export function normalizeImageBatchDestinationPath(
  outputPath: string
): string {
  return path.resolve(outputPath);
}
