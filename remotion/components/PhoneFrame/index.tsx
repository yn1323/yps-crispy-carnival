import type { ReactNode } from "react";
import { COLORS, SHADOW } from "../../theme";

type Props = {
  children: ReactNode;
  width?: number;
};

/** スマホ画面の記号。中身はシーンごとに差し替える。 */
export const PhoneFrame = ({ children, width = 440 }: Props) => {
  const height = Math.round((width * 19.5) / 9);

  return (
    <div
      style={{
        position: "relative",
        width,
        height,
        borderRadius: 54,
        padding: 14,
        backgroundColor: COLORS.ink,
        boxShadow: SHADOW.float,
      }}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          borderRadius: 42,
          backgroundColor: COLORS.surface,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 14,
            left: "50%",
            transform: "translateX(-50%)",
            width: 128,
            height: 26,
            borderRadius: 999,
            backgroundColor: COLORS.ink,
            zIndex: 2,
          }}
        />
        {children}
      </div>
    </div>
  );
};
