/**
 * 入力欄の文字を、0から上限までの整数の人数へ直す。
 * 空欄、数字でない文字、負の数は0人（未設定）として扱い、小数は切り捨てる。
 */
export const parseStaffingCount = (value: string, max: number): number => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.min(parsed, max);
};
