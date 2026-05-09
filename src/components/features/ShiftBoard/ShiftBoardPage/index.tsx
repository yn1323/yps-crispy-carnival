import { Box, Flex, Icon, Text } from "@chakra-ui/react";
import { Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useCallback, useMemo, useRef } from "react";
import { LuChevronLeft, LuCircleCheck } from "react-icons/lu";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ShiftForm } from "@/src/components/features/Shift/ShiftForm";
import { Dialog, useDialog } from "@/src/components/ui/Dialog";
import { showErrorToast, toaster } from "@/src/components/ui/toaster";
import { DEFAULT_POSITION } from "@/src/domains/shift/constants";
import {
  formatDateTime,
  formatDateTimeWithWeekday,
  formatDateWithWeekday,
  getDateRange,
} from "@/src/domains/shift/date";
import { resolveDisplayShiftLine } from "@/src/domains/shift/resolveDisplayShiftLine";
import type { ShiftData, StaffType } from "@/src/domains/shift/types";
import { ConfirmShiftContent } from "../ConfirmShiftContent";
import { RemindUnsubmittedContent } from "../RemindUnsubmittedContent";
import type { ShiftBoardData } from "../types";

const POSITIONS = [DEFAULT_POSITION];

function generatePeriodLabel(dates: string[]): string {
  if (dates.length === 0) return "";
  return `${formatDateWithWeekday(dates[0])}〜${formatDateWithWeekday(dates[dates.length - 1])} のシフト`;
}

/** Convexデータ → ShiftForm用 ShiftData[] に変換 */
function buildShiftData(data: ShiftBoardData, staffs: StaffType[], dates: string[]): ShiftData[] {
  const requestMap = new Map<string, { startTime: string; endTime: string }>();
  for (const r of data.shiftRequests) {
    requestMap.set(`${r.staffId}-${r.date}`, { startTime: r.startTime, endTime: r.endTime });
  }

  const assignmentMap = new Map<string, { startTime: string; endTime: string }>();
  for (const item of data.shiftAssignments) {
    assignmentMap.set(`${item.staffId}-${item.date}`, { startTime: item.startTime, endTime: item.endTime });
  }
  const wasSubmittedAtDraftMap = new Map(data.staffs.map((s) => [s._id, s.wasSubmittedAtDraft]));

  const shifts: ShiftData[] = [];

  for (const staff of staffs) {
    for (const date of dates) {
      const key = `${staff.id}-${date}`;
      const assignment = assignmentMap.get(key);
      const request = requestMap.get(key);
      const displayLine = resolveDisplayShiftLine({
        hasDraftSaved: data.recruitment.draftSavedAt !== null,
        savedAssignment: assignment,
        wasSubmittedAtDraft: wasSubmittedAtDraftMap.get(staff.id as Id<"staffs">) ?? false,
        currentRequest: request,
      });

      shifts.push({
        id: `shift-${staff.id}-${date}`,
        staffId: staff.id,
        staffName: staff.name,
        date,
        requestedTime: request ? { start: request.startTime, end: request.endTime } : null,
        positions:
          displayLine.type !== "none"
            ? [
                {
                  id: `seg-${staff.id}-${date}`,
                  positionId: DEFAULT_POSITION.id,
                  positionName: DEFAULT_POSITION.name,
                  color: DEFAULT_POSITION.color,
                  start: displayLine.start,
                  end: displayLine.end,
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
  const saveShiftAssignments = useMutation(api.shiftBoard.mutations.saveShiftAssignments);
  const confirmRecruitmentMutation = useMutation(api.shiftBoard.mutations.confirmRecruitment);
  const sendReminderEmailsMutation = useMutation(api.shiftReminder.mutations.sendReminderEmails);

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
  const reminderModal = useDialog();

  const unsubmittedNames = useMemo(() => data.staffs.filter((s) => !s.isSubmitted).map((s) => s.name), [data.staffs]);

  const handleSendReminders = useCallback(async () => {
    try {
      await sendReminderEmailsMutation({ recruitmentId });
      reminderModal.close();
      toaster.create({ title: "提出のお願いを送りました", type: "success" });
    } catch (error) {
      showErrorToast(error);
    }
  }, [sendReminderEmailsMutation, recruitmentId, reminderModal]);

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
      toaster.create({ title: "保存しました", type: "success" });
    } catch (error) {
      showErrorToast(error);
    }
  }, [saveShiftAssignments, recruitmentId, buildAssignments]);

  const confirmTitle = isConfirmed
    ? "確定済みのシフトをもう一度通知しますか？"
    : "このシフトをスタッフに通知しますか？";

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
          onSaveDraft={performSaveDraft}
          onConfirm={confirmModal.open}
          onRemind={isConfirmed ? undefined : reminderModal.open}
          lastSentAtLabel={
            data.recruitment.lastReminderSentAt
              ? formatDateTimeWithWeekday(data.recruitment.lastReminderSentAt)
              : undefined
          }
        />
      </Box>

      <Dialog
        title={confirmTitle}
        isOpen={confirmModal.isOpen}
        onOpenChange={confirmModal.onOpenChange}
        onSubmit={handleConfirm}
        submitLabel="シフトを確定して通知"
        onClose={confirmModal.close}
      >
        <ConfirmShiftContent staffCount={staffs.length} periodLabel={periodLabel} />
      </Dialog>

      <Dialog
        title="未提出のスタッフに提出をお願い"
        isOpen={reminderModal.isOpen}
        onOpenChange={reminderModal.onOpenChange}
        onSubmit={handleSendReminders}
        submitLabel="提出のお願いを送る"
        onClose={reminderModal.close}
      >
        <RemindUnsubmittedContent
          unsubmittedNames={unsubmittedNames}
          deadline={formatDateWithWeekday(data.recruitment.deadline)}
          linkExpiresAtLabel={formatDateTimeWithWeekday(Date.now() + 24 * 60 * 60 * 1000)}
        />
      </Dialog>
    </Flex>
  );
};
