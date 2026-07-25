import type { CSSProperties, ReactNode } from "react";
import { COLORS, SHADOW } from "../../theme";

type Props = {
  children: ReactNode;
  /** active の間だけ枠と影を強調して、視線の順番をつくる */
  active?: boolean;
  dimmed?: boolean;
  padding?: number;
  style?: CSSProperties;
};

export const Card = ({ children, active = false, dimmed = false, padding = 44, style }: Props) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      padding,
      borderRadius: 32,
      backgroundColor: COLORS.bg,
      border: `2px solid ${active ? COLORS.tealSoft : COLORS.line}`,
      boxShadow: active ? SHADOW.cardActive : SHADOW.card,
      opacity: dimmed ? 0.42 : 1,
      transform: `scale(${active ? 1 : 0.97})`,
      ...style,
    }}
  >
    {children}
  </div>
);
