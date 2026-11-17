import { resolveDefaultPosition } from "@/src/domains/shift/operations";
import { getPositionSkill } from "@/src/domains/shift/positionSkills";
import type { PositionSkillLevel, PositionType, StaffType } from "@/src/domains/shift/types";

// スタッフの、ポジションごとの値（担当外、見習い、リーダー）を、シフト表へ出す印にまとめる。
// 名前の横の印は「入れるもの」で選んでいるポジションでの値、勤務の側の印はその区間のポジションでの値を表す。

/** 印の配色。帯の「見」の印と同じ決まりで、見習いは橙、リーダーは緑、担当外は灰色にする。 */
export const SKILL_MARK_COLORS = {
  unavailable: { bg: "gray.100", color: "gray.700" },
  newcomer: { bg: "orange.100", color: "orange.800" },
  lead: { bg: "green.100", color: "green.800" },
} as const satisfies Record<PositionSkillLevel, { bg: string; color: string }>;

const NAME_LABELS = { unavailable: "担当外", newcomer: "見習い", lead: "リーダー" } as const;

const describeSkill = (positionName: string, level: PositionSkillLevel): string =>
  level === "unavailable" ? `${positionName}は担当外です` : `${positionName}では${NAME_LABELS[level]}です`;

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
  level: PositionSkillLevel;
  /** 「見習い」「リーダー」「担当外」 */
  label: string;
  /** どのポジションでの値かを添える場合の、ポジション。ポジションが1つの店舗ではnull。 */
  position: { name: string; color: string } | null;
  /** 印の説明。ポジションが1つの店舗では、印の文字で足りるためnull。 */
  title: string | null;
};

/** 名前の横の印。一人前と、根拠にするポジションがない表示では出さない（null）。 */
export const buildNameSkillMark = (input: {
  staff: Pick<StaffType, "positionSkills">;
  /** resolveNameSkillPositionの結果 */
  position: PositionType | null;
  /** 店舗のポジションの数。2つ以上のときだけ、どのポジションでの値かを添える。 */
  positionCount: number;
}): NameSkillMarkView | null => {
  if (!input.position) return null;
  const level = getPositionSkill(input.staff, input.position.id);
  if (level === "standard") return null;
  const showsPosition = input.positionCount >= 2;
  return {
    level,
    label: NAME_LABELS[level],
    position: showsPosition ? { name: input.position.name, color: input.position.color } : null,
    title: showsPosition ? describeSkill(input.position.name, level) : null,
  };
};

// ==========================================
// 勤務の側の印
// ==========================================
export type SegmentSkillMarkView = {
  level: "newcomer" | "lead";
  /** 「見」「リ」 */
  label: string;
  /** 読み上げで「見習い」「リーダー」にするための続き */
  hiddenSuffix: string;
  title: string;
};

const SEGMENT_LABELS = {
  newcomer: { label: "見", hiddenSuffix: "習い" },
  lead: { label: "リ", hiddenSuffix: "ーダー" },
} as const;

/**
 * 勤務の区間に添える印。その区間のポジションでの値が、見習いかリーダーのときだけ出す。
 * 担当外のポジションの勤務は確認事項で知らせるため、ここでは印を出さない。
 */
export const buildSegmentSkillMark = (
  staff: Pick<StaffType, "positionSkills"> | undefined,
  segment: { positionId: string; positionName: string } | undefined,
): SegmentSkillMarkView | null => {
  if (!staff || !segment) return null;
  const level = getPositionSkill(staff, segment.positionId);
  if (level !== "newcomer" && level !== "lead") return null;
  return { level, ...SEGMENT_LABELS[level], title: describeSkill(segment.positionName, level) };
};
