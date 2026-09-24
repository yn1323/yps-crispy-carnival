import type { CSSProperties } from "react";
import { Easing, interpolate } from "remotion";

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// 絵コンテの「動きの共通ルール」
export const EASE = {
  enter: Easing.bezier(0.16, 1, 0.3, 1),
  exit: Easing.bezier(0.7, 0, 0.84, 0),
  move: Easing.bezier(0.65, 0, 0.35, 1),
  pop: Easing.spring({ damping: 12 }),
} as const;

/** startが無限大（退場しない要素）の場合は0を返す */
export const progress = (frame: number, start: number, duration: number, easing = EASE.move) =>
  Number.isFinite(start) ? interpolate(frame, [start, start + duration], [0, 1], { ...CLAMP, easing }) : 0;

/** enter（12f）で現れ、endからexit（8f）で消える */
export const appear = (frame: number, start: number, end = Number.POSITIVE_INFINITY): CSSProperties => {
  const shown = progress(frame, start, 12, EASE.enter);
  const hidden = progress(frame, end, 8, EASE.exit);
  return { opacity: shown * (1 - hidden), translate: `0px ${(1 - shown) * 24}px` };
};

/** pop（scale 0.6→1、ばねの行き過ぎあり） */
export const popIn = (frame: number, start: number, duration = 14): CSSProperties => ({
  opacity: progress(frame, start, 6, EASE.enter),
  scale: String(0.6 + 0.4 * progress(frame, start, duration, EASE.pop)),
});

export const fadeOut = (frame: number, start: number, duration = 8) => 1 - progress(frame, start, duration, EASE.exit);

export type Point = { x: number; y: number };

/** fromからtoへ、上にふくらむ弧の上の点 */
export const arcPoint = (t: number, from: Point, to: Point, lift = 160): Point => {
  const control = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - lift };
  const u = 1 - t;
  return {
    x: u * u * from.x + 2 * u * t * control.x + t * t * to.x,
    y: u * u * from.y + 2 * u * t * control.y + t * t * to.y,
  };
};

export type CameraKey = { frame: number; scale: number; x: number; y: number };

/** ステージ座標の(x, y)を画面中央に置き、scale倍で見せる */
export const cameraStyle = (frame: number, keys: CameraKey[]): CSSProperties => {
  const frames = keys.map((key) => key.frame);
  const options = { ...CLAMP, easing: EASE.move };
  const scale = interpolate(
    frame,
    frames,
    keys.map((key) => key.scale),
    options,
  );
  const x = interpolate(
    frame,
    frames,
    keys.map((key) => key.x),
    options,
  );
  const y = interpolate(
    frame,
    frames,
    keys.map((key) => key.y),
    options,
  );
  return {
    position: "absolute",
    inset: 0,
    transformOrigin: "0 0",
    transform: `translate(${960 - x * scale}px, ${540 - y * scale}px) scale(${scale})`,
  };
};

export const FULL_VIEW: Omit<CameraKey, "frame"> = { scale: 1, x: 960, y: 540 };
