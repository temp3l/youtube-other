import type { BenchmarkRequest, BenchmarkResult, CacheInspectionResult, CleanCacheRequest, CleanCacheResult, ComposeRequest, ComposeResult, InspectCacheRequest, RenderOptions, RenderRequest, RenderResult, RendererCapabilities, RenderSceneRequest, SceneRenderResult, ValidateRequest, ValidationResult } from "../contracts.js";

export interface EducationalRenderer {
  validate(request: ValidateRequest): Promise<ValidationResult>;
  render(request: RenderRequest, options?: RenderOptions): Promise<RenderResult>;
  renderScene(request: RenderSceneRequest, options?: RenderOptions): Promise<SceneRenderResult>;
  compose(request: ComposeRequest): Promise<ComposeResult>;
  inspectCapabilities(): Promise<RendererCapabilities>;
  benchmark(request: BenchmarkRequest): Promise<BenchmarkResult>;
  inspectCache(request?: InspectCacheRequest): Promise<CacheInspectionResult>;
  cleanCache(request?: CleanCacheRequest): Promise<CleanCacheResult>;
}
