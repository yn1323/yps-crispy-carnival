import type { MutableRefObject } from "react";
import type { AssignmentIssue } from "@/convex/shiftBoard/validation";
import type { ShiftSubmissionPattern } from "@/convex/shop/schemas";
import type {
  ReminderStatus,
  ShiftDateNote,
  ShiftFormDetailActions,
  ShiftFormHeader,
  ShiftFormStaffing,
} from "@/src/components/features/Shift/ShiftForm";
import type { DisplayIssue } from "@/src/domains/shift/assignmentIssues";
import type { AssignmentWarning } from "@/src/domains/shift/assignmentWarnings";
import type { NewcomerOnlyPeriod } from "@/src/domains/shift/staffing";
import type { PositionType, ShiftData, StaffSortMode, StaffType, TimeRange } from "@/src/domains/shift/types";

export type ShiftBoardPageViewModel = {
  isRecruitmentChanged?: boolean;
  periodLabel: string;
  confirmedAtLabel: string | null;
  isConfirmed: boolean;
  isReadOnly: boolean;
  readOnlyReason: string | null;
  exportAction: { isDisabled: boolean } | null;
  showTimeInputGuide: boolean;
  shiftForm: {
    shopId: string;
    staffs: StaffType[];
    positions: PositionType[];
    initialShifts: ShiftData[];
    dates: string[];
    timeRange: TimeRange;
    holidays: string[];
    submissionPattern: ShiftSubmissionPattern;
    isSavingDraft: boolean;
    isConfirming: boolean;
    reminderStatus: ReminderStatus;
    validationIssues: AssignmentIssue[];
    validationWarnings: AssignmentWarning[];
    newcomerOnlyPeriods: NewcomerOnlyPeriod[];
    dateNotes: readonly ShiftDateNote[];
    staffing?: ShiftFormStaffing;
    initialDetailMode: boolean;
    /** 店舗が選んだスタッフの並び替え。表示設定で変えると、保存を待たずに先に切り替える。 */
    staffSortMode: StaffSortMode;
    /** 「シンプル / くわしく」の切り替えを出すか。確定済みの募集と、変更できない画面では出さない。 */
    canSwitchDetailMode: boolean;
    detailActions: ShiftFormDetailActions;
    applyShiftsRef: MutableRefObject<((update: (current: ShiftData[]) => ShiftData[]) => void) | null>;
  };
  confirmDialog: {
    isOpen: boolean;
    title: string;
    submitLabel: string;
    staffCount: number;
    warnings: DisplayIssue[];
    /** 見習いだけの時間帯。日、ポジション、時間帯の単位で出す。 */
    newcomerOnlyItems: Array<{ key: string; label: string }>;
    unsubmittedNames: string[];
    hasUnsubmittedManager: boolean;
  };
  unsubmittedDialog: {
    isOpen: boolean;
    names: string[];
    deadline: string;
  };
  unsavedChangesDialog: {
    isOpen: boolean;
    isSaving: boolean;
  };
  /** 表示の切り替えで下書きを削除する前の確認。 */
  detailModeSwitchDialog: {
    isOpen: boolean;
    isSwitching: boolean;
  };
};

export type ShiftBoardPageIntents = {
  onReload?: () => void;
  onOpenExport: () => void;
  onShiftsChange: (shifts: ShiftData[]) => void;
  onDetailModeChange: (isDetailMode: boolean) => void;
  onConfirmDetailModeSwitch: () => void;
  onCancelDetailModeSwitch: () => void;
  onSaveDraft: () => void;
  onConfirmRequest: () => void;
  onOpenUnsubmittedDetails: () => void;
  onDismissValidationIssues: () => void;
  onConfirmDialogOpenChange: (details: { open: boolean }) => void;
  onConfirmDialogSubmit: () => void;
  onCloseConfirmDialog: () => void;
  onUnsubmittedDialogOpenChange: (details: { open: boolean }) => void;
  onCloseUnsubmittedDialog: () => void;
  onStay: () => void;
  onLeaveWithoutSaving: () => void;
  onSaveAndLeave: () => void;
};

export type ShiftBoardPageViewProps = {
  viewModel: ShiftBoardPageViewModel;
  intents: ShiftBoardPageIntents;
  layout?: "legacy" | "app";
  header?: ShiftFormHeader;
  /** シフト表の内側のスクロールで、上の行を隠した・表示したときに通知する。 */
  onChromeHiddenChange?: (isHidden: boolean) => void;
};
