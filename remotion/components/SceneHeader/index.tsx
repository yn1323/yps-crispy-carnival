import type { ReactNode } from "react";
import { riseIn, useSpringIn } from "../../animation";
import { COLORS } from "../../theme";

type Props = {
  eyebrow?: ReactNode;
  eyebrowIcon?: ReactNode;
  title: ReactNode;
  delay?: number;
  align?: "center" | "start";
};

export const SceneHeader = ({ eyebrow, eyebrowIcon, title, delay = 0, align = "center" }: Props) => {
  const eyebrowIn = useSpringIn(delay);
  const titleIn = useSpringIn(delay + 6);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: align === "center" ? "center" : "flex-start",
        gap: 24,
        textAlign: align === "center" ? "center" : "left",
      }}
    >
      {eyebrow ? (
        <div
          style={{
            ...riseIn(eyebrowIn, 16),
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 26px",
            borderRadius: 999,
            backgroundColor: COLORS.tealTint,
            color: COLORS.teal,
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: "0.02em",
          }}
        >
          {eyebrowIcon}
          {eyebrow}
        </div>
      ) : null}

      <h1
        style={{
          ...riseIn(titleIn, 26),
          margin: 0,
          fontSize: 76,
          fontWeight: 800,
          lineHeight: 1.28,
          letterSpacing: "0.005em",
        }}
      >
        {title}
      </h1>
    </div>
  );
};

export const Accent = ({ children }: { children: ReactNode }) => <span style={{ color: COLORS.teal }}>{children}</span>;
