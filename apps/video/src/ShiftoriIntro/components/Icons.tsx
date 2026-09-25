import { useCurrentFrame } from "remotion";
import { arcPoint, EASE, fadeOut, type Point, progress } from "../motion";
import { COLORS } from "../theme";

export const MailIcon = ({ size, color = COLORS.background }: { size: number; color?: string }) => (
  <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none">
    <rect x="3" y="5.5" width="18" height="13" rx="2.5" stroke={color} strokeWidth="2" />
    <path d="M4 7 L12 13 L20 7" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const BellIcon = ({ size, color = COLORS.background }: { size: number; color?: string }) => (
  <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path d="M6 16.5 V11 a6 6 0 0 1 12 0 V16.5 L19.5 18 H4.5 Z" stroke={color} strokeWidth="2" strokeLinejoin="round" />
    <path d="M10 20.5 a2 2 0 0 0 4 0" stroke={color} strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export const CheckIcon = ({ size, color = COLORS.background }: { size: number; color?: string }) => (
  <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path d="M5 12.5 L10 17.5 L19 7.5" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** ティールの丸にチェック */
export const CheckBadge = ({ size }: { size: number }) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: "50%",
      background: COLORS.teal,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    }}
  >
    <CheckIcon size={size * 0.62} />
  </div>
);

type FlyingIconProps = {
  from: Point;
  to: Point;
  start: number;
  duration?: number;
  kind?: "mail" | "bell";
  lift?: number;
  size?: number;
};

/** 通知が端末から端末へ弧を描いて飛ぶ */
export const FlyingIcon = ({
  from,
  to,
  start,
  duration = 24,
  kind = "mail",
  lift = 160,
  size = 72,
}: FlyingIconProps) => {
  const frame = useCurrentFrame();
  if (frame < start || frame > start + duration + 6) return null;
  const point = arcPoint(progress(frame, start, duration, EASE.move), from, to, lift);
  return (
    <div
      style={{
        position: "absolute",
        left: point.x - size / 2,
        top: point.y - size / 2,
        width: size,
        height: size,
        borderRadius: "50%",
        background: COLORS.teal,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 8px 20px rgba(13, 148, 136, 0.35)",
        opacity: progress(frame, start, 4, EASE.enter) * fadeOut(frame, start + duration, 6),
      }}
    >
      {kind === "mail" ? <MailIcon size={size * 0.52} /> : <BellIcon size={size * 0.52} />}
    </div>
  );
};

/** 着信した端末が一瞬ふくらむ */
export const bumpScale = (frame: number, at: number) => {
  const t = (frame - at) / 8;
  return t >= 0 && t <= 1 ? 1 + 0.04 * Math.sin(t * Math.PI) : 1;
};
