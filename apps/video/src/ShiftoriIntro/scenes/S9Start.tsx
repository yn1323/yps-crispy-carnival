import { Img, staticFile, useCurrentFrame } from "remotion";
import { Illustration } from "../components/People";
import { Scene } from "../components/Scene";
import { TELOP } from "../copy";
import { appear, popIn } from "../motion";
import { COLORS } from "../theme";

// cafe-storefront.png のうち、店が描かれている範囲
const STORE = { x: 211, y: 171, width: 1037, height: 673, sheetWidth: 1536, sheetHeight: 1024 } as const;
const STORE_VIEW = { x: 140, y: 380, width: 860 } as const;
const storeScale = STORE_VIEW.width / STORE.width;
const COLUMN_CENTER = 1440;

/** S9 2か月無料でお試しできます（5秒）。最後のフレームは再生後も残る */
export const S9Start = () => {
  const frame = useCurrentFrame();
  return (
    <Scene>
      <div
        style={{
          position: "absolute",
          left: STORE_VIEW.x,
          top: STORE_VIEW.y,
          width: STORE_VIEW.width,
          height: STORE.height * storeScale,
          overflow: "hidden",
          ...appear(frame, 0),
        }}
      >
        <Img
          src={staticFile("illustrations/cafe-storefront.png")}
          alt=""
          style={{
            position: "absolute",
            left: -STORE.x * storeScale,
            top: -STORE.y * storeScale,
            width: STORE.sheetWidth * storeScale,
            height: STORE.sheetHeight * storeScale,
            maxWidth: "none",
          }}
        />
      </div>
      <Illustration
        file="manager-relieved.png"
        x={520}
        y={440}
        width={560}
        height={560}
        style={{ ...popIn(frame, 10, 15), transformOrigin: "50% 100%" }}
      />
      <Img
        src={staticFile("textlogo.png")}
        alt=""
        style={{
          position: "absolute",
          left: COLUMN_CENTER - 280,
          top: 330,
          width: 560,
          height: 152,
          ...appear(frame, 18),
        }}
      />
      <div
        style={{
          position: "absolute",
          left: COLUMN_CENTER - 360,
          width: 720,
          top: 540,
          textAlign: "center",
          fontSize: 96,
          fontWeight: 700,
          lineHeight: 1.25,
          color: COLORS.text,
          ...appear(frame, 30),
        }}
      >
        {TELOP.trialFirst}
        <br />
        {TELOP.trialLast}
      </div>
    </Scene>
  );
};
