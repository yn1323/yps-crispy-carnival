import { useNavigate } from "@tanstack/react-router";
import { useConvex } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { buildAutoAssignments } from "@/convex/shiftBoard/autoCreate/buildAutoAssignments";
import type { ShiftFormDetailActions } from "@/src/components/features/Shift/ShiftForm";
import { showErrorToast, showSuccessToast } from "@/src/components/shared/feedback";
import { toaster } from "@/src/components/ui/toaster";
import { applyAutoAssignments } from "@/src/domains/shift/autoAssignments";
import type { PositionType, ShiftData, StaffSortMode, StaffType } from "@/src/domains/shift/types";
import { useShopMutation } from "@/src/hooks/useShopMutation";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import type { ManagerShopScope } from "@/src/providers/ManagerShopScopeProvider";
import type { ShiftBoardData, ShiftBoardStaffingData } from "../types";
import { AI_DRAFT_FAILURE_MESSAGES } from "./aiDraftFailureMessages";
import { toAutoCreateInput } from "./autoCreateAdapter";
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
  isReadOnly: boolean;
  isConfirmed: boolean;
  hasUnsavedChanges: () => boolean;
  /** 保存の失敗を画面へ反映する。画面へ反映できた場合はtrueを返す。 */
  handleMutationError: (error: unknown) => boolean;
};

/**
 * シフト表の表示設定と「くわしく」表示の操作を持つ。
 * 設定ページを開く、その日のテンプレートを当て直す、勤務を自動で作る、
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

  // 希望シフトからの自動作成。過去の確定シフトの集計を1回だけ読み、画面の中で勤務を作って、下書きをすべて置き換える。
  // 保存はしない。置き換えた下書きは保存済みの内容と違うため、保存していない変更として扱われる。
  const { run: runAutoCreate, isRunning: isAutoCreating } = useSingleFlight(async (includesBreaks: boolean) => {
    if (!shopScope || !applyShiftsRef.current || !staffing) return;
    try {
      const history = await convex.query(api.shiftBoard.queries.getAutoCreateHistory, {
        shopId: shopScope.shopId as Id<"shops">,
        expectedOrganizationId: shopScope.expectedOrganizationId as Id<"organizations">,
        recruitmentId,
      });
      // 過去なしで作ると結果が変わるため、集計を読めなかった場合は作らない。
      if (!history) throw new Error("Auto create history is unavailable");
      const result = buildAutoAssignments(
        toAutoCreateInput({ data, staffs, positions, staffing, history, includesBreaks }),
      );
      if (result.shifts.length === 0) {
        toaster.create({ title: "作成できるシフトがありませんでした", type: "info" });
        return;
      }
      applyShiftsRef.current((current) => applyAutoAssignments({ shifts: current, created: result.shifts, positions }));
      // 人数が足りない所が残っていても、知らせには足さない。作ったのは下書きで、不足はシフト表の人数の表示で分かる。
      showSuccessToast({ title: "シフトを自動作成しました" });
    } catch (error) {
      showErrorToast(error);
    }
  });
  // AIでの自動作成。希望、必要人数、メモはサーバーが読み、決まった手順の下書きをAIが見直した結果を受け取る。
  // 受け取った勤務で下書きをすべて置き換える。保存はしない。
  // 作れなかった場合はfalseを返し、ダイアログを開いたままにして、AIの手直しを外して作り直せるようにする。
  const { run: runAiCreate, isRunning: isAiCreating } = useSingleFlight(async (includesBreaks: boolean) => {
    if (!shopScope || !applyShiftsRef.current) return false;
    try {
      const result = await convex.action(api.shiftBoard.actions.createAiDraft, {
        shopId: shopScope.shopId as Id<"shops">,
        expectedOrganizationId: shopScope.expectedOrganizationId as Id<"organizations">,
        recruitmentId,
        includesBreaks,
      });
      if (result.status === "failed") {
        toaster.create({
          ...AI_DRAFT_FAILURE_MESSAGES[result.reason],
          type: "error",
          duration: Number.POSITIVE_INFINITY,
        });
        return false;
      }
      if (result.shifts.length === 0) {
        toaster.create({ title: "作成できるシフトがありませんでした", type: "info" });
        return true;
      }
      applyShiftsRef.current((current) => applyAutoAssignments({ shifts: current, created: result.shifts, positions }));
      showSuccessToast({ title: "シフトを自動作成しました" });
      return true;
    } catch (error) {
      showErrorToast(error);
      return false;
    }
  });
  const handleAutoCreate = useCallback(
    async (method: "rule" | "ai", options: { includesBreaks: boolean }) => {
      if (method === "ai") return (await runAiCreate(options.includesBreaks)) ?? false;
      await runAutoCreate(options.includesBreaks);
      return true;
    },
    [runAutoCreate, runAiCreate],
  );
  // AIで作れるのは、AIを使える環境の、時間指定の募集だけである。サーバーも同じ条件で断る。
  const aiUnavailableReason =
    staffing?.isAiDraftConfigured !== true
      ? ("notConfigured" as const)
      : data.submissionPattern.kind !== "time"
        ? ("unsupported" as const)
        : undefined;

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

  // 自動作成は必要人数から作るため、店舗の設定を読めた画面でだけ使える。
  const canAutoCreate = Boolean(shopScope) && !isReadOnly && !isConfirmed && staffing !== undefined;
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
      ...(canAutoCreate
        ? {
            autoCreateAction: {
              onCreate: handleAutoCreate,
              isLoading: isAutoCreating || isAiCreating,
              ...(aiUnavailableReason ? { aiUnavailableReason } : {}),
              ...(staffing ? { aiRemainingCount: staffing.aiDraftRemainingCount } : {}),
            },
          }
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
      handleOpenSetup,
      handleApplyDayTemplate,
      isApplyingDayTemplate,
      canAutoCreate,
      handleAutoCreate,
      isAutoCreating,
      isAiCreating,
      aiUnavailableReason,
      staffing,
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
