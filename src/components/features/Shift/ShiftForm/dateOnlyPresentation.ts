import { formatDateShort, formatDateWithWeekday } from "@/src/domains/shift/date";
import { countDateOnlyAssignmentsByDate } from "@/src/domains/shift/dateOnlyAssignments";
import {
  buildDateOnlyCell,
  type DateOnlyDayStatus,
  isDateOnlyStaffWithoutRequests,
} from "@/src/domains/shift/dateOnlyCells";
import { calculateDateOnlyFulfillmentPercent } from "@/src/domains/shift/staffingFulfillment";
import type { ShiftData, StaffType } from "@/src/domains/shift/types";
import type { AssignmentPillCell } from "./assignmentCellParts";
import { buildAssignmentPillFields } from "./assignmentCellPresentation";
import {
  type DayStaffingView,
  type PositionStaffingCountPresentation,
  selectShownStaffingPositions,
} from "./staffingPresentation";
import { buildStaffNamesLabel } from "./staffNamesLabel";

// 日付選択の表（PCの週の表、スマートフォンの1日ずつのリスト）に出す内容。
// セルは「希望の輪」と「割り当てのピル」の2つの層で示し、色はポジションと状態だけに使う。パターン選択の日別と同じ決まりである。

export type DateOnlyDateInfo = { iso: string; inRange: boolean };

export type DateOnlyCellPresentation = AssignmentPillCell & {
  /** 日付（YYYY-MM-DD）。 */
  key: string;
  /** 期間外の日と定休日は、セルに何も描かず、押せない。 */
  status: DateOnlyDayStatus;
  /** その日の連絡事項があるか。PCの週の表で、セルの角に印を付ける。 */
  hasNote: boolean;
};

export type DateOnlyNotePresentation = {
  date: string;
  /** 「12/1」 */
  dateLabel: string;
  note: string;
};

type RowBase = {
  key: string;
  staff: StaffType;
  staffName: string;
  isNameMuted: boolean;
  /** 名前に「未提出」を添えるか。 */
  isUnsubmitted: boolean;
};

/** PCの週の表の1行。 */
export type DateOnlyWeekRowPresentation = RowBase & {
  cells: DateOnlyCellPresentation[];
  /** 表示中の週の連絡事項。日付順。 */
  notes: DateOnlyNotePresentation[];
};

/** スマートフォンの1日ずつのリストの1行。 */
export type DateOnlyDayRowPresentation = RowBase & {
  cell: DateOnlyCellPresentation;
  /** その日の連絡事項。なければnull。 */
  note: string | null;
};

/** 下にたたんでまとめる人たち。該当する人がいなければnull。 */
export type DateOnlyFoldedGroupPresentation<Row> = {
  /** 「希望なし 2人」「この日の希望がない人 9人」 */
  label: string;
  /** 見出しの横に薄く出す名前。「中村・高橋・伊藤・ほか1人」 */
  namesLabel: string;
  rows: Row[];
};

type GetNote = (staffId: string, date: string) => string | undefined;

const resolveDayStatus = (date: DateOnlyDateInfo, holidaySet: ReadonlySet<string>): DateOnlyDayStatus =>
  !date.inRange ? "outOfRange" : holidaySet.has(date.iso) ? "closed" : "open";

type CellInput = {
  staff: StaffType;
  shift: ShiftData | undefined;
  date: string;
  status: DateOnlyDayStatus;
  hasNote: boolean;
  isConfirmedDisplay: boolean;
  usesPositionColors: boolean;
};

const buildCellPresentation = (input: CellInput) => {
  const { staff, shift, date, status, hasNote, isConfirmedDisplay, usesPositionColors } = input;
  const cell = buildDateOnlyCell({ shift, staff, status });
  const pill = buildAssignmentPillFields(cell, { isConfirmedDisplay, usesPositionColors });
  const descriptions = [
    ...(pill.showsRequestRing ? ["希望あり"] : []),
    ...pill.noticeTexts,
    ...(hasNote ? ["連絡事項あり"] : []),
  ];
  const presentation: DateOnlyCellPresentation = {
    key: date,
    status,
    hasNote,
    ...pill,
    // 既存のE2Eがこの形で探すため、名前の形を変えない。ポジションを塗り分ける表示では、末尾にポジション名を添える。
    ariaLabel: `${staff.name} ${formatDateWithWeekday(date)} ${pill.assigned ? "勤務あり" : "勤務なし"}${
      usesPositionColors && cell.segment ? `、${cell.segment.positionName}` : ""
    }`,
    ariaDescription: descriptions.length > 0 ? descriptions.join("、") : null,
  };
  return { presentation, cell };
};

const toRowBase = (staff: StaffType, isConfirmedDisplay: boolean): RowBase => ({
  key: staff.id,
  staff,
  staffName: staff.name,
  isNameMuted: !staff.isSubmitted,
  isUnsubmitted: !isConfirmedDisplay && !staff.isSubmitted,
});

const indexShifts = (shifts: readonly ShiftData[]): Map<string, ShiftData> =>
  new Map(shifts.map((shift) => [`${shift.staffId}-${shift.date}`, shift]));

const toFoldedGroup = <Row extends RowBase>(
  rows: Row[],
  toLabel: (count: number) => string,
): DateOnlyFoldedGroupPresentation<Row> | null =>
  rows.length > 0
    ? {
        label: toLabel(rows.length),
        namesLabel: buildStaffNamesLabel(rows.map((row) => row.staffName)),
        rows,
      }
    : null;

// ==========================================
// PCの週の表
// ==========================================
export type DateOnlyWeekColumnPresentation = {
  key: string;
  date: DateOnlyDateInfo;
  status: DateOnlyDayStatus;
  /** 「8人」。期間外の日と定休日はnull。 */
  countLabel: string | null;
};

export type DateOnlyWeekPresentation = {
  columns: DateOnlyWeekColumnPresentation[];
  rows: DateOnlyWeekRowPresentation[];
  /** その週に希望が1日もなく、割り当ても連絡事項もない人。 */
  foldedGroup: DateOnlyFoldedGroupPresentation<DateOnlyWeekRowPresentation> | null;
};

export const buildDateOnlyWeekPresentation = ({
  staffs,
  shifts,
  dates,
  holidays,
  isConfirmedDisplay,
  usesPositionColors,
  getNote,
}: {
  /** 表示する順に並べたスタッフ。 */
  staffs: StaffType[];
  shifts: ShiftData[];
  /** 表示中の週の7日分。 */
  dates: DateOnlyDateInfo[];
  holidays: string[];
  /** スタッフ向けの確定シフトの表示。希望の輪、点、たたむまとまりを出さない。 */
  isConfirmedDisplay: boolean;
  /** ポジションを塗り分ける表示（くわしく表示で、ポジションが2つ以上）かどうか。 */
  usesPositionColors: boolean;
  /** 表示設定にかかわらず、提出された連絡事項を返す。 */
  getNote: GetNote;
}): DateOnlyWeekPresentation => {
  const holidaySet = new Set(holidays);
  const shiftByStaffDate = indexShifts(shifts);
  const statuses = dates.map((date) => resolveDayStatus(date, holidaySet));
  const openDateKeys = dates.filter((_, index) => statuses[index] === "open").map((date) => date.iso);
  const counts = countDateOnlyAssignmentsByDate(shifts, openDateKeys);

  const built = staffs.map((staff) => {
    const cells = dates.map((date, index) => {
      // 期間外の日の連絡事項は、提出の対象外なので持たない。
      const hasNote = date.inRange && getNote(staff.id, date.iso) !== undefined;
      return buildCellPresentation({
        staff,
        shift: shiftByStaffDate.get(`${staff.id}-${date.iso}`),
        date: date.iso,
        status: statuses[index],
        hasNote,
        isConfirmedDisplay,
        usesPositionColors,
      });
    });
    const notes = dates.flatMap((date) => {
      const note = date.inRange ? getNote(staff.id, date.iso) : undefined;
      return note ? [{ date: date.iso, dateLabel: formatDateShort(date.iso), note }] : [];
    });
    const row: DateOnlyWeekRowPresentation = {
      ...toRowBase(staff, isConfirmedDisplay),
      cells: cells.map((cell) => cell.presentation),
      notes,
    };
    const isFolded =
      !isConfirmedDisplay &&
      isDateOnlyStaffWithoutRequests({ staff, cells: cells.map(({ cell }) => cell), hasNote: notes.length > 0 });
    return { row, isFolded };
  });

  return {
    columns: dates.map((date, index) => ({
      key: date.iso,
      date,
      status: statuses[index],
      countLabel: statuses[index] === "open" ? `${counts.get(date.iso) ?? 0}人` : null,
    })),
    rows: built.filter((item) => !item.isFolded).map((item) => item.row),
    foldedGroup: toFoldedGroup(
      built.filter((item) => item.isFolded).map((item) => item.row),
      (count) => `希望なし ${count}人`,
    ),
  };
};

// ==========================================
// スマートフォンの1日ずつのリスト
// ==========================================
export type DateOnlyDayPresentation = {
  /** 「3人」 */
  countLabel: string;
  rows: DateOnlyDayRowPresentation[];
  /** その日の希望も割り当ても連絡事項もない人。 */
  foldedGroup: DateOnlyFoldedGroupPresentation<DateOnlyDayRowPresentation> | null;
};

/** PCの週の表で、名前の右の確認事項に出す文言。日ごとの理由を、日付を付けて並べる。 */
export const toDateOnlyWeekWarningMessages = (row: DateOnlyWeekRowPresentation): string[] =>
  row.cells
    .filter((cell) => cell.dot !== null)
    .flatMap((cell) => cell.noticeTexts.map((text) => `${formatDateWithWeekday(cell.key)}：${text}`));

export const buildDateOnlyDayPresentation = ({
  staffs,
  shifts,
  date,
  isClosed,
  isConfirmedDisplay,
  usesPositionColors,
  getNote,
}: {
  /** 表示する順に並べたスタッフ。同じまとまりの中では、この順を保つ。 */
  staffs: StaffType[];
  shifts: ShiftData[];
  date: string;
  isClosed: boolean;
  isConfirmedDisplay: boolean;
  usesPositionColors: boolean;
  getNote: GetNote;
}): DateOnlyDayPresentation => {
  const shiftByStaffDate = indexShifts(shifts);
  const status: DateOnlyDayStatus = isClosed ? "closed" : "open";

  const built = staffs.map((staff) => {
    const note = getNote(staff.id, date) ?? null;
    const { presentation, cell } = buildCellPresentation({
      staff,
      shift: shiftByStaffDate.get(`${staff.id}-${date}`),
      date,
      status,
      hasNote: note !== null,
      isConfirmedDisplay,
      usesPositionColors,
    });
    const row: DateOnlyDayRowPresentation = {
      ...toRowBase(staff, isConfirmedDisplay),
      cell: presentation,
      note,
    };
    const isFolded =
      !isConfirmedDisplay && isDateOnlyStaffWithoutRequests({ staff, cells: [cell], hasNote: note !== null });
    return { row, isFolded };
  });

  const visibleRows = built.filter((item) => !item.isFolded).map((item) => item.row);
  return {
    countLabel: `${isClosed ? 0 : (countDateOnlyAssignmentsByDate(shifts, [date]).get(date) ?? 0)}人`,
    // 並べ替えず、渡された順（スタッフのページで決めた並び順）のまま出す。
    rows: visibleRows,
    foldedGroup: toFoldedGroup(
      built.filter((item) => item.isFolded).map((item) => item.row),
      (count) => `この日の希望がない人 ${count}人`,
    ),
  };
};

// ==========================================
// 充足（くわしく表示）
// ==========================================
export type DateOnlyStaffingPresentation = {
  /** 渡した日をまとめた充足率（%）。必要人数が1つもなければnull。 */
  percent: number | null;
  /** 100%のときtrue。文字の色を決める。 */
  isFulfilled: boolean;
  /** 人数を出すポジション。渡した日のどれかに必要人数があるか、だれかが入っているポジションを、設定の並び順で持つ。 */
  positions: Array<{ positionId: string; name: string; color: string }>;
  /** 日付から、positionsと同じ並びの「配置/必要」を引く。 */
  countsByDate: ReadonlyMap<string, PositionStaffingCountPresentation[]>;
};

/**
 * 日ごとの人数（DayStaffingView）を、週の見出しとスマートフォンの充足の行に出す形へ直す。
 * PCは表示中の週の営業日、スマートフォンはその日の1日分を渡す。
 * 出すポジションは渡した日でそろえ、日によって並びと数を変えない。状態が変わっても位置を動かさないためである。
 */
export const buildDateOnlyStaffingPresentation = (views: readonly DayStaffingView[]): DateOnlyStaffingPresentation => {
  // 日付選択の区切りは、終日の1つだけである。
  const days = views.flatMap((view) => (view.slots[0] ? [{ date: view.date, slot: view.slots[0] }] : []));
  const { positions, toCounts } = selectShownStaffingPositions(days.map(({ slot }) => slot));
  const percent = calculateDateOnlyFulfillmentPercent(days.map(({ slot }) => ({ positions: slot.positions })));
  return {
    percent,
    // 多い分で100%を超えた日も、満たした日として同じ色で出す。
    isFulfilled: percent !== null && percent >= 100,
    positions,
    countsByDate: new Map(days.map(({ date, slot }) => [date, toCounts(slot)])),
  };
};
