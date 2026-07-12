import React from "react";
import { Composition, Img, registerRoot, useCurrentFrame } from "remotion";

export interface RemotionMathScene {
  sceneId: string;
  startFrame: number;
  endFrame: number;
  svgDataUrl: string;
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
  return (
    <div
      data-scene-id={scene.sceneId}
      style={{
        width: 1920,
        height: 1080,
        backgroundColor: "#f8fafc",
        overflow: "hidden",
      }}
    >
      <Img src={scene.svgDataUrl} style={{ width: 1920, height: 1080 }} />
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
      svgDataUrl:
        "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxOTIwIDEwODAiPjxyZWN0IHdpZHRoPSIxOTIwIiBoZWlnaHQ9IjEwODAiIGZpbGw9IiNmOGZhZmMiLz48L3N2Zz4=",
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
