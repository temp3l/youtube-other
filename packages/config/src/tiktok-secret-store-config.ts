import { z } from "zod";

const identifierPattern = /^[a-z0-9][a-z0-9._-]*$/u;
const identifierSchema = z.string().min(1).max(160).regex(identifierPattern);

export const tikTokSecretStoreConfigSchema = z
  .object({
    storeRoot: z.string().min(1),
    encryptionKeyConfigured: z.literal(true),
  })
  .strict();
export type TikTokSecretStoreConfig = z.infer<typeof tikTokSecretStoreConfigSchema>;

const tikTokSecretStoreEnvironmentSchema = z.object({
  MEDIAFORGE_TIKTOK_SECRET_STORE_DIR: z.string().optional(),
  MEDIAFORGE_TIKTOK_SECRET_ENCRYPTION_KEY: z.string().optional(),
});

export function resolveTikTokSecretStoreRoot(input: {
  readonly configuredRoot?: string;
  readonly workspaceRoot?: string;
}): string {
  const configuredRoot =
    input.configuredRoot ??
    pathJoin(input.workspaceRoot ?? process.cwd(), ".mediaforge", "tiktok-secrets");
  return configuredRoot;
}

function pathJoin(...segments: string[]): string {
  return segments
    .filter((segment) => segment.length > 0)
    .join("/")
    .replace(/\/+/gu, "/");
}

export function parseTikTokSecretStoreEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
  input: { readonly workspaceRoot?: string } = {}
): {
  readonly config: TikTokSecretStoreConfig;
  readonly encryptionKey: string;
} {
  const parsed = tikTokSecretStoreEnvironmentSchema.parse(environment);
  const encryptionKey = parsed.MEDIAFORGE_TIKTOK_SECRET_ENCRYPTION_KEY?.trim();
  if (!encryptionKey || Buffer.byteLength(encryptionKey, "utf8") < 32) {
    throw new Error(
      "MEDIAFORGE_TIKTOK_SECRET_ENCRYPTION_KEY must contain at least 32 bytes."
    );
  }
  return {
    config: tikTokSecretStoreConfigSchema.parse({
      storeRoot: resolveTikTokSecretStoreRoot({
        configuredRoot: parsed.MEDIAFORGE_TIKTOK_SECRET_STORE_DIR,
        workspaceRoot: input.workspaceRoot,
      }),
      encryptionKeyConfigured: true,
    }),
    encryptionKey,
  };
}

export function redactTikTokSecretStoreConfigEvidence(
  value: unknown
): unknown {
  if (Array.isArray(value)) return value.map(redactTikTokSecretStoreConfigEvidence);
  if (!value || typeof value !== "object") {
    if (typeof value === "string" && Buffer.byteLength(value, "utf8") >= 32) {
      return "[REDACTED]";
    }
    return value;
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
      key,
      /(?:encryption|secret|token|key)/iu.test(key)
        ? "[REDACTED]"
        : redactTikTokSecretStoreConfigEvidence(nested),
    ])
  );
}

export function assertTikTokSecretStoreConfigIdentifiers(input: {
  readonly workspaceId: string;
  readonly accountId: string;
}): void {
  identifierSchema.parse(input.workspaceId);
  identifierSchema.parse(input.accountId);
}
