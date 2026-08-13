import type { ManagerSettingsInvitation } from "./types";

export function getManagerInvitationStatusPresentation(status: ManagerSettingsInvitation["status"]): {
  label: string;
  colorPalette: "teal" | "orange" | "red";
} {
  if (status === "sendFailed") return { label: "送信エラー", colorPalette: "red" };
  if (status === "limitReached") return { label: "上限到達（現在は連携できません）", colorPalette: "orange" };
  if (status === "conflict") return { label: "競合", colorPalette: "orange" };
  return { label: "招待中", colorPalette: "teal" };
}

export function getManagerInvitationExpiryLabel(expiresAt: number): string {
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(expiresAt));
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";

  return `有効期限 ${value("year")}年${value("month")}月${value("day")}日 ${value("hour")}:${value("minute")}`;
}
