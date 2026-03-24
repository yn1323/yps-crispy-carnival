// 月曜始まりの曜日インデックス配列（祝日を末尾に）
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0, 7] as const;

// 平日（月〜金）/ 休日（日,土,祝）のグルーピング
export const WEEKDAY_DAYS = [1, 2, 3, 4, 5] as const;
export const HOLIDAY_DAYS = [0, 6, 7] as const;
