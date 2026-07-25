import { COLORS } from "../../theme";

type Props = {
  text: string;
  /** line: LINE想定の緑吹き出し / plain: メモや口頭のグレー吹き出し */
  tone?: "line" | "plain";
  /** 吹き出しのしっぽの向き */
  tail?: "left" | "right";
  width?: number;
};

export const ChatBubble = ({ text, tone = "plain", tail = "left", width = 420 }: Props) => {
  const isLine = tone === "line";

  return (
    <div style={{ position: "relative", width, filter: "drop-shadow(0 12px 22px rgba(15, 23, 42, 0.10))" }}>
      <div
        style={{
          padding: "22px 28px",
          borderRadius: 26,
          backgroundColor: isLine ? COLORS.lineBrand : COLORS.bg,
          border: isLine ? "none" : `2px solid ${COLORS.line}`,
          color: isLine ? COLORS.bg : COLORS.inkSoft,
          fontSize: 30,
          fontWeight: 600,
          lineHeight: 1.45,
        }}
      >
        {text}
      </div>
      <div
        style={{
          position: "absolute",
          bottom: -12,
          left: tail === "left" ? 36 : undefined,
          right: tail === "right" ? 36 : undefined,
          width: 26,
          height: 26,
          transform: "rotate(45deg)",
          backgroundColor: isLine ? COLORS.lineBrand : COLORS.bg,
          borderRight: isLine ? "none" : `2px solid ${COLORS.line}`,
          borderBottom: isLine ? "none" : `2px solid ${COLORS.line}`,
          borderRadius: 4,
        }}
      />
    </div>
  );
};
