/**
 * シフト時間帯を表示用の文字列に整形する
 *
 * 24:00 以降は「翌H:MM」表記に変換
 *
 * @example
 * formatShiftTimeRange("14:00", "25:00") // "14:00〜翌1:00"
 * formatShiftTimeRange("10:00", "18:00") // "10:00〜18:00"
 */
export const formatShiftTimeRange = (start: string, end: string): string => {
  return `${formatOne(start)}〜${formatOne(end)}`;
};

const formatOne = (time: string): string => {
  const [hStr, mStr] = time.split(":");
  const h = Number(hStr);
  if (h >= 24) {
    const displayH = h - 24;
    return `翌${displayH}:${mStr.padStart(2, "0")}`;
  }
  return `${hStr.padStart(2, "0")}:${mStr.padStart(2, "0")}`;
};
