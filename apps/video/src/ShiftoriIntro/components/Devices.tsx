import type { CSSProperties, ReactNode } from "react";
import { Img, staticFile } from "remotion";
import { SHOP_NAME } from "../copy";
import type { Point } from "../motion";
import { COLORS } from "../theme";

type DeviceProps = { x: number; y: number; scale?: number; children: ReactNode; style?: CSSProperties };

export const LAPTOP = { screenWidth: 1000, screenHeight: 625, bezel: 20 } as const;
export const PHONE = { width: 340, height: 700, bezel: 12 } as const;

/** 端末内の座標を、ステージ上の座標へ変換する */
export const screenToStage = (device: { x: number; y: number; scale?: number }, bezel: number, point: Point): Point => {
  const scale = device.scale ?? 1;
  return { x: device.x + (bezel + point.x) * scale, y: device.y + (bezel + point.y) * scale };
};

export const Laptop = ({ x, y, scale = 1, children, style }: DeviceProps) => (
  <div style={{ position: "absolute", left: x, top: y, transformOrigin: "0 0", scale: String(scale), ...style }}>
    <div
      style={{
        width: LAPTOP.screenWidth + LAPTOP.bezel * 2,
        padding: LAPTOP.bezel,
        background: COLORS.device,
        borderRadius: "28px 28px 8px 8px",
      }}
    >
      <div
        style={{
          position: "relative",
          width: LAPTOP.screenWidth,
          height: LAPTOP.screenHeight,
          background: COLORS.background,
          borderRadius: 6,
          overflow: "hidden",
        }}
      >
        {children}
      </div>
    </div>
    <div
      style={{
        width: LAPTOP.screenWidth + LAPTOP.bezel * 2 + 120,
        height: 28,
        marginLeft: -60,
        background: "#D4D4D8",
        borderRadius: "0 0 24px 24px",
      }}
    />
  </div>
);

export const Phone = ({ x, y, scale = 1, children, style }: DeviceProps) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      width: PHONE.width,
      height: PHONE.height,
      padding: PHONE.bezel,
      transformOrigin: "0 0",
      scale: String(scale),
      background: COLORS.device,
      borderRadius: 52,
      boxShadow: "0 24px 60px rgba(24, 24, 27, 0.14)",
      ...style,
    }}
  >
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        borderRadius: 42,
        overflow: "hidden",
        background: COLORS.background,
      }}
    >
      {children}
      <div
        style={{
          position: "absolute",
          top: 10,
          left: "50%",
          width: 96,
          height: 26,
          marginLeft: -48,
          borderRadius: 13,
          background: COLORS.device,
        }}
      />
    </div>
  </div>
);

/** PC画面の上部に出すシフトリのバー */
export const AppBar = () => (
  <div
    style={{
      height: 64,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0 28px",
      borderBottom: `2px solid ${COLORS.border}`,
    }}
  >
    <Img src={staticFile("textlogo.png")} alt="" style={{ height: 30 }} />
    <div style={{ fontSize: 18, color: COLORS.muted }}>{SHOP_NAME}</div>
  </div>
);
