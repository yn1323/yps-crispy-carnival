import type { AssignmentIssue } from "@/convex/shiftBoard/validation";
import type { ShiftSubmissionPattern } from "@/convex/shop/schemas";
import type { ReminderStatus } from "@/src/components/features/Shift/ShiftForm";
import type { DisplayIssue } from "@/src/domains/shift/assignmentIssues";
import type { AssignmentWarning } from "@/src/domains/shift/assignmentWarnings";
import type { PositionType, ShiftData, StaffType, TimeRange } from "@/src/domains/shift/types";

export type ShiftBoardPageViewModel = {
  periodLabel: string;
  confirmedAtLabel: string | null;
  isConfirmed: boolean;
  isReadOnly: boolean;
  readOnlyReason: string | null;
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
  };
  confirmDialog: {
    isOpen: boolean;
    title: string;
    submitLabel: string;
    staffCount: number;
    warnings: DisplayIssue[];
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
};

export type ShiftBoardPageIntents = {
  onShiftsChange: (shifts: ShiftData[]) => void;
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
};
