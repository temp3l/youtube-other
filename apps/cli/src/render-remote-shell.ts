export function buildRemoteRenderShellScript(
  kind: "check" | "cleanup"
): string {
  if (kind === "check") {
    return [
      "set -Eeuo pipefail",
      "umask 077",
      'test "$(id -u)" -ne 0',
      "command -v ffmpeg >/dev/null",
      "command -v ffprobe >/dev/null",
      "command -v rsync >/dev/null",
      'mkdir -p "$1/jobs"',
      'chmod 700 "$1" "$1/jobs"',
      'tmpdir="$1/.remote-check-$(date +%s)-$$"',
      'mkdir -p "$tmpdir"',
      'ffmpeg -y -f lavfi -i testsrc2=duration=1:size=64x64:rate=30 -c:v libx264 -pix_fmt yuv420p "$tmpdir/test.mp4"',
      'ffprobe -v error -show_streams -show_format "$tmpdir/test.mp4" >/dev/null',
      'rm -rf "$tmpdir"',
    ].join("; ");
  }
  return [
    "set -Eeuo pipefail",
    "umask 077",
    'jobs_dir="$1/jobs"',
    'cutoff_minutes="$2"',
    'find "$jobs_dir" -mindepth 1 -maxdepth 1 -type d -mmin "+$cutoff_minutes" -exec rm -rf -- {} +',
  ].join("; ");
}

