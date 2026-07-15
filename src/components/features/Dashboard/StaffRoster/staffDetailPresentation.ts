import type { Staff } from "../types";

export type StaffLineStatus = {
  label: string;
  description: string;
  colorPalette: "green" | "orange" | "gray";
  tone: "brand" | "muted";
};

export function getStaffLineStatus(staff: Staff): StaffLineStatus {
  if (staff.isLineLinked && staff.isLineFollowing) {
    return {
      label: "LINE連携済み",
      description: "シフトのお知らせはLINEで送ります。",
      colorPalette: "green",
      tone: "brand",
    };
  }

  if (staff.isLineLinked && !staff.isLineFollowing) {
    return {
      label: "LINEで受け取れません",
      description:
        "LINE連携されていますが、友だち追加を解除している可能性があります。シフトのお知らせはメールで送ります。",
      colorPalette: "orange",
      tone: "muted",
    };
  }

  return {
    label: "LINE未連携",
    description: "LINE未連携です。シフトのお知らせはメールで送ります。",
    colorPalette: "gray",
    tone: "muted",
  };
}
