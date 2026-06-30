import { describe, expect, it } from "vitest";
import { buildRemoteRenderShellScript } from "./render-remote-shell.js";

describe("remote render shell scripts", () => {
  it("expands the cleanup cutoff via shell variables", () => {
    const script = buildRemoteRenderShellScript("cleanup");
    expect(script).toContain('cutoff_minutes="$2"');
    expect(script).toContain('find "$jobs_dir" -mindepth 1 -maxdepth 1 -type d -mmin "+$cutoff_minutes" -exec rm -rf -- {} +');
  });

  it("keeps the check script intact", () => {
    const script = buildRemoteRenderShellScript("check");
    expect(script).toContain('command -v ffmpeg >/dev/null');
    expect(script).toContain('mkdir -p "$1/jobs"');
  });
});

