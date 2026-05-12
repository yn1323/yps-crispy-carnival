import { LuCalendarX } from "react-icons/lu";
import { Empty } from "@/src/components/ui/Empty";
import type { DayEntry } from "../DayCard";
import { ReadOnlySubmitView } from "../ReadOnlySubmitView";
import { type SubmissionData, SubmitFormView } from "../SubmitFormView";
import { SubmitPageHeader, SubmitPageLayout } from "../SubmitPageLayout";

type Props = {
  data: SubmissionData;
  onSubmit: (entries: DayEntry[], acceptedLegal?: boolean) => Promise<void>;
};

export const ShiftSubmitPage = ({ data, onSubmit }: Props) => {
  // 状態D: 未提出＋締切後
  if (!data.isBeforeDeadline && !data.hasSubmitted) {
    return (
      <SubmitPageLayout>
        <SubmitPageHeader shopName={data.shopName} />
        <Empty
          icon={LuCalendarX}
          title="提出締切を過ぎました"
          description={"変更したい日がある場合は、\nシフト作成担当者に連絡してください。"}
          tone="neutral"
          flex={1}
        />
      </SubmitPageLayout>
    );
  }

  // 状態C: 提出済み＋締切後
  if (!data.isBeforeDeadline && data.hasSubmitted) {
    return <ReadOnlySubmitView data={data} />;
  }

  // 状態A/B: 締切前（編集可能）
  return <SubmitFormView data={data} onSubmit={onSubmit} />;
};
