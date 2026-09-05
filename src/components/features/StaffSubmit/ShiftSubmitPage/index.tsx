import { type ReactNode, useRef } from "react";
import { RecruitmentChangedNotice } from "@/src/components/shared/RecruitmentChangedNotice";
import { ReadOnlySubmitView } from "../ReadOnlySubmitView";
import { SubmitForm, type SubmitShiftSelectionInput } from "../SubmitForm";
import { SubmitPageHeader, SubmitPageLayout } from "../SubmitPageLayout";
import type { SubmissionData } from "../types";

type Props = {
  data: SubmissionData;
  onSubmit: (submission: SubmitShiftSelectionInput, acceptedLegal?: boolean) => Promise<void>;
  headerAction?: ReactNode;
  hasStaleError?: boolean;
};

export const ShiftSubmitPage = ({ data, onSubmit, headerAction, hasStaleError = false }: Props) => {
  const expectedEditVersion = useRef(data.editVersion ?? 0).current;
  if (hasStaleError || expectedEditVersion !== (data.editVersion ?? 0)) {
    return (
      <SubmitPageLayout>
        <SubmitPageHeader shopName={data.shopName} actions={headerAction} />
        <RecruitmentChangedNotice onReload={() => window.location.reload()} />
      </SubmitPageLayout>
    );
  }
  // 状態C: 提出済み＋提出期限後
  if (!data.isBeforeDeadline && data.hasSubmitted) {
    return <ReadOnlySubmitView data={data} headerAction={headerAction} />;
  }

  // 状態A/B: 提出期限前（編集可能） / 状態D: 提出期限後未提出（初回提出のみ可能）
  return <SubmitForm data={data} onSubmit={onSubmit} headerAction={headerAction} />;
};
