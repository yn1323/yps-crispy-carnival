import { Box, Flex, Icon, Text } from "@chakra-ui/react";
import { Link, useBlocker } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useCallback, useMemo, useRef, useState } from "react";
import { LuChevronLeft, LuCircleCheck } from "react-icons/lu";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  type AssignmentIssue,
  parseShiftAssignmentValidationError,
  validateShiftAssignments,
} from "@/convex/shiftBoard/validation";
import { ShiftForm } from "@/src/components/features/Shift/ShiftForm";
import type { ReminderStatus } from "@/src/components/features/Shift/ShiftForm/components";
import { HEADER_HEIGHT } from "@/src/components/templates/Header";
import { Button } from "@/src/components/ui/Button";
import { Dialog, useDialog } from "@/src/components/ui/Dialog";
import { showErrorToast, toaster } from "@/src/components/ui/toaster";
import { toDisplayIssues } from "@/src/domains/shift/assignmentIssues";
import { type AssignmentWarning, computeAssignmentWarnings } from "@/src/domains/shift/assignmentWarnings";
import { buildAssignments } from "@/src/domains/shift/buildAssignments";
import { DEFAULT_POSITION } from "@/src/domains/shift/constants";
import {
  formatDateTime,
  formatDateTimeWithWeekday,
  formatDateWithWeekday,
  getDateRange,
} from "@/src/domains/shift/date";
import { isAssignmentsEqual } from "@/src/domains/shift/isAssignmentsEqual";
import { resolveDisplayShiftLine } from "@/src/domains/shift/resolveDisplayShiftLine";
import { minutesToTime } from "@/src/domains/shift/time";
import type { ShiftData, ShiftTimeRange, StaffType } from "@/src/domains/shift/types";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import { ConfirmShiftContent } from "../ConfirmShiftContent";
import { RemindUnsubmittedContent } from "../RemindUnsubmittedContent";
import type { ShiftBoardData } from "../types";
import { UnsavedChangesContent } from "../UnsavedChangesContent";

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
          : isShiftTypePattern && displayLine.type === "request" && requests.length > 0
            ? requests.flatMap((requestItem, index) => {
                const shiftTypeOptionId = getShiftTypeOptionIdForRange(requestItem, shiftTypeOptions);
                if (!shiftTypeOptionId) return [];
                return [
                  {
                    id: `seg-${staff.id}-${date}-${index}`,
                    positionId: fallbackPosition.id,
                    positionName: fallbackPosition.name,
                    color: fallbackPosition.color,
                    start: requestItem.startTime,
                    end: requestItem.endTime,
                    shiftTypeOptionId,
                  },
                ];
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

  const confirmedAt = data.recruitment.confirmedAt ? new Date(data.recruitment.confirmedAt) : null;
  const isConfirmed = data.recruitment.status === "confirmed";

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
  // 最後に保存した（または初期表示した）シフト。dirty判定の基準
  const baselineShiftsRef = useRef<ShiftData[]>(initialShifts);
  const isFormInitializedRef = useRef(false);
  const shopClosedDateSet = useMemo(
    () => new Set(data.recruitment.shopClosedDates),
    [data.recruitment.shopClosedDates],
  );

  // 確定前バリデーション（エラー=確定不可）とワーニング（確認事項=確定はできる助言）。
  // 検出後（attempted）は編集のたびに再評価し、直すと一覧・ハイライトがライブに減っていく
  const [validationIssues, setValidationIssues] = useState<AssignmentIssue[]>([]);
  const [validationWarnings, setValidationWarnings] = useState<AssignmentWarning[]>([]);
  const hasAttemptedConfirmRef = useRef(false);

  const validateCurrentShifts = useCallback(
    (shifts: ShiftData[]) =>
      validateShiftAssignments({
        assignments: buildAssignments(shifts, shopClosedDateSet),
        periodStart: data.recruitment.periodStart,
        periodEnd: data.recruitment.periodEnd,
        closedDates: data.recruitment.shopClosedDates,
        pattern: data.submissionPattern,
      }),
    [
      shopClosedDateSet,
      data.recruitment.periodStart,
      data.recruitment.periodEnd,
      data.recruitment.shopClosedDates,
      data.submissionPattern,
    ],
  );

  const computeCurrentWarnings = useCallback(
    (shifts: ShiftData[]) => computeAssignmentWarnings({ shifts, staffs, pattern: data.submissionPattern }),
    [staffs, data.submissionPattern],
  );

  // エラー（確定不可）と確認事項（助言）をまとめて再評価し、一覧・バッジ・ハイライトに反映する。
  // 確定可否の判定に使えるよう、評価したエラーを返す
  const revalidate = useCallback(
    (shifts: ShiftData[]) => {
      const issues = validateCurrentShifts(shifts);
      setValidationIssues(issues);
      setValidationWarnings(computeCurrentWarnings(shifts));
      return issues;
    },
    [validateCurrentShifts, computeCurrentWarnings],
  );

  const handleShiftsChange = useCallback(
    (shifts: ShiftData[]) => {
      shiftsRef.current = shifts;
      // ShiftFormはマウント時にatom初期値([])→initialShiftsの順で通知してくる。
      // initialShifts（参照一致）を受け取って初めてユーザー編集を検知できる状態になる
      if (shifts === baselineShiftsRef.current) {
        isFormInitializedRef.current = true;
      }
      if (hasAttemptedConfirmRef.current) {
        revalidate(shifts);
      }
    },
    [revalidate],
  );

  const dismissValidationIssues = useCallback(() => {
    hasAttemptedConfirmRef.current = false;
    setValidationIssues([]);
    setValidationWarnings([]);
  }, []);

  const displayWarnings = useMemo(() => toDisplayIssues(validationWarnings, staffs), [validationWarnings, staffs]);

  // サーバー側バリデーションエラー（二重防御）をエラー一覧UIへマップする。
  // 構造化エラーでなければ従来通りtoastにフォールバックする
  const handleMutationError = useCallback((error: unknown) => {
    const issues = parseShiftAssignmentValidationError(error);
    if (issues) {
      hasAttemptedConfirmRef.current = true;
      setValidationIssues(issues);
      return true;
    }
    showErrorToast(error);
    return false;
  }, []);

  const confirmModal = useDialog();
  const unsubmittedDialog = useDialog();

  const unsubmittedNames = useMemo(() => data.staffs.filter((s) => !s.isSubmitted).map((s) => s.name), [data.staffs]);
  const reminderStatus = useMemo<ReminderStatus>(() => {
    if (data.recruitment.lastReminderSentAt) {
      return {
        kind: "sent",
        label: `${formatDateTimeWithWeekday(data.recruitment.lastReminderSentAt)} 催促通知済み`,
      };
    }
    if (data.recruitment.reminderScheduledAt && data.recruitment.reminderScheduledAt > Date.now()) {
      return {
        kind: "scheduled",
        label: "締切前日17:00に自動で催促通知を送ります。",
      };
    }
    return {
      kind: "none",
      label: "自動催促の送信予定はありません",
    };
  }, [data.recruitment.lastReminderSentAt, data.recruitment.reminderScheduledAt]);

  const buildSaveAssignments = useCallback(
    (shifts: ShiftData[]) => buildAssignments<Id<"staffs">, Id<"positions">>(shifts, shopClosedDateSet),
    [shopClosedDateSet],
  );

  // 現在のシフトを保存し、dirty判定の基準（baseline）を保存時点に更新する
  const persistCurrentShifts = useCallback(async () => {
    const shiftsAtSave = shiftsRef.current;
    await saveShiftAssignments({ recruitmentId, assignments: buildSaveAssignments(shiftsAtSave) });
    baselineShiftsRef.current = shiftsAtSave;
  }, [buildSaveAssignments, recruitmentId, saveShiftAssignments]);

  // 確定ボタン押下時: フロントで全件評価する。
  // エラーがあれば確認ダイアログを開かず一覧表示。ワーニング（確認事項）は確定をブロックせず、
  // ダイアログ内のサマリーと盤面のオレンジパネルで知らせる。
  const handleConfirmRequest = useCallback(() => {
    hasAttemptedConfirmRef.current = true;
    const issues = revalidate(shiftsRef.current);
    if (issues.length > 0) return;
    confirmModal.open();
  }, [revalidate, confirmModal]);

  const { run: handleConfirm, isRunning: isConfirming } = useSingleFlight(async () => {
    const shiftsAtSave = shiftsRef.current;
    try {
      await saveShiftAssignments({ recruitmentId, assignments: buildSaveAssignments(shiftsAtSave) });
      // 保存はこの時点で完了している。後続のconfirmが失敗しても未保存扱い（離脱ブロック）にしない
      baselineShiftsRef.current = shiftsAtSave;
      await confirmRecruitmentMutation({ recruitmentId, intent: isConfirmed ? "resend" : "confirm" });
      // 確定済み。残っていた確認事項（オレンジパネル・バッジ）は役目を終えたのでクリアする
      dismissValidationIssues();
      confirmModal.close();
      toaster.create({ title: "確定しました", type: "success" });
    } catch (error) {
      if (handleMutationError(error)) {
        confirmModal.close();
      }
    }
  });

  const { run: performSaveDraft, isRunning: isSavingDraft } = useSingleFlight(async () => {
    try {
      await persistCurrentShifts();
      toaster.create({ title: "保存しました", type: "success" });
    } catch (error) {
      handleMutationError(error);
    }
  });

  // 未保存の変更（ユーザー編集による割り当ての差分）があるか。
  // シフト申請の到着などサーバー由来のデータ変化はatomに反映されないため、ここではdirty扱いにならない
  const hasUnsavedChanges = useCallback(() => {
    if (!isFormInitializedRef.current) return false;
    if (shiftsRef.current === baselineShiftsRef.current) return false;
    return !isAssignmentsEqual(
      buildSaveAssignments(shiftsRef.current),
      buildSaveAssignments(baselineShiftsRef.current),
    );
  }, [buildSaveAssignments]);

  // 離脱時（アプリ内の戻る・ブラウザバック）に未保存の変更があれば確認ダイアログを表示し、
  // 「保存して離脱」「保存せず離脱」を選ばせる。ダイアログを閉じた場合はその場に留まる
  const blocker = useBlocker({
    shouldBlockFn: () => hasUnsavedChanges(),
    enableBeforeUnload: () => hasUnsavedChanges(),
    withResolver: true,
  });

  const { run: handleSaveAndLeave, isRunning: isSavingAndLeaving } = useSingleFlight(async () => {
    try {
      await persistCurrentShifts();
      toaster.create({ title: "保存しました", type: "success" });
      blocker.proceed?.();
    } catch (error) {
      // 保存に失敗した場合はダイアログを開いたまま留まる
      if (handleMutationError(error)) {
        blocker.reset?.();
      }
    }
  });

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
          onConfirm={handleConfirmRequest}
          isSavingDraft={isSavingDraft}
          isConfirming={isConfirming}
          reminderStatus={reminderStatus}
          onOpenUnsubmittedDetails={unsubmittedDialog.open}
          validationIssues={validationIssues}
          validationWarnings={validationWarnings}
          onDismissValidationIssues={dismissValidationIssues}
        />
      </Box>

      <Dialog
        title={confirmTitle}
        isOpen={confirmModal.isOpen}
        onOpenChange={confirmModal.onOpenChange}
        onSubmit={handleConfirm}
        submitLabel="シフトを確定して通知"
        onClose={confirmModal.close}
        isLoading={isConfirming}
        isSubmitDisabled={isConfirming}
      >
        <ConfirmShiftContent staffCount={staffs.length} periodLabel={periodLabel} warnings={displayWarnings} />
      </Dialog>

      <Dialog
        title="未提出のスタッフ"
        isOpen={unsubmittedDialog.isOpen}
        onOpenChange={unsubmittedDialog.onOpenChange}
        onClose={unsubmittedDialog.close}
        closeLabel="閉じる"
      >
        <RemindUnsubmittedContent
          unsubmittedNames={unsubmittedNames}
          deadline={`${formatDateWithWeekday(data.recruitment.deadline)} 23:59`}
        />
      </Dialog>

      <Dialog
        title="保存していない変更があります"
        isOpen={blocker.status === "blocked"}
        onOpenChange={({ open }) => {
          if (!open) blocker.reset?.();
        }}
        role="alertdialog"
        footer={
          <>
            <Button variant="outline" onClick={() => blocker.proceed?.()} disabled={isSavingAndLeaving}>
              保存せず離脱
            </Button>
            <Button colorPalette="teal" onClick={handleSaveAndLeave} loading={isSavingAndLeaving}>
              保存して離脱
            </Button>
          </>
        }
      >
        <UnsavedChangesContent />
      </Dialog>
    </Flex>
  );
};
