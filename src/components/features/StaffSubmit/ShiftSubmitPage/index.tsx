import { useState } from "react";
import type { DayEntry } from "../DayCard";
import { ExpiredSubmitView } from "../ExpiredSubmitView";
import { ReadOnlySubmitView } from "../ReadOnlySubmitView";
import { SubmitCompleteView } from "../SubmitCompleteView";
import { type SubmissionData, SubmitFormView } from "../SubmitFormView";

type Props = {
  data: SubmissionData;
};

export const ShiftSubmitPage = ({ data }: Props) => {
  const [showCompletion, setShowCompletion] = useState(false);
  const [submittedEntries, setSubmittedEntries] = useState<DayEntry[] | null>(null);

  // 状態D: 未提出＋締切後
  if (!data.isBeforeDeadline && !data.hasSubmitted) {
    return <ExpiredSubmitView shopName={data.shopName} />;
  }

  // 状態C: 提出済み＋締切後
  if (!data.isBeforeDeadline && data.hasSubmitted) {
    return <ReadOnlySubmitView data={data} />;
  }

  // 画面5: 提出完了
  if (showCompletion && submittedEntries) {
    return (
      <SubmitCompleteView shopName={data.shopName} entries={submittedEntries} onEdit={() => setShowCompletion(false)} />
    );
  }

  // 状態A/B: 締切前（編集可能）
  return (
    <SubmitFormView
      data={data}
      onSubmit={(entries) => {
        setSubmittedEntries(entries);
        setShowCompletion(true);
      }}
    />
  );
};
