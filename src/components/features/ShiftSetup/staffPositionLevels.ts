import type { Id } from "@/convex/_generated/dataModel";
import type {
  ShiftSetupPosition,
  ShiftSetupStaff,
  StaffPositionLevel,
  StaffPositionLevels,
  StaffShiftProfileInput,
} from "./types";

// スタッフが、ポジションごとに担当できるかどうかと熟練度を編集するための純粋処理。
// 画面では「担当外／見習い／一人前／リーダー」の4つの値で扱い、保存する形では一人前を省く。
// 画面では、マスを押すたびに値が順に切り替わる。

type PositionRef = Pick<ShiftSetupPosition, "_id">;

const LEVEL_LABELS: Record<StaffPositionLevel, string> = {
  unavailable: "担当外",
  newcomer: "見習い",
  standard: "一人前",
  lead: "リーダー",
};

/** マスを押すたびに切り替わる順。最後の「担当外」の次は、最初の一人前へ戻る。 */
const STAFF_POSITION_LEVEL_ORDER: readonly StaffPositionLevel[] = ["standard", "newcomer", "lead", "unavailable"];

export function getStaffPositionLevelLabel(level: StaffPositionLevel): string {
  return LEVEL_LABELS[level];
}

/** 保存済みの値を、編集中の形（ポジションのID → 値。一人前は持たない）へ直す。いまは無いポジションの値は捨てる。 */
export function toStaffPositionLevels(
  staff: Pick<ShiftSetupStaff, "positionSkills">,
  positions: readonly PositionRef[],
): StaffPositionLevels {
  const positionIds = new Set<string>(positions.map((position) => position._id));
  const levels: Record<string, StaffPositionLevels[string]> = {};
  for (const skill of staff.positionSkills) {
    if (positionIds.has(skill.positionId)) levels[skill.positionId] = skill.level;
  }
  return levels;
}

export function getStaffPositionLevel(levels: StaffPositionLevels, positionId: string): StaffPositionLevel {
  return levels[positionId] ?? "standard";
}

function countAvailablePositions(levels: StaffPositionLevels, positions: readonly PositionRef[]): number {
  return positions.filter((position) => levels[position._id] !== "unavailable").length;
}

/** そのポジションが、スタッフに残った最後の「担当できるポジション」かを返す。最後の1つは「担当外」にできない。 */
export function isLastAvailablePosition(
  levels: StaffPositionLevels,
  positionId: string,
  positions: readonly PositionRef[],
): boolean {
  return levels[positionId] !== "unavailable" && countAvailablePositions(levels, positions) <= 1;
}

/** 1つのポジションの値を変える。最後の1つを「担当外」にする操作は無視する。 */
export function setStaffPositionLevel(
  levels: StaffPositionLevels,
  positionId: string,
  level: StaffPositionLevel,
  positions: readonly PositionRef[],
): StaffPositionLevels {
  if (level === "unavailable" && isLastAvailablePosition(levels, positionId, positions)) return levels;
  const { [positionId]: _current, ...rest } = levels;
  return level === "standard" ? rest : { ...rest, [positionId]: level };
}

/** いまあるポジションについて、値がすべて同じかを返す。変更の有無の判定に使う。 */
export function isSameStaffPositionLevels(
  left: StaffPositionLevels,
  right: StaffPositionLevels,
  positions: readonly PositionRef[],
): boolean {
  return positions.every(
    (position) => getStaffPositionLevel(left, position._id) === getStaffPositionLevel(right, position._id),
  );
}

/**
 * 保存する形へ直す。保存済みの値から変えたスタッフだけを返す。
 * 値はポジションの並び順に並べ、一人前と、いまは無いポジションの値は送らない。
 */
export function toStaffProfileInputs(
  staffs: readonly ShiftSetupStaff[],
  drafts: Readonly<Record<string, StaffPositionLevels>>,
  positions: readonly PositionRef[],
): StaffShiftProfileInput[] {
  return staffs.flatMap((staff) => {
    const draft = drafts[staff._id];
    if (!draft || isSameStaffPositionLevels(draft, toStaffPositionLevels(staff, positions), positions)) return [];
    return [
      {
        staffId: staff._id,
        positionSkills: positions.flatMap((position) => {
          const level = draft[position._id];
          return level ? [{ positionId: position._id as Id<"positions">, level }] : [];
        }),
      },
    ];
  });
}

/**
 * マスを押したあとの値を返す。一人前、見習い、リーダー、担当外の順に切り替わり、担当外の次は一人前へ戻る。
 * スタッフに残った最後の「担当できるポジション」では、担当外を飛ばして一人前へ戻る。
 */
export function getNextStaffPositionLevel(
  levels: StaffPositionLevels,
  positionId: string,
  positions: readonly PositionRef[],
): StaffPositionLevel {
  const current = getStaffPositionLevel(levels, positionId);
  const next =
    STAFF_POSITION_LEVEL_ORDER[(STAFF_POSITION_LEVEL_ORDER.indexOf(current) + 1) % STAFF_POSITION_LEVEL_ORDER.length];
  return next === "unavailable" && isLastAvailablePosition(levels, positionId, positions) ? "standard" : next;
}
