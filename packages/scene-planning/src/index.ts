import {
  imagePromptSchema,
  sceneIdSchema,
  transcriptSegmentIdSchema,
  scenePlanSchema,
  inferSceneTextRequirement,
  requiresSceneText,
  type ImagePrompt,
  type RewrittenScript,
  type Scene,
  type ScenePlan,
  type TranscriptSegmentId,
  type Transcript
} from "@mediaforge/domain";
import { clamp, normalizeWhitespace, sceneFilename, safeTimestampToken, splitIntoSentences, splitIntoWords } from "@mediaforge/shared";

export interface ScenePlanner {
  plan(
    transcript: Transcript,
    script: RewrittenScript,
    aspectRatios?: ReadonlyArray<"16:9" | "9:16">,
    options?: {
      readonly visualSceneTargetPer10Minutes?: number;
      readonly visualSceneMinSeconds?: number;
      readonly visualSceneMaxSeconds?: number;
    }
  ): ScenePlan;
}

function buildSceneId(sequenceNumber: number): `scene-${string}` {
  return `scene-${String(sequenceNumber).padStart(3, "0")}` as `scene-${string}`;
}

const stopWords = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "that",
  "this",
  "there",
  "their",
  "about",
  "into",
  "your",
  "yours",
  "they",
  "them",
  "then",
  "than",
  "when",
  "what",
  "which",
  "while",
  "were",
  "was",
  "are",
  "been",
  "being",
  "have",
  "has",
  "had",
  "you",
  "our",
  "out",
  "over",
  "under",
  "into",
  "just",
  "some",
  "more",
  "most",
  "very",
  "can",
  "could",
  "would",
  "should",
  "will",
  "not",
  "but",
  "because",
  "since",
  "into"
]);

function uniqueWords(values: ReadonlyArray<string>): string[] {
  return [...new Set(values)];
}

function extractKeywords(text: string, limit = 8): string[] {
  const words = splitIntoWords(text)
    .map((word) => word.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter((word) => word.length > 2 && !stopWords.has(word));
  return uniqueWords(words).slice(0, limit);
}

function splitLongChunk(chunk: string): [string, string] | null {
  const words = splitIntoWords(chunk);
  if (words.length <= 1) {
    return null;
  }
  const midpoint = Math.max(1, Math.floor(words.length / 2));
  return [words.slice(0, midpoint).join(" "), words.slice(midpoint).join(" ")];
}

function splitNarrationBeats(text: string): string[] {
  const normalized = normalizeWhitespace(text);
  if (normalized.length === 0) {
    return [];
  }
  const sentences = splitIntoSentences(normalized);
  const source = sentences.length > 0 ? sentences : [normalized];
  const beats: string[] = [];
  for (const sentence of source) {
    const trimmed = normalizeWhitespace(sentence);
    if (trimmed.length === 0) {
      continue;
    }
    const wordCount = splitIntoWords(trimmed).length;
    if (wordCount <= 16) {
      beats.push(trimmed);
      continue;
    }
    const clauses = trimmed
      .split(/\s*(?:,|;|:|—|–)\s*/u)
      .map((clause) => normalizeWhitespace(clause))
      .filter((clause) => clause.length > 0);
    if (clauses.length > 1) {
      for (const clause of clauses) {
        const clauseWords = splitIntoWords(clause).length;
        if (clauseWords > 24) {
          const split = splitLongChunk(clause);
          if (split) {
            beats.push(split[0], split[1]);
            continue;
          }
        }
        beats.push(clause);
      }
      continue;
    }
    const split = splitLongChunk(trimmed);
    if (split) {
      beats.push(split[0], split[1]);
    } else {
      beats.push(trimmed);
    }
  }
  return beats.filter((beat) => beat.length > 0);
}

function resolveVisualSceneDurationBounds(options: {
  readonly visualSceneTargetPer10Minutes?: number;
  readonly visualSceneMinSeconds?: number;
  readonly visualSceneMaxSeconds?: number;
}): { readonly minDurationSeconds: number; readonly maxDurationSeconds: number } {
  if (typeof options.visualSceneTargetPer10Minutes === "number" && Number.isFinite(options.visualSceneTargetPer10Minutes) && options.visualSceneTargetPer10Minutes > 0) {
    const targetDurationSeconds = 600 / options.visualSceneTargetPer10Minutes;
    const minDurationSeconds = options.visualSceneMinSeconds ?? Math.max(1, targetDurationSeconds * 0.85);
    const maxDurationSeconds = options.visualSceneMaxSeconds ?? Math.max(minDurationSeconds, targetDurationSeconds * 1.15);
    return {
      minDurationSeconds,
      maxDurationSeconds
    };
  }
  return {
    minDurationSeconds: options.visualSceneMinSeconds ?? 5,
    maxDurationSeconds: options.visualSceneMaxSeconds ?? 6
  };
}

function rebalanceChunks(chunks: ReadonlyArray<string>, desiredCount: number): string[] {
  const normalized = chunks.map((chunk) => normalizeWhitespace(chunk)).filter((chunk) => chunk.length > 0);
  if (desiredCount <= 0 || normalized.length === 0) {
    return normalized;
  }
  if (normalized.length === desiredCount) {
    return [...normalized];
  }
  if (normalized.length > desiredCount) {
    const balanced: string[] = [];
    const step = normalized.length / desiredCount;
    for (let index = 0; index < desiredCount; index += 1) {
      const start = Math.floor(index * step);
      const end = index === desiredCount - 1 ? normalized.length : Math.max(start + 1, Math.floor((index + 1) * step));
      balanced.push(normalized.slice(start, end).join(" "));
    }
    return balanced.map((chunk) => normalizeWhitespace(chunk)).filter((chunk) => chunk.length > 0);
  }
  const expanded = [...normalized];
  while (expanded.length < desiredCount) {
    let splitIndex = -1;
    let longest = 0;
    for (let index = 0; index < expanded.length; index += 1) {
      const current = expanded[index];
      const length = current ? splitIntoWords(current).length : 0;
      if (length > longest) {
        longest = length;
        splitIndex = index;
      }
    }
    if (splitIndex === -1) {
      break;
    }
    const target = expanded[splitIndex];
    if (!target) {
      break;
    }
    const split = splitLongChunk(target);
    if (!split) {
      break;
    }
    expanded.splice(splitIndex, 1, split[0], split[1]);
  }
  return expanded.slice(0, desiredCount);
}

function buildSceneNarration(script: RewrittenScript, sceneCount: number): string[] {
  const scriptText = normalizeWhitespace(
    script.sections
      .map((section) => normalizeWhitespace(section.text))
      .filter((section) => section.length > 0)
      .join(" ")
  );
  const baseChunks = splitNarrationBeats(scriptText);
  const normalizedChunks = baseChunks.length > 0 ? baseChunks : [scriptText];
  return rebalanceChunks(normalizedChunks, sceneCount);
}

interface SceneWindow {
  readonly startSeconds: number;
  readonly endSeconds: number;
  readonly startWordIndex: number;
  readonly endWordIndex: number;
}

function buildSceneWindows(transcript: Transcript, minDurationSeconds: number, maxDurationSeconds: number): SceneWindow[] {
  const words = transcript.words
    .map((word) => ({
      startSeconds: word.startSeconds,
      endSeconds: word.endSeconds
    }))
    .filter((word) => Number.isFinite(word.startSeconds) && Number.isFinite(word.endSeconds) && word.endSeconds > word.startSeconds)
    .sort((left, right) => left.startSeconds - right.startSeconds || left.endSeconds - right.endSeconds);

  if (words.length === 0) {
    const segments = transcript.segments
      .map((segment) => ({
        startSeconds: segment.startSeconds,
        endSeconds: segment.endSeconds
      }))
      .filter((segment) => Number.isFinite(segment.startSeconds) && Number.isFinite(segment.endSeconds) && segment.endSeconds > segment.startSeconds)
      .sort((left, right) => left.startSeconds - right.startSeconds || left.endSeconds - right.endSeconds);
    if (segments.length === 0) {
      return [{ startSeconds: 0, endSeconds: Math.max(minDurationSeconds, 1), startWordIndex: 0, endWordIndex: 0 }];
    }
    const targetDurationSeconds = clamp((minDurationSeconds + maxDurationSeconds) / 2, minDurationSeconds, maxDurationSeconds);
    const windows: SceneWindow[] = [];
    let startIndex = 0;
    while (startIndex < segments.length) {
      const startSegment = segments[startIndex];
      if (!startSegment) {
        break;
      }
      const startSeconds = startSegment.startSeconds;
      let bestIndex = startIndex;
      let bestScore = Number.POSITIVE_INFINITY;
      let latestValidIndex = startIndex;
      for (let index = startIndex; index < segments.length; index += 1) {
        const currentSegment = segments[index];
        if (!currentSegment) {
          continue;
        }
        const duration = currentSegment.endSeconds - startSeconds;
        if (duration < minDurationSeconds) {
          latestValidIndex = index;
          continue;
        }
        if (duration > maxDurationSeconds) {
          break;
        }
        latestValidIndex = index;
        const score = Math.abs(duration - targetDurationSeconds);
        if (score < bestScore || (score === bestScore && index > bestIndex)) {
          bestScore = score;
          bestIndex = index;
        }
      }
      const chosenIndex = bestIndex > startIndex ? bestIndex : latestValidIndex;
      const chosenSegment = segments[chosenIndex] ?? segments[latestValidIndex] ?? startSegment;
      windows.push({
        startSeconds,
        endSeconds: Math.max(chosenSegment.endSeconds, startSeconds + minDurationSeconds),
        startWordIndex: startIndex,
        endWordIndex: chosenIndex
      });
      startIndex = chosenIndex + 1;
    }
    return windows.filter((window) => window.endSeconds > window.startSeconds);
  }

  const targetDurationSeconds = clamp((minDurationSeconds + maxDurationSeconds) / 2, minDurationSeconds, maxDurationSeconds);
  const windows: SceneWindow[] = [];
  let startIndex = 0;

  while (startIndex < words.length) {
    const startWord = words[startIndex];
    if (!startWord) {
      break;
    }
    const startSeconds = startWord.startSeconds;
    let bestIndex = startIndex;
    let bestScore = Number.POSITIVE_INFINITY;
    let latestValidIndex = startIndex;

    for (let index = startIndex; index < words.length; index += 1) {
      const currentWord = words[index];
      if (!currentWord) {
        continue;
      }
      const duration = currentWord.endSeconds - startSeconds;
      if (duration < minDurationSeconds) {
        latestValidIndex = index;
        continue;
      }
      if (duration > maxDurationSeconds) {
        break;
      }
      latestValidIndex = index;
      const score = Math.abs(duration - targetDurationSeconds);
      if (score < bestScore || (score === bestScore && index > bestIndex)) {
        bestScore = score;
        bestIndex = index;
      }
    }

    const chosenIndex = bestIndex > startIndex ? bestIndex : latestValidIndex;
    const chosenWord = words[chosenIndex] ?? words[latestValidIndex] ?? words[startIndex];
    if (!chosenWord) {
      break;
    }
    const endSeconds = Math.max(chosenWord.endSeconds, startSeconds + minDurationSeconds);
    windows.push({
      startSeconds,
      endSeconds: Math.min(endSeconds, startSeconds + maxDurationSeconds),
      startWordIndex: startIndex,
      endWordIndex: chosenIndex
    });
    startIndex = chosenIndex + 1;
  }

  if (windows.length > 1) {
    const finalWindow = windows[windows.length - 1];
    const previousWindow = windows[windows.length - 2];
    if (finalWindow && previousWindow) {
      const finalDuration = finalWindow.endSeconds - finalWindow.startSeconds;
      const combinedDuration = finalWindow.endSeconds - previousWindow.startSeconds;
      if (finalDuration < minDurationSeconds && combinedDuration <= maxDurationSeconds) {
        windows[windows.length - 2] = {
          ...previousWindow,
          endSeconds: finalWindow.endSeconds,
          endWordIndex: finalWindow.endWordIndex
        };
        windows.pop();
      }
    }
  }

  return windows.filter((window) => window.endSeconds > window.startSeconds);
}

function resolveSourceSegmentIds(transcript: Transcript, window: SceneWindow): TranscriptSegmentId[] {
  return transcript.segments
    .filter((segment) => segment.endSeconds > window.startSeconds && segment.startSeconds < window.endSeconds)
    .map((segment) => transcriptSegmentIdSchema.parse(segment.id));
}

interface SceneVisualSpec {
  readonly subject: string;
  readonly action: string;
  readonly setting: string;
  readonly composition: string;
  readonly cameraFraming: string;
  readonly mood: string;
  readonly continuityReferences: string[];
  readonly onScreenText: string;
  readonly textRequirement: Scene["textRequirement"];
  readonly negativeConstraints: string[];
  readonly sourceNarration: string;
}

function deriveSceneVisualSpec(narration: string): SceneVisualSpec {
  const lower = narration.toLowerCase();
  const keywords = extractKeywords(narration, 10);
  const hasEarlyLife = /\b(age of three|before the age of three|born|opened your eyes|mother's voice|first steps|first word|baby brain|infantile amnesia)\b/u.test(lower);
  const hasBaby = /\b(baby|infant|crib|mother|ankle|mobile)\b/u.test(lower);
  const hasMemoryLab = /\b(experiment|scientist|research|rutgers|hospital|science)\b/u.test(lower);
  const hasBrain = /\b(hippocampus|brain|neuron|neurons|neurogenesis|prefrontal)\b/u.test(lower);
  const hasMirror = /\b(mirror|self[- ]?recognition|rouge)\b/u.test(lower);
  const hasLanguage = /\b(language|story|stories|conversation|talking|narratives?)\b/u.test(lower);
  const hasCulture = /\b(culture|maori|new zealand|east asian|western)\b/u.test(lower);
  const hasFreud = /\bfreud|infantile amnesia\b/u.test(lower);

  if (hasMemoryLab) {
    return {
      subject: "a simple memory experiment diagram with a hanging mobile and response arrows",
      action: "showing how learned movement is remembered over time",
      setting: "a calm research board with labels, arrows, and simple lab notes",
      composition: "Landscape 16:9. One clear focal point. Keep the experiment simple and readable.",
      cameraFraming: "medium shot",
      mood: "curious and observational",
      continuityReferences: ["keep the same rough ink-and-paper collage style"],
      onScreenText: "",
      textRequirement: inferSceneTextRequirement(narration),
      negativeConstraints: ["no photorealism", "no stock-photo look", "no watermarks"],
      sourceNarration: narration
    };
  }

  if (hasEarlyLife) {
    return {
      subject: "a baby growing into a toddler shown through early life milestones",
      action: "birth, first glance, first steps, and first words connected in one clear visual story",
      setting: "a calm hand-drawn collage with a crib, soft household details, and a subtle life timeline",
      composition: "Landscape 16:9. One clear focal point. Show the baby and childhood milestones large and readable.",
      cameraFraming: "medium shot",
      mood: "reflective and intimate",
      continuityReferences: ["keep the same rough ink-and-paper collage style"],
      onScreenText: "",
      textRequirement: inferSceneTextRequirement(narration),
      negativeConstraints: ["no photorealism", "no stock-photo look", "no watermarks"],
      sourceNarration: narration
    };
  }

  if (hasBaby && hasMirror) {
    return {
      subject: "a toddler standing in front of a mirror",
      action: "recognizing their own reflection",
      setting: "a simple home interior with a mirror and soft daylight",
      composition: "Landscape 16:9. One clear focal point. Leave open space around the mirror.",
      cameraFraming: "medium shot",
      mood: "gentle and thoughtful",
      continuityReferences: ["keep the same rough ink-and-paper collage style"],
      onScreenText: "",
      textRequirement: inferSceneTextRequirement(narration),
      negativeConstraints: ["no photorealism", "no stock-photo look", "no watermarks"],
      sourceNarration: narration
    };
  }

  if (hasBrain) {
    return {
      subject: "a brain drawn as a simple memory map",
      action: "new neurons forming while old pathways fade",
      setting: "an abstract brain diagram shown as a hand-drawn collage",
      composition: "Landscape 16:9. One clear focal point. Show the brain diagram large and uncluttered.",
      cameraFraming: "close medium shot",
      mood: "scientific and explanatory",
      continuityReferences: ["keep the same rough ink-and-paper collage style"],
      onScreenText: "",
      textRequirement: inferSceneTextRequirement(narration),
      negativeConstraints: ["no photorealism", "no stock-photo look", "no watermarks"],
      sourceNarration: narration
    };
  }

  if (hasLanguage || hasCulture) {
    return {
      subject: "a parent and child talking over family stories",
      action: "sharing memories that help the child remember the past",
      setting: "a warm family room with story prompts and simple household objects",
      composition: "Landscape 16:9. One clear focal point. Keep the room sparse and easy to read.",
      cameraFraming: "medium shot",
      mood: "warm and reflective",
      continuityReferences: ["keep the same rough ink-and-paper collage style"],
      onScreenText: "",
      textRequirement: inferSceneTextRequirement(narration),
      negativeConstraints: ["no photorealism", "no stock-photo look", "no watermarks"],
      sourceNarration: narration
    };
  }

  if (hasFreud) {
    return {
      subject: "Sigmund Freud at a desk with notes about infantile amnesia",
      action: "writing down the idea that early memories fade",
      setting: "a historical study with papers, ink, and memory diagrams",
      composition: "Landscape 16:9. One clear focal point. Keep the desk and notes readable without clutter.",
      cameraFraming: "medium shot",
      mood: "historical and reflective",
      continuityReferences: ["keep the same rough ink-and-paper collage style"],
      onScreenText: "",
      textRequirement: inferSceneTextRequirement(narration),
      negativeConstraints: ["no photorealism", "no stock-photo look", "no watermarks"],
      sourceNarration: narration
    };
  }

  return {
    subject: keywords.slice(0, 4).join(", ") || "the main idea from the narration",
    action: "showing the key narrated idea in a clear visual scene",
    setting: "a minimal hand-drawn documentary scene",
    composition: "Landscape 16:9. One clear focal point. Keep the background sparse and readable.",
    cameraFraming: "medium shot",
    mood: "informative and calm",
    continuityReferences: ["keep the same rough ink-and-paper collage style"],
    onScreenText: "",
    textRequirement: inferSceneTextRequirement(narration),
    negativeConstraints: ["no photorealism", "no stock-photo look", "no watermarks"],
    sourceNarration: narration
  };
}

export class OneToOneScenePlanner implements ScenePlanner {
  public plan(
    transcript: Transcript,
    script: RewrittenScript,
    aspectRatios: ReadonlyArray<"16:9" | "9:16"> = ["16:9", "9:16"],
    options: {
      readonly visualSceneTargetPer10Minutes?: number;
      readonly visualSceneMinSeconds?: number;
      readonly visualSceneMaxSeconds?: number;
    } = {}
  ): ScenePlan {
    const { minDurationSeconds, maxDurationSeconds } =
      resolveVisualSceneDurationBounds(options);
    const windows = buildSceneWindows(transcript, minDurationSeconds, maxDurationSeconds);
    const sceneNarrations = buildSceneNarration(script, windows.length);
    const scenes: Scene[] = windows.map((window, index) => {
      const sequenceNumber = index + 1;
      const startSeconds = window.startSeconds;
      const endSeconds = window.endSeconds;
      const sceneId = sceneIdSchema.parse(buildSceneId(sequenceNumber));
      const narration = normalizeWhitespace(sceneNarrations[index] ?? script.sections[index]?.text ?? transcript.text);
      const visualSpec = deriveSceneVisualSpec(narration);
      return {
        id: sceneId,
        sequenceNumber,
        canonicalNarration: narration.length > 0 ? narration : script.sections[index]?.text ?? transcript.text,
        sourceSegmentIds: resolveSourceSegmentIds(transcript, window),
        estimatedDurationSeconds: Math.max(1, endSeconds - startSeconds),
        timing: {
          startSeconds,
          endSeconds
        },
        visualPurpose: "Depict the narrated concept clearly and directly.",
        subject: visualSpec.subject,
        action: visualSpec.action,
        setting: visualSpec.setting,
        composition: visualSpec.composition,
        cameraFraming: visualSpec.cameraFraming,
        mood: visualSpec.mood,
      continuityReferences: visualSpec.continuityReferences,
      onScreenText: visualSpec.onScreenText,
        textRequirement: visualSpec.textRequirement,
        negativeConstraints: visualSpec.negativeConstraints,
        aspectRatios: [...aspectRatios],
        imagePrompt: buildScenePrompt(sequenceNumber, narration.length > 0 ? narration : script.sections[index]?.text ?? transcript.text, aspectRatios[0] ?? "16:9", visualSpec),
        expectedImageFilenames: aspectRatios.map((aspectRatio) => sceneFilename(sequenceNumber, startSeconds, endSeconds, aspectRatio)),
        qualityStatus: "draft"
      };
    });
    return scenePlanSchema.parse({
      sourceId: transcript.sourceId,
      scenes
    });
  }
}

function buildScenePrompt(
  sceneNumber: number,
  scriptText: string,
  aspectRatio: "16:9" | "9:16",
  visualSpec: SceneVisualSpec
): string {
  const keywords = extractKeywords(scriptText, 8);
  return [
    `SCENE ${String(sceneNumber).padStart(3, "0")}`,
    `NARRATION ${scriptText}.`,
    `${visualSpec.subject}. ${visualSpec.action}.`,
    `SETTING ${visualSpec.setting}.`,
    `COMPOSITION ${visualSpec.composition}.`,
    `CAMERA ${visualSpec.cameraFraming}. MOOD ${visualSpec.mood}.`,
    `GLOBAL STYLE Custom rough ink-and-paper collage on an off-white background. Thick uneven charcoal lines. Deliberately imperfect hand-drawn shapes. Simple expressive figures. Two accent colors only. No photorealism, 3D rendering, cinematic lighting, borders, bands, frames, stock-photo look, logos, or watermarks.`,
    `ASPECT RATIO ${aspectRatio}.`,
    `CONTINUITY Keep the hand-drawn style consistent and match the narrated concept.`,
    `REQUIRED OBJECTS ${keywords.join(", ")}.`,
    `SOURCE IDEA ${scriptText}.`,
    requiresSceneText(visualSpec.textRequirement)
      ? [
          "TEXT REQUIREMENT This scene requires one specific piece of readable text.",
          `Render exactly ${JSON.stringify(visualSpec.textRequirement.text)}.`,
          visualSpec.textRequirement.placement
            ? `Placement ${visualSpec.textRequirement.placement}.`
            : undefined,
          "The spelling, capitalization, punctuation, and language must be exact and clearly legible.",
          "Do not add any other words, captions, subtitles, labels, logos, watermarks, or unrelated background text.",
        ]
          .filter((line): line is string => Boolean(line))
          .join(" ")
      : "TEXT REQUIREMENT Do not include captions, subtitles, labels, logos, watermarks, or readable text."
  ].join("\n");
}

export function createImagePrompts(scenePlan: ScenePlan, aspectRatio: "16:9" | "9:16"): ImagePrompt[] {
  return scenePlan.scenes.map((scene) =>
    imagePromptSchema.parse({
      sceneId: scene.id,
      sequenceNumber: scene.sequenceNumber,
      aspectRatio,
      timestampStart: scene.timing.startSeconds,
      timestampEnd: scene.timing.endSeconds,
      visualPurpose: scene.visualPurpose,
      prompt: scene.imagePrompt,
      negativePrompt: scene.negativeConstraints.join(", "),
      continuity: scene.continuityReferences.join("; "),
      expectedFilename: sceneFilename(scene.sequenceNumber, scene.timing.startSeconds, scene.timing.endSeconds, aspectRatio)
    })
  );
}

export function sortScenesByTiming(plan: ScenePlan): ScenePlan {
  return scenePlanSchema.parse({
    sourceId: plan.sourceId,
    scenes: [...plan.scenes].sort((left, right) => left.sequenceNumber - right.sequenceNumber)
  });
}

export function sceneTimestampLabel(scene: Scene): string {
  return `${safeTimestampToken(scene.timing.startSeconds)}-${safeTimestampToken(scene.timing.endSeconds)}`;
}
