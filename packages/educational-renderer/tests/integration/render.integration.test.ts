import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createEducationalRenderer } from "../../src/index.js";
import type { RenderRequest, RendererEvent } from "../../src/contracts.js";
import { runProcess } from "../../src/infrastructure/process.js";

const roots: string[] = [];
async function setup() { const root = await fs.mkdtemp(path.join(os.tmpdir(), "educational-renderer-test-")); roots.push(root); return { root, renderer: await createEducationalRenderer({ workspaceDirectory: root, cacheDirectory: path.join(root, "cache"), temporaryDirectory: path.join(root, "tmp") }) }; }
const request = (root: string): RenderRequest => ({ requestVersion: "1", jobId: "integration", profile: "preview", outputDirectory: path.join(root, "output"), visualPlan: { version: "1", lessonId: "integration", locale: "de", title: "Test", scenes: [{ id: "title", type: "title", durationMs: 1_000, localeSensitivity: "localized", title: "Gleichungen", subtitle: "Ein Test" }, { id: "answer", type: "equation", durationMs: 1_000, localeSensitivity: "language-neutral", equation: "x=3" }] } });
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))); });
describe("real Linux rendering", () => {
  it("renders, verifies, emits ordered events, and reuses scene cache", async () => {
    const { root, renderer } = await setup(); const events: RendererEvent[] = []; const cold = await renderer.render(request(root), { onEvent: (event) => events.push(event) }); expect(cold.status, JSON.stringify(cold.errors)).toBe("completed"); expect(cold.output?.width).toBe(960); expect(cold.output?.frameRate).toBe(15); expect(await fs.stat(cold.output!.videoPath)).toBeTruthy(); expect(events[0]?.type).toBe("job-started"); expect(events.at(-1)?.type).toBe("job-completed");
    const warm = await renderer.render(request(root)); expect(warm.cache.hits).toBe(2); expect(warm.scenes.every((scene) => scene.cacheStatus === "hit")).toBe(true);
  });
  it("invalidates only a changed scene and recovers corrupt cache", async () => {
    const { root, renderer } = await setup(); const initial = await renderer.render(request(root)); const changed = request(root); changed.visualPlan.scenes[1] = { ...changed.visualPlan.scenes[1]!, equation: "x=4" }; const result = await renderer.render(changed); expect(result.cache.hits).toBe(1); expect(result.cache.misses).toBe(1); const cached = result.scenes[0]!; const inspection = await renderer.inspectCache({ cacheKey: cached.cacheKey }); expect(inspection.entries[0]?.status).toBe("hit"); await fs.writeFile(cached.outputPath!, "corrupt"); const recovered = await renderer.render(changed); expect(recovered.scenes[0]?.cacheStatus).toBe("corrupt"); expect(recovered.status, JSON.stringify(recovered.errors)).toBe("completed"); expect(initial.scenes).toHaveLength(2);
  });
  it("recomposes audio and subtitles without rerendering visuals", async () => {
    const { root, renderer } = await setup(); const rendered = await renderer.render(request(root)); const scenePaths = rendered.scenes.map((scene) => scene.outputPath!); const mtimes = await Promise.all(scenePaths.map(async (item) => (await fs.stat(item)).mtimeMs)); const audio = path.join(root, "tone.wav"); const subtitles = path.join(root, "captions.vtt"); await runProcess("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono", "-t", "2", audio]); await fs.writeFile(subtitles, "WEBVTT\n\n00:00:00.000 --> 00:00:01.500\nTest\n"); const composed = await renderer.compose({ requestVersion: "1", jobId: "audio-only", profile: "preview", outputDirectory: path.join(root, "audio-output"), scenePaths, audio: { path: audio, volume: .8 }, subtitles: { path: subtitles, mode: "embedded" } }); expect(composed.status).toBe("completed"); expect(composed.output?.audioCodec).toBe("aac"); expect(await Promise.all(scenePaths.map(async (item) => (await fs.stat(item)).mtimeMs))).toEqual(mtimes);
  });
});
