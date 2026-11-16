import type { Id } from "@/convex/_generated/dataModel";
import type {
  ShiftSetupPosition,
  ShiftSetupStaff,
  StaffPositionLevel,
  StaffPositionLevels,
  StaffShiftProfileInput,
} from "./types";

// スタッフが、ポジションごとに入れるかどうかと熟練度を編集するための純粋処理。
// 画面では「入れない／新人／標準／責任者」の4つの値で扱い、保存する形では標準を省く。

type PositionRef = Pick<ShiftSetupPosition, "_id">;

const LEVEL_OPTIONS: ReadonlyArray<{ value: StaffPositionLevel; label: string }> = [
  { value: "unavailable", label: "入れない" },
  { value: "newcomer", label: "新人" },
  { value: "standard", label: "標準" },
  { value: "lead", label: "責任者" },
];

const LEVEL_LABELS = Object.fromEntries(LEVEL_OPTIONS.map((option) => [option.value, option.label])) as Record<
  StaffPositionLevel,
  string
>;

export function getStaffPositionLevelLabel(level: StaffPositionLevel): string {
  return LEVEL_LABELS[level];
}

/**
 * 選べる値を返す。
 * ポジションが1件の店舗では、入れるポジションを選ぶ余地がないため「入れない」を出さない。
 */
export function getStaffPositionLevelOptions(positions: readonly PositionRef[]) {
  return positions.length > 1 ? LEVEL_OPTIONS : LEVEL_OPTIONS.filter((option) => option.value !== "unavailable");
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

/** まとめて設定できる値。 */
export type BulkStaffPositionLevel = "standard" | "unavailable";

/**
 * 1つのポジションの値を、全員まとめて変える。
 * 「入れない」にすると入れるポジションがなくなるスタッフは変えずに飛ばし、その人数を返す。
 */
export function setPositionLevelForAllStaffs(
  profiles: Readonly<Record<string, StaffPositionLevels>>,
  positionId: string,
  level: BulkStaffPositionLevel,
  positions: readonly PositionRef[],
): { profiles: Record<string, StaffPositionLevels>; skippedCount: number } {
  let skippedCount = 0;
  const next: Record<string, StaffPositionLevels> = {};
  for (const [staffId, levels] of Object.entries(profiles)) {
    if (level === "unavailable" && isLastAvailablePosition(levels, positionId, positions)) {
      skippedCount += 1;
      next[staffId] = levels;
    } else {
      next[staffId] = setStaffPositionLevel(levels, positionId, level, positions);
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

/**
 * 標準以外の値を、ポジションの並び順で返す。一覧の行で、例外だけを短く示すために使う。
 * `limit`件を超えた分は件数だけを返す。
 */
export function summarizeStaffPositionLevels<Position extends PositionRef>(
  levels: StaffPositionLevels,
  positions: readonly Position[],
  limit: number,
): { items: Array<{ position: Position; level: Exclude<StaffPositionLevel, "standard"> }>; restCount: number } {
  const exceptions = positions.flatMap((position) => {
    const level = levels[position._id];
    return level ? [{ position, level }] : [];
  });
  return { items: exceptions.slice(0, limit), restCount: Math.max(0, exceptions.length - limit) };
}
