export interface MathPresentationProfile {
  id: "grades-5-7-v1" | "grades-8-10-v1";
  minFormulaPx: number;
  maxActiveObjects: number;
  maxTeacherAreaRatio: number;
  concreteModelsPreferred: boolean;
}
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
  if (activeObjects > profile.maxActiveObjects)
    throw new Error(
      `${profile.id} permits at most ${profile.maxActiveObjects} active objects.`
    );
  if (formulaPx < profile.minFormulaPx)
    throw new Error(`${profile.id} formula is below minimum glyph size.`);
  if (teacherAreaRatio > profile.maxTeacherAreaRatio)
    throw new Error("Teacher exceeds 25 percent of the frame.");
}
