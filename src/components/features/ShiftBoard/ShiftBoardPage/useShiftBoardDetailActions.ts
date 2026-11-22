import { useNavigate } from "@tanstack/react-router";
import { useConvex } from "convex/react";
import { type MutableRefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { ShiftFormDetailActions } from "@/src/components/features/Shift/ShiftForm";
import { showErrorToast, showSuccessToast } from "@/src/components/shared/feedback";
import { toaster } from "@/src/components/ui/toaster";
import { insertProvisionalAssignments } from "@/src/domains/shift/provisionalAssignments";
import type { PositionType, ShiftData, StaffSortMode, StaffType } from "@/src/domains/shift/types";
import { useShopMutation } from "@/src/hooks/useShopMutation";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import type { ManagerShopScope } from "@/src/providers/ManagerShopScopeProvider";
import type { ShiftBoardData, ShiftBoardStaffingData } from "../types";
import { toDayTemplateIdArg } from "./staffingAdapter";

type Input = {
  data: ShiftBoardData;
  recruitmentId: Id<"recruitments">;
  expectedEditVersion: number;
  staffing: ShiftBoardStaffingData | undefined;
  /** 画面が操作している店舗。店舗を特定できない利用箇所ではnull。 */
  shopScope: ManagerShopScope | null;
  staffs: readonly StaffType[];
  positions: readonly PositionType[];
  /** いま画面にある勤務。仮の勤務を入れる先を読むために使う。 */
  shiftsRef: MutableRefObject<ShiftData[]>;
  isReadOnly: boolean;
  isConfirmed: boolean;
  hasUnsavedChanges: () => boolean;
  /** 保存の失敗を画面へ反映する。画面へ反映できた場合はtrueを返す。 */
  handleMutationError: (error: unknown) => boolean;
};

/**
 * シフト表の表示設定と「くわしく」表示の操作を持つ。
 * 設定ページを開く、その日のテンプレートを当て直す、前回の勤務を仮で入れる、
 * 「シンプル / くわしく」を切り替える、スタッフの並び替えを変える、の5つである。
 * 勤務の保存と確定は持たない。
 */
export const useShiftBoardDetailActions = ({
  data,
  recruitmentId,
  expectedEditVersion,
  staffing,
  shopScope,
  staffs,
  positions,
  shiftsRef,
  isReadOnly,
  isConfirmed,
  hasUnsavedChanges,
  handleMutationError,
}: Input) => {
  const navigate = useNavigate();
  const convex = useConvex();
  const applyDayTemplateToDates = useShopMutation(api.shiftSetup.mutations.applyDayTemplateToDates);
  const switchShiftDetailMode = useShopMutation(api.shiftBoard.mutations.switchShiftDetailMode);
  const setShiftStaffSortMode = useShopMutation(api.shiftBoard.mutations.setShiftStaffSortMode);
  const applyShiftsRef = useRef<((update: (current: ShiftData[]) => ShiftData[]) => void) | null>(null);

  const handleOpenSetup = useCallback(() => {
    if (!shopScope) return;
    void navigate({
      to: "/manage/shops/$shopId/shift-setup",
      params: { shopId: shopScope.shopId },
      search: { org: shopScope.expectedOrganizationId },
    });
  }, [navigate, shopScope]);

  // テンプレートの当て直し。必要人数だけを変え、シフト表の下書き（未保存の勤務）には触れない。
  const { run: runApplyDayTemplate, isRunning: isApplyingDayTemplate } = useSingleFlight(
    async (targetDates: string[], templateId: string | null) => {
      try {
        await applyDayTemplateToDates({
          recruitmentId,
          dates: targetDates,
          templateId: toDayTemplateIdArg(templateId),
        });
        if (targetDates.length > 1) showSuccessToast({ title: `${targetDates.length}日のテンプレートを変更しました` });
        return true;
      } catch (error) {
        showErrorToast(error);
        return false;
      }
    },
  );
  const handleApplyDayTemplate = useCallback(
    async (targetDates: string[], templateId: string | null) =>
      (await runApplyDayTemplate(targetDates, templateId)) ?? false,
    [runApplyDayTemplate],
  );

  const { run: handleInsertProvisional, isRunning: isInsertingProvisional } = useSingleFlight(async () => {
    if (!shopScope || !applyShiftsRef.current) return;
    try {
      const candidates = await convex.query(api.shiftBoard.queries.getProvisionalAssignments, {
        shopId: shopScope.shopId as Id<"shops">,
        expectedOrganizationId: shopScope.expectedOrganizationId as Id<"organizations">,
        recruitmentId,
      });
      const unsubmittedStaffIds = new Set(staffs.filter((staff) => !staff.isSubmitted).map((staff) => staff.id));
      const result = insertProvisionalAssignments({
        shifts: shiftsRef.current,
        // パターン選択と日付選択は休憩を扱わないため、前回の勤務の休憩を引き継がない。
        candidates: (candidates ?? []).map((candidate) =>
          data.submissionPattern.kind === "time" ? candidate : { ...candidate, breaks: undefined },
        ),
        unsubmittedStaffIds,
        positions,
      });
      if (result.insertedCount === 0) {
        toaster.create({ title: "仮で入れられる前回の勤務がありませんでした", type: "info" });
        return;
      }
      applyShiftsRef.current(() => result.shifts);
      showSuccessToast({ title: `前回の勤務を${result.insertedCount}日分、仮で入れました` });
    } catch (error) {
      showErrorToast(error);
    }
  });

  // ShiftFormは、この通知を渡した画面でだけ「シンプル / くわしく」の切り替えを出す。通知の内容は、いまは使わない。
  const handleDetailModeChange = useCallback((_isDetailMode: boolean) => {}, []);

  // 「シンプル / くわしく」の切り替え。表示が変わると勤務の持ち方が合わなくなるため、この募集の下書きと保存していない編集を捨て、
  // 選んだ表示を店舗へ保存する。保存が済むと、店舗の表示が変わったデータを受けて、ページ全体が開き直される。
  // 確定済みの募集、変更できない画面、店舗を特定できない利用箇所では切り替えを出さない。
  const canSwitchDetailMode = Boolean(shopScope) && !isReadOnly && !isConfirmed;
  const [pendingDetailMode, setPendingDetailMode] = useState<boolean | null>(null);
  const { run: runSwitchDetailMode, isRunning: isSwitchingDetailMode } = useSingleFlight(
    async (isDetailMode: boolean) => {
      try {
        await switchShiftDetailMode({ recruitmentId, expectedEditVersion, isDetailMode });
      } catch (error) {
        setPendingDetailMode(null);
        handleMutationError(error);
      }
    },
  );
  // スタッフの並び替え（固定 / 勤務時間順）。店舗に保存し、管理者全員と全端末で共通にする。
  // 押してすぐ並びが変わるよう、先に画面を切り替えてから保存し、保存できなければ元へ戻す。
  const savedStaffSortMode: StaffSortMode = data.shiftStaffSortMode ?? "fixed";
  const [staffSortMode, setStaffSortMode] = useState<StaffSortMode>(savedStaffSortMode);
  useEffect(() => {
    setStaffSortMode(savedStaffSortMode);
  }, [savedStaffSortMode]);
  const requestStaffSortModeChange = useCallback(
    (mode: StaffSortMode) => {
      setStaffSortMode(mode);
      void setShiftStaffSortMode({ mode }).catch((error: unknown) => {
        setStaffSortMode(savedStaffSortMode);
        handleMutationError(error);
      });
    },
    [handleMutationError, savedStaffSortMode, setShiftStaffSortMode],
  );

  const hasSavedDraft = data.recruitment.draftSavedAt !== null;
  const requestDetailModeChange = useCallback(
    (isDetailMode: boolean) => {
      // 下書き保存したシフトも、保存していない編集もなければ、消えるものがないため確認せずに切り替える。
      if (!hasSavedDraft && !hasUnsavedChanges()) {
        void runSwitchDetailMode(isDetailMode);
        return;
      }
      setPendingDetailMode(isDetailMode);
    },
    [hasSavedDraft, hasUnsavedChanges, runSwitchDetailMode],
  );
  const confirmDetailModeSwitch = useCallback(() => {
    if (pendingDetailMode !== null) void runSwitchDetailMode(pendingDetailMode);
  }, [pendingDetailMode, runSwitchDetailMode]);
  const cancelDetailModeSwitch = useCallback(() => setPendingDetailMode(null), []);

  const hasUnsubmittedStaff = staffs.some((staff) => !staff.isSubmitted && !staff.isRemoved);
  const canInsertProvisional =
    Boolean(shopScope) &&
    !isReadOnly &&
    !isConfirmed &&
    hasUnsubmittedStaff &&
    staffing?.hasPreviousConfirmedRecruitment === true;
  // 確定済みの募集は、確定した時点の必要人数を残すため、テンプレートの当て直しを出さない。
  const canEditDayStaffing = Boolean(shopScope) && !isReadOnly && staffing !== undefined && !staffing.isLocked;
  const detailActions = useMemo<ShiftFormDetailActions>(
    () => ({
      ...(shopScope ? { onOpenSetup: handleOpenSetup } : {}),
      ...(canEditDayStaffing
        ? {
            dayStaffingActions: {
              onApplyTemplate: handleApplyDayTemplate,
              isPending: isApplyingDayTemplate,
            },
          }
        : {}),
      ...(canInsertProvisional
        ? { provisionalAction: { onInsert: handleInsertProvisional, isLoading: isInsertingProvisional } }
        : {}),
      ...(canSwitchDetailMode ? { requestDetailModeChange } : {}),
      // 並び替えは表示の好みなので、確定済みや過去の募集でも変えられる。店舗を特定できる画面でだけ出す。
      ...(shopScope ? { requestStaffSortModeChange } : {}),
    }),
    [
      canSwitchDetailMode,
      requestDetailModeChange,
      requestStaffSortModeChange,
      shopScope,
      canEditDayStaffing,
      canInsertProvisional,
      handleOpenSetup,
      handleApplyDayTemplate,
      isApplyingDayTemplate,
      handleInsertProvisional,
      isInsertingProvisional,
    ],
  );

  return {
    detailActions,
    applyShiftsRef,
    canSwitchDetailMode,
    staffSortMode,
    detailModeSwitchDialog: { isOpen: pendingDetailMode !== null, isSwitching: isSwitchingDetailMode },
    handleDetailModeChange,
    confirmDetailModeSwitch,
    cancelDetailModeSwitch,
  };
};
