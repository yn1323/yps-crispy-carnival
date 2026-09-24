import type { ReactNode } from "react";
import { AbsoluteFill } from "remotion";
import { fontFamily } from "../fonts";
import { COLORS } from "../theme";

export const Scene = ({ children }: { children: ReactNode }) => (
  <AbsoluteFill style={{ background: COLORS.background, color: COLORS.text, fontFamily, overflow: "hidden" }}>
    {children}
  </AbsoluteFill>
);
