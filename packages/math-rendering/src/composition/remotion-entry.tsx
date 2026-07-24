import React from "react";
import { Composition, registerRoot, useCurrentFrame } from "remotion";
import {
  extractSemanticChalkSteps,
  renderSemanticChalkFrame,
} from "./semantic-chalk.js";

export interface RemotionMathScene {
  sceneId: string;
  startFrame: number;
  endFrame: number;
  svgMarkup: string;
  animation: {
    mode: "progressive-chalk-reveal";
    rendererVersion: "math-semantic-chalk.v2";
  };
  caption?: {
    text: string;
    lines: string[];
    fontSizePx: 44;
  };
}
export interface RemotionMathVideoProps extends Record<string, unknown> {
  durationInFrames: number;
  scenes: RemotionMathScene[];
}

export const MathVideo: React.FC<RemotionMathVideoProps> = ({ scenes }) => {
  const frame = useCurrentFrame();
  const scene = scenes.find(
    (candidate) => frame >= candidate.startFrame && frame < candidate.endFrame
  );
  if (!scene)
    throw new Error(`No synchronized math scene exists at frame ${frame}.`);
  const localFrame = frame - scene.startFrame;
  const sceneFrames = scene.endFrame - scene.startFrame;
  const steps = extractSemanticChalkSteps(scene.svgMarkup);
  const reveal = renderSemanticChalkFrame({
    svgMarkup: scene.svgMarkup,
    steps,
    localFrame,
    sceneFrames,
  });
  return (
    <div
      data-scene-id={scene.sceneId}
      style={{
        width: 1920,
        height: 1080,
        backgroundColor: "#102b26",
        overflow: "hidden",
      }}
    >
      <div
        data-semantic-chalk-board
        style={{
          position: "absolute",
          inset: 0,
          width: 1920,
          height: 1080,
          filter: "invert(0.9) sepia(0.18) saturate(0.75) contrast(1.08)",
        }}
        dangerouslySetInnerHTML={{ __html: reveal.svgMarkup }}
      />
      {reveal.revealing && reveal.guide && reveal.activeFactId ? (
        <svg
          data-semantic-chalk-writing
          data-active-fact-id={reveal.activeFactId}
          viewBox="0 0 1920 1080"
          style={{ position: "absolute", inset: 0, width: 1920, height: 1080 }}
        >
          <path
            d={`M ${reveal.guide.x1} ${reveal.guide.y} C ${reveal.guide.x1 + 260} ${reveal.guide.y - 10}, ${reveal.guide.x2 - 260} ${reveal.guide.y + 12}, ${reveal.guide.x2} ${reveal.guide.y}`}
            fill="none"
            stroke="#f4efd8"
            strokeWidth="9"
            strokeLinecap="round"
            pathLength="1"
            strokeDasharray="1"
            strokeDashoffset={1 - reveal.stepProgress}
            opacity={0.9}
          />
          <path
            d={`M ${reveal.guide.x1} ${reveal.guide.y + 5} Q ${(reveal.guide.x1 + reveal.guide.x2) / 2} ${reveal.guide.y - 7}, ${reveal.guide.x2} ${reveal.guide.y + 3}`}
            fill="none"
            stroke="#fffbe8"
            strokeWidth="3"
            strokeLinecap="round"
            pathLength="1"
            strokeDasharray="1"
            strokeDashoffset={1 - reveal.stepProgress}
            opacity={0.55}
          />
        </svg>
      ) : null}
      {reveal.revealing ? (
        <div
          data-chalk-tip
          style={{
            position: "absolute",
            left:
              (reveal.guide?.x1 ?? 360) +
              reveal.stepProgress *
                ((reveal.guide?.x2 ?? 1560) - (reveal.guide?.x1 ?? 360)),
            top:
              (reveal.guide?.y ?? 450) + Math.sin(localFrame * 0.41) * 4,
            width: 18,
            height: 18,
            borderRadius: 9,
            backgroundColor: "#f4efd8",
            boxShadow: "0 0 14px 7px rgba(244, 239, 216, 0.28)",
            transform: "translate(-50%, -50%)",
          }}
        />
      ) : null}
      {scene.caption ? (
        <div
          aria-label={scene.caption.text}
          style={{
            position: "absolute",
            left: 180,
            right: 180,
            bottom: 54,
            padding: "12px 24px",
            borderRadius: 16,
            backgroundColor: "rgba(7, 17, 31, 0.9)",
            color: "#ffffff",
            fontFamily: "Arial, sans-serif",
            fontSize: scene.caption.fontSizePx,
            lineHeight: 1.2,
            textAlign: "center",
          }}
        >
          {scene.caption.lines.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
      ) : null}
    </div>
  );
};

const defaultProps: RemotionMathVideoProps = {
  durationInFrames: 30,
  scenes: [
    {
      sceneId: "scene-001",
      startFrame: 0,
      endFrame: 30,
      svgMarkup:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080"><rect width="1920" height="1080" fill="#f8fafc"/></svg>',
      animation: {
        mode: "progressive-chalk-reveal",
        rendererVersion: "math-semantic-chalk.v2",
      },
    },
  ],
};

const RemotionRoot: React.FC = () => (
  <Composition
    id="MathLesson"
    component={MathVideo}
    durationInFrames={30}
    fps={30}
    width={1920}
    height={1080}
    defaultProps={defaultProps}
  />
);

registerRoot(RemotionRoot);
