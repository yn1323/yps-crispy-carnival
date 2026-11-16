import { useEffect, useMemo, useRef, useState } from "react";
import { SHIFT_DAY_TEMPLATE_LIMIT } from "@/convex/constants";
import { DAY_TEMPLATE_ISSUE_MESSAGES } from "@/convex/shiftSetup/dayTemplates";
import { assistSituationSchema } from "@/convex/shiftSetup/schemas";
import { showErrorToast, showSuccessToast } from "@/src/components/shared/feedback";
import { useDialog } from "@/src/components/ui/Dialog";
import { toaster } from "@/src/components/ui/toaster";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import {
  changeDayTemplateBars,
  changeRequiredCount,
  copyDayTemplateRequirements,
  createDayTemplateDraft,
  type DayTemplateSelection,
  findDayTemplateDraftIssues,
  findDayTemplateInputsIssue,
  getDayTemplateLabel,
  hasPendingDayTemplateChanges,
  isSameDayTemplateInputs,
  removeDayTemplate,
  renameDayTemplate,
  resolveSelectedDayTemplate,
  toDayTemplateDrafts,
  toDayTemplateDraftsFromSuggestion,
  toDayTemplateInputs,
  toggleDayTemplateHoliday,
  toggleDayTemplateWeekday,
} from "./dayTemplateDrafts";
import {
  applyPositionInputs,
  createDraftPositionId,
  isSamePositions,
  keepPositionsInDayTemplateDrafts,
  reconcileStaffDrafts,
  replacePositionIds,
  replacePositionIdsInDayTemplateDrafts,
  replacePositionIdsInStaffDrafts,
  resolveSavedPositionIds,
  type SavedPositionIds,
  toPositionSaveInputs,
} from "./positionDrafts";
import { formatPendingSections } from "./script";
import {
  changeStaffPositionMarks,
  isSameStaffPositionLevels,
  setStaffPositionLevel,
  toStaffPositionLevels,
  toStaffProfileInputs,
} from "./staffPositionLevels";
import type {
  DayTemplateDraft,
  PendingSection,
  PositionInput,
  ShiftSetupData,
  ShiftSetupEditorView,
  ShiftSetupPosition,
  ShiftSetupRemote,
  StaffPositionLevels,
  StaffPositionMarkChange,
} from "./types";

const ASSIST_UNAVAILABLE_MESSAGE = "いまはAIの下書きを使えません。\n「型を作る」から手で作れます。";
const ASSIST_RATE_LIMITED_MESSAGE =
  "短い時間に続けて作ったため、いまは下書きを作れません。\n少し時間をおいて、もう一度お試しください。";
const ASSIST_EMPTY_MESSAGE = "下書きに入れる型がありませんでした。\n「型を作る」から手で作れます。";

type Input = {
  setup: ShiftSetupData;
  remote: ShiftSetupRemote;
};

/**
 * 「シフト作成の設定」の編集中の値と保存の流れを持つ。
 * ポジション、必要人数、スタッフの条件は編集中の値として持ち、ページの「保存する」でまとめて保存する。
 * ポジションのDialogは、決めた一覧を編集中の値へ反映するだけで、保存しない。
 */
export function useShiftSetupEditor({ setup, remote }: Input) {
  const canWrite = setup.canWriteBusinessData;
  const { positions: savedPositions, staffs, submissionPattern: pattern } = setup;

  // nullは「編集していない」を表し、保存済みの値をそのまま表示する。
  const [positionDrafts, setPositionDrafts] = useState<ShiftSetupPosition[] | null>(null);
  // 編集中のポジション。必要人数とスタッフの表は、保存の前からこの一覧で表示する。
  const positions = positionDrafts ?? savedPositions;
  const [templateDrafts, setTemplateDrafts] = useState<DayTemplateDraft[] | null>(null);
  // 保存済みの値から変えたスタッフだけを持つ。
  const [staffDrafts, setStaffDrafts] = useState<Record<string, StaffPositionLevels>>({});
  const [templateSelection, setTemplateSelection] = useState<DayTemplateSelection>({ rowKey: null, index: 0 });
  const [hasAttemptedSave, setHasAttemptedSave] = useState(false);
  const [assistMessage, setAssistMessage] = useState<string>();
  // 保存の応答を待っている間は編集を受け付けない。応答のあとで編集中の値を捨てるため、待っている間の編集が消えるのを防ぐ。
  // 描画を待たずに止めるため、stateではなくrefで持つ。
  const isSavingRef = useRef(false);
  const rowKeyCountRef = useRef(0);
  const createRowKey = () => {
    rowKeyCountRef.current += 1;
    return `new-${rowKeyCountRef.current}`;
  };
  const draftPositionCountRef = useRef(0);
  const createNextDraftPositionId = () => {
    draftPositionCountRef.current += 1;
    return createDraftPositionId(draftPositionCountRef.current);
  };

  const positionsDialog = useDialog();
  const assistDialog = useDialog();

  const viewSetup = useMemo(() => ({ ...setup, positions }), [setup, positions]);
  const inputContext = useMemo(() => ({ positions, pattern }), [positions, pattern]);
  // 編集中の一覧から外したポジションのバーと人数は、保存済みの型からも外して表示する。
  const savedDrafts = useMemo(
    () => keepPositionsInDayTemplateDrafts(toDayTemplateDrafts(setup.dayTemplates), positions),
    [setup.dayTemplates, positions],
  );
  const savedInputs = useMemo(() => toDayTemplateInputs(savedDrafts, inputContext), [savedDrafts, inputContext]);
  const drafts = templateDrafts ?? savedDrafts;
  const selectedDraft = resolveSelectedDayTemplate(drafts, templateSelection);
  const templateInputs = toDayTemplateInputs(drafts, inputContext);
  // 作ったまま何も入れていない新しい型だけが違いのときは、保存していない変更に数えない。
  const hasTemplateChanges = templateDrafts !== null && hasPendingDayTemplateChanges(drafts, savedInputs, inputContext);
  const hasPositionChanges = positionDrafts !== null && !isSamePositions(positionDrafts, savedPositions);
  const staffInputs = toStaffProfileInputs(staffs, staffDrafts, positions);
  const pendingSections: PendingSection[] = [
    ...(hasPositionChanges ? (["positions"] as const) : []),
    ...(hasTemplateChanges ? (["dayTemplates"] as const) : []),
    ...(staffInputs.length > 0 ? (["staffs"] as const) : []),
  ];
  const hasUnsavedChangesRef = useRef(false);
  hasUnsavedChangesRef.current = canWrite && pendingSections.length > 0;

  const issues = findDayTemplateDraftIssues(drafts, inputContext);
  const issueMessages: Record<string, string> = {};
  for (const draft of drafts) {
    const issue = issues[draft.rowKey];
    // 入力の途中では誤りを出さず、保存を試したあとで見せる。
    if (issue && hasAttemptedSave) issueMessages[draft.rowKey] = DAY_TEMPLATE_ISSUE_MESSAGES[issue];
  }

  const { close: closePositionsDialog } = positionsDialog;
  const { close: closeAssistDialog } = assistDialog;
  useEffect(() => {
    if (canWrite) return;
    // 書き込めなくなったら、保存できない編集中の値を残さない。
    setPositionDrafts(null);
    setTemplateDrafts(null);
    setStaffDrafts({});
    setHasAttemptedSave(false);
    closePositionsDialog();
    closeAssistDialog();
  }, [canWrite, closeAssistDialog, closePositionsDialog]);

  const canEdit = () => canWrite && !isSavingRef.current;

  const editTemplates = (update: (current: DayTemplateDraft[]) => DayTemplateDraft[]) => {
    if (!canEdit()) return;
    setTemplateDrafts((current) => {
      const next = update(current ?? savedDrafts);
      // 保存済みの値と同じ内容へ戻ったら、編集していない状態へ戻す。
      return isSameDayTemplateInputs(toDayTemplateInputs(next, inputContext), savedInputs) ? null : next;
    });
  };

  /** スタッフごとの、編集中の値を反映したポジションごとの値。 */
  const resolveStaffProfiles = (drafts: Readonly<Record<string, StaffPositionLevels>>) =>
    Object.fromEntries(
      staffs.map((staff) => [staff._id, drafts[staff._id] ?? toStaffPositionLevels(staff, positions)]),
    );

  /** 保存済みの値と同じになったスタッフを、編集中の値から外す。 */
  const toStaffDrafts = (profiles: Readonly<Record<string, StaffPositionLevels>>) =>
    Object.fromEntries(
      staffs.flatMap((staff) => {
        const levels = profiles[staff._id];
        const isChanged =
          levels && !isSameStaffPositionLevels(levels, toStaffPositionLevels(staff, positions), positions);
        return isChanged ? [[staff._id, levels]] : [];
      }),
    );

  const editStaffs = (
    update: (profiles: Record<string, StaffPositionLevels>) => Record<string, StaffPositionLevels>,
  ) => {
    if (!canEdit()) return;
    setStaffDrafts((current) => toStaffDrafts(update(resolveStaffProfiles(current))));
  };

  const changePositionMarks = (change: StaffPositionMarkChange) => {
    if (!canEdit()) return;
    const result = changeStaffPositionMarks(resolveStaffProfiles(staffDrafts), change, positions);
    setStaffDrafts(toStaffDrafts(result.profiles));
    // 入れるポジションがなくなるスタッフは変えていないため、その人数を伝える。
    if (result.skippedCount > 0) {
      toaster.create({ title: `入れるポジションがなくなる${result.skippedCount}人は変えていません`, type: "info" });
    }
  };

  const { run: saveChanges, isRunning: isSaving } = useSingleFlight(async (): Promise<boolean> => {
    if (!canWrite) return false;

    const saved: PendingSection[] = [];
    isSavingRef.current = true;
    try {
      if (hasTemplateChanges) {
        setHasAttemptedSave(true);
        const invalidIndex = drafts.findIndex((draft) => issues[draft.rowKey] !== undefined);
        const invalidDraft = drafts[invalidIndex];
        const issue = invalidDraft ? issues[invalidDraft.rowKey] : findDayTemplateInputsIssue(templateInputs, pattern);
        if (issue) {
          // 誤りのある型を開き、その型の中で誤りを読めるようにする。
          if (invalidDraft) setTemplateSelection({ rowKey: invalidDraft.rowKey, index: invalidIndex });
          toaster.create({ title: DAY_TEMPLATE_ISSUE_MESSAGES[issue], type: "error" });
          return false;
        }
      }

      // 新しく足したポジションは、保存するまでIDがない。ポジションを先に保存してIDを受け取り、
      // 型とスタッフの編集中の値が指す仮のIDを置き換えてから、続きを保存する。
      let savedIds: SavedPositionIds = new Map();
      if (hasPositionChanges) {
        const ids = await remote.savePositions(toPositionSaveInputs(positions));
        // ここから先で失敗しても、もう一度の保存でポジションを作り直さないよう、編集中の一覧を先に捨てる。
        setPositionDrafts(null);
        saved.push("positions");
        savedIds = resolveSavedPositionIds(positions, ids);
        const replaceIds = savedIds;
        setTemplateDrafts((current) => current && replacePositionIdsInDayTemplateDrafts(current, replaceIds));
        setStaffDrafts((current) => replacePositionIdsInStaffDrafts(current, replaceIds));
      }
      // 保存の引数は、保存後のIDを持つ一覧から作る。一覧にないIDのバー、人数、熟練度は引数に入らない。
      const positionsToSave = replacePositionIds(positions, savedIds);

      if (hasTemplateChanges) {
        await remote.saveDayTemplates(
          toDayTemplateInputs(replacePositionIdsInDayTemplateDrafts(drafts, savedIds), {
            positions: positionsToSave,
            pattern,
          }),
        );
        setTemplateDrafts(null);
        setHasAttemptedSave(false);
        saved.push("dayTemplates");
      }
      const staffInputsToSave = toStaffProfileInputs(
        staffs,
        replacePositionIdsInStaffDrafts(staffDrafts, savedIds),
        positionsToSave,
      );
      if (staffInputsToSave.length > 0) {
        await remote.saveStaffShiftProfiles(staffInputsToSave);
        setStaffDrafts({});
        saved.push("staffs");
      }
      return true;
    } catch (error) {
      showErrorToast(error);
      return false;
    } finally {
      isSavingRef.current = false;
      // 途中まで保存できた場合も、保存できた分を伝える。
      if (saved.length > 0) showSuccessToast({ title: `${formatPendingSections(saved)}の設定を保存しました` });
    }
  });

  /** Dialogで決めたポジションの一覧を、編集中の値へ反映する。保存はしない。 */
  const applyPositions = (inputs: PositionInput[]) => {
    if (!canEdit()) return;
    const next = applyPositionInputs(inputs, positions, createNextDraftPositionId);
    setPositionDrafts(isSamePositions(next, savedPositions) ? null : next);
    // 外したポジションのバー、人数、熟練度は、編集中の値からも外す。「元に戻す」で保存済みの内容へ戻る。
    setTemplateDrafts((current) => current && keepPositionsInDayTemplateDrafts(current, next));
    setStaffDrafts((current) => reconcileStaffDrafts(staffs, current, next));
    positionsDialog.close();
  };

  const { run: requestAssist, isRunning: isAssistRunning } = useSingleFlight(async (situation: string) => {
    if (!canEdit() || !setup.assistAvailable) return;
    const parsed = assistSituationSchema.safeParse(situation);
    if (!parsed.success) {
      setAssistMessage(parsed.error.issues[0]?.message ?? "入力内容を確認してください。");
      return;
    }

    setAssistMessage(undefined);
    try {
      const result = await remote.suggestShiftSetup(parsed.data);
      if (result.status !== "ok") {
        setAssistMessage(result.status === "rateLimited" ? ASSIST_RATE_LIMITED_MESSAGE : ASSIST_UNAVAILABLE_MESSAGE);
        return;
      }
      if (result.templates.length === 0) {
        setAssistMessage(ASSIST_EMPTY_MESSAGE);
        return;
      }
      // 下書きは編集中の値へ入れるだけにする。設定が変わるのは、利用者が「保存する」を押したときである。
      // 下書きは保存済みのポジションから作られるため、編集中の一覧から外したポジションの分を除く。
      const suggested = keepPositionsInDayTemplateDrafts(
        toDayTemplateDraftsFromSuggestion(result.templates, createRowKey),
        positions,
      );
      setTemplateDrafts(suggested);
      setTemplateSelection({ rowKey: suggested[0].rowKey, index: 0 });
      setHasAttemptedSave(false);
      assistDialog.close();
      showSuccessToast({ title: "下書きを表に入れました", description: "内容を確かめてから保存してください。" });
    } catch (error) {
      showErrorToast(error);
    }
  });

  const openWhenWritable = (open: () => void) => () => {
    if (canWrite) open();
  };

  const copyRequirements = (target: { fromRowKey: string; toRowKey: string }) => {
    const source = drafts.find((draft) => draft.rowKey === target.fromRowKey);
    const hasTarget = drafts.some((draft) => draft.rowKey === target.toRowKey);
    if (!canEdit() || !source || !hasTarget || target.fromRowKey === target.toRowKey) return;
    editTemplates((current) => copyDayTemplateRequirements(current, target));
    // 写したあとも見えている範囲がほとんど変わらないため、どの型から写したかを伝える。
    showSuccessToast({ title: `「${getDayTemplateLabel(source)}」の必要人数をコピーしました` });
  };

  const view: ShiftSetupEditorView = {
    setup: viewSetup,
    savedPositions,
    canWrite,
    dayTemplates: {
      drafts,
      selectedRowKey: selectedDraft?.rowKey ?? null,
      issueMessages,
      canAdd: drafts.length < SHIFT_DAY_TEMPLATE_LIMIT,
    },
    staffProfiles: resolveStaffProfiles(staffDrafts),
    pendingSections: canWrite ? pendingSections : [],
    isSaving,
    positionsDialog: { ...positionsDialog, open: openWhenWritable(positionsDialog.open) },
    assistDialog: {
      ...assistDialog,
      open: openWhenWritable(() => {
        setAssistMessage(undefined);
        assistDialog.open();
      }),
      isRunning: isAssistRunning,
      message: assistMessage,
    },
    intents: {
      onSelectDayTemplate: (rowKey) => {
        const index = drafts.findIndex((draft) => draft.rowKey === rowKey);
        if (index !== -1) setTemplateSelection({ rowKey, index });
      },
      onAddDayTemplate: () => {
        if (!canEdit() || drafts.length >= SHIFT_DAY_TEMPLATE_LIMIT) return;
        const rowKey = createRowKey();
        editTemplates((current) =>
          current.length >= SHIFT_DAY_TEMPLATE_LIMIT
            ? current
            : [
                ...current,
                createDayTemplateDraft({
                  drafts: current,
                  pattern,
                  regularClosedDays: setup.regularClosedDays,
                  rowKey,
                }),
              ],
        );
        setTemplateSelection({ rowKey, index: drafts.length });
      },
      onRemoveDayTemplate: (rowKey) => {
        if (!canEdit()) return;
        const index = drafts.findIndex((draft) => draft.rowKey === rowKey);
        editTemplates((current) => removeDayTemplate(current, rowKey));
        // 削除した型を編集していた場合は、同じ位置に来る型へ移る。
        if (selectedDraft?.rowKey === rowKey) setTemplateSelection({ rowKey: null, index });
      },
      onRenameDayTemplate: (rowKey, name) => editTemplates((current) => renameDayTemplate(current, rowKey, name)),
      onToggleWeekday: (rowKey, weekday) =>
        editTemplates((current) => toggleDayTemplateWeekday(current, rowKey, weekday)),
      onToggleHoliday: (rowKey) => editTemplates((current) => toggleDayTemplateHoliday(current, rowKey)),
      onChangeBars: (rowKey, bars) => editTemplates((current) => changeDayTemplateBars(current, rowKey, bars)),
      onChangeRequiredCount: (rowKey, change) =>
        editTemplates((current) => changeRequiredCount(current, rowKey, change)),
      onCopyRequirements: copyRequirements,
      onChangeStaffPositionLevel: (staffId, positionId, level) =>
        editStaffs((profiles) => {
          const levels = profiles[staffId];
          return levels
            ? { ...profiles, [staffId]: setStaffPositionLevel(levels, positionId, level, positions) }
            : profiles;
        }),
      onChangeStaffPositionMarks: changePositionMarks,
      onResetChanges: () => {
        if (isSavingRef.current) return;
        setPositionDrafts(null);
        setTemplateDrafts(null);
        setStaffDrafts({});
        setHasAttemptedSave(false);
      },
      onSaveChanges: () => void saveChanges(),
      onApplyPositions: applyPositions,
      onRequestAssist: (situation) => void requestAssist(situation),
    },
  };

  return {
    view,
    /** 保存していない変更があるか。離脱確認が、描画を待たずに最新の値を読むために使う。 */
    hasUnsavedChanges: () => hasUnsavedChangesRef.current,
    saveChanges,
  };
}
