export const COLORS = {
  background: "#FFFFFF",
  text: "#18181B",
  muted: "#71717A",
  subtle: "#A1A1AA",
  border: "#E4E4E7",
  surface: "#F4F4F5",
  teal: "#0D9488",
  tealDark: "#0F766E",
  mint: "#CCFBF1",
  mintSoft: "#F0FDFA",
  device: "#27272A",
} as const;

export const VIDEO = { width: 1920, height: 1080, fps: 30 } as const;

// 字幕帯と左右の余白（絵コンテの「画面の基本設計」）
export const LAYOUT = { safeX: 140, telopTop: 96, telopHeight: 144 } as const;
