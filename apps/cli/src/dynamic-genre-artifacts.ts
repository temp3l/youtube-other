import path from "node:path";
import {
  DYNAMIC_GENRE_ARTIFACT_NAMES,
  DynamicGenreArtifactStore,
  type ResolvedProductionConfig,
} from "@mediaforge/dynamic-genre";
import { fileExists } from "@mediaforge/shared";

/** Loads only a committed, schema-valid bundle. Historical episodes return null. */
export async function loadDynamicProductionConfig(
  episodeDirectory: string
): Promise<ResolvedProductionConfig | null> {
  const artifactDirectory = path.join(
    episodeDirectory,
    "state",
    "dynamic-genre"
  );
  if (
    !(await fileExists(
      path.join(artifactDirectory, DYNAMIC_GENRE_ARTIFACT_NAMES.bundle)
    )) &&
    !(await fileExists(
      path.join(artifactDirectory, DYNAMIC_GENRE_ARTIFACT_NAMES.provenance)
    ))
  ) {
    return null;
  }
  const store = new DynamicGenreArtifactStore(artifactDirectory);
  const artifacts = await store.read();
  return artifacts?.resolvedProductionConfig ?? null;
}
