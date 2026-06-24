import { migrations } from "./index";

/**
 * shops の legacy 時間帯フィールド shiftStartTime/shiftEndTime を削除する。
 *
 * submissionPattern への移行（m002）完走後、これらは読み取りに使われなくなった。
 * 本マイグレーションで全ドキュメントから値を unset し、schema narrow
 * （フィールド定義の削除）を安全にする。
 *
 * NOTE: 本 PR で schema から該当フィールドを削除済み。実行完了済みの履歴であり
 *   runner は完了済みを再実行しないため、削除済みフィールドは型ビュー経由で扱う。
 */
type LegacyShiftTimes = { shiftStartTime?: string; shiftEndTime?: string };

export const migration = migrations.define({
  table: "shops",
  migrateOne: (_ctx, doc) => {
    const { shiftStartTime, shiftEndTime } = doc as typeof doc & LegacyShiftTimes;
    if (shiftStartTime === undefined && shiftEndTime === undefined) return;
    const cleared: LegacyShiftTimes = { shiftStartTime: undefined, shiftEndTime: undefined };
    return cleared as Partial<typeof doc>;
  },
});
