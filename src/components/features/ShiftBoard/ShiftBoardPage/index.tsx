import { Box, Flex, Icon, Text, useBreakpointValue } from "@chakra-ui/react";
import { Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useCallback, useMemo, useRef } from "react";
import { LuChevronLeft, LuCircleCheck } from "react-icons/lu";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ShiftForm } from "@/src/components/features/Shift/ShiftForm";
import { DEFAULT_POSITION } from "@/src/components/features/Shift/ShiftForm/constants";
import type { ShiftData, StaffType } from "@/src/components/features/Shift/ShiftForm/types";
import {
  formatDateShort,
  formatDateTime,
  getDateRange,
  getWeekdayLabel,
} from "@/src/components/features/Shift/ShiftForm/utils/dateUtils";
import { BottomSheet } from "@/src/components/ui/BottomSheet";
import { Dialog, useDialog } from "@/src/components/ui/Dialog";
import { showErrorToast, toaster } from "@/src/components/ui/toaster";
import { ConfirmShiftContent } from "../ConfirmShiftContent";
import { SaveDraftWarningContent } from "../SaveDraftWarningContent";
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
  const saveDraftWarningModal = useDialog();
  const Modal = isMobile ? BottomSheet : Dialog;

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

  const performSaveDraft = useCallback(async () => {
    try {
      await saveShiftAssignments({ recruitmentId, assignments: buildAssignments() });
      saveDraftWarningModal.close();
      toaster.create({ title: "保存しました", type: "success" });
    } catch (error) {
      showErrorToast(error);
    }
  }, [saveShiftAssignments, recruitmentId, buildAssignments, saveDraftWarningModal]);

  const handleSaveDraft = useCallback(() => {
    const isFirstSave = data.shiftAssignments.length === 0 && !isConfirmed;
    if (isFirstSave) {
      saveDraftWarningModal.open();
    } else {
      void performSaveDraft();
    }
  }, [data.shiftAssignments.length, isConfirmed, saveDraftWarningModal, performSaveDraft]);

  const confirmTitle = isConfirmed ? "シフトを再通知しますか？" : "シフトを確定して通知しますか？";

  return (
    <Flex direction="column" h="calc(100dvh - 56px)" minH={0}>
      <Flex align="center" justify="space-between" bg="white" px={{ base: 4, lg: 6 }} py={2} flexShrink={0}>
        <Link to="/dashboard">
          <Flex align="center" gap={1} color="gray.500" _hover={{ color: "gray.700" }} cursor="pointer">
            <Icon boxSize={4}>
              <LuChevronLeft />
            </Icon>
            <Text fontSize="sm">戻る</Text>
          </Flex>
        </Link>
        <Text fontSize={{ base: "sm", lg: "md" }} fontWeight={600} color="gray.900">
          {periodLabel}
        </Text>
        {isConfirmed && confirmedAt ? (
          <Flex align="center" gap={1}>
            <Icon color="green.600" boxSize={3.5}>
              <LuCircleCheck />
            </Icon>
            <Text fontSize="xs" color="green.600" display={{ base: "none", lg: "inline" }}>
              確定済み（{formatDateTime(confirmedAt)}）
            </Text>
            <Text fontSize="2xs" color="green.600" display={{ base: "inline", lg: "none" }}>
              確定済み
            </Text>
          </Flex>
        ) : (
          <Box w={{ base: "40px", lg: "80px" }} />
        )}
      </Flex>

      <Box flex={1} minH={0}>
        <ShiftForm
          shopId={data.shopId}
          staffs={staffs}
          positions={POSITIONS}
          initialShifts={initialShifts}
          dates={dates}
          timeRange={data.timeRange}
          onShiftsChange={handleShiftsChange}
          isConfirmed={isConfirmed}
          onSaveDraft={handleSaveDraft}
          onConfirm={confirmModal.open}
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

      <Modal
        title="締切前のシフト自動適用がオフになります"
        isOpen={saveDraftWarningModal.isOpen}
        onOpenChange={saveDraftWarningModal.onOpenChange}
        onSubmit={performSaveDraft}
        submitLabel="保存する"
        onClose={saveDraftWarningModal.close}
      >
        <SaveDraftWarningContent />
      </Modal>
    </Flex>
  );
};
