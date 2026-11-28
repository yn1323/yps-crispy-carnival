import { buildSlotAssignments } from "./slotAssignments";
import { buildTimeAssignments } from "./timeAssignments";
import type { AutoCreateInput, AutoCreateResult } from "./types";

// シフトの自動作成（決まった手順）の入口。
// サーバーとフロントで共有する。DBアクセス・Convex APIのインポート禁止（shiftBoard/validation.tsと同じ共有規約）。

/**
 * 希望、必要人数、熟練度、過去の集計から、募集期間の勤務を作る。
 * 希望のない日と時間、担当外のポジション、必要人数のない日には入れない。必要人数に届かない所は、不足のまま残す。
 * 同じ入力からは同じ結果になり、スタッフや希望を渡す並びには左右されない。
 */
export function buildAutoAssignments(input: AutoCreateInput): AutoCreateResult {
  return input.pattern.kind === "time" ? buildTimeAssignments(input) : buildSlotAssignments(input);
}
