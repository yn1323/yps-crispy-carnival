import type { DayRequirements } from "../../shiftSetup/dayTemplates";

// 自動作成を使える日かどうかの判定。画面が「作成する」を押せるかを決めるために、手順とは別のファイルに置く。
// DBアクセス・Convex APIのインポート禁止（shiftBoard/validation.tsと同じ共有規約）。

/** その日に、必要人数が1人以上あるか。 */
export function hasRequiredStaff(requirements: DayRequirements | null | undefined): boolean {
  if (!requirements) return false;
  if (requirements.kind === "time") return requirements.bars.length > 0;
  if (requirements.kind === "dateOnly") return requirements.counts.some((count) => count.count > 0);
  return requirements.options.some((option) => option.counts.some((count) => count.count > 0));
}
