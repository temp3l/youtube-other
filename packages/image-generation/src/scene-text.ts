import {
  requiresSceneText,
  type SceneTextRequirement,
} from "@mediaforge/domain";

export function buildSceneTextPromptSection(
  requirement: SceneTextRequirement
): string {
  if (!requiresSceneText(requirement)) {
    return "Do not include captions, subtitles, labels, logos, watermarks, or readable text.";
  }
  const lines = [
    "This scene requires one specific piece of readable text.",
    `Render exactly: ${JSON.stringify(requirement.text)}.`,
  ];
  if (requirement.placement) {
    lines.push(`Placement: ${requirement.placement}.`);
  }
  lines.push(
    "The spelling, capitalization, punctuation, and language must be exact and clearly legible.",
    "Do not add any other words, captions, subtitles, labels, logos, watermarks, or unrelated background text."
  );
  return lines.join(" ");
}

export function buildSceneNegativePrompt(
  requirement: SceneTextRequirement,
  baseConstraints: ReadonlyArray<string>
): string {
  const constraints = [...baseConstraints];
  if (!requiresSceneText(requirement)) {
    constraints.push("no readable text", "no captions", "no subtitles", "no labels");
  }
  return constraints.join(", ");
}
