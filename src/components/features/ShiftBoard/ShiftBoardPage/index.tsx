import { Box, Flex, Icon, Text } from "@chakra-ui/react";
import { Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useCallback, useMemo, useRef } from "react";
import { LuChevronLeft, LuCircleCheck } from "react-icons/lu";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ShiftForm } from "@/src/components/features/Shift/ShiftForm";
import { HEADER_HEIGHT } from "@/src/components/templates/Header";
import { Dialog, useDialog } from "@/src/components/ui/Dialog";
import { showErrorToast, toaster } from "@/src/components/ui/toaster";
import { BREAK_POSITION, DEFAULT_POSITION } from "@/src/domains/shift/constants";
import {
  formatDateTime,
  formatDateTimeWithWeekday,
  formatDateWithWeekday,
  getDateRange,
} from "@/src/domains/shift/date";
import { resolveDisplayShiftLine } from "@/src/domains/shift/resolveDisplayShiftLine";
import { minutesToTime } from "@/src/domains/shift/time";
import type { ShiftData, ShiftTimeRange, StaffType } from "@/src/domains/shift/types";
import { ConfirmShiftContent } from "../ConfirmShiftContent";
import { RemindUnsubmittedContent } from "../RemindUnsubmittedContent";
import type { ShiftBoardData } from "../types";

type ShiftRequestRange = { startTime: string; endTime: string; optionId: string | null };

function generatePeriodLabel(dates: string[]): string {
  if (dates.length === 0) return "";
  return `${formatDateWithWeekday(dates[0])}〜${formatDateWithWeekday(dates[dates.length - 1])} のシフト`;
}

const getRequestSpan = (requests: ShiftRequestRange[]): ShiftRequestRange | undefined => {
  if (requests.length === 0) return undefined;
  const sorted = [...requests].sort((a, b) => a.startTime.localeCompare(b.startTime));
  return {
    startTime: sorted[0].startTime,
    endTime: sorted.reduce(
      (latest, request) => (request.endTime > latest ? request.endTime : latest),
      sorted[0].endTime,
    ),
    optionId: sorted.length === 1 ? sorted[0].optionId : null,
  };
};

const toShiftTimeRange = (request: ShiftRequestRange): ShiftTimeRange => ({
  start: request.startTime,
  end: request.endTime,
});

const getShiftTypeOptionIdForRange = (
  request: { startTime: string; endTime: string; optionId: string | null },
  options: Array<{ id: string; startTime: string; endTime: string }>,
): string | undefined => {
  if (request.optionId) return request.optionId;
  return options.find((option) => option.startTime === request.startTime && option.endTime === request.endTime)?.id;
};

/** Convexデータ → ShiftForm用 ShiftData[] に変換 */
export function buildShiftData(data: ShiftBoardData, staffs: StaffType[], dates: string[]): ShiftData[] {
  const shopClosedDateSet = new Set(data.recruitment.shopClosedDates);
  const positions = data.positions.length > 0 ? data.positions : [];
  const defaultPosition = positions.find((position) => position.isDefault) ?? positions[0];
  const fallbackPosition = defaultPosition
    ? { id: defaultPosition._id, name: defaultPosition.name, color: defaultPosition.color }
    : DEFAULT_POSITION;
  const positionById = new Map(
    positions.map((position) => [position._id, { id: position._id, name: position.name, color: position.color }]),
  );

  const requestMap = new Map<string, ShiftRequestRange[]>();
  for (const r of data.requestedSlots) {
    const key = `${r.staffId}-${r.date}`;
    const requests = requestMap.get(key) ?? [];
    requests.push({ startTime: r.startTime, endTime: r.endTime, optionId: r.optionId ?? null });
    requestMap.set(key, requests);
  }
  const requestedDateSet = new Set(data.requestedDates.map((r) => `${r.staffId}-${r.date}`));
  const fullDayRequest = {
    startTime: minutesToTime(data.timeRange.editableStartMinutes ?? data.timeRange.start * 60),
    endTime: minutesToTime(data.timeRange.editableEndMinutes ?? data.timeRange.end * 60),
    optionId: null,
  };

  const assignmentMap = new Map<
    string,
    Array<{ startTime: string; endTime: string; positionId: Id<"positions">; optionId: string | null }>
  >();
  for (const item of data.shiftAssignments) {
    const key = `${item.staffId}-${item.date}`;
    const assignments = assignmentMap.get(key) ?? [];
    assignments.push({
      startTime: item.startTime,
      endTime: item.endTime,
      positionId: item.positionId,
      optionId: item.optionId ?? null,
    });
    assignmentMap.set(key, assignments);
  }
  const wasSubmittedAtDraftMap = new Map(data.staffs.map((s) => [s._id, s.wasSubmittedAtDraft]));

  const shifts: ShiftData[] = [];

  for (const staff of staffs) {
    for (const date of dates) {
      if (shopClosedDateSet.has(date)) {
        shifts.push({
          id: `shift-${staff.id}-${date}`,
          staffId: staff.id,
          staffName: staff.name,
          date,
          requestedTime: null,
          positions: [],
        });
        continue;
      }

      const key = `${staff.id}-${date}`;
      const assignments = (assignmentMap.get(key) ?? []).sort((a, b) => a.startTime.localeCompare(b.startTime));
      const requests = (requestMap.get(key) ?? []).sort((a, b) => a.startTime.localeCompare(b.startTime));
      const shiftTypeOptions = data.submissionPattern.kind === "shiftType" ? data.submissionPattern.options : [];
      const requestedShiftTypeOptionIds =
        data.submissionPattern.kind === "shiftType"
          ? requests
              .map((requestItem) => getShiftTypeOptionIdForRange(requestItem, shiftTypeOptions))
              .filter((optionId): optionId is string => !!optionId)
          : undefined;
      const request = getRequestSpan(requests) ?? (requestedDateSet.has(key) ? fullDayRequest : undefined);
      const requestedTimes =
        requests.length > 0
          ? requests.map(toShiftTimeRange)
          : requestedDateSet.has(key)
            ? [toShiftTimeRange(fullDayRequest)]
            : undefined;
      const savedAssignment =
        assignments.length > 0
          ? {
              startTime: assignments[0].startTime,
              endTime: assignments[assignments.length - 1].endTime,
            }
          : undefined;
      const isShiftTypePattern = data.submissionPattern.kind === "shiftType";
      const displayLine = resolveDisplayShiftLine({
        hasDraftSaved: data.recruitment.draftSavedAt !== null,
        savedAssignment,
        wasSubmittedAtDraft: wasSubmittedAtDraftMap.get(staff.id as Id<"staffs">) ?? false,
        currentRequest: request,
      });
      const positionSegments =
        assignments.length > 0
          ? assignments.map((assignment, index) => {
              const position = positionById.get(assignment.positionId) ?? fallbackPosition;
              const shiftTypeOptionId =
                data.submissionPattern.kind === "shiftType"
                  ? getShiftTypeOptionIdForRange(assignment, shiftTypeOptions)
                  : undefined;
              return {
                id: `seg-${staff.id}-${date}-${index}`,
                positionId: position.id,
                positionName: position.name,
                color: position.color,
                start: assignment.startTime,
                end: assignment.endTime,
                shiftTypeOptionId,
              };
            })
          : !isShiftTypePattern && displayLine.type === "request" && requests.length > 0
            ? requests.map((requestItem, index) => ({
                id: `seg-${staff.id}-${date}-${index}`,
                positionId: fallbackPosition.id,
                positionName: fallbackPosition.name,
                color: fallbackPosition.color,
                start: requestItem.startTime,
                end: requestItem.endTime,
              }))
            : !isShiftTypePattern && displayLine.type !== "none"
              ? [
                  {
                    id: `seg-${staff.id}-${date}`,
                    positionId: fallbackPosition.id,
                    positionName: fallbackPosition.name,
                    color: fallbackPosition.color,
                    start: displayLine.start,
                    end: displayLine.end,
                  },
                ]
              : [];

      shifts.push({
        id: `shift-${staff.id}-${date}`,
        staffId: staff.id,
        staffName: staff.name,
        date,
        requestedTime: request ? { start: request.startTime, end: request.endTime } : null,
        requestedTimes,
        requestedShiftTypeOptionIds,
        positions: positionSegments,
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

  const positions = useMemo(
    () =>
      data.positions.length > 0
        ? data.positions.map((position) => ({ id: position._id, name: position.name, color: position.color }))
        : [DEFAULT_POSITION],
    [data.positions],
  );

  const initialShifts = useMemo(() => buildShiftData(data, staffs, dates), [data, staffs, dates]);

  const shiftsRef = useRef<ShiftData[]>(initialShifts);
  const handleShiftsChange = useCallback((shifts: ShiftData[]) => {
    shiftsRef.current = shifts;
  }, []);
  const shopClosedDateSet = useMemo(
    () => new Set(data.recruitment.shopClosedDates),
    [data.recruitment.shopClosedDates],
  );

  const confirmModal = useDialog();
  const reminderModal = useDialog();

  const unsubmittedNames = useMemo(() => data.staffs.filter((s) => !s.isSubmitted).map((s) => s.name), [data.staffs]);

  const handleSendReminders = useCallback(async () => {
    try {
      await sendReminderEmailsMutation({ recruitmentId });
      reminderModal.close();
      toaster.create({ title: "催促を送りました", type: "success" });
    } catch (error) {
      showErrorToast(error);
    }
  }, [sendReminderEmailsMutation, recruitmentId, reminderModal]);

  const buildAssignments = useCallback(() => {
    return shiftsRef.current.flatMap((s) => {
      if (shopClosedDateSet.has(s.date)) return [];
      return s.positions
        .filter((position) => position.positionId !== BREAK_POSITION.id)
        .map((position) => ({
          staffId: s.staffId as Id<"staffs">,
          date: s.date,
          startTime: position.start,
          endTime: position.end,
          ...(position.shiftTypeOptionId ? { optionId: position.shiftTypeOptionId } : {}),
          ...(position.positionId !== DEFAULT_POSITION.id
            ? { positionId: position.positionId as Id<"positions"> }
            : {}),
        }));
    });
  }, [shopClosedDateSet]);

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
    <Flex
      direction="column"
      h={{
        base: `calc(100dvh - ${HEADER_HEIGHT.base})`,
        md: `calc(100dvh - ${HEADER_HEIGHT.md})`,
      }}
      minH={0}
    >
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
          positions={positions}
          initialShifts={initialShifts}
          dates={dates}
          timeRange={data.timeRange}
          holidays={data.recruitment.shopClosedDates}
          submissionPattern={data.submissionPattern}
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
        title="未提出のスタッフに催促"
        isOpen={reminderModal.isOpen}
        onOpenChange={reminderModal.onOpenChange}
        onSubmit={handleSendReminders}
        submitLabel="催促を送る"
        onClose={reminderModal.close}
      >
        <RemindUnsubmittedContent
          unsubmittedNames={unsubmittedNames}
          deadline={formatDateWithWeekday(data.recruitment.deadline)}
        />
      </Dialog>
    </Flex>
  );
};
