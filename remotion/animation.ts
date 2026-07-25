import type { CSSProperties } from "react";
import { Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

export const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** 落ち着いた立ち上がり。テキストやカードの登場に使う。 */
export const useSpringIn = (delay = 0, durationInFrames = 26) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return spring({ frame: frame - delay, fps, durationInFrames, config: { damping: 200 } });
};

/** 少し弾む立ち上がり。バッジやアイコンなど小さい要素に使う。 */
export const useBounceIn = (delay = 0) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return spring({ frame: frame - delay, fps, config: { damping: 13, mass: 0.6, stiffness: 140 } });
};

/** start〜end フレームの間を 0→1 で進む。イージング付き。 */
export const useRange = (start: number, end: number, easing = Easing.inOut(Easing.cubic)) => {
  const frame = useCurrentFrame();

  return interpolate(frame, [start, end], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing,
  });
};

/** inAt で表示、outAt で退場するフェード値。シーン内の入れ替えに使う。 */
export const useFadeWindow = (inAt: number, outAt: number, fade = 10) => {
  const frame = useCurrentFrame();

  return interpolate(frame, [inAt, inAt + fade, outAt - fade, outAt], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
};

/** period フレーム周期の 0→1 ノコギリ波。 */
export const useLoop = (period: number, delay = 0) => {
  const frame = useCurrentFrame();

  return ((((frame - delay) % period) + period) % period) / period;
};

/** period フレーム周期でゆっくり上下する呼吸アニメーション。 */
export const useBreath = (period: number, amplitude = 1, delay = 0) => {
  const frame = useCurrentFrame();

  return Math.sin(((frame - delay) / period) * Math.PI * 2) * amplitude;
};

export const riseIn = (progress: number, distance = 32): CSSProperties => ({
  opacity: clamp01(progress),
  transform: `translateY(${(1 - clamp01(progress)) * distance}px)`,
});

export const popIn = (progress: number, from = 0.84): CSSProperties => ({
  opacity: clamp01(progress),
  transform: `scale(${from + (1 - from) * progress})`,
});

export const slideIn = (progress: number, distance = 48): CSSProperties => ({
  opacity: clamp01(progress),
  transform: `translateX(${(1 - clamp01(progress)) * distance}px)`,
});
