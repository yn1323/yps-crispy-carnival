export type ConfirmStatus = {
  confirmedAt: Date | null;
};

export type ShiftBoardHeaderProps = {
  periodLabel: string;
  submittedCount: number;
  totalStaffCount: number;
  confirmedAt: Date | null;
  onSave: () => void;
  onConfirm: () => void;
  isSaving?: boolean;
};

export function formatSubmissionStatus(submittedCount: number, totalStaffCount: number): string {
  const base = `提出状況: ${submittedCount}/${totalStaffCount}人完了`;
  return submittedCount >= totalStaffCount ? `${base} ✓` : base;
}
