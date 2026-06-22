import { LuCalendarX, LuTriangleAlert } from "react-icons/lu";
import { Empty } from "@/src/components/ui/Empty";
import type { StaffLinkUnavailableReason } from "@/src/utils/staffSession";
import { SubmitPageHeader, SubmitPageLayout } from "../SubmitPageLayout";

type Props = {
  reason: StaffLinkUnavailableReason;
};

const PRESENTATION = {
  invalid_link: {
    icon: LuTriangleAlert,
    title: "このリンクでは提出できません",
    description: "新しいリンクが必要な場合は、\nシフト作成担当者に連絡してください。",
    tone: "warning" as const,
  },
  recruitment_deleted: {
    icon: LuCalendarX,
    title: "このシフト募集は削除されました",
    description: "提出や確認が必要な場合は、\nシフト作成担当者に連絡してください。",
    tone: "neutral" as const,
  },
  submission_closed: {
    icon: LuCalendarX,
    title: "このシフト募集の提出受付は終了しました",
    description: "変更したい日がある場合は、\nシフト作成担当者に連絡してください。",
    tone: "neutral" as const,
  },
} satisfies Record<
  StaffLinkUnavailableReason,
  {
    icon: typeof LuTriangleAlert;
    title: string;
    description: string;
    tone: "warning" | "neutral";
  }
>;

export const SubmitUnavailableView = ({ reason }: Props) => {
  const view = PRESENTATION[reason];

  return (
    <SubmitPageLayout>
      <SubmitPageHeader shopName="シフト提出" />
      <Empty icon={view.icon} title={view.title} description={view.description} tone={view.tone} flex={1} />
    </SubmitPageLayout>
  );
};
