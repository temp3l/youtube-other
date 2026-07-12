import path from "node:path";
import { z } from "zod";

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
