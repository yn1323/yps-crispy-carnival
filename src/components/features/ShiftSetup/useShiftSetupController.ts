import { useBlocker, useRouter } from "@tanstack/react-router";
import { useAction, useMutation } from "convex/react";
import { useEffect } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import type { LeaveDialogState, ShiftSetupData, ShiftSetupEditorView, ShiftSetupRemote } from "./types";
import { useShiftSetupEditor } from "./useShiftSetupEditor";

type Input = {
  shopId: Id<"shops">;
  organizationId: Id<"organizations">;
  setup: ShiftSetupData;
};

export type ShiftSetupController = ShiftSetupEditorView & {
  leaveDialog: LeaveDialogState;
  onBack: () => void;
};

/** 編集の状態を、対象店舗のConvex APIと、保存していない変更の離脱確認へつなぐ。 */
export function useShiftSetupController({ shopId, organizationId, setup }: Input): ShiftSetupController {
  const savePositions = useMutation(api.shiftSetup.mutations.savePositions);
  const saveDayTemplates = useMutation(api.shiftSetup.mutations.saveDayTemplates);
  const saveBreakRule = useMutation(api.shiftSetup.mutations.saveBreakRule);
  const saveStaffShiftProfiles = useMutation(api.shiftSetup.mutations.saveStaffShiftProfiles);
  const suggestShiftSetup = useAction(api.shiftSetup.actions.suggestShiftSetup);
  const router = useRouter();

  const scope = { shopId, expectedOrganizationId: organizationId };
  const remote: ShiftSetupRemote = {
    savePositions: (positions) => savePositions({ ...scope, positions }),
    saveDayTemplates: (templates) => saveDayTemplates({ ...scope, templates }),
    saveBreakRule: (breakRule) => saveBreakRule({ ...scope, breakRule }),
    saveStaffShiftProfiles: (profiles) => saveStaffShiftProfiles({ ...scope, profiles }),
    suggestShiftSetup: (situation) => suggestShiftSetup({ ...scope, situation }),
  };
  const editor = useShiftSetupEditor({ setup, remote });

  const blocker = useBlocker({
    shouldBlockFn: () => editor.hasUnsavedChanges(),
    enableBeforeUnload: () => editor.hasUnsavedChanges(),
    withResolver: true,
  });

  const { reset: resetBlocker } = blocker;
  useEffect(() => {
    // 書き込めなくなると編集中の値を捨てるため、確認中の離脱も取り消す。
    if (!setup.canWriteBusinessData) resetBlocker?.();
  }, [resetBlocker, setup.canWriteBusinessData]);

  const { run: saveAndLeave, isRunning: isSavingAndLeaving } = useSingleFlight(async () => {
    const saved = await editor.saveChanges();
    if (saved) blocker.proceed?.();
    else blocker.reset?.();
  });

  return {
    ...editor.view,
    leaveDialog: {
      isOpen: blocker.status === "blocked",
      isSaving: isSavingAndLeaving,
      onStay: () => blocker.reset?.(),
      onLeaveWithoutSaving: () => blocker.proceed?.(),
      onSaveAndLeave: () => void saveAndLeave(),
    },
    onBack: () => router.history.back(),
  };
}
