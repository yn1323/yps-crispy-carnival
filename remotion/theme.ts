/**
 * 紹介動画のデザイントークン。
 * 値は `src/configs/theme/tokens/colors.ts` のアプリ本体トークンと揃えている。
 */

export const VIDEO = {
  width: 1920,
  height: 1080,
  fps: 30,
  durationInFrames: 1800,
} as const;

export const COLORS = {
  bg: "#ffffff",
  surface: "#fafafa",
  ink: "#111111",
  inkSoft: "#3f3f46",
  inkMuted: "#71717a",
  line: "#e4e4e7",
  lineStrong: "#d4d4d8",
  teal: "#0d9488",
  tealBright: "#14b8a6",
  tealDeep: "#0c5d56",
  tealSoft: "#ccfbf1",
  tealTint: "#f0fdfa",
  lineBrand: "#06c755",
  amber: "#f59e0b",
  rose: "#e11d48",
} as const;

/**
 * レンダリング環境に日本語フォントが必要。
 * Noto Sans JP / ヒラギノ / 游ゴシック / メイリオ のいずれかが入っていれば崩れない。
 */
export const FONT_FAMILY = [
  "Inter",
  "-apple-system",
  "BlinkMacSystemFont",
  '"Segoe UI"',
  '"Hiragino Sans"',
  '"Hiragino Kaku Gothic ProN"',
  '"Noto Sans JP"',
  '"Yu Gothic UI"',
  '"Yu Gothic"',
  "Meiryo",
  "sans-serif",
].join(", ");

export const SHADOW = {
  card: "0 18px 40px rgba(15, 23, 42, 0.08)",
  cardActive: "0 28px 60px rgba(13, 148, 136, 0.18)",
  float: "0 24px 48px rgba(15, 23, 42, 0.14)",
} as const;

export const SITE_URL = "shiftori.app";
