import fs from "node:fs";
import { resolveRepoPath } from "./story-localization.utils.js";

const templateCache = new Map<string, string>();

function escapeTemplateKey(key: string): string {
  return key.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

export function loadAudioTemplate(fileName: string): string {
  const templatePath = resolveRepoPath("docs", "templates", "audio", fileName);
  const cached = templateCache.get(templatePath);
  if (cached !== undefined) {
    return cached;
  }
  const template = fs.readFileSync(templatePath, "utf8").replace(/\r\n/gu, "\n");
  templateCache.set(templatePath, template);
  return template;
}

export function renderTemplate(
  template: string,
  replacements: Readonly<Record<string, string>>
): string {
  let rendered = template;
  for (const [key, value] of Object.entries(replacements)) {
    rendered = rendered.replace(
      new RegExp(`\\{\\{${escapeTemplateKey(key)}\\}\\}`, "gu"),
      value
    );
  }
  return rendered;
}

export function insertSectionBeforeMarker(
  template: string,
  marker: string,
  section: string
): string {
  const markerIndex = template.indexOf(marker);
  if (markerIndex < 0) {
    return `${template}\n\n${section}`;
  }
  return `${template.slice(0, markerIndex)}${section}\n\n${template.slice(markerIndex)}`;
}
