import { Img, staticFile, useCurrentFrame } from "remotion";
import { Laptop, Phone } from "../components/Devices";
import { bumpScale, FlyingIcon } from "../components/Icons";
import { RecruitmentFormScreen } from "../components/PcScreens";
import { Avatar } from "../components/People";
import { LockScreen } from "../components/PhoneScreens";
import { Scene } from "../components/Scene";
import { TELOP } from "../copy";
import { PC_MAIN, PHONE_MAIN } from "../layout";
import { appear, EASE, fadeOut, popIn, progress } from "../motion";
import { COLORS } from "../theme";

const PC_SMALL = { x: 300, y: 520, scale: 0.5 } as const;
const PHONE_SMALL = { x: 1300, y: 470, scale: 0.62 } as const;
const ARC = { from: { x: 840, y: 560 }, to: { x: 1290, y: 520 }, lift: 230 } as const;

const lerp = (from: number, to: number, t: number) => from + (to - from) * t;

/** S2 その連絡を、シフトリが届けます（6秒） */
export const S2Intro = () => {
  const frame = useCurrentFrame();
  // 顔アイコンはpopで現れ、150から消える
  const avatarStyle = (at: number) => {
    const pop = popIn(frame, at, 14);
    return { ...pop, opacity: Number(pop.opacity) * fadeOut(frame, 150, 8) };
  };
  const rise = progress(frame, 20, 24, EASE.move);
  const logoPop = popIn(frame, 0, 18);
  const settle = progress(frame, 156, 24, EASE.move);
  const pcIn = progress(frame, 60, 24, EASE.enter);
  const phoneIn = progress(frame, 64, 24, EASE.enter);
  const pc = {
    x: lerp(PC_SMALL.x, PC_MAIN.x, settle),
    y: lerp(PC_SMALL.y, PC_MAIN.y, settle),
    scale: lerp(PC_SMALL.scale, PC_MAIN.scale, settle),
  };
  const phone = {
    x: lerp(PHONE_SMALL.x, PHONE_MAIN.x, settle),
    y: lerp(PHONE_SMALL.y, PHONE_MAIN.y, settle),
    scale: lerp(PHONE_SMALL.scale, PHONE_MAIN.scale, settle) * bumpScale(frame, 128) * bumpScale(frame, 152),
  };
  const controlX = (ARC.from.x + ARC.to.x) / 2;
  const controlY = Math.min(ARC.from.y, ARC.to.y) - ARC.lift;
  return (
    <Scene>
      <Laptop x={pc.x} y={pc.y} scale={pc.scale} style={{ opacity: pcIn, translate: `${(1 - pcIn) * -120}px 0px` }}>
        <RecruitmentFormScreen />
      </Laptop>
      <Phone
        x={phone.x}
        y={phone.y}
        scale={phone.scale}
        style={{ opacity: phoneIn, translate: `${(1 - phoneIn) * 120}px 0px` }}
      >
        <LockScreen />
      </Phone>
      <svg
        aria-hidden="true"
        width={1920}
        height={1080}
        style={{
          position: "absolute",
          inset: 0,
          opacity: progress(frame, 90, 20, EASE.enter) * fadeOut(frame, 150, 8),
        }}
      >
        <path
          d={`M ${ARC.from.x} ${ARC.from.y} Q ${controlX} ${controlY} ${ARC.to.x} ${ARC.to.y}`}
          fill="none"
          stroke={COLORS.teal}
          strokeWidth={5}
          strokeDasharray="14 14"
          strokeDashoffset={-frame * 1.5}
          strokeLinecap="round"
        />
      </svg>
      <FlyingIcon from={ARC.from} to={ARC.to} start={100} duration={28} lift={ARC.lift} />
      <FlyingIcon from={ARC.from} to={ARC.to} start={124} duration={28} lift={ARC.lift} />
      <Avatar person="manager" size={150} style={{ position: "absolute", left: 230, top: 800, ...avatarStyle(70) }} />
      <Avatar person="saki" size={150} style={{ position: "absolute", left: 1560, top: 820, ...avatarStyle(76) }} />
      <Img
        src={staticFile("textlogo.png")}
        alt=""
        style={{
          position: "absolute",
          left: 960 - 320,
          top: lerp(540, 190, rise) - 87,
          width: 640,
          height: 173,
          opacity: Number(logoPop.opacity) * fadeOut(frame, 160, 8),
          scale: String(Number(logoPop.scale) * (1 - 0.2 * rise)),
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 300,
          textAlign: "center",
          fontSize: 96,
          fontWeight: 700,
          color: COLORS.text,
          ...appear(frame, 24, 160),
        }}
      >
        {TELOP.intro}
      </div>
    </Scene>
  );
};
