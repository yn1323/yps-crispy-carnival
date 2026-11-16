import type { Id } from "@/convex/_generated/dataModel";
import type {
  ShiftSetupPosition,
  ShiftSetupStaff,
  StaffPositionLevel,
  StaffPositionLevels,
  StaffPositionMark,
  StaffPositionMarkChange,
  StaffShiftProfileInput,
} from "./types";

// スタッフが、ポジションごとに入れるかどうかと熟練度を編集するための純粋処理。
// 画面では「入れない／新人／標準／責任者」の4つの値で扱い、保存する形では標準を省く。
// 標準は印を持たない。画面では、付ける印（新人／責任者／入れない）を選んでからマスを押して値を変える。

type PositionRef = Pick<ShiftSetupPosition, "_id">;

const LEVEL_LABELS: Record<StaffPositionLevel, string> = {
  unavailable: "入れない",
  newcomer: "新人",
  standard: "標準",
  lead: "責任者",
};

/** マスに出す短い印。新人と責任者は、シフト表の勤務に添える印にそろえる。 */
const MARK_SYMBOLS: Record<StaffPositionMark, string> = { newcomer: "新", lead: "責", unavailable: "×" };

const MARK_ORDER: readonly StaffPositionMark[] = ["newcomer", "lead", "unavailable"];

export function getStaffPositionLevelLabel(level: StaffPositionLevel): string {
  return LEVEL_LABELS[level];
}

/** マスに出す短い印を返す。 */
export function getStaffPositionMarkSymbol(mark: StaffPositionMark): string {
  return MARK_SYMBOLS[mark];
}

/**
 * 付けられる印を、選ぶ順に返す。
 * ポジションが1件の店舗では、入れるポジションを選ぶ余地がないため「入れない」を出さない。
 */
export function getStaffPositionMarkOptions(
  positions: readonly PositionRef[],
): Array<{ value: StaffPositionMark; label: string }> {
  return MARK_ORDER.filter((mark) => mark !== "unavailable" || positions.length > 1).map((mark) => ({
    value: mark,
    label: LEVEL_LABELS[mark],
  }));
}

/** 保存済みの値を、編集中の形（ポジションのID → 値。標準は持たない）へ直す。いまは無いポジションの値は捨てる。 */
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

/** そのポジションが、スタッフに残った最後の「入れるポジション」かを返す。最後の1つは「入れない」にできない。 */
export function isLastAvailablePosition(
  levels: StaffPositionLevels,
  positionId: string,
  positions: readonly PositionRef[],
): boolean {
  return levels[positionId] !== "unavailable" && countAvailablePositions(levels, positions) <= 1;
}

/** 1つのポジションの値を変える。最後の1つを「入れない」にする操作は無視する。 */
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
 * 値はポジションの並び順に並べ、標準と、いまは無いポジションの値は送らない。
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
 * マスを押したあとの値を返す。
 * 選んでいる印と同じ印のマスは標準へ戻し、それ以外のマスは選んでいる印に置き換える。
 */
export function getStampedStaffPositionLevel(current: StaffPositionLevel, mark: StaffPositionMark): StaffPositionLevel {
  return current === mark ? "standard" : mark;
}

/** 選んでいる印を、そのマスに付けられないかを返す。最後に残った「入れるポジション」には「入れない」を付けられない。 */
export function isStaffPositionMarkBlocked(
  levels: StaffPositionLevels,
  positionId: string,
  mark: StaffPositionMark,
  positions: readonly PositionRef[],
): boolean {
  return mark === "unavailable" && isLastAvailablePosition(levels, positionId, positions);
}

/**
 * 1つのポジションの印を、選んだスタッフだけまとめて変える。選んでいないスタッフの値は変えない。
 * 「入れない」を付けると入れるポジションがなくなるスタッフは変えずに飛ばし、その人数を返す。
 */
export function changeStaffPositionMarks(
  profiles: Readonly<Record<string, StaffPositionLevels>>,
  change: StaffPositionMarkChange,
  positions: readonly PositionRef[],
): { profiles: Record<string, StaffPositionLevels>; skippedCount: number } {
  const { positionId, mark, action } = change;
  let skippedCount = 0;
  const next: Record<string, StaffPositionLevels> = { ...profiles };
  for (const staffId of new Set(change.staffIds)) {
    const levels = profiles[staffId];
    if (!levels) continue;
    if (action === "remove") {
      if (levels[positionId] === mark) next[staffId] = setStaffPositionLevel(levels, positionId, "standard", positions);
    } else if (isStaffPositionMarkBlocked(levels, positionId, mark, positions)) {
      skippedCount += 1;
    } else {
      next[staffId] = setStaffPositionLevel(levels, positionId, mark, positions);
    }
  }
  return { profiles: next, skippedCount };
}

/** 名前の比較に使う形へそろえる。全角と半角、大文字と小文字、空白の有無の違いを吸収する。 */
function normalizeName(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/g, "");
}

/** 名前に検索語を含むスタッフだけを返す。検索語が空なら全員を返す。 */
export function filterStaffsByName<Staff extends Pick<ShiftSetupStaff, "name">>(
  staffs: readonly Staff[],
  query: string,
): Staff[] {
  const keyword = normalizeName(query);
  if (!keyword) return [...staffs];
  return staffs.filter((staff) => normalizeName(staff.name).includes(keyword));
}
