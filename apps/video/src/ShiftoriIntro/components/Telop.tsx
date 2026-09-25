import type { CSSProperties } from "react";
import { useCurrentFrame } from "remotion";
import { appear } from "../motion";
import { COLORS, LAYOUT } from "../theme";

type TelopProps = { text: string; start: number; end?: number; step?: number };

/** 画面上部の字幕帯。stepがあれば番号バッジを付ける */
export const Telop = ({ text, start, end, step }: TelopProps) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: LAYOUT.telopTop,
        height: LAYOUT.telopHeight,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 28,
        zIndex: 1,
        isolation: "isolate",
        ...appear(frame, start, end),
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: -LAYOUT.telopTop,
          height: LAYOUT.telopTop + LAYOUT.telopHeight + 40,
          background: `linear-gradient(180deg, ${COLORS.background} 82%, rgba(255, 255, 255, 0) 100%)`,
          zIndex: -1,
        }}
      />
      {step ? <StepBadge number={step} /> : null}
      <div style={{ fontSize: 96, fontWeight: 700, color: COLORS.text, lineHeight: 1.2, whiteSpace: "nowrap" }}>
        {text}
      </div>
    </div>
  );
};

export const StepBadge = ({ number, size = 104 }: { number: number; size?: number }) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: "50%",
      background: COLORS.teal,
      color: COLORS.background,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: size * 0.6,
      fontWeight: 700,
      flexShrink: 0,
    }}
  >
    {number}
  </div>
);

export const Chip = ({ text, style }: { text: string; style?: CSSProperties }) => (
  <div
    style={{
      padding: "10px 32px",
      borderRadius: 999,
      border: `4px solid ${COLORS.teal}`,
      background: COLORS.background,
      fontSize: 72,
      fontWeight: 700,
      color: COLORS.text,
      lineHeight: 1.2,
      whiteSpace: "nowrap",
      ...style,
    }}
  >
    {text}
  </div>
);
