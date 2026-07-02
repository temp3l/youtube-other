import fs from "node:fs";
import { resolveRepoPath } from "./story-localization.utils.js";

const templateCache = new Map<string, string>();
const unresolvedPlaceholderPattern = /\{\{([A-Z0-9_]+)\}\}/gu;

export class StoryPromptTemplateError extends Error {
  constructor(
    message: string,
    readonly details: {
      readonly fileName: string;
      readonly unresolvedPlaceholders?: readonly string[];
      readonly missingMarker?: string;
    }
  ) {
    super(message);
    this.name = "StoryPromptTemplateError";
  }
}

function escapeTemplateKey(key: string): string {
  return key.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function normalizeTemplate(template: string): string {
  return template.replace(/\r\n/gu, "\n");
}

export function resetStoryPromptTemplateCacheForTests(): void {
  templateCache.clear();
}

export function loadStoryPromptTemplate(fileName: string): string {
  const templatePath = resolveRepoPath("docs", "templates", "audio", fileName);
  const cached = templateCache.get(templatePath);
  if (cached !== undefined) {
    return cached;
  }
  const template = normalizeTemplate(fs.readFileSync(templatePath, "utf8"));
  templateCache.set(templatePath, template);
  return template;
}

/**
 * Deprecated staged alias while older callers migrate to the story-facing name.
 */
export function loadAudioTemplate(fileName: string): string {
  return loadStoryPromptTemplate(fileName);
}

export function renderTemplate(
  template: string,
  replacements: Readonly<Record<string, string>>,
  options?: {
    readonly strict?: boolean;
    readonly fileName?: string;
  }
): string {
  let rendered = template;
  for (const [key, value] of Object.entries(replacements)) {
    rendered = rendered.replace(
      new RegExp(`\\{\\{${escapeTemplateKey(key)}\\}\\}`, "gu"),
      value
    );
  }
  if (options?.strict) {
    const unresolved = [...rendered.matchAll(unresolvedPlaceholderPattern)].map(
      (match) => match[1] ?? ""
    );
    if (unresolved.length > 0) {
      throw new StoryPromptTemplateError(
        `Unresolved placeholders remain in template ${options.fileName ?? "unknown"}.`,
        {
          fileName: options.fileName ?? "unknown",
          unresolvedPlaceholders: unresolved,
        }
      );
    }
  }
  return rendered;
}

export function insertSectionBeforeMarker(
  template: string,
  marker: string,
  section: string,
  options?: {
    readonly strict?: boolean;
    readonly fileName?: string;
  }
): string {
  const markerIndex = template.indexOf(marker);
  if (markerIndex < 0) {
    if (options?.strict) {
      throw new StoryPromptTemplateError(
        `Required insertion marker missing from template ${options.fileName ?? "unknown"}.`,
        {
          fileName: options.fileName ?? "unknown",
          missingMarker: marker,
        }
      );
    }
    return `${template}\n\n${section}`;
  }
  return `${template.slice(0, markerIndex)}${section}\n\n${template.slice(markerIndex)}`;
}
