import { LAPTOP, PHONE, screenToStage } from "./components/Devices";
import type { Point } from "./motion";

// S3〜S6で使う、ステージ上のPCとスマホの位置
export const PC_MAIN = { x: 160, y: 330, scale: 1 } as const;
export const PHONE_MAIN = { x: 1420, y: 300, scale: 1 } as const;

export const pcPoint = (point: Point, device: { x: number; y: number; scale?: number } = PC_MAIN) =>
  screenToStage(device, LAPTOP.bezel, point);

export const phonePoint = (point: Point, device: { x: number; y: number; scale?: number } = PHONE_MAIN) =>
  screenToStage(device, PHONE.bezel, point);
