import { resolveDefaultPosition } from "@/src/domains/shift/operations";
import { getPositionSkill } from "@/src/domains/shift/positionSkills";
import type { PositionType, StaffType } from "@/src/domains/shift/types";

// スタッフの、ポジションごとの値（担当外、見習い、リーダー）のうち、シフト表へ出すものを印にまとめる。
// シフト表には、名前の横の「担当外」だけを出す。リーダーは、シフト表では印を出さない。
// 見習いは印を出さず、見習いだけの時間帯として人数の表示と確認事項で知らせる。
// 名前の横の印は「入れるもの」で選んでいるポジションでの値を表す。

/** 担当外の印の配色。 */
export const UNAVAILABLE_MARK_COLORS = { bg: "gray.100", color: "gray.700" } as const;

const UNAVAILABLE_LABEL = "担当外";

// ==========================================
// 名前の横の印
// ==========================================
/**
 * 名前の横の印が根拠にするポジションを返す。
 * 「入れるもの」で選んでいるポジション（選んでいなければ既定のポジション。ポジションが1つの店舗はそのポジション）である。
 * 「入れるもの」がない表示（シンプル表示、閲覧専用、スタッフ向けの確定シフト、休憩を選んでいる間）ではnullを返す。
 */
export const resolveNameSkillPosition = (input: {
  positions: readonly PositionType[];
  selectedPositionId: string | null;
  /** くわしく表示で、編集できる場合だけtrue。 */
  isToolPaletteActive: boolean;
  isBreakToolActive: boolean;
  isConfirmedDisplay: boolean;
}): PositionType | null => {
  const { positions } = input;
  if (!input.isToolPaletteActive || input.isBreakToolActive || input.isConfirmedDisplay) return null;
  if (positions.length === 0) return null;
  if (positions.length === 1) return positions[0];
  return positions.find((position) => position.id === input.selectedPositionId) ?? resolveDefaultPosition(positions);
};

export type NameSkillMarkView = {
  level: "unavailable";
  /** 「担当外」 */
  label: string;
  /** どのポジションでの値かを添える場合の、ポジション。ポジションが1つの店舗ではnull。 */
  position: { name: string; color: string } | null;
  /** 印の説明。ポジションが1つの店舗では、印の文字で足りるためnull。 */
  title: string | null;
};

/** 名前の横の印。担当外のときだけ出し、一人前、見習い、リーダー、根拠にするポジションがない表示では出さない（null）。 */
export const buildNameSkillMark = (input: {
  staff: Pick<StaffType, "positionSkills">;
  /** resolveNameSkillPositionの結果 */
  position: PositionType | null;
  /** 店舗のポジションの数。2つ以上のときだけ、どのポジションでの値かを添える。 */
  positionCount: number;
}): NameSkillMarkView | null => {
  if (!input.position) return null;
  if (getPositionSkill(input.staff, input.position.id) !== "unavailable") return null;
  const showsPosition = input.positionCount >= 2;
  return {
    level: "unavailable",
    label: UNAVAILABLE_LABEL,
    position: showsPosition ? { name: input.position.name, color: input.position.color } : null,
    title: showsPosition ? `${input.position.name}は担当外です` : null,
  };
};
