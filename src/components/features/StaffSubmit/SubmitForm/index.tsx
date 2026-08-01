import type { ReactNode } from "react";
import type { SubmissionData } from "../types";
import type { SubmitShiftSelectionInput } from "./buildSubmissionInput";
import { SubmitFormView } from "./SubmitFormView";
import { useSubmitFormController } from "./useSubmitFormController";

type Props = {
  data: SubmissionData;
  onSubmit: (submission: SubmitShiftSelectionInput, acceptedLegal?: boolean) => Promise<void>;
  headerAction?: ReactNode;
};

export function SubmitForm({ data, onSubmit, headerAction }: Props) {
  const controller = useSubmitFormController({ data, onSubmit });

  return (
    <SubmitFormView
      data={data}
      headerAction={headerAction}
      days={controller.days}
      acceptedLegal={controller.acceptedLegal}
      acceptedLegalError={controller.acceptedLegalError}
      canApplyPreviousPattern={controller.canApplyPreviousPattern}
      timeOptions={controller.timeOptions}
      isSubmitting={controller.isSubmitting}
      isLateSubmitting={controller.isLateSubmitting}
      lateSubmitDialog={controller.lateSubmitDialog}
      onSetWorking={controller.handleSetWorking}
      onTimeChange={controller.handleTimeChange}
      onClear={controller.handleClear}
      onShiftTypeSelect={controller.handleShiftTypeSelect}
      onApplyPreviousPattern={controller.handleApplyPreviousPattern}
      onAcceptedLegalChange={controller.handleAcceptedLegalChange}
      onSubmit={controller.handleSubmit}
      onLateSubmitConfirm={controller.handleLateSubmitConfirm}
    />
  );
}

export type { SubmissionData } from "../types";
export type { SubmitShiftSelectionInput } from "./buildSubmissionInput";
