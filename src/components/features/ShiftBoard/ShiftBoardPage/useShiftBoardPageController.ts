import { useBlocker } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  type AssignmentIssue,
  parseShiftAssignmentValidationError,
  validateShiftAssignments,
} from "@/convex/shiftBoard/validation";
import type { ReminderStatus } from "@/src/components/features/Shift/ShiftForm";
import { showErrorToast, showSuccessToast } from "@/src/components/shared/feedback";
import { useDialog } from "@/src/components/ui/Dialog";
import { toaster } from "@/src/components/ui/toaster";
import { toDisplayIssues } from "@/src/domains/shift/assignmentIssues";
import { type AssignmentWarning, computeAssignmentWarnings } from "@/src/domains/shift/assignmentWarnings";
import { type BuildAssignmentsOptions, buildAssignments } from "@/src/domains/shift/buildAssignments";
import { DEFAULT_POSITION } from "@/src/domains/shift/constants";
import {
  formatDateTime,
  formatDateTimeWithWeekday,
  formatDateWithWeekday,
  getDateRange,
  isPastShiftPeriod,
} from "@/src/domains/shift/date";
import { isAssignmentsEqual } from "@/src/domains/shift/isAssignmentsEqual";
import type { ShiftData, StaffType } from "@/src/domains/shift/types";
import { useShopMutation } from "@/src/hooks/useShopMutation";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import type { ShiftBoardData } from "../types";
import { buildShiftData } from "./buildShiftData";
import type { ShiftBoardPageViewProps } from "./types";
import { visibleAssignmentWarnings } from "./warningVisibility";

const PAST_SHIFT_SAVE_ERROR = "過去のシフトは保存できません";
const PAST_SHIFT_NOTIFY_ERROR = "過去のシフトはスタッフに通知できません";

function getReadOnlyReason(reason: ShiftBoardData["businessWriteBlockReason"]): string {
  switch (reason) {
    case "memberReadOnly":
      return "管理者権限が閲覧のみに制限されているため、シフトを変更できません。";
    case "shopArchived":
      return "アーカイブ済みの店舗のため、シフトを変更できません。";
    case "shopPlanSuspended":
      return "現在のプランでは、この店舗のシフトを変更できません。\n組織設定で利用店舗を確認してください。";
    case "paymentResultPending":
      return "支払い結果を確認中のため、シフトを変更できません。";
    case "restricted":
      return "契約状態を確認できるまで、シフトを変更できません。\n組織設定で契約状態を確認してください。";
    case null:
      return "現在、このシフトは変更できません。";
  }
}

const generatePeriodLabel = (dates: string[]): string => {
  if (dates.length === 0) return "";
  return `${formatDateWithWeekday(dates[0])}〜${formatDateWithWeekday(dates[dates.length - 1])}のシフト`;
};

export const useShiftBoardPageController = (
  data: ShiftBoardData,
  recruitmentId: Id<"recruitments">,
): ShiftBoardPageViewProps => {
  const saveShiftAssignments = useShopMutation(api.shiftBoard.mutations.saveShiftAssignments);
  const confirmRecruitmentMutation = useShopMutation(api.shiftBoard.mutations.confirmRecruitment);

  const confirmedAt = data.recruitment.confirmedAt ? new Date(data.recruitment.confirmedAt) : null;
  const isConfirmed = data.recruitment.status === "confirmed";
  const isReadOnly = !data.canWriteBusinessData;
  const readOnlyReason = isReadOnly ? getReadOnlyReason(data.businessWriteBlockReason) : null;
  const isPastShiftNow = useCallback(() => isPastShiftPeriod(data.recruitment.periodEnd), [data.recruitment.periodEnd]);

  const dates = useMemo(
    () => getDateRange(data.recruitment.periodStart, data.recruitment.periodEnd),
    [data.recruitment.periodStart, data.recruitment.periodEnd],
  );
  const periodLabel = useMemo(() => generatePeriodLabel(dates), [dates]);
  const staffs: StaffType[] = useMemo(
    () =>
      data.staffs.map((staff) => ({
        id: staff._id,
        name: staff.isRemoved ? `${staff.name}（削除済み）` : staff.name,
        isSubmitted: staff.isSubmitted,
        isRemoved: staff.isRemoved,
        createdAt: staff.createdAt,
      })),
    [data.staffs],
  );
  const positions = useMemo(
    () =>
      data.positions.length > 0
        ? data.positions.map((position) => ({
            id: position._id,
            name: position.name,
            color: position.color,
            isDefault: position.isDefault,
          }))
        : [DEFAULT_POSITION],
    [data.positions],
  );
  const assignmentBuildOptions = useMemo<BuildAssignmentsOptions<Id<"positions">>>(() => {
    const defaultPositionId = data.positions.find((position) => position.isDefault)?._id ?? data.positions[0]?._id;
    return {
      submissionPatternKind: data.submissionPattern.kind,
      ...(defaultPositionId ? { defaultPositionId } : {}),
    };
  }, [data.positions, data.submissionPattern.kind]);
  const initialShifts = useMemo(() => buildShiftData(data, staffs, dates), [data, staffs, dates]);

  const shiftsRef = useRef<ShiftData[]>(initialShifts);
  // 最後に保存した（または初期表示した）シフト。dirty判定の基準
  const baselineShiftsRef = useRef<ShiftData[]>(initialShifts);
  // 確定済みの編集では「開いた時点の確定シフト」から変わったセルだけをwarning表示対象にする。
  // 下書き保存でdirty基準が更新されても、再通知までは確認対象を維持する
  const confirmedWarningBaselineRef = useRef<ShiftData[]>(initialShifts);
  const isFormInitializedRef = useRef(false);
  const canWriteBusinessDataRef = useRef(data.canWriteBusinessData);
  const shopClosedDateSet = useMemo(
    () => new Set(data.recruitment.shopClosedDates),
    [data.recruitment.shopClosedDates],
  );

  // 確定前バリデーション（エラー=確定不可）とワーニング（確認事項=確定はできる助言）。
  // エラーは確定時に表示する。ワーニングは初期表示と編集後に表内バッジ/アイコンへ反映する
  const [validationIssues, setValidationIssues] = useState<AssignmentIssue[]>([]);
  const [validationWarnings, setValidationWarnings] = useState<AssignmentWarning[]>([]);
  const hasAttemptedConfirmRef = useRef(false);

  const buildSaveAssignments = useCallback(
    (shifts: ShiftData[]) =>
      buildAssignments<Id<"staffs">, Id<"positions">>(shifts, shopClosedDateSet, assignmentBuildOptions),
    [assignmentBuildOptions, shopClosedDateSet],
  );

  const validateCurrentShifts = useCallback(
    (shifts: ShiftData[]) =>
      validateShiftAssignments({
        assignments: buildSaveAssignments(shifts),
        periodStart: data.recruitment.periodStart,
        periodEnd: data.recruitment.periodEnd,
        closedDates: data.recruitment.shopClosedDates,
        pattern: data.submissionPattern,
      }),
    [
      buildSaveAssignments,
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

  const computeVisibleWarnings = useCallback(
    (shifts: ShiftData[]) =>
      visibleAssignmentWarnings({
        warnings: computeCurrentWarnings(shifts),
        currentShifts: shifts,
        baselineShifts: confirmedWarningBaselineRef.current,
        closedDateSet: shopClosedDateSet,
        buildAssignmentsOptions: assignmentBuildOptions,
        isConfirmed,
      }),
    [assignmentBuildOptions, computeCurrentWarnings, isConfirmed, shopClosedDateSet],
  );

  // エラー（確定不可）と確認事項（助言）をまとめて再評価し、一覧・バッジ・ハイライトに反映する。
  // 確定可否の判定に使えるよう、評価したエラーを返す
  const revalidate = useCallback(
    (shifts: ShiftData[]) => {
      const issues = validateCurrentShifts(shifts);
      setValidationIssues(issues);
      setValidationWarnings(computeVisibleWarnings(shifts));
      return issues;
    },
    [validateCurrentShifts, computeVisibleWarnings],
  );

  const handleShiftsChange = useCallback(
    (shifts: ShiftData[]) => {
      shiftsRef.current = shifts;
      // ShiftFormはマウント時にatom初期値([])→initialShiftsの順で通知してくる。
      // initialShifts（参照一致）を受け取って初めてユーザー編集を検知できる状態になる
      if (shifts === baselineShiftsRef.current) {
        isFormInitializedRef.current = true;
        // 確定済みシフトを開き直しただけなら、過去の確認事項を編集面に再掲しない。
        setValidationWarnings(computeVisibleWarnings(shifts));
        if (!hasAttemptedConfirmRef.current) return;
      }
      if (hasAttemptedConfirmRef.current) {
        revalidate(shifts);
        return;
      }
      if (isFormInitializedRef.current) {
        setValidationWarnings(computeVisibleWarnings(shifts));
      }
    },
    [computeVisibleWarnings, revalidate],
  );

  const dismissValidationIssues = useCallback(() => {
    hasAttemptedConfirmRef.current = false;
    setValidationIssues([]);
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

  const unsubmittedNames = useMemo(
    () => data.staffs.filter((staff) => !staff.isSubmitted).map((staff) => staff.name),
    [data.staffs],
  );
  const reminderStatus = useMemo<ReminderStatus>(() => {
    if (data.recruitment.lastReminderSentAt) {
      return {
        kind: "sent",
        label: `${formatDateTimeWithWeekday(data.recruitment.lastReminderSentAt)} 催促を送信済み`,
      };
    }
    if (data.recruitment.reminderScheduledAt && data.recruitment.reminderScheduledAt > Date.now()) {
      return {
        kind: "scheduled",
        label: "締切前日の17:00に、催促通知を自動で送ります。",
      };
    }
    return {
      kind: "none",
      label: "自動催促は設定されていません",
    };
  }, [data.recruitment.lastReminderSentAt, data.recruitment.reminderScheduledAt]);

  // 現在のシフトを保存し、dirty判定の基準（baseline）を保存時点に更新する
  const persistCurrentShifts = useCallback(async () => {
    if (isReadOnly) {
      toaster.create({ title: readOnlyReason ?? "現在、このシフトは変更できません", type: "info" });
      return false;
    }
    if (isPastShiftNow()) {
      toaster.create({ title: PAST_SHIFT_SAVE_ERROR, type: "error" });
      return false;
    }
    const shiftsAtSave = shiftsRef.current;
    await saveShiftAssignments({ recruitmentId, assignments: buildSaveAssignments(shiftsAtSave) });
    baselineShiftsRef.current = shiftsAtSave;
    return true;
  }, [buildSaveAssignments, isPastShiftNow, isReadOnly, readOnlyReason, recruitmentId, saveShiftAssignments]);

  // 確定ボタン押下時: フロントで全件評価する。
  // エラーがあれば確認ダイアログを開かず一覧表示。ワーニングは確定をブロックせず、ダイアログ内のサマリーで知らせる。
  const handleConfirmRequest = useCallback(() => {
    if (isReadOnly) {
      toaster.create({ title: readOnlyReason ?? "現在、このシフトは変更できません", type: "info" });
      return;
    }
    if (isPastShiftNow()) {
      toaster.create({ title: PAST_SHIFT_NOTIFY_ERROR, type: "error" });
      return;
    }
    hasAttemptedConfirmRef.current = true;
    const issues = revalidate(shiftsRef.current);
    if (issues.length > 0) return;
    confirmModal.open();
  }, [isPastShiftNow, isReadOnly, readOnlyReason, revalidate, confirmModal]);

  const { run: handleConfirm, isRunning: isConfirming } = useSingleFlight(async () => {
    if (isReadOnly) {
      confirmModal.close();
      toaster.create({ title: readOnlyReason ?? "現在、このシフトは変更できません", type: "info" });
      return;
    }
    if (isPastShiftNow()) {
      confirmModal.close();
      toaster.create({ title: PAST_SHIFT_NOTIFY_ERROR, type: "error" });
      return;
    }
    const shiftsAtSave = shiftsRef.current;
    try {
      await saveShiftAssignments({ recruitmentId, assignments: buildSaveAssignments(shiftsAtSave) });
      // 保存はこの時点で完了している。後続のconfirmが失敗しても未保存扱い（離脱ブロック）にしない
      baselineShiftsRef.current = shiftsAtSave;
      const result = await confirmRecruitmentMutation({ recruitmentId, intent: isConfirmed ? "resend" : "confirm" });
      // 初回確定では直前に確認したwarningを残す。再通知では通知済みになるため編集面のwarningをリセットする
      dismissValidationIssues();
      if (isConfirmed) {
        confirmedWarningBaselineRef.current = shiftsAtSave;
        setValidationWarnings([]);
      }
      confirmModal.close();
      if (result?.status === "no_changes") {
        toaster.create({ title: "前回の通知から変更されたスタッフはいません", type: "info" });
        return;
      }
      showSuccessToast({
        title: isConfirmed ? "変更があるスタッフに通知を送りました" : "シフトを確定しました",
      });
    } catch (error) {
      if (handleMutationError(error)) {
        confirmModal.close();
      }
    }
  });

  const { run: performSaveDraft, isRunning: isSavingDraft } = useSingleFlight(async () => {
    try {
      const saved = await persistCurrentShifts();
      if (!saved) return;
      showSuccessToast({ title: "下書きを保存しました" });
    } catch (error) {
      handleMutationError(error);
    }
  });

  // 未保存の変更（ユーザー編集による割り当ての差分）があるか。
  // シフト申請の到着などサーバー由来のデータ変化はatomに反映されないため、ここではdirty扱いにならない
  const hasUnsavedChanges = useCallback(() => {
    if (isReadOnly) return false;
    if (!isFormInitializedRef.current) return false;
    if (shiftsRef.current === baselineShiftsRef.current) return false;
    return !isAssignmentsEqual(
      buildSaveAssignments(shiftsRef.current),
      buildSaveAssignments(baselineShiftsRef.current),
    );
  }, [buildSaveAssignments, isReadOnly]);

  // 離脱時（アプリ内の戻る・ブラウザバック）に未保存の変更があれば確認ダイアログを表示し、
  // 「保存する」「保存しない」を選ばせる。ダイアログを閉じた場合はその場に留まる
  const blocker = useBlocker({
    shouldBlockFn: () => hasUnsavedChanges(),
    enableBeforeUnload: () => hasUnsavedChanges(),
    withResolver: true,
  });

  useEffect(() => {
    if (canWriteBusinessDataRef.current === data.canWriteBusinessData) return;
    canWriteBusinessDataRef.current = data.canWriteBusinessData;

    // 権限変更時はShiftFormも再初期化されるため、controller側の編集基準も同じserver値へ揃える。
    // editable中の通常のquery更新ではここを通らず、ユーザーの未保存draftを維持する。
    shiftsRef.current = initialShifts;
    baselineShiftsRef.current = initialShifts;
    confirmedWarningBaselineRef.current = initialShifts;
    isFormInitializedRef.current = false;
    hasAttemptedConfirmRef.current = false;
    setValidationIssues([]);
    setValidationWarnings([]);

    if (!data.canWriteBusinessData) {
      confirmModal.close();
      blocker.reset?.();
    }
  }, [blocker.reset, confirmModal.close, data.canWriteBusinessData, initialShifts]);

  const { run: handleSaveAndLeave, isRunning: isSavingAndLeaving } = useSingleFlight(async () => {
    if (isReadOnly) {
      blocker.proceed?.();
      return;
    }
    try {
      const saved = await persistCurrentShifts();
      if (!saved) return;
      showSuccessToast({ title: "下書きを保存しました" });
      blocker.proceed?.();
    } catch (error) {
      // 保存に失敗した場合はダイアログを開いたまま留まる
      if (handleMutationError(error)) {
        blocker.reset?.();
      }
    }
  });

  return {
    viewModel: {
      periodLabel,
      confirmedAtLabel: isConfirmed && confirmedAt ? formatDateTime(confirmedAt) : null,
      isConfirmed,
      isReadOnly,
      readOnlyReason,
      showTimeInputGuide: data.submissionPattern.kind === "time",
      shiftForm: {
        shopId: data.shopId,
        staffs,
        positions,
        initialShifts,
        dates,
        timeRange: data.timeRange,
        holidays: data.recruitment.shopClosedDates,
        submissionPattern: data.submissionPattern,
        isSavingDraft,
        isConfirming,
        reminderStatus,
        validationIssues,
        validationWarnings,
      },
      confirmDialog: {
        isOpen: confirmModal.isOpen,
        title: isConfirmed ? "確定済みのシフトをもう一度通知しますか？" : "このシフトをスタッフに通知しますか？",
        submitLabel: isConfirmed ? "変更があるスタッフに通知" : "シフトを確定して通知",
        staffCount: staffs.length,
        warnings: displayWarnings,
      },
      unsubmittedDialog: {
        isOpen: unsubmittedDialog.isOpen,
        names: unsubmittedNames,
        deadline: `${formatDateWithWeekday(data.recruitment.deadline)} 23:59`,
      },
      unsavedChangesDialog: {
        isOpen: blocker.status === "blocked",
        isSaving: isSavingAndLeaving,
      },
    },
    intents: {
      onShiftsChange: handleShiftsChange,
      onSaveDraft: performSaveDraft,
      onConfirmRequest: handleConfirmRequest,
      onOpenUnsubmittedDetails: unsubmittedDialog.open,
      onDismissValidationIssues: dismissValidationIssues,
      onConfirmDialogOpenChange: confirmModal.onOpenChange,
      onConfirmDialogSubmit: handleConfirm,
      onCloseConfirmDialog: confirmModal.close,
      onUnsubmittedDialogOpenChange: unsubmittedDialog.onOpenChange,
      onCloseUnsubmittedDialog: unsubmittedDialog.close,
      onStay: () => blocker.reset?.(),
      onLeaveWithoutSaving: () => blocker.proceed?.(),
      onSaveAndLeave: handleSaveAndLeave,
    },
  };
};
