import { useCurrentFrame } from "remotion";
import { MailIcon } from "../components/Icons";
import { Illustration } from "../components/People";
import { Scene } from "../components/Scene";
import { StepBadge, Telop } from "../components/Telop";
import { STEP_LABELS, TELOP } from "../copy";
import { appear, EASE, fadeOut, popIn, progress } from "../motion";
import { COLORS } from "../theme";

const LOOP = { x: 1300, y: 600, rx: 560, ry: 250 } as const;

/** S7 毎月の作業をかんたんに（4秒） */
export const S7OnlyThree = () => {
  const frame = useCurrentFrame();
  const leave = fadeOut(frame, 112, 8);
  const loopOpacity = progress(frame, 30, 20, EASE.enter) * leave;
  return (
    <Scene>
      <svg
        aria-hidden="true"
        width={1920}
        height={1080}
        style={{ position: "absolute", inset: 0, opacity: loopOpacity * 0.6 }}
      >
        <ellipse
          cx={LOOP.x}
          cy={LOOP.y}
          rx={LOOP.rx}
          ry={LOOP.ry}
          fill="none"
          stroke={COLORS.teal}
          strokeWidth={5}
          strokeDasharray="14 14"
          strokeDashoffset={-frame * 1.5}
        />
      </svg>
      {[0, 1, 2].map((order) => {
        const angle = (frame - 40) * 0.045 + (order * Math.PI * 2) / 3;
        return (
          <div
            key={order}
            style={{
              position: "absolute",
              left: LOOP.x + LOOP.rx * Math.cos(angle) - 30,
              top: LOOP.y + LOOP.ry * Math.sin(angle) - 30,
              width: 60,
              height: 60,
              borderRadius: "50%",
              background: COLORS.teal,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: progress(frame, 40, 10, EASE.enter) * leave,
            }}
          >
            <MailIcon size={32} />
          </div>
        );
      })}
      <Illustration
        file="manager-ok.png"
        x={150}
        y={330}
        width={620}
        height={620}
        style={{
          ...popIn(frame, 20, 15),
          opacity: Number(popIn(frame, 20, 15).opacity) * leave,
          transformOrigin: "50% 100%",
        }}
      />
      {STEP_LABELS.map((label, index) => (
        <div
          key={label}
          style={{
            position: "absolute",
            left: 820 + index * 330,
            top: 440,
            width: 300,
            height: 320,
            borderRadius: 28,
            background: COLORS.background,
            border: `3px solid ${COLORS.border}`,
            boxShadow: "0 16px 40px rgba(24, 24, 27, 0.08)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 28,
            ...appear(frame, 6 + index * 8, 112),
          }}
        >
          <StepBadge number={index + 1} size={96} />
          <div style={{ fontSize: 60, fontWeight: 700, color: COLORS.text }}>{label}</div>
        </div>
      ))}
      <Telop text={TELOP.easier} start={0} end={112} />
    </Scene>
  );
};
