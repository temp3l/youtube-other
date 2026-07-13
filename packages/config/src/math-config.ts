import path from "node:path";
import { z } from "zod";

const mathLanguageSchema = z.enum(["de", "en", "es", "fr", "pt"]);
const idSchema = z.string().trim().min(1);

export const mathBrandPolicySchema = z
  .strictObject({
    artifactVersion: z.literal("math-brand-policy.v1"),
    privacyStatus: z.literal("private"),
    madeForKids: z.boolean(),
    containsSyntheticMedia: z.boolean(),
    channels: z
      .array(
        z.strictObject({
          language: mathLanguageSchema,
          channelId: idSchema,
          playlists: z.record(
            z.string().regex(/^(?:grade|topic|variant)-[a-z0-9-]+$/u),
            idSchema
          ),
        })
      )
      .length(5),
  })
  .superRefine((policy, context) => {
    const languages = policy.channels.map((channel) => channel.language);
    if (new Set(languages).size !== languages.length)
      context.addIssue({ code: "custom", path: ["channels"], message: "Math brand languages must be unique." });
    for (const language of mathLanguageSchema.options)
      if (!languages.includes(language))
        context.addIssue({ code: "custom", path: ["channels"], message: `Missing math channel for ${language}.` });
    const channelIds = policy.channels.map((channel) => channel.channelId);
    if (new Set(channelIds).size !== channelIds.length)
      context.addIssue({ code: "custom", path: ["channels"], message: "Math channel IDs must be unique." });
    for (const [channelIndex, channel] of policy.channels.entries()) {
      const ids = Object.values(channel.playlists);
      if (new Set(ids).size !== ids.length)
        context.addIssue({ code: "custom", path: ["channels", channelIndex, "playlists"], message: "Playlist IDs must be unique per language." });
    }
  });
export type MathBrandPolicy = z.infer<typeof mathBrandPolicySchema>;

export type MathBrandPolicyValidation =
  | { status: "READY"; policy: MathBrandPolicy; blockers: [] }
  | { status: "PUBLISH_BLOCKED"; blockers: string[] };

export function validateMathBrandPolicy(raw: unknown): MathBrandPolicyValidation {
  const parsed = mathBrandPolicySchema.safeParse(raw);
  if (!parsed.success)
    return {
      status: "PUBLISH_BLOCKED",
      blockers: parsed.error.issues.map(
        (issue) => `${issue.path.join(".") || "policy"}: ${issue.message}`
      ),
    };
  return { status: "READY", policy: parsed.data, blockers: [] };
}

export const mathRuntimeConfigSchema = z.strictObject({
  workspaceDir: z.string().min(1),
  brandConfigPath: z.string().min(1),
  enabled: z.boolean(),
  renderingEnabled: z.boolean(),
  publishingEnabled: z.boolean(),
});

export type MathRuntimeConfig = z.infer<typeof mathRuntimeConfigSchema>;

export function loadMathRuntimeConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
  cwd = process.cwd()
): MathRuntimeConfig {
  const parseBoolean = (name: string, fallback: boolean): boolean => {
    const value = env[name];
    if (value === undefined) return fallback;
    if (["1", "true", "yes", "on"].includes(value.toLowerCase())) return true;
    if (["0", "false", "no", "off"].includes(value.toLowerCase())) return false;
    throw new Error(`Invalid boolean value for ${name}: ${value}`);
  };

  return mathRuntimeConfigSchema.parse({
    workspaceDir: path.resolve(
      cwd,
      env["MEDIAFORGE_MATH_WORKSPACE"] ?? "math-episodes"
    ),
    brandConfigPath: path.resolve(
      cwd,
      env["MEDIAFORGE_MATH_BRAND_CONFIG"] ?? "config/math-brand.json"
    ),
    enabled: parseBoolean("MEDIAFORGE_MATH_ENABLED", true),
    renderingEnabled: parseBoolean("MEDIAFORGE_MATH_RENDERING_ENABLED", true),
    publishingEnabled: parseBoolean(
      "MEDIAFORGE_MATH_PUBLISHING_ENABLED",
      false
    ),
  });
}
