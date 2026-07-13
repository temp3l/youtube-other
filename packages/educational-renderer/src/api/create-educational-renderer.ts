import { EducationalRendererService, type EducationalRendererConfiguration } from "../application/renderer.js";
import type { EducationalRenderer } from "./educational-renderer.js";
import { z } from "zod";
import { RendererError } from "../errors.js";

const configurationSchema = z.strictObject({ workspaceDirectory: z.string().min(1), cacheDirectory: z.string().min(1), temporaryDirectory: z.string().min(1), fontFile: z.string().min(1).optional() });

export async function createEducationalRenderer(configuration: EducationalRendererConfiguration): Promise<EducationalRenderer> {
  const parsed = configurationSchema.safeParse(configuration);
  if (!parsed.success) throw new RendererError({ code: "INVALID_REQUEST", message: "Invalid renderer configuration.", details: { issues: parsed.error.issues.length } });
  return EducationalRendererService.create({ workspaceDirectory: parsed.data.workspaceDirectory, cacheDirectory: parsed.data.cacheDirectory, temporaryDirectory: parsed.data.temporaryDirectory, ...(parsed.data.fontFile === undefined ? {} : { fontFile: parsed.data.fontFile }) });
}
