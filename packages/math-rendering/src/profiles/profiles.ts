export interface MathPresentationProfile {
  id: "grades-5-7-v1" | "grades-8-10-v1";
  minFormulaPx: number;
  maxActiveObjects: number;
  maxTeacherAreaRatio: number;
  concreteModelsPreferred: boolean;
}

export type MathEncodingProfileId = "draft" | "review" | "publish";

export interface MathEncodingProfile {
  readonly id: MathEncodingProfileId;
  readonly width: 1920;
  readonly height: 1080;
  readonly fps: 30;
  readonly videoCodec: "libx264";
  readonly crf: 18 | 21 | 25;
  readonly preset: "veryfast" | "medium" | "slow";
  readonly pixelFormat: "yuv420p";
  readonly audioCodec: "aac";
  readonly audioBitrate: "192k";
}

export const mathEncodingProfiles: Readonly<
  Record<MathEncodingProfileId, MathEncodingProfile>
> = {
  draft: {
    id: "draft",
    width: 1920,
    height: 1080,
    fps: 30,
    videoCodec: "libx264",
    crf: 25,
    preset: "veryfast",
    pixelFormat: "yuv420p",
    audioCodec: "aac",
    audioBitrate: "192k",
  },
  review: {
    id: "review",
    width: 1920,
    height: 1080,
    fps: 30,
    videoCodec: "libx264",
    crf: 21,
    preset: "medium",
    pixelFormat: "yuv420p",
    audioCodec: "aac",
    audioBitrate: "192k",
  },
  publish: {
    id: "publish",
    width: 1920,
    height: 1080,
    fps: 30,
    videoCodec: "libx264",
    crf: 18,
    preset: "slow",
    pixelFormat: "yuv420p",
    audioCodec: "aac",
    audioBitrate: "192k",
  },
};
export const grades57Profile: MathPresentationProfile = {
  id: "grades-5-7-v1",
  minFormulaPx: 72,
  maxActiveObjects: 3,
  maxTeacherAreaRatio: 0.25,
  concreteModelsPreferred: true,
};
export const grades810Profile: MathPresentationProfile = {
  id: "grades-8-10-v1",
  minFormulaPx: 58,
  maxActiveObjects: 5,
  maxTeacherAreaRatio: 0.25,
  concreteModelsPreferred: false,
};
export function validateMathLayout(
  profile: MathPresentationProfile,
  activeObjects: number,
  formulaPx: number,
  teacherAreaRatio: number
): void {
  if (!Number.isInteger(activeObjects) || activeObjects <= 0)
    throw new Error(
      "A readable math layout requires at least one active object."
    );
  if (!Number.isFinite(formulaPx) || !Number.isFinite(teacherAreaRatio))
    throw new Error("Math layout measurements must be finite.");
  if (activeObjects > profile.maxActiveObjects)
    throw new Error(
      `${profile.id} permits at most ${profile.maxActiveObjects} active objects.`
    );
  if (formulaPx < profile.minFormulaPx)
    throw new Error(`${profile.id} formula is below minimum glyph size.`);
  if (teacherAreaRatio > profile.maxTeacherAreaRatio)
    throw new Error("Teacher exceeds 25 percent of the frame.");
}

export interface SafeAreaBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function validateSafeAreaAndReadability(
  profile: MathPresentationProfile,
  bounds: SafeAreaBounds,
  minimumGlyphPx: number
): void {
  const safe = { left: 96, top: 54, right: 1824, bottom: 1026 };
  if (
    ![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) ||
    bounds.width <= 0 ||
    bounds.height <= 0 ||
    bounds.x < safe.left ||
    bounds.y < safe.top ||
    bounds.x + bounds.width > safe.right ||
    bounds.y + bounds.height > safe.bottom
  )
    throw new Error("Math visual escapes the 1920x1080 safe area.");
  if (minimumGlyphPx < profile.minFormulaPx)
    throw new Error(
      `${profile.id} visual is below minimum readable glyph size.`
    );
}

export function validateTeacherPresence(
  teacherFrames: number,
  totalFrames: number
): void {
  if (
    !Number.isInteger(teacherFrames) ||
    !Number.isInteger(totalFrames) ||
    teacherFrames < 0 ||
    totalFrames <= 0
  )
    throw new Error("Teacher frame counts must be non-negative integers.");
  if (teacherFrames / totalFrames > 0.25)
    throw new Error("Teacher presence exceeds 25 percent of the timeline.");
}
