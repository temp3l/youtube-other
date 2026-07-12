import { EducationalRendererService, type EducationalRendererConfiguration } from "../application/renderer.js";
import type { EducationalRenderer } from "./educational-renderer.js";

export async function createEducationalRenderer(configuration: EducationalRendererConfiguration): Promise<EducationalRenderer> {
  return EducationalRendererService.create(configuration);
}
