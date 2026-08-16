import type { MicrodramaShotBlockingKind } from "./microdrama-source-plate-prompt.js";

export const MICRODRAMA_PROVIDER_VISUAL_BRIEF_VERSION =
  "mediaforge.microdrama.provider-visual-brief.v3" as const;

const BLOCKING_FRAMING: Readonly<Record<MicrodramaShotBlockingKind, string>> = {
  establishing: "wide establishing frame, clear environment, quiet dramatic tension",
  reaction: "medium close-up reaction, face and eyes readable, restrained emotion",
  dialogue: "over-the-shoulder or two-shot dialogue framing, intimate vertical composition",
  insert: "tight insert detail shot, story-critical object or phone screen glow without readable text",
  phone: "character looking at a glowing phone, screen content abstract and unreadable",
  offscreen: "foreground subject reacting to an offscreen event, tension in negative space",
  controlled_mouth: "close framing on speaking subject, naturalistic mouth-ready portrait",
  listening: "listening subject in medium shot, subtle reaction, soft background separation",
};

export type MicrodramaProviderVisualCastMember = {
  readonly name: string;
  readonly visualNotes: string;
};

export type MicrodramaProviderVisualBriefInput = {
  readonly seriesTitle: string;
  readonly genres: readonly string[];
  readonly episodeId: string;
  readonly episodeTitle?: string;
  readonly locationLabel: string;
  readonly cast: readonly MicrodramaProviderVisualCastMember[];
  readonly blockingKind: MicrodramaShotBlockingKind;
  readonly plateSemanticId: string;
  readonly sceneSemanticId: string;
  /** Concrete story moment this plate must depict (aligned to narration). */
  readonly visualMoment?: string;
  /** Exact spoken narration overlapping this shot window (preferred over beat summary). */
  readonly narrationMoment?: string;
  readonly beatCategory?: string;
  readonly episodeHook?: string;
};

export function buildMicrodramaProviderVisualBrief(
  input: MicrodramaProviderVisualBriefInput
): string {
  const castLine =
    input.cast.length > 0
      ? input.cast
          .map((member) => `${member.name} (${member.visualNotes})`)
          .join("; ")
      : "contemporary adult leads";
  const genreLine =
    input.genres.length > 0 ? input.genres.join(", ") : "mystery thriller drama";
  const framing = BLOCKING_FRAMING[input.blockingKind];
  const titlePart = input.episodeTitle
    ? `Episode ${input.episodeId} "${input.episodeTitle}"`
    : `Episode ${input.episodeId}`;
  const moment =
    input.narrationMoment?.trim() ||
    input.visualMoment?.trim() ||
    input.episodeHook?.trim() ||
    "tense contemporary microdrama beat with the named cast in the named location";
  const beatPart = input.beatCategory
    ? `Beat ${input.beatCategory}.`
    : "";
  const narrationPriority = input.narrationMoment?.trim()
    ? "This still must match the spoken narration window below, not a generic episode mood."
    : "Match the story moment exactly with clear story-readable staging, props, and blocking.";

  return [
    `Photoreal cinematic still, vertical 9:16, for microdrama "${input.seriesTitle}" (${genreLine}).`,
    `${titlePart}. Location: ${input.locationLabel}.`,
    `PRIMARY ACTION TO DEPICT: ${moment}`,
    narrationPriority,
    beatPart,
    `Cast continuity: ${castLine}.`,
    `Camera (${input.blockingKind}): ${framing}.`,
    "If a phone video or future clip is implied, show a glowing phone or implied screen light but keep all glyphs unreadable.",
    "No readable text, no captions, no logos, no watermarks, no UI chrome, no subtitles, no signage with words.",
    `Identity tags: ${input.plateSemanticId}; ${input.sceneSemanticId}; brief:${MICRODRAMA_PROVIDER_VISUAL_BRIEF_VERSION}.`,
  ]
    .filter((line) => line.trim().length > 0)
    .join(" ");
}

const VIOLENCE_RETRY_PRIMARY_ACTION =
  "PRIMARY ACTION TO DEPICT: The named cast at the named location. Tense faces, eye contact, and blocking only. No accident, no injury, and no physical harm depicted.";

/**
 * One-shot rewrite after an image-safety violence refusal.
 * Keeps cast/location/camera lines; drops remaining peril staging.
 */
export function rewriteProviderBriefForViolenceRetry(brief: string): string {
  const withoutPrimary = brief.replace(
    /PRIMARY ACTION TO DEPICT:\s[\s\S]*?(?=\s(?:This still must match|Match the story moment))/u,
    VIOLENCE_RETRY_PRIMARY_ACTION
  );
  return withoutPrimary
    .replace(/\sStage this as a PG-13 cinematic still:[^.]*\./u, "")
    .replace(/\sShow cinematic implied peril[^.]*\./u, "")
    .replace(/\bimply danger\b/giu, "imply tension");
}

export function deriveCharacterVisualNotes(description: string): string {
  const trimmed = description.trim();
  if (trimmed.length === 0) {
    return "contemporary adult character";
  }
  const ageMatch = trimmed.match(/\b(\d{2})\b/u);
  const age = ageMatch?.[1];
  const role = trimmed
    .split(";")[0]
    ?.replace(/^\d+,\s*/u, "")
    .trim();
  if (age && role) {
    return `about ${age}, ${role}, naturalistic contemporary look`;
  }
  if (role) {
    return `${role}, naturalistic contemporary look`;
  }
  return "naturalistic contemporary look";
}
