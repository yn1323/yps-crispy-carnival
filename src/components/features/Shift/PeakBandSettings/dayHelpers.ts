// 曜日カラー（土=青、日・祝=赤、平日=デフォルト）
export const getDayColor = (dayIndex: number) => {
  if (dayIndex === 6) return "blue.500";
  if (dayIndex === 0 || dayIndex === 7) return "red.500";
  return undefined;
};
