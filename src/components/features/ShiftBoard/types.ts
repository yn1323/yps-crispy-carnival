import type { ViewMode } from "@/src/components/features/Shift/ShiftForm/types";

export type ShiftBoardHeaderProps = {
  periodLabel: string;
  confirmedAt: Date | null;
  onSave: () => void;
  onConfirm: () => void;
  isSaving?: boolean;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
};
