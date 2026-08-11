import path from "node:path";

import type { TaskImplementation } from "@mediaforge/workflow-engine";

import {
  createDarkTruthPublicationTaskImplementation,
  type DarkTruthCanonicalPublicationAdapterOptions,
} from "./canonical-publication-task-adapter.js";

import {
  DARK_TRUTH_MEDIA_EXECUTABLE_TASK_IDS,
  createDarkTruthMediaTaskImplementations,
  type DarkTruthCanonicalMediaAdapterOptions,
  type DarkTruthMediaExecutableTaskId,
} from "./canonical-media-task-adapters.js";
import {
  DARK_TRUTH_STORY_EXECUTABLE_TASK_IDS,
  createDarkTruthStoryTaskImplementations,
  type DarkTruthCanonicalStoryAdapterOptions,
  type DarkTruthStoryExecutableTaskId,
} from "./canonical-story-task-adapters.js";

export const DARK_TRUTH_SAFE_CANONICAL_EXECUTABLE_TASK_IDS = [
  ...DARK_TRUTH_STORY_EXECUTABLE_TASK_IDS,
  ...DARK_TRUTH_MEDIA_EXECUTABLE_TASK_IDS,
] as const;

export type DarkTruthSafeCanonicalExecutableTaskId =
  (typeof DARK_TRUTH_SAFE_CANONICAL_EXECUTABLE_TASK_IDS)[number];

export type DarkTruthSafeCanonicalTaskImplementations = Readonly<
  Record<DarkTruthSafeCanonicalExecutableTaskId, TaskImplementation>
>;

export interface DarkTruthCanonicalTaskCompositionOptions {
  readonly story: DarkTruthCanonicalStoryAdapterOptions;
  readonly media: DarkTruthCanonicalMediaAdapterOptions;
}

export const DARK_TRUTH_CANONICAL_EXECUTABLE_TASK_IDS = [
  ...DARK_TRUTH_SAFE_CANONICAL_EXECUTABLE_TASK_IDS,
  "darktruth.publish",
] as const;

export type DarkTruthCanonicalExecutableTaskId =
  (typeof DARK_TRUTH_CANONICAL_EXECUTABLE_TASK_IDS)[number];

export type DarkTruthCanonicalTaskImplementations = Readonly<
  Record<DarkTruthCanonicalExecutableTaskId, TaskImplementation>
>;

export interface DarkTruthCanonicalPublicationCompositionOptions
  extends DarkTruthCanonicalTaskCompositionOptions {
  readonly publication: DarkTruthCanonicalPublicationAdapterOptions;
}

function assertSameIdentity(
  story: DarkTruthCanonicalStoryAdapterOptions,
  media: DarkTruthCanonicalMediaAdapterOptions
): void {
  const mismatches: string[] = [];
  if (path.resolve(story.workspaceRoot) !== path.resolve(media.workspaceRoot)) {
    mismatches.push("workspaceRoot");
  }
  if (path.resolve(story.unitRoot) !== path.resolve(media.unitRoot)) {
    mismatches.push("unitRoot");
  }
  if (story.unitId !== media.unitId) mismatches.push("unitId");
  if (story.policyRevision !== media.policyRevision) {
    mismatches.push("policyRevision");
  }
  if (story.store !== media.store) mismatches.push("store");
  if (story.repository !== media.repository) mismatches.push("repository");
  if (mismatches.length > 0) {
    throw new Error(
      `Canonical Dark Truth adapter identity mismatch: ${mismatches.join(", ")}.`
    );
  }
}

function assertServices(
  options: DarkTruthCanonicalTaskCompositionOptions
): void {
  for (const taskId of DARK_TRUTH_STORY_EXECUTABLE_TASK_IDS) {
    if (!options.story.services[taskId]) {
      throw new Error(`Missing source-authoritative service for ${taskId}.`);
    }
  }
  for (const taskId of DARK_TRUTH_MEDIA_EXECUTABLE_TASK_IDS) {
    if (!options.media.services[taskId]) {
      throw new Error(`Missing source-authoritative service for ${taskId}.`);
    }
  }
}

export function createDarkTruthSafeCanonicalTaskImplementations(
  options: DarkTruthCanonicalTaskCompositionOptions
): DarkTruthSafeCanonicalTaskImplementations {
  assertSameIdentity(options.story, options.media);
  assertServices(options);
  const story = createDarkTruthStoryTaskImplementations(options.story);
  const media = createDarkTruthMediaTaskImplementations(options.media);
  return {
    ...story,
    ...media,
  } satisfies Record<
    DarkTruthStoryExecutableTaskId | DarkTruthMediaExecutableTaskId,
    TaskImplementation
  >;
}

/**
 * Full production composition. Manual approval remains unbound, while the
 * irreversible task is owned by the dedicated canonical publication executor.
 */
export function createDarkTruthCanonicalTaskImplementations(
  options: DarkTruthCanonicalPublicationCompositionOptions
): DarkTruthCanonicalTaskImplementations {
  return {
    ...createDarkTruthSafeCanonicalTaskImplementations(options),
    "darktruth.publish": createDarkTruthPublicationTaskImplementation(
      options.publication
    ),
  } satisfies Record<DarkTruthCanonicalExecutableTaskId, TaskImplementation>;
}
