import { Img, staticFile, useCurrentFrame } from "remotion";
import { Scene } from "../components/Scene";
import { TITLE } from "../copy";
import { EASE, progress } from "../motion";
import { COLORS } from "../theme";

const LOGO = { width: 900, height: 244, top: 318 } as const;
const CENTER = { x: 960, y: 507 } as const;

/** S0 タイトル（3秒）。0フレーム目から完成した状態で見せ、再生前のサムネイルにも使う */
export const S0Title = () => {
  const frame = useCurrentFrame();
  const drift = progress(frame, 0, 90, EASE.move);
  const leave = progress(frame, 80, 10, EASE.exit);
  const radius = 420 + 40 * drift;
  return (
    <Scene>
      <div style={{ position: "absolute", inset: 0, opacity: 1 - leave, scale: String(1 - 0.02 * leave) }}>
        <div
          style={{
            position: "absolute",
            left: CENTER.x - radius,
            top: CENTER.y - radius,
            width: radius * 2,
            height: radius * 2,
            borderRadius: "50%",
            background: COLORS.mintSoft,
          }}
        />
        <Img
          src={staticFile("textlogo.png")}
          alt=""
          style={{
            position: "absolute",
            left: CENTER.x - LOGO.width / 2,
            top: LOGO.top,
            width: LOGO.width,
            height: LOGO.height,
            scale: String(1 + 0.02 * drift),
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 610,
            textAlign: "center",
            fontSize: 64,
            fontWeight: 700,
            letterSpacing: "0.3em",
            color: COLORS.muted,
          }}
        >
          {TITLE.subtitle}
        </div>
      </div>
    </Scene>
  );
};
