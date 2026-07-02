import { describe, expect, it } from "vitest";
import {
  buildFilter,
  buildFilterChain,
  buildFilterComplex,
  buildSceneClipFilterGraph,
  escapeDrawTextValue,
  formatNumber,
  resolveNormalizedCrop,
  zoomPanFrameCount,
  type VideoFilterOperation,
} from "./index.js";

describe("FFmpeg filter builders", () => {
  it("serializes deterministic chains independent of object property order", () => {
    const first: VideoFilterOperation = {
      kind: "scale",
      mode: "contain",
      widthPx: 1920,
      heightPx: 1080,
    };
    const second: VideoFilterOperation = {
      heightPx: 1080,
      widthPx: 1920,
      mode: "contain",
      kind: "scale",
    };

    expect(buildFilter(first)).toBe(buildFilter(second));
    expect(formatNumber(1.230000)).toBe("1.23");
    expect(
      buildFilterChain([
        first,
        {
          kind: "pad",
          widthPx: 1920,
          heightPx: 1080,
          x: "center",
          y: "center",
        },
        { kind: "format", pixelFormat: "yuv420p" },
      ])
    ).toBe(
      "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,format=yuv420p"
    );
  });

  it("builds scale and crop operations for common aspect-ratio cases", () => {
    expect(
      buildFilter({ kind: "scale", mode: "cover", widthPx: 1080, heightPx: 1920 })
    ).toBe("scale=1080:1920:force_original_aspect_ratio=increase");
    expect(
      buildFilter({
        kind: "scale",
        mode: "explicit",
        widthPx: 1919,
        heightPx: 1079,
        forceEven: true,
      })
    ).toBe("scale=trunc(1919/2)*2:trunc(1079/2)*2");
    expect(
      buildFilter({
        kind: "crop",
        widthPx: 500,
        heightPx: 500,
        position: { mode: "center" },
      })
    ).toBe("crop=500:500");
    expect(
      buildFilter({
        kind: "crop",
        widthPx: 200,
        heightPx: 300,
        inputWidthPx: 1000,
        inputHeightPx: 800,
        position: { mode: "explicit", xPx: 800, yPx: 500 },
      })
    ).toBe("crop=200:300:800:500");
    expect(
      resolveNormalizedCrop({
        crop: { x: 0.1, y: 0.2, width: 0.5, height: 0.25 },
        inputWidthPx: 1000,
        inputHeightPx: 800,
      })
    ).toEqual({ x: 100, y: 160, width: 500, height: 200 });
  });

  it("rejects invalid dimensions and crop bounds", () => {
    expect(() =>
      buildFilter({ kind: "scale", mode: "contain", widthPx: 0, heightPx: 1080 })
    ).toThrow(/scale\.widthPx/u);
    expect(() =>
      buildFilter({
        kind: "crop",
        widthPx: 300,
        heightPx: 300,
        inputWidthPx: 500,
        inputHeightPx: 500,
        position: { mode: "explicit", xPx: 250, yPx: 250 },
      })
    ).toThrow(/crop\.position/u);
  });

  it("builds bounded zoompan expressions and deterministic frame counts", () => {
    expect(zoomPanFrameCount({ durationSeconds: 2, fps: 29.97 })).toBe(60);
    const slowPush = buildFilter({
      kind: "zoompan",
      durationSeconds: 3,
      fps: 30,
      outputWidthPx: 1920,
      outputHeightPx: 1080,
      startZoom: 1,
      endZoom: 1.08,
      startCenter: { x: 0.5, y: 0.5 },
      endCenter: { x: 0.5, y: 0.5 },
    });
    expect(slowPush).toContain("d=90:s=1920x1080:fps=30");
    expect(slowPush).toContain("max(0,min(iw-iw/zoom");
    expect(
      buildFilter({
        kind: "zoompan",
        durationSeconds: 1,
        fps: 24,
        outputWidthPx: 1080,
        outputHeightPx: 1920,
        startZoom: 1.12,
        endZoom: 1,
        startCenter: { x: 0.2, y: 0.5 },
        endCenter: { x: 0.8, y: 0.5 },
      })
    ).toContain("(-0.12)*on/23");
    expect(() =>
      buildFilter({
        kind: "zoompan",
        durationSeconds: 0,
        fps: 30,
        outputWidthPx: 1920,
        outputHeightPx: 1080,
        startZoom: 1,
        endZoom: 1.1,
        startCenter: { x: 0.5, y: 0.5 },
        endCenter: { x: 0.5, y: 0.5 },
      })
    ).toThrow(/zoompan\.durationSeconds/u);
  });

  it("serializes supported effects and rejects invalid ranges", () => {
    expect(buildFilter({ kind: "boxblur", radius: 12, power: 2 })).toBe(
      "boxblur=12:2"
    );
    expect(
      buildFilter({
        kind: "eq",
        brightness: 0.12,
        contrast: 1.1,
        saturation: 0.9,
        gamma: 1.02,
      })
    ).toBe("eq=brightness=0.12:contrast=1.1:saturation=0.9:gamma=1.02");
    expect(buildFilter({ kind: "noise", strength: 0.04 })).toBe(
      "noise=alls=4:allf=u"
    );
    expect(buildFilter({ kind: "vignette", angle: 0.7 })).toBe(
      "vignette=angle=0.7"
    );
    expect(
      buildFilter({
        kind: "fade",
        direction: "in",
        startSeconds: 0,
        durationSeconds: 0.25,
        color: "black",
      })
    ).toBe("fade=t=in:st=0:d=0.25:color=black");
    expect(
      buildFilter({
        kind: "rotate",
        angleDegrees: -1,
        expandOutput: true,
        fillColor: "black",
      })
    ).toBe("rotate=-1*PI/180:ow=rotw(iw):oh=roth(ih):fillcolor=black");
    expect(buildFilter({ kind: "format", pixelFormat: "yuv420p" })).toBe(
      "format=yuv420p"
    );
    expect(() => buildFilter({ kind: "noise", strength: 1.2 })).toThrow(
      /noise\.strength/u
    );
    expect(() => buildFilter({ kind: "rotate", angleDegrees: 90 })).toThrow(
      /rotate\.angleDegrees/u
    );
  });

  it("escapes hostile drawtext values as one filter argument", () => {
    const hostile = "apostrophe:' colon:, comma, semicolon; backslash\\ [x]\n% [x];movie=evil";
    const escaped = escapeDrawTextValue(hostile);
    expect(escaped).toContain("\\'");
    expect(escaped).toContain("\\:");
    expect(escaped).toContain("\\,");
    expect(escaped).toContain("\\\\");
    expect(escaped).toContain("\\[x\\]");
    expect(escaped).toContain("\\n");
    expect(escaped).toContain("\\%");

    const filter = buildFilter({
      kind: "drawtext",
      text: hostile,
      xPx: 20,
      yPx: 40,
      fontSizePx: 36,
      fontColor: "white",
      fontFile: "/tmp/font dir/Font's:Name.ttf",
      box: { color: "black", opacity: 0.6, borderWidthPx: 8 },
      startSeconds: 1,
      endSeconds: 2.5,
    });
    expect(filter).toContain("drawtext=text='");
    expect(filter).toContain("fontfile='/tmp/font dir/Font\\'s\\:Name.ttf'");
    expect(filter).toContain("enable='between(t,1,2.5)'");
  });

  it("builds overlay graphs with deterministic labels and rejects unsafe labels", () => {
    expect(
      buildFilterComplex({
        inputLabels: ["base", "logo"],
        nodes: [
          {
            inputLabels: ["base", "logo"],
            outputLabel: "with_logo",
            operation: {
              kind: "overlay",
              xPx: 24,
              yPx: 48,
              startSeconds: 1,
              endSeconds: 3,
              opacity: 0.5,
              assetPath: "/tmp/local path/logo's,[]%.png",
            },
          },
          {
            inputLabels: ["with_logo"],
            outputLabel: "out",
            operation: { kind: "format", pixelFormat: "yuv420p" },
          },
        ],
        outputLabels: ["out"],
      })
    ).toBe(
      "[base][logo]overlay=x=24:y=48:enable='between(t,1,3)'[with_logo];[with_logo]format=yuv420p[out]"
    );
    expect(() =>
      buildFilterComplex({
        inputLabels: ["base"],
        nodes: [
          {
            inputLabels: ["missing"],
            outputLabel: "out",
            operation: { kind: "format", pixelFormat: "yuv420p" },
          },
        ],
      })
    ).toThrow(/format\.inputLabels/u);
    expect(() =>
      buildFilterComplex({
        inputLabels: ["base"],
        nodes: [
          {
            inputLabels: ["base"],
            outputLabel: "bad[label]",
            operation: { kind: "format", pixelFormat: "yuv420p" },
          },
        ],
      })
    ).toThrow(/graph\.streamLabel/u);
    expect(() =>
      buildFilter({
        kind: "overlay",
        xPx: 0,
        yPx: 0,
        assetPath: "https://example.com/logo.png",
      })
    ).toThrow(/overlay\.assetPath/u);
    expect(() =>
      buildFilterComplex({
        inputLabels: ["base"],
        nodes: [
          {
            inputLabels: ["base"],
            outputLabel: "dup",
            operation: { kind: "format", pixelFormat: "yuv420p" },
          },
          {
            inputLabels: ["base"],
            outputLabel: "dup",
            operation: { kind: "format", pixelFormat: "yuv420p" },
          },
        ],
      })
    ).toThrow(/format\.outputLabel/u);
  });

  it("builds constrained crossfades and timestamp adjustments", () => {
    expect(
      buildFilterComplex({
        inputLabels: ["a", "b"],
        nodes: [
          {
            inputLabels: ["a", "b"],
            outputLabel: "xf",
            operation: {
              kind: "xfade",
              transition: "dissolve",
              durationSeconds: 0.25,
              offsetSeconds: 2,
              firstClipDurationSeconds: 3,
            },
          },
        ],
      })
    ).toBe("[a][b]xfade=transition=dissolve:duration=0.25:offset=2[xf]");
    expect(buildFilter({ kind: "setpts", mode: "reset" })).toBe(
      "setpts=PTS-STARTPTS"
    );
    expect(buildFilter({ kind: "setpts", mode: "offset", offsetSeconds: 1.5 })).toBe(
      "setpts=PTS-STARTPTS+1.5/TB"
    );
    expect(() =>
      buildFilter({
        kind: "xfade",
        transition: "bad" as "fade",
        durationSeconds: 0.25,
        offsetSeconds: 0,
      })
    ).toThrow(/xfade\.transition/u);
    expect(() =>
      buildFilter({
        kind: "xfade",
        transition: "fade",
        durationSeconds: 0.25,
        offsetSeconds: -1,
      })
    ).toThrow(/xfade\.offsetSeconds/u);
  });

  it("preserves scene-rendering filter graph compatibility", () => {
    expect(buildSceneClipFilterGraph(1080, 1920)).toBe(
      "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,format=yuv420p"
    );
    expect(buildSceneClipFilterGraph(1920, 1080)).toBe(
      "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,format=yuv420p"
    );
    expect(buildSceneClipFilterGraph(1920, 1080, "/tmp/captions:en.srt")).toBe(
      "subtitles=/tmp/captions\\:en.srt,scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,format=yuv420p"
    );
  });
});
