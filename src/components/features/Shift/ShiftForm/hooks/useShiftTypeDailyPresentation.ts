import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { indexShiftsByStaffId } from "@/src/domains/shift/shiftLookup";
import { useAllShiftDateNotes } from "../dateNotes";
import { buildShiftTypeDailyPresentation, buildShiftTypeStaffingPresentation } from "../shiftTypeDailyPresentation";
import { useDayStaffingView } from "../staffingParts";
import {
  dailySortedStaffsAtom,
  selectedDateAtom,
  shiftConfigAtom,
  shiftsForSelectedDateAtom,
  usesPositionColorsAtom,
} from "../stores";

/** パターン選択の日別の表（PCとスマートフォン）に出す、選んでいる日の内容。 */
export const useShiftTypeDailyPresentation = () => {
  const config = useAtomValue(shiftConfigAtom);
  const shiftsForDate = useAtomValue(shiftsForSelectedDateAtom);
  const sortedStaffs = useAtomValue(dailySortedStaffsAtom);
  const selectedDate = useAtomValue(selectedDateAtom);
  const usesPositionColors = useAtomValue(usesPositionColorsAtom);
  // たたむ人の判定は、表示設定で変わらないよう、すべての連絡事項で行う。
  const allDateNotes = useAllShiftDateNotes();
  // 人数と過不足を出す日（くわしく表示の営業日）だけ値が入る。シンプル表示、定休日、スタッフ向けの確定シフトではnullになる。
  const staffingView = useDayStaffingView(selectedDate);

  const { submissionPattern } = config;
  const isConfirmedDisplay = config.displayMode === "confirmed";

  const presentation = useMemo(
    () =>
      buildShiftTypeDailyPresentation({
        submissionPattern,
        shifts: shiftsForDate,
        staffs: sortedStaffs,
        shiftByStaffId: indexShiftsByStaffId(shiftsForDate),
        isConfirmedDisplay,
        usesPositionColors,
        hasNote: (staffId) => allDateNotes.getNote(staffId, selectedDate) !== undefined,
      }),
    [
      allDateNotes,
      isConfirmedDisplay,
      selectedDate,
      shiftsForDate,
      sortedStaffs,
      submissionPattern,
      usesPositionColors,
    ],
  );
  const staffing = useMemo(
    () =>
      staffingView
        ? buildShiftTypeStaffingPresentation(
            staffingView,
            presentation.options.map(({ option }) => option),
          )
        : null,
    [presentation.options, staffingView],
  );
  // テンプレートの選択は、必要人数のない日でも、店舗にテンプレートがあれば出す。その日にテンプレートを当てられるようにするためである。
  const showsTemplate =
    staffingView !== null && (staffingView.hasRequirements || (config.staffing?.templates.length ?? 0) > 0);

  return { presentation, staffing, staffingView, showsTemplate };
};
