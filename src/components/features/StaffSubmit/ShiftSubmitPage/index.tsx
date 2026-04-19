import type { DayEntry } from "../DayCard";
import { ExpiredSubmitView } from "../ExpiredSubmitView";
import { ReadOnlySubmitView } from "../ReadOnlySubmitView";
import { type SubmissionData, SubmitFormView } from "../SubmitFormView";

type Props = {
  data: SubmissionData;
  onSubmit: (entries: DayEntry[]) => Promise<void>;
};

export const ShiftSubmitPage = ({ data, onSubmit }: Props) => {
  // 状態D: 未提出＋締切後
  if (!data.isBeforeDeadline && !data.hasSubmitted) {
    return <ExpiredSubmitView shopName={data.shopName} />;
  }

  // 状態C: 提出済み＋締切後
  if (!data.isBeforeDeadline && data.hasSubmitted) {
    return <ReadOnlySubmitView data={data} />;
  }

  // 状態A/B: 締切前（編集可能）
  return <SubmitFormView data={data} onSubmit={onSubmit} />;
};
