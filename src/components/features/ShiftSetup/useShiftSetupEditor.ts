import { useEffect, useMemo, useRef, useState } from "react";
import { SHIFT_DAY_TEMPLATE_LIMIT } from "@/convex/constants";
import { DAY_TEMPLATE_ISSUE_MESSAGES } from "@/convex/shiftSetup/dayTemplates";
import { assistSituationSchema } from "@/convex/shiftSetup/schemas";
import { showErrorToast, showSuccessToast } from "@/src/components/shared/feedback";
import { useDialog } from "@/src/components/ui/Dialog";
import { toaster } from "@/src/components/ui/toaster";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import {
  addTimeSlot,
  changeRequiredCount,
  changeTimeSlotRange,
  createDayTemplateDraft,
  findDayTemplateDraftIssues,
  findDayTemplateInputsIssue,
  isSameDayTemplateInputs,
  removeDayTemplate,
  removeDayTemplateSlot,
  renameDayTemplate,
  toDayTemplateDrafts,
  toDayTemplateDraftsFromSuggestion,
  toDayTemplateInputs,
  toggleDayTemplateWeekday,
} from "./dayTemplateDrafts";
import {
  formatPendingSections,
  isSameStaffProfile,
  resolveStaffProfile,
  toggleStaffPosition,
  toStaffProfileInputs,
} from "./script";
import type {
  DayTemplateDraft,
  PendingSection,
  PositionInput,
  ShiftSetupBreakRule,
  ShiftSetupData,
  ShiftSetupEditorView,
  ShiftSetupRemote,
  StaffProfile,
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
 * 必要人数とスタッフの条件は編集中の値として持ち、操作バーの「保存する」でまとめて保存する。
 * ポジションと休憩の決まりは、Dialogの保存でその場で保存する。
 */
export function useShiftSetupEditor({ setup, remote }: Input) {
  const canWrite = setup.canWriteBusinessData;
  const { positions, staffs, submissionPattern: pattern } = setup;

  // nullは「編集していない」を表し、保存済みの値をそのまま表示する。
  const [templateDrafts, setTemplateDrafts] = useState<DayTemplateDraft[] | null>(null);
  // 保存済みの値から変えたスタッフだけを持つ。
  const [staffDrafts, setStaffDrafts] = useState<Record<string, StaffProfile>>({});
  const [hasAttemptedSave, setHasAttemptedSave] = useState(false);
  const [assistMessage, setAssistMessage] = useState<string>();
  const rowKeyCountRef = useRef(0);
  const createRowKey = () => {
    rowKeyCountRef.current += 1;
    return `new-${rowKeyCountRef.current}`;
  };

  const positionsDialog = useDialog();
  const breakRuleDialog = useDialog();
  const assistDialog = useDialog();

  const savedDrafts = useMemo(() => toDayTemplateDrafts(setup.dayTemplates, pattern), [setup.dayTemplates, pattern]);
  const savedInputs = useMemo(() => toDayTemplateInputs(savedDrafts, positions), [savedDrafts, positions]);
  const drafts = templateDrafts ?? savedDrafts;
  const templateInputs = toDayTemplateInputs(drafts, positions);
  const isTemplatesDirty = templateDrafts !== null && !isSameDayTemplateInputs(templateInputs, savedInputs);
  const staffInputs = toStaffProfileInputs(staffs, staffDrafts, positions);
  const pendingSections: PendingSection[] = [
    ...(isTemplatesDirty ? (["dayTemplates"] as const) : []),
    ...(staffInputs.length > 0 ? (["staffs"] as const) : []),
  ];
  const hasUnsavedChangesRef = useRef(false);
  hasUnsavedChangesRef.current = canWrite && pendingSections.length > 0;

  const issues = findDayTemplateDraftIssues(drafts, pattern, positions);
  const issueMessages: Record<string, string> = {};
  for (const draft of drafts) {
    const issue = issues[draft.rowKey];
    // 時間帯の誤りは選んだ直後に見せる。名前の誤りは入力の途中で出さず、保存を試したあとで見せる。
    if (issue && (hasAttemptedSave || issue.startsWith("SLOT_"))) {
      issueMessages[draft.rowKey] = DAY_TEMPLATE_ISSUE_MESSAGES[issue];
    }
  }

  const { close: closePositionsDialog } = positionsDialog;
  const { close: closeBreakRuleDialog } = breakRuleDialog;
  const { close: closeAssistDialog } = assistDialog;
  useEffect(() => {
    if (canWrite) return;
    // 書き込めなくなったら、保存できない編集中の値を残さない。
    setTemplateDrafts(null);
    setStaffDrafts({});
    setHasAttemptedSave(false);
    closePositionsDialog();
    closeBreakRuleDialog();
    closeAssistDialog();
  }, [canWrite, closeAssistDialog, closeBreakRuleDialog, closePositionsDialog]);

  const editTemplates = (update: (current: DayTemplateDraft[]) => DayTemplateDraft[]) => {
    if (!canWrite) return;
    setTemplateDrafts((current) => {
      const next = update(current ?? savedDrafts);
      // 保存済みの値と同じ内容へ戻ったら、編集していない状態へ戻す。
      return isSameDayTemplateInputs(toDayTemplateInputs(next, positions), savedInputs) ? null : next;
    });
  };

  const editStaff = (staffId: string, update: (profile: StaffProfile) => StaffProfile) => {
    const staff = staffs.find((candidate) => candidate._id === staffId);
    if (!canWrite || !staff) return;
    setStaffDrafts((current) => {
      const { [staffId]: currentDraft, ...rest } = current;
      const next = update(resolveStaffProfile(staff, currentDraft));
      return isSameStaffProfile(next, resolveStaffProfile(staff, undefined), positions)
        ? rest
        : { ...rest, [staffId]: next };
    });
  };

  const { run: saveChanges, isRunning: isSaving } = useSingleFlight(async (): Promise<boolean> => {
    if (!canWrite) return false;

    const saved: PendingSection[] = [];
    try {
      if (isTemplatesDirty) {
        setHasAttemptedSave(true);
        const firstDraftIssue = drafts.map((draft) => issues[draft.rowKey]).find((issue) => issue !== undefined);
        const issue = firstDraftIssue ?? findDayTemplateInputsIssue(templateInputs, pattern);
        if (issue) {
          toaster.create({ title: DAY_TEMPLATE_ISSUE_MESSAGES[issue], type: "error" });
          return false;
        }
        await remote.saveDayTemplates(templateInputs);
        setTemplateDrafts(null);
        setHasAttemptedSave(false);
        saved.push("dayTemplates");
      }
      if (staffInputs.length > 0) {
        await remote.saveStaffShiftProfiles(staffInputs);
        setStaffDrafts({});
        saved.push("staffs");
      }
      return true;
    } catch (error) {
      showErrorToast(error);
      return false;
    } finally {
      // 片方だけ保存できた場合も、保存できた分を伝える。
      if (saved.length > 0) showSuccessToast({ title: `${formatPendingSections(saved)}の設定を保存しました` });
    }
  });

  const { run: savePositions, isRunning: isSavingPositions } = useSingleFlight(async (inputs: PositionInput[]) => {
    if (!canWrite) return;
    try {
      await remote.savePositions(inputs);
      positionsDialog.close();
      showSuccessToast({ title: "ポジションを保存しました" });
    } catch (error) {
      showErrorToast(error);
    }
  });

  const { run: saveBreakRule, isRunning: isSavingBreakRule } = useSingleFlight(
    async (breakRule: ShiftSetupBreakRule | null) => {
      if (!canWrite) return;
      try {
        await remote.saveBreakRule(breakRule);
        breakRuleDialog.close();
        showSuccessToast({ title: breakRule ? "休憩の決まりを保存しました" : "休憩の決まりをなくしました" });
      } catch (error) {
        showErrorToast(error);
      }
    },
  );

  const { run: requestAssist, isRunning: isAssistRunning } = useSingleFlight(async (situation: string) => {
    if (!canWrite || !setup.assistAvailable) return;
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
      setTemplateDrafts(toDayTemplateDraftsFromSuggestion(result.templates, pattern, createRowKey));
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

  const view: ShiftSetupEditorView = {
    setup,
    canWrite,
    dayTemplates: {
      drafts,
      issueMessages,
      canAdd: drafts.length < SHIFT_DAY_TEMPLATE_LIMIT,
    },
    staffProfiles: Object.fromEntries(
      staffs.map((staff) => [staff._id, resolveStaffProfile(staff, staffDrafts[staff._id])]),
    ),
    pendingSections: canWrite ? pendingSections : [],
    isSaving,
    positionsDialog: { ...positionsDialog, open: openWhenWritable(positionsDialog.open), isSaving: isSavingPositions },
    breakRuleDialog: { ...breakRuleDialog, open: openWhenWritable(breakRuleDialog.open), isSaving: isSavingBreakRule },
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
      onAddDayTemplate: () => {
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
      },
      onRemoveDayTemplate: (rowKey) => editTemplates((current) => removeDayTemplate(current, rowKey)),
      onRenameDayTemplate: (rowKey, name) => editTemplates((current) => renameDayTemplate(current, rowKey, name)),
      onToggleWeekday: (rowKey, weekday) =>
        editTemplates((current) => toggleDayTemplateWeekday(current, rowKey, weekday)),
      onChangeRequiredCount: (target, delta) => editTemplates((current) => changeRequiredCount(current, target, delta)),
      onChangeTimeSlotRange: (target, patch) => editTemplates((current) => changeTimeSlotRange(current, target, patch)),
      onAddTimeSlot: (templateRowKey) => {
        const rowKey = createRowKey();
        editTemplates((current) => addTimeSlot(current, templateRowKey, pattern, rowKey));
      },
      onRemoveSlot: (target) => editTemplates((current) => removeDayTemplateSlot(current, target)),
      onToggleStaffPosition: (staffId, positionId) =>
        editStaff(staffId, (profile) => toggleStaffPosition(profile, positionId, positions)),
      onChangeStaffSkillLevel: (staffId, skillLevel) => editStaff(staffId, (profile) => ({ ...profile, skillLevel })),
      onResetChanges: () => {
        setTemplateDrafts(null);
        setStaffDrafts({});
        setHasAttemptedSave(false);
      },
      onSaveChanges: () => void saveChanges(),
      onSavePositions: (inputs) => void savePositions(inputs),
      onSaveBreakRule: (breakRule) => void saveBreakRule(breakRule),
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
