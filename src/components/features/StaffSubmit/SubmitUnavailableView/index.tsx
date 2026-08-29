import { LuCalendarX, LuTriangleAlert } from "react-icons/lu";
import { Empty } from "@/src/components/ui/Empty";
import type { StaffLinkUnavailableReason } from "@/src/domains/staffAccess";
import { SubmitPageHeader, SubmitPageLayout } from "../SubmitPageLayout";

type Props = {
  reason: StaffLinkUnavailableReason;
};

const PRESENTATION = {
  invalid_link: {
    icon: LuTriangleAlert,
    title: "このリンクでは提出できません",
    description: "新しいリンクが必要な場合は、シフト作成担当者に連絡してください。",
    tone: "warning" as const,
  },
  recruitment_deleted: {
    icon: LuCalendarX,
    title: "このシフト募集は削除されました",
    description: "提出や確認が必要な場合は、シフト作成担当者に連絡してください。",
    tone: "neutral" as const,
  },
  submission_closed: {
    icon: LuCalendarX,
    title: "このシフト募集の提出受付は終了しました",
    description: "変更日がある場合、シフト作成担当者に直接連絡してください。",
    tone: "neutral" as const,
  },
  usage_limit_exceeded: {
    icon: LuTriangleAlert,
    title: "現在のプランでは提出できません",
    description:
      "利用人数・店舗・管理者がプランの上限を超えています。管理者に、利用状況の整理またはプラン変更を依頼してください。",
    tone: "warning" as const,
  },
  usage_limit_evaluation_unavailable: {
    icon: LuTriangleAlert,
    title: "現在、希望シフトを提出できません",
    description:
      "利用数を安全に確認できないため、提出を一時的に制限しています。管理者に、利用人数・店舗・管理者の確認を依頼してください。",
    tone: "warning" as const,
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
