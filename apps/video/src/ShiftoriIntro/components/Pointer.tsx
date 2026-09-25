import { useCurrentFrame } from "remotion";
import { arcPoint, EASE, fadeOut, type Point, progress } from "../motion";
import { COLORS } from "../theme";

export type PathKey = Point & { frame: number };

/** キーの間を小さな弧でつなぎ、加減速して動く */
export const pathPoint = (frame: number, keys: PathKey[], lift = 60): Point => {
  const first = keys[0];
  if (frame <= first.frame) return first;
  for (let index = 1; index < keys.length; index++) {
    const from = keys[index - 1];
    const to = keys[index];
    if (frame <= to.frame) {
      const t = EASE.move((frame - from.frame) / (to.frame - from.frame));
      const distance = Math.hypot(to.x - from.x, to.y - from.y);
      return arcPoint(t, from, to, Math.min(lift, distance * 0.25));
    }
  }
  return keys[keys.length - 1];
};

const Ripple = ({ at, point }: { at: number; point: Point }) => {
  const frame = useCurrentFrame();
  if (frame < at || frame > at + 14) return null;
  const t = progress(frame, at, 12, EASE.enter);
  const radius = 48 * t;
  return (
    <div
      style={{
        position: "absolute",
        left: point.x - radius,
        top: point.y - radius,
        width: radius * 2,
        height: radius * 2,
        borderRadius: "50%",
        background: COLORS.teal,
        opacity: 0.4 * (1 - t),
      }}
    />
  );
};

type CursorProps = { keys: PathKey[]; clicks?: number[]; start: number; end?: number; size?: number };

/** PC操作のカーソル。クリックで縮んで波紋を出す */
export const Cursor = ({ keys, clicks = [], start, end = Number.POSITIVE_INFINITY, size = 1.4 }: CursorProps) => {
  const frame = useCurrentFrame();
  const point = pathPoint(frame, keys);
  const opacity = progress(frame, start, 6, EASE.enter) * fadeOut(frame, end, 6);
  const press = clicks.reduce((scale, at) => {
    const t = frame - at;
    return t >= 0 && t <= 6 ? Math.min(scale, 1 - 0.15 * Math.sin((t / 6) * Math.PI)) : scale;
  }, 1);
  return (
    <>
      {clicks.map((at) => (
        <Ripple key={at} at={at} point={pathPoint(at, keys)} />
      ))}
      <svg
        aria-hidden="true"
        width={30 * size}
        height={44 * size}
        viewBox="0 0 30 44"
        style={{
          position: "absolute",
          left: point.x,
          top: point.y,
          opacity,
          scale: String(press),
          transformOrigin: "0 0",
        }}
      >
        <path
          d="M2 2 L2 36 L11 28 L17 42 L24 39 L18 25 L29 25 Z"
          fill={COLORS.background}
          stroke={COLORS.text}
          strokeWidth={2.5}
          strokeLinejoin="round"
        />
      </svg>
    </>
  );
};

/** スマホのタップを表す半透明の円 */
export const TapMark = ({ point, at, size = 64 }: { point: Point; at: number; size?: number }) => {
  const frame = useCurrentFrame();
  if (frame < at || frame > at + 12) return null;
  const grow = progress(frame, at, 6, EASE.enter);
  return (
    <div
      style={{
        position: "absolute",
        left: point.x - size / 2,
        top: point.y - size / 2,
        width: size,
        height: size,
        borderRadius: "50%",
        background: "rgba(13, 148, 136, 0.3)",
        border: `3px solid ${COLORS.teal}`,
        scale: String(0.6 + 0.4 * grow),
        opacity: fadeOut(frame, at + 6, 6),
      }}
    />
  );
};
