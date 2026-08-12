import {
  type TikTokLocaleProviderPolicy,
  type TikTokMediaProvenance,
  type TikTokMetadataLocale,
  type TikTokMetadataRevision,
  projectTikTokMetadataRevision,
} from "@mediaforge/domain";
import {
  projectTikTokLocaleEditorialMetadata,
  type ProjectTikTokLocaleEditorialInput,
} from "@mediaforge/metadata/tiktok-locale-metadata.js";

export interface ProjectTikTokLocaleMetadataBundleInput {
  readonly metadataRevisionId: string;
  readonly revision: number;
  readonly episodeId: string;
  readonly episodeRevisionId: string;
  readonly locale: TikTokMetadataLocale;
  readonly metadataProfileId: string;
  readonly metadataProfileVersion: number;
  readonly editorial: ProjectTikTokLocaleEditorialInput;
  readonly providerPolicy: TikTokLocaleProviderPolicy;
  readonly mediaProvenance: TikTokMediaProvenance;
  readonly createdAt: string;
}

export function projectTikTokLocaleMetadataBundle(
  input: ProjectTikTokLocaleMetadataBundleInput
): TikTokMetadataRevision {
  const editorial = projectTikTokLocaleEditorialMetadata(input.editorial);

  return projectTikTokMetadataRevision({
    metadataRevisionId: input.metadataRevisionId,
    revision: input.revision,
    episodeId: input.episodeId,
    episodeRevisionId: input.episodeRevisionId,
    locale: input.locale,
    metadataProfileId: input.metadataProfileId,
    metadataProfileVersion: input.metadataProfileVersion,
    editorial,
    providerPolicy: input.providerPolicy,
    mediaProvenance: input.mediaProvenance,
    createdAt: input.createdAt,
  });
}
