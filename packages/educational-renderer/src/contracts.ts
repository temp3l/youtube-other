import { z } from "zod";
import type { RendererErrorData } from "./errors.js";

const safeId = z.string().min(1).max(96).regex(/^[a-z0-9][a-z0-9._-]*$/u);
const safeText = z.string().min(1).max(1_000).refine((value) => Array.from(value).every((character) => { const code = character.codePointAt(0) ?? 0; return code === 9 || code === 10 || code === 13 || code >= 32; }), "Unsafe control character");
const finite = z.number().finite();
const range = z.tuple([finite, finite]).refine(([a, b]) => a < b, "Range must increase");
const base = {
  id: safeId,
  durationMs: z.number().int().min(250).max(300_000),
  localeSensitivity: z.enum(["language-neutral", "localized", "timing-sensitive"]),
  transition: z.strictObject({ type: z.enum(["none", "fade"]), durationMs: z.number().int().min(0).max(2_000) }).optional(),
  narrationCue: z.strictObject({ startMs: z.number().int().nonnegative(), endMs: z.number().int().positive() }).refine((v) => v.startMs < v.endMs).optional(),
};
const titleSceneSchema = z.strictObject({ ...base, type: z.literal("title"), title: safeText, subtitle: safeText.optional() });
const textSceneSchema = z.strictObject({ ...base, type: z.literal("text"), heading: safeText.optional(), text: safeText, annotation: safeText.optional() });
const equationSceneSchema = z.strictObject({ ...base, type: z.literal("equation"), equation: z.string().min(1).max(300), label: safeText.optional(), highlight: z.string().max(80).optional() });
const equationTransformationSceneSchema = z.strictObject({ ...base, type: z.literal("equation-transformation"), from: z.string().min(1).max(300), to: z.string().min(1).max(300), operation: safeText, highlight: z.string().max(80).optional() });
const graphFunctionSchema = z.strictObject({ expression: z.string().regex(/^[-+]?(?:\d+(?:\.\d+)?)?\*?x(?:[-+]\d+(?:\.\d+)?)?$/u, "Only linear expressions ax+b are supported"), domain: range, color: z.string().regex(/^#[0-9a-fA-F]{6}$/u).optional() });
const coordinateGraphSceneSchema = z.strictObject({ ...base, type: z.literal("coordinate-graph"), xRange: range, yRange: range, functions: z.array(graphFunctionSchema).min(1).max(4), points: z.array(z.strictObject({ x: finite, y: finite, label: safeText.optional() })).max(16).default([]), xLabel: safeText.max(12).optional(), yLabel: safeText.max(12).optional(), annotation: safeText.optional(), expensiveGrid: z.boolean().default(false) });
const geometrySceneSchema = z.strictObject({ ...base, type: z.literal("geometry"), shape: z.enum(["triangle", "rectangle", "circle"]), labels: z.array(safeText.max(40)).max(8).default([]) });
const summarySceneSchema = z.strictObject({ ...base, type: z.literal("summary"), title: safeText, points: z.array(safeText).min(1).max(8) });

export const visualSceneSchema = z.discriminatedUnion("type", [titleSceneSchema, textSceneSchema, equationSceneSchema, equationTransformationSceneSchema, coordinateGraphSceneSchema, geometrySceneSchema, summarySceneSchema]);
export const visualPlanSchema = z.strictObject({
  version: z.literal("1"), lessonId: safeId, locale: z.enum(["de", "en", "es", "fr", "pt"]), title: safeText,
  scenes: z.array(visualSceneSchema).min(1).max(120),
}).superRefine((plan, context) => {
  const ids = new Set<string>();
  for (const [index, scene] of plan.scenes.entries()) {
    if (ids.has(scene.id)) context.addIssue({ code: "custom", path: ["scenes", index, "id"], message: "Scene IDs must be unique" });
    ids.add(scene.id);
    if (scene.narrationCue && scene.narrationCue.endMs > scene.durationMs) context.addIssue({ code: "custom", path: ["scenes", index, "narrationCue"], message: "Narration cue exceeds scene duration" });
  }
});

export const profileNameSchema = z.enum(["preview", "draft", "youtube-full", "youtube-short"]);
export const renderProfileInputSchema = z.union([
  profileNameSchema,
  z.strictObject({ name: profileNameSchema, frameRate: z.union([z.literal(15), z.literal(24), z.literal(25)]).optional(), encoder: z.enum(["libx264", "h264_vaapi", "h264_qsv"]).optional(), preset: z.enum(["ultrafast", "superfast", "veryfast", "faster", "fast"]).optional() }),
]);
export const audioInputSchema = z.strictObject({ path: z.string().min(1), volume: z.number().min(0).max(4).default(1) });
export const subtitleInputSchema = z.strictObject({ path: z.string().min(1), mode: z.enum(["embedded", "none"]).default("embedded") });
export const renderRequestSchema = z.strictObject({
  requestVersion: z.literal("1"), jobId: safeId, visualPlan: visualPlanSchema, profile: renderProfileInputSchema, outputDirectory: z.string().min(1),
  assets: z.record(z.string(), z.strictObject({ path: z.string().min(1), sha256: z.string().regex(/^[a-f0-9]{64}$/u).optional() })).optional(),
  audio: audioInputSchema.optional(), subtitles: subtitleInputSchema.optional(),
  execution: z.strictObject({ changedOnly: z.boolean().optional(), resume: z.boolean().optional(), overwrite: z.boolean().optional(), renderConcurrency: z.number().int().min(1).max(2).optional(), encoderConcurrency: z.number().int().min(1).max(2).optional(), keepTemporaryFiles: z.boolean().optional() }).optional(),
});

export type VisualScene = z.infer<typeof visualSceneSchema>;
export type VisualPlanInput = z.infer<typeof visualPlanSchema>;
export type RenderProfileInput = z.infer<typeof renderProfileInputSchema>;
export type RenderRequest = z.infer<typeof renderRequestSchema>;
export interface ValidateRequest { readonly requestVersion: "1"; readonly visualPlan: VisualPlanInput; readonly profile: RenderProfileInput; }
export interface RenderOptions { readonly signal?: AbortSignal; readonly onEvent?: (event: RendererEvent) => void; }
export interface RenderSceneRequest extends RenderRequest { readonly sceneId: string; }
export interface ComposeRequest { readonly requestVersion: "1"; readonly jobId: string; readonly profile: RenderProfileInput; readonly outputDirectory: string; readonly scenePaths: readonly string[]; readonly audio?: z.infer<typeof audioInputSchema>; readonly subtitles?: z.infer<typeof subtitleInputSchema>; }
export interface BenchmarkRequest { readonly requestVersion: "1"; readonly fixtureDirectory: string; readonly profiles: readonly z.infer<typeof profileNameSchema>[]; readonly encoders?: readonly string[]; readonly outputDirectory: string; }
export interface InspectCacheRequest { readonly cacheKey?: string; readonly verify?: boolean; }
export interface CleanCacheRequest { readonly cacheKey?: string; readonly corruptOnly?: boolean; }

export type CacheStatus = "hit" | "miss" | "stale" | "corrupt" | "disabled";
export interface RendererWarning { readonly code: string; readonly message: string; readonly sceneId?: string; }
export interface SceneRenderResult { readonly resultVersion: "1"; readonly sceneId: string; readonly status: "completed" | "failed" | "cancelled"; readonly cacheStatus: CacheStatus; readonly cacheKey: string; readonly outputPath?: string; readonly sha256?: string; readonly durationMs: number; readonly renderDurationMs: number; readonly warnings: readonly RendererWarning[]; readonly errors: readonly RendererErrorData[]; }
export interface CacheSummary { readonly hits: number; readonly misses: number; readonly stale: number; readonly corrupt: number; readonly bytesRead: number; }
export interface RenderMetrics { readonly totalDurationMs: number; readonly validationDurationMs: number; readonly sceneRenderDurationMs: number; readonly compositionDurationMs: number; readonly ffmpegDurationMs: number; readonly renderedFrameCount: number; readonly temporaryBytesWritten: number; }
export interface MediaOutput { readonly videoPath: string; readonly manifestPath: string; readonly durationMs: number; readonly width: number; readonly height: number; readonly frameRate: number; readonly videoCodec: string; readonly audioCodec?: string; readonly sha256: string; }
export interface RenderResult { readonly resultVersion: "1"; readonly jobId: string; readonly status: "completed" | "completed-with-warnings" | "incomplete" | "failed" | "cancelled"; readonly output?: MediaOutput; readonly scenes: readonly SceneRenderResult[]; readonly cache: CacheSummary; readonly metrics: RenderMetrics; readonly capabilities: RendererCapabilitiesSummary; readonly warnings: readonly RendererWarning[]; readonly errors: readonly RendererErrorData[]; }
export interface ValidationResult { readonly valid: boolean; readonly warnings: readonly RendererWarning[]; readonly errors: readonly RendererErrorData[]; readonly normalizedProfile?: NormalizedRenderProfile; }
export interface ComposeResult { readonly status: "completed" | "failed"; readonly output?: MediaOutput; readonly warnings: readonly RendererWarning[]; readonly errors: readonly RendererErrorData[]; readonly durationMs: number; }
export type CapabilityStatus = "available" | "unavailable" | "untested" | "available-but-failed-self-test";
export interface Capability { readonly status: CapabilityStatus; readonly version?: string; readonly detail?: string; }
export interface RendererCapabilities { readonly resultVersion: "1"; readonly node: Capability; readonly ffmpeg: Capability; readonly ffprobe: Capability; readonly encoders: Readonly<Record<string, Capability>>; readonly driDevices: readonly string[]; readonly fonts: readonly Capability[]; readonly graphviz: Capability; readonly blender: Capability; readonly svgRenderer: Capability; readonly cpuCount: number; readonly totalMemoryBytes: number; readonly freeSpaceBytes?: number; }
export interface RendererCapabilitiesSummary { readonly ffmpeg: CapabilityStatus; readonly ffprobe: CapabilityStatus; readonly encoder: string; }
export interface CacheInspectionResult { readonly resultVersion: "1"; readonly entries: readonly { readonly cacheKey: string; readonly status: CacheStatus; readonly bytes: number; readonly sceneId?: string }[]; readonly totalBytes: number; }
export interface CleanCacheResult { readonly resultVersion: "1"; readonly removedEntries: number; readonly removedBytes: number; }
export interface BenchmarkResult { readonly resultVersion: "1"; readonly timestamp: string; readonly packageVersion: string; readonly rendererFormatVersion: string; readonly machine: { readonly cpuCount: number; readonly totalMemoryBytes: number; readonly nodeVersion: string }; readonly tools: { readonly ffmpeg: Capability; readonly ffprobe: Capability; readonly font: Capability }; readonly runs: readonly { readonly profile: string; readonly encoder: string; readonly coldDurationMs?: number; readonly warmDurationMs?: number; readonly changedOneSceneDurationMs?: number; readonly audioOnlyCompositionDurationMs?: number; readonly validationDurationMs?: number; readonly ffmpegDurationMs?: number; readonly compositionDurationMs?: number; readonly sceneDurationsMs?: Readonly<Record<string, number>>; readonly renderedFrameCount?: number; readonly effectiveFrameRate?: number; readonly cacheHits?: number; readonly cacheMisses?: number; readonly cacheHitRate?: number; readonly temporaryBytesWritten?: number; readonly outputBytes?: number; readonly peakMemoryBytes?: number; readonly status: "completed" | "failed" | "skipped"; readonly warnings?: readonly string[]; readonly failures?: readonly RendererErrorData[] }[]; }
export interface NormalizedRenderProfile { readonly name: z.infer<typeof profileNameSchema>; readonly width: number; readonly height: number; readonly frameRate: 15 | 24 | 25; readonly encoder: "libx264" | "h264_vaapi" | "h264_qsv"; readonly preset: "ultrafast" | "superfast" | "veryfast" | "faster" | "fast"; readonly pixelFormat: "yuv420p"; }
export type RendererEvent =
  | { readonly type: "job-started"; readonly jobId: string; readonly timestamp: string }
  | { readonly type: "scene-started"; readonly jobId: string; readonly sceneId: string; readonly timestamp: string }
  | { readonly type: "scene-cache-hit"; readonly jobId: string; readonly sceneId: string; readonly cacheKey: string }
  | { readonly type: "scene-completed"; readonly jobId: string; readonly sceneId: string; readonly durationMs: number }
  | { readonly type: "scene-failed"; readonly jobId: string; readonly sceneId: string; readonly error: RendererErrorData }
  | { readonly type: "job-completed"; readonly jobId: string; readonly status: RenderResult["status"] };
