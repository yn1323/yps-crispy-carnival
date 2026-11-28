import type { PositionSkillLevel, StaffPositionSkill, StaffType } from "./types";

// スタッフの、ポジションごとの値（担当外、見習い、一人前、リーダー）を引く純粋処理。
// 値を持つのは一人前以外のポジションだけで、設定のないポジションは一人前として扱う。

/** そのスタッフの、そのポジションでの値。 */
export type PositionSkillValue = PositionSkillLevel | "standard";

/** ポジションごとの、そのポジションで見習いのstaffId。 */
export type NewcomerStaffIdsByPositionId = ReadonlyMap<string, ReadonlySet<string>>;

type SkillHolder = { positionSkills?: readonly StaffPositionSkill[] };

/** そのスタッフの、そのポジションでの値を返す。設定のないポジションと、スタッフが分からない場合は一人前。 */
export const getPositionSkill = (staff: SkillHolder | undefined, positionId: string): PositionSkillValue =>
  staff?.positionSkills?.find((skill) => skill.positionId === positionId)?.level ?? "standard";

/**
 * そのポジションで見習いのstaffIdを、ポジションごとに集める。削除済みのスタッフは含めない。
 * 見習いが1人もいないポジションは、結果に含めない。
 */
export const collectNewcomerStaffIdsByPositionId = (
  staffs: ReadonlyArray<Pick<StaffType, "id" | "isRemoved" | "positionSkills">>,
): Map<string, Set<string>> => {
  const staffIdsByPositionId = new Map<string, Set<string>>();
  for (const staff of staffs) {
    if (staff.isRemoved) continue;
    for (const skill of staff.positionSkills ?? []) {
      if (skill.level !== "newcomer") continue;
      const staffIds = staffIdsByPositionId.get(skill.positionId);
      if (staffIds) staffIds.add(staff.id);
      else staffIdsByPositionId.set(skill.positionId, new Set([staff.id]));
    }
  }
  return staffIdsByPositionId;
};
