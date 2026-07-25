import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill } from "remotion";
import { COLORS, FONT_FAMILY } from "../../theme";

type Props = {
  children: ReactNode;
  tone?: "light" | "tint" | "brand";
  /** 右上のやわらかい装飾。文字量が多いシーンでは切る。 */
  decorated?: boolean;
  style?: CSSProperties;
};

const BACKGROUNDS: Record<NonNullable<Props["tone"]>, string> = {
  light: COLORS.bg,
  tint: COLORS.tealTint,
  brand: COLORS.teal,
};

export const Screen = ({ children, tone = "light", decorated = true, style }: Props) => (
  <AbsoluteFill
    style={{
      backgroundColor: BACKGROUNDS[tone],
      color: tone === "brand" ? COLORS.bg : COLORS.ink,
      fontFamily: FONT_FAMILY,
      overflow: "hidden",
      ...style,
    }}
  >
    {decorated && tone !== "brand" ? <Decoration /> : null}
    {children}
  </AbsoluteFill>
);

const Decoration = () => (
  <>
    <div
      style={{
        position: "absolute",
        top: -280,
        right: -220,
        width: 820,
        height: 820,
        borderRadius: "50%",
        background: `radial-gradient(circle, ${COLORS.tealTint} 0%, rgba(240, 253, 250, 0) 70%)`,
      }}
    />
    <div
      style={{
        position: "absolute",
        bottom: -320,
        left: -260,
        width: 760,
        height: 760,
        borderRadius: "50%",
        background: `radial-gradient(circle, ${COLORS.tealTint} 0%, rgba(240, 253, 250, 0) 70%)`,
      }}
    />
  </>
);
