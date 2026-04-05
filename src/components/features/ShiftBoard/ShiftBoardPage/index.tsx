import { Box, useBreakpointValue } from "@chakra-ui/react";
import { useMutation } from "convex/react";
import { useCallback, useMemo, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ShiftForm } from "@/src/components/features/Shift/ShiftForm";
import { DEFAULT_POSITION } from "@/src/components/features/Shift/ShiftForm/constants";
import type { ShiftData, StaffType, ViewMode } from "@/src/components/features/Shift/ShiftForm/types";
import {
  formatDateShort,
  getDateRange,
  getWeekdayLabel,
} from "@/src/components/features/Shift/ShiftForm/utils/dateUtils";
import { BottomSheet } from "@/src/components/ui/BottomSheet";
import { Dialog, useDialog } from "@/src/components/ui/Dialog";
import { showErrorToast, toaster } from "@/src/components/ui/toaster";
import { ConfirmShiftContent } from "../ConfirmShiftContent";
import { ShiftBoardHeader } from "../ShiftBoardHeader";
import { ShiftBoardSPHeader } from "../ShiftBoardSPHeader";
import type { ShiftBoardData } from "../types";

const POSITIONS = [DEFAULT_POSITION];

/** dates配列から "M/D(曜)〜M/D(曜) のシフト" を生成 */
function generatePeriodLabel(dates: string[]): string {
  if (dates.length === 0) return "";
  const first = dates[0];
  const last = dates[dates.length - 1];
  return `${formatDateShort(first)}(${getWeekdayLabel(first)})〜${formatDateShort(last)}(${getWeekdayLabel(last)}) のシフト`;
}

/** Convexデータ → ShiftForm用 ShiftData[] に変換 */
function buildShiftData(data: ShiftBoardData, staffs: StaffType[], dates: string[]): ShiftData[] {
  const requestMap = new Map<string, { startTime: string; endTime: string }>();
  for (const r of data.shiftRequests) {
    requestMap.set(`${r.staffId}-${r.date}`, { startTime: r.startTime, endTime: r.endTime });
  }

  // assignmentsがあればassignments、なければrequestsを初期値として展開
  const source = data.shiftAssignments.length > 0 ? data.shiftAssignments : data.shiftRequests;
  const sourceMap = new Map<string, { startTime: string; endTime: string }>();
  for (const item of source) {
    sourceMap.set(`${item.staffId}-${item.date}`, { startTime: item.startTime, endTime: item.endTime });
  }

  const shifts: ShiftData[] = [];

  for (const staff of staffs) {
    for (const date of dates) {
      const key = `${staff.id}-${date}`;
      const entry = sourceMap.get(key);
      const request = requestMap.get(key);

      shifts.push({
        id: `shift-${staff.id}-${date}`,
        staffId: staff.id,
        staffName: staff.name,
        date,
        requestedTime: request ? { start: request.startTime, end: request.endTime } : null,
        positions: entry
          ? [
              {
                id: `seg-${staff.id}-${date}`,
                positionId: DEFAULT_POSITION.id,
                positionName: DEFAULT_POSITION.name,
                color: DEFAULT_POSITION.color,
                start: entry.startTime,
                end: entry.endTime,
              },
            ]
          : [],
      });
    }
  }

  return shifts;
}

type Props = {
  data: ShiftBoardData;
  recruitmentId: Id<"recruitments">;
};

export const ShiftBoardPage = ({ data, recruitmentId }: Props) => {
  const isMobile = useBreakpointValue({ base: true, lg: false });

  const [viewMode, setViewMode] = useState<ViewMode>("daily");

  const saveShiftAssignments = useMutation(api.shiftBoard.mutations.saveShiftAssignments);
  const confirmRecruitmentMutation = useMutation(api.shiftBoard.mutations.confirmRecruitment);

  const confirmedAt = data.recruitment.confirmedAt ? new Date(data.recruitment.confirmedAt) : null;
  const isConfirmed = confirmedAt !== null;

  const dates = useMemo(
    () => getDateRange(data.recruitment.periodStart, data.recruitment.periodEnd),
    [data.recruitment.periodStart, data.recruitment.periodEnd],
  );

  const periodLabel = useMemo(() => generatePeriodLabel(dates), [dates]);

  const staffs: StaffType[] = useMemo(
    () => data.staffs.map((s) => ({ id: s._id, name: s.name, isSubmitted: s.isSubmitted })),
    [data.staffs],
  );

  const initialShifts = useMemo(() => buildShiftData(data, staffs, dates), [data, staffs, dates]);

  const shiftsRef = useRef<ShiftData[]>(initialShifts);
  const handleShiftsChange = useCallback((shifts: ShiftData[]) => {
    shiftsRef.current = shifts;
  }, []);

  const confirmModal = useDialog();
  const Modal = isMobile ? BottomSheet : Dialog;

  /** 現在のシフトデータからmutation用のassignment配列を構築 */
  const buildAssignments = useCallback(() => {
    return shiftsRef.current
      .filter((s) => s.positions.length > 0)
      .map((s) => ({
        staffId: s.staffId as Id<"staffs">,
        date: s.date,
        startTime: s.positions[0].start,
        endTime: s.positions[s.positions.length - 1].end,
      }));
  }, []);

  const handleConfirm = useCallback(async () => {
    try {
      await saveShiftAssignments({ recruitmentId, assignments: buildAssignments() });
      await confirmRecruitmentMutation({ recruitmentId });
      confirmModal.close();
      toaster.create({ title: "確定しました", type: "success" });
    } catch (error) {
      showErrorToast(error);
    }
  }, [saveShiftAssignments, confirmRecruitmentMutation, recruitmentId, buildAssignments, confirmModal]);

  const confirmTitle = isConfirmed ? "シフトを再通知しますか？" : "シフトを確定して通知しますか？";

  return (
    <Box>
      <Box display={{ base: "none", lg: "block" }}>
        <ShiftBoardHeader
          periodLabel={periodLabel}
          confirmedAt={confirmedAt}
          onConfirm={confirmModal.open}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
        />
      </Box>

      <Box display={{ base: "block", lg: "none" }}>
        <ShiftBoardSPHeader
          periodLabel={periodLabel}
          confirmedAt={confirmedAt}
          onConfirm={confirmModal.open}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
        />
      </Box>

      <Box px={{ base: 0, lg: 4 }}>
        <ShiftForm
          shopId={data.shopId}
          staffs={staffs}
          positions={POSITIONS}
          initialShifts={initialShifts}
          dates={dates}
          timeRange={data.timeRange}
          onShiftsChange={handleShiftsChange}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          hideViewSwitcher
        />
      </Box>

      <Modal
        title={confirmTitle}
        isOpen={confirmModal.isOpen}
        onOpenChange={confirmModal.onOpenChange}
        onSubmit={handleConfirm}
        submitLabel="確定して通知する"
        onClose={confirmModal.close}
      >
        <ConfirmShiftContent staffCount={staffs.length} periodLabel={periodLabel} />
      </Modal>
    </Box>
  );
};
