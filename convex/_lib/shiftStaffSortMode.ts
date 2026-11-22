import { type Infer, v } from "convex/values";

/**
 * シフト表のスタッフの並び替え。店舗ごとに保存し、管理者の画面、出力、スタッフが見る確定シフトで共通に使う。
 * - fixed: その日の状態のまとまり（勤務あり → 出勤の希望あり → 休み希望 → 未提出）の中を、スタッフのページで決めた並び順にする。
 * - workTime: 勤務ありは勤務の時刻、出勤の希望ありは希望の時刻が早い順にする。同じ時刻と、ほかのまとまりは、決めた並び順にする。
 */
export const shiftStaffSortModeValidator = v.union(v.literal("fixed"), v.literal("workTime"));

export type ShiftStaffSortMode = Infer<typeof shiftStaffSortModeValidator>;

/** 店舗がまだ選んでいない場合の並び替え。 */
export const DEFAULT_SHIFT_STAFF_SORT_MODE: ShiftStaffSortMode = "fixed";
