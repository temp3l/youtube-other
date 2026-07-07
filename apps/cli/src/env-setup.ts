import fs from "node:fs";
import path from "node:path";

function parseDotEnvValue(rawValue: string): string {
  const trimmed = rawValue.trim();
  const quoted =
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
      ? trimmed.slice(1, -1)
      : trimmed;
  return quoted.replace(/\\n/gu, "\n");
}

function readPreferredOpenAiApiKeyFromDotEnv(
  cwd: string,
): string | undefined {
  const dotenvPath = path.join(cwd, ".env");

  try {
    const content = fs.readFileSync(dotenvPath, "utf8");
    for (const line of content.split(/\r?\n/u)) {
      const trimmed = line.trim();
      if (trimmed.length === 0 || trimmed.startsWith("#")) {
        continue;
      }
      const equalsIndex = trimmed.indexOf("=");
      if (equalsIndex <= 0) {
        continue;
      }
      const key = trimmed.slice(0, equalsIndex).trim();
      if (key !== "OPENAI_API_KEY") {
        continue;
      }
      return parseDotEnvValue(trimmed.slice(equalsIndex + 1));
    }
  } catch {
    return undefined;
  }

  return undefined;
}

const preferredOpenAiApiKey = readPreferredOpenAiApiKeyFromDotEnv(process.cwd());

if (preferredOpenAiApiKey !== undefined) {
  process.env.OPENAI_API_KEY = preferredOpenAiApiKey;
}
