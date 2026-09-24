import type { CSSProperties } from "react";
import { SHOP_NAME } from "../copy";
import { COLORS } from "../theme";

type NotificationCardProps = {
  title: string;
  greeting?: string;
  lines?: readonly string[];
  button?: string;
  width: number;
  compact?: boolean;
  hideShop?: boolean;
  style?: CSSProperties;
};

/** シフトリのデザインで描く通知カード。LINEの画面にもLINEの名前にも似せない */
export const NotificationCard = ({
  title,
  greeting,
  lines = [],
  button,
  width,
  compact = false,
  hideShop = false,
  style,
}: NotificationCardProps) => (
  <div
    style={{
      width,
      boxSizing: "border-box",
      background: COLORS.background,
      borderRadius: 20,
      border: `2px solid ${COLORS.border}`,
      boxShadow: "0 12px 32px rgba(24, 24, 27, 0.14)",
      padding: compact ? "12px 16px" : "18px 18px 20px",
      display: "flex",
      flexDirection: "column",
      gap: compact ? 4 : 10,
      ...style,
    }}
  >
    {hideShop ? null : <div style={{ fontSize: 14, color: COLORS.muted }}>{SHOP_NAME}</div>}
    <div
      style={{
        fontSize: compact ? 19 : 23,
        fontWeight: 700,
        color: COLORS.text,
        lineHeight: 1.3,
        whiteSpace: "pre-line",
      }}
    >
      {title}
    </div>
    {compact ? null : (
      <>
        {greeting ? <div style={{ fontSize: 17, color: COLORS.text }}>{greeting}</div> : null}
        {lines.map((line) => (
          <div key={line} style={{ fontSize: 16, color: COLORS.text, lineHeight: 1.5 }}>
            {line}
          </div>
        ))}
        {button ? (
          <div
            style={{
              marginTop: 6,
              background: COLORS.teal,
              color: COLORS.background,
              borderRadius: 12,
              padding: "13px 0",
              textAlign: "center",
              fontSize: 19,
              fontWeight: 700,
            }}
          >
            {button}
          </div>
        ) : null}
      </>
    )}
  </div>
);
