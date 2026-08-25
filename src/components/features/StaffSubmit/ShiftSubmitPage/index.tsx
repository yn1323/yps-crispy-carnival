import type { ReactNode } from "react";
import { ReadOnlySubmitView } from "../ReadOnlySubmitView";
import { SubmitForm, type SubmitShiftSelectionInput } from "../SubmitForm";
import type { SubmissionData } from "../types";

type Props = {
  data: SubmissionData;
  onSubmit: (submission: SubmitShiftSelectionInput, acceptedLegal?: boolean) => Promise<void>;
  headerAction?: ReactNode;
};

export const ShiftSubmitPage = ({ data, onSubmit, headerAction }: Props) => {
  // 状態C: 提出済み＋提出期限後
  if (!data.isBeforeDeadline && data.hasSubmitted) {
    return <ReadOnlySubmitView data={data} headerAction={headerAction} />;
  }

  // 状態A/B: 提出期限前（編集可能） / 状態D: 提出期限後未提出（初回提出のみ可能）
  return <SubmitForm data={data} onSubmit={onSubmit} headerAction={headerAction} />;
};
