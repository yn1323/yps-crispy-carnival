// 自動作成が勤務へ入れる休憩の長さ。
// DBアクセス・Convex APIのインポート禁止（shiftBoard/validation.tsと同じ共有規約）。

/** 開始から終了までがこの長さまでの勤務には、休憩を入れない。 */
const SPAN_MINUTES_WITHOUT_BREAK = 6 * 60;
/** 開始から終了までがこの長さ以上の勤務に、45分の休憩を入れる。休憩を引いた時間が6時間になる長さである。 */
const SPAN_MINUTES_FOR_SHORT_BREAK = 6 * 60 + 45;
/** 開始から終了までがこの長さ以上の勤務に、1時間の休憩を入れる。休憩を引いた時間が8時間になる長さである。 */
const SPAN_MINUTES_FOR_LONG_BREAK = 9 * 60;
const SHORT_BREAK_MINUTES = 45;
const LONG_BREAK_MINUTES = 60;

/**
 * 勤務の開始から終了までの長さから、入れる休憩の長さを分で返す。休憩を入れない勤務は0を返す。
 * 6時間45分以上の勤務に45分、9時間以上の勤務に1時間を入れる。
 * 6時間を超えて6時間45分より短い勤務は、休憩を入れずに`getMinutesOverNoBreakSpan`の分だけ短くして作る。
 * 店舗の休憩の決まりは使わない。設定ページに入力がなく、店舗が中身を確かめられないためである。
 */
export function getRequiredBreakMinutes(spanMinutes: number): number {
  if (spanMinutes >= SPAN_MINUTES_FOR_LONG_BREAK) return LONG_BREAK_MINUTES;
  if (spanMinutes >= SPAN_MINUTES_FOR_SHORT_BREAK) return SHORT_BREAK_MINUTES;
  return 0;
}

/**
 * 6時間を超えて6時間45分より短い勤務について、6時間を超えている長さを分で返す。それ以外の勤務は0を返す。
 * この長さの勤務は、休憩で調整せず、早く上がるか遅く入る形で6時間に縮める。
 */
export function getMinutesOverNoBreakSpan(spanMinutes: number): number {
  return spanMinutes > SPAN_MINUTES_WITHOUT_BREAK && spanMinutes < SPAN_MINUTES_FOR_SHORT_BREAK
    ? spanMinutes - SPAN_MINUTES_WITHOUT_BREAK
    : 0;
}
