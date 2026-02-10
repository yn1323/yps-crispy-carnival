// "HH:MM" 形式の時間文字列から時（hour）を取得
export const parseHour = (time: string): number => Number.parseInt(time.split(":")[0], 10);

// 営業時間から時間帯の配列を生成（例: "09:00", "22:00" → [9, 10, ..., 21]）
export const generateHourRange = (openTime: string, closeTime: string): number[] => {
  const result: number[] = [];
  for (let hour = parseHour(openTime); hour < parseHour(closeTime); hour++) {
    result.push(hour);
  }
  return result;
};
