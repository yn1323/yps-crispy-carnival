import { ReadOnlySubmitView } from "../ReadOnlySubmitView";
import { type SubmissionData, SubmitFormView, type SubmitShiftSelectionInput } from "../SubmitFormView";

type Props = {
  data: SubmissionData;
  onSubmit: (submission: SubmitShiftSelectionInput, acceptedLegal?: boolean) => Promise<void>;
};

export const ShiftSubmitPage = ({ data, onSubmit }: Props) => {
  // 状態C: 提出済み＋締切後
  if (!data.isBeforeDeadline && data.hasSubmitted) {
    return <ReadOnlySubmitView data={data} />;
  }

  // 状態A/B: 締切前（編集可能） / 状態D: 締切後未提出（初回提出のみ可能）
  return <SubmitFormView data={data} onSubmit={onSubmit} />;
};
