import { describe, expect, it } from "vitest";
import { inspectCapabilities } from "../../src/infrastructure/media.js";
import type { ProcessResult } from "../../src/infrastructure/process.js";

const probe = JSON.stringify({ streams: [{ codec_type: "video", codec_name: "h264", width: 64, height: 64, pix_fmt: "yuv420p", r_frame_rate: "10/1", duration: "0.2" }], format: { duration: "0.2", size: "1" } });
const result = (executable: string, args: readonly string[], stdout = "", exitCode = 0): ProcessResult => ({ executable, args, startedAt: "2026-01-01T00:00:00.000Z", completedAt: "2026-01-01T00:00:00.001Z", durationMs: 1, exitCode, stdout, stderr: "", timedOut: false });

describe("capability self-tests", () => {
  it("marks a real software encode as available but leaves optional encoders unavailable without devices", async () => {
    const capabilities = await inspectCapabilities(process.cwd(), { driDevices: async () => [], temporaryDirectory: async () => "/tmp/capability-test", removeTemporaryDirectory: async () => undefined, run: async (executable, args) => executable === "ffmpeg" && args.includes("-encoders") ? result(executable, args, " libx264\n h264_vaapi\n h264_qsv") : executable === "ffprobe" ? result(executable, args, probe) : result(executable, args, "ffmpeg version test") });
    expect(capabilities.encoders.libx264.status).toBe("available");
    expect(capabilities.encoders.h264_vaapi).toMatchObject({ status: "unavailable" });
    expect(capabilities.encoders.h264_qsv).toMatchObject({ status: "unavailable" });
  });
  it("does not treat a hardware listing as usable when its encode self-test fails", async () => {
    const capabilities = await inspectCapabilities(process.cwd(), { driDevices: async () => ["/dev/dri/renderD128"], temporaryDirectory: async () => "/tmp/capability-test", removeTemporaryDirectory: async () => undefined, run: async (executable, args) => executable === "ffmpeg" && args.includes("-encoders") ? result(executable, args, " libx264\n h264_vaapi") : executable === "ffmpeg" && args.includes("h264_vaapi") ? result(executable, args, "", 1) : executable === "ffprobe" ? result(executable, args, probe) : result(executable, args, "ffmpeg version test") });
    expect(capabilities.encoders.h264_vaapi.status).toBe("failed-self-test");
    expect(JSON.parse(JSON.stringify(capabilities)).encoders.h264_vaapi.status).toBe("failed-self-test");
  });
});
