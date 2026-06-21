import {
  alignmentResultSchema,
  captionSegmentSchema,
  type AlignmentResult,
  type CaptionSegment,
  type Transcript,
  type ScenePlan,
  type WordTiming
} from "@mediaforge/domain";
import { buildAss, buildSrt, buildVtt, splitIntoWords } from "@mediaforge/shared";

export interface CaptionPack {
  readonly alignment: AlignmentResult;
  readonly segments: CaptionSegment[];
  readonly srt: string;
  readonly vtt: string;
  readonly ass: string;
}

export function alignScriptToScenes(_transcript: Transcript, scenePlan: ScenePlan): AlignmentResult {
  const words: WordTiming[] = [];
  for (const scene of scenePlan.scenes) {
    const sceneWords = splitIntoWords(scene.canonicalNarration);
    const duration = Math.max(0.1, scene.timing.endSeconds - scene.timing.startSeconds);
    const step = duration / Math.max(1, sceneWords.length);
    sceneWords.forEach((word, index) => {
      const startSeconds = scene.timing.startSeconds + index * step;
      words.push({
        word,
        startSeconds,
        endSeconds: startSeconds + step,
        confidence: 1
      });
    });
  }
  return alignmentResultSchema.parse({
    sceneId: scenePlan.scenes[0]?.id ?? ("scene-001" as never),
    words,
    lowConfidenceRanges: []
  });
}

export function buildCaptionPack(transcript: Transcript, scenePlan: ScenePlan): CaptionPack {
  const alignment = alignScriptToScenes(transcript, scenePlan);
  const segments = transcript.segments.map((segment) =>
    captionSegmentSchema.parse({
      startSeconds: segment.startSeconds,
      endSeconds: segment.endSeconds,
      text: segment.text
    })
  );
  const simpleEntries = segments.map((segment) => ({
    startSeconds: segment.startSeconds,
    endSeconds: segment.endSeconds,
    text: segment.text
  }));
  return {
    alignment,
    segments,
    srt: buildSrt(simpleEntries),
    vtt: buildVtt(simpleEntries),
    ass: buildAss(simpleEntries)
  };
}
