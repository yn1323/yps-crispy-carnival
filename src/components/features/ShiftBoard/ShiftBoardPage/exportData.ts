import type { ShiftDateNote } from "@/src/components/features/Shift/ShiftForm";
import type { ShiftAssignmentDraft } from "@/src/domains/shift/buildAssignments";
import type { StaffSortMode } from "@/src/domains/shift/types";
import type { ShiftBoardData } from "../types";

// 出力ボタンを押した時点のシフト表を、出力ページへ渡す形にする純粋処理。

export type ShiftBoardExportData = {
  recruitment: {
    periodStart: string;
    periodEnd: string;
    shopClosedDates: string[];
    submissionPattern: ShiftBoardData["submissionPattern"];
  };
  staffs: { id: string; name: string; isRemoved: boolean }[];
  assignments: {
    staffId: string;
    date: string;
    startTime: string;
    endTime: string;
    optionId: string | null;
    positionId: string | null;
    breaks: { startTime: string; endTime: string }[];
  }[];
  positions: { id: string; name: string; color: string }[];
  dateNotes: ShiftDateNote[];
  /** 「くわしく」表示で開いているか。「シンプル」の勤務は既定のポジションが入るだけなので、出力でポジションを出さない。 */
  isDetailMode: boolean;
  /** 店舗が選んだスタッフの並び替え。日別の出力の並びに使う。 */
  staffSortMode: StaffSortMode;
};

/**
 * 出力に載せるスタッフを、スタッフのページで決めた並び順で返す。
 * 並び順がない、件数が合わない、重複がある、一覧にないスタッフを指す、のどれかに当たる場合はnullを返す。
 * 一部のスタッフだけの帳票を作らないためである。
 */
export const resolveExportStaffs = (
  data: Pick<ShiftBoardData, "staffs" | "exportStaffOrder">,
): ShiftBoardExportData["staffs"] | null => {
  const order = data.exportStaffOrder;
  const byId = new Map(data.staffs.map((staff) => [staff._id, staff]));
  if (!order || order.length !== byId.size || new Set(order).size !== order.length) return null;

  const staffs: ShiftBoardExportData["staffs"] = [];
  for (const id of order) {
    const staff = byId.get(id);
    if (!staff) return null;
    staffs.push({ id, name: staff.name, isRemoved: staff.isRemoved ?? false });
  }
  return staffs;
};

/** 出力ページへ渡す内容。募集の条件とメモは写しを渡し、あとから元の値が変わっても出力に響かないようにする。 */
export const buildShiftBoardExportData = (input: {
  data: ShiftBoardData;
  staffs: ShiftBoardExportData["staffs"];
  /** 保存するときと同じ形にした、いま画面にある勤務。 */
  assignments: readonly ShiftAssignmentDraft[];
  dateNotes: readonly ShiftDateNote[];
  isDetailMode: boolean;
  staffSortMode: StaffSortMode;
}): ShiftBoardExportData => {
  const { data } = input;
  return {
    recruitment: {
      periodStart: data.recruitment.periodStart,
      periodEnd: data.recruitment.periodEnd,
      shopClosedDates: [...data.recruitment.shopClosedDates],
      submissionPattern: structuredClone(data.submissionPattern),
    },
    staffs: input.staffs,
    assignments: input.assignments.map(({ staffId, date, startTime, endTime, optionId, positionId, breaks }) => ({
      staffId,
      date,
      startTime,
      endTime,
      optionId: optionId ?? null,
      positionId: positionId ?? null,
      breaks: breaks ?? [],
    })),
    positions: data.positions.map((position) => ({ id: position._id, name: position.name, color: position.color })),
    dateNotes: input.dateNotes.map(({ staffId, date, note }) => ({ staffId, date, note })),
    isDetailMode: input.isDetailMode,
    staffSortMode: input.staffSortMode,
  };
};
