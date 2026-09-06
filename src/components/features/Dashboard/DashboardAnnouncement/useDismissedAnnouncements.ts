import { useState } from "react";

export const DISMISSED_ANNOUNCEMENTS_STORAGE_KEY = "shiftori-dashboard-dismissed-announcements:v1";

export function useDismissedAnnouncements() {
  const [dismissedIds, setDismissedIds] = useState(readDismissedIds);

  const dismissAnnouncement = (id: string) => {
    // 別タブで保存された削除済みIDも残す。
    const nextIds = [...new Set([...readDismissedIds(), ...dismissedIds, id])];
    setDismissedIds(nextIds);
    try {
      window.localStorage.setItem(DISMISSED_ANNOUNCEMENTS_STORAGE_KEY, JSON.stringify(nextIds));
    } catch {
      // 保存できない環境でも、現在の画面では削除した状態を保つ。
    }
  };

  return { dismissedIds, dismissAnnouncement };
}

function readDismissedIds(): string[] {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(DISMISSED_ANNOUNCEMENTS_STORAGE_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}
