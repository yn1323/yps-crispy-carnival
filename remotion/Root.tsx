import { Composition } from "remotion";
import { PromoVideo } from "./PromoVideo";
import { VIDEO } from "./theme";

export const RemotionRoot = () => (
  <Composition
    id="PromoVideo"
    component={PromoVideo}
    durationInFrames={VIDEO.durationInFrames}
    fps={VIDEO.fps}
    width={VIDEO.width}
    height={VIDEO.height}
  />
);
