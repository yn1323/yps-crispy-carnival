import type { StaffingEntry } from "../types";

// 仮の生成ロジック（後でAI APIに置き換え）
export const generateMockStaffing = (
  openTime: string,
  closeTime: string,
  positions: { _id: string; name: string }[],
): StaffingEntry[] => {
  const openHour = Number.parseInt(openTime.split(":")[0], 10);
  const closeHour = Number.parseInt(closeTime.split(":")[0], 10);

  const result: StaffingEntry[] = [];

  for (let hour = openHour; hour < closeHour; hour++) {
    for (const pos of positions) {
      // 時間帯に応じた人数を設定
      let count = 1;
      if (hour >= 11 && hour < 14) count = 3; // ランチタイム
      if (hour >= 18 && hour < 21) count = 3; // ディナータイム

      // キッチンは少し少なめ
      if (pos.name === "キッチン") count = Math.max(1, count - 1);
      // その他は最小限
      if (pos.name === "その他") count = hour >= 11 && hour < 14 ? 1 : 0;

      result.push({
        hour,
        position: pos.name,
        requiredCount: count,
      });
    }
  }

  return result;
};
