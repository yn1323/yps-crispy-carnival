import { LuPlus } from "react-icons/lu";
import { ActionSection } from "@/src/components/ui/ActionSection";

type Props = {
  canCreate: boolean;
  disabledReason?: string;
  onCreate: () => void;
};

export function OrganizationCreationSection({ canCreate, disabledReason, onCreate }: Props) {
  return (
    <ActionSection
      title="新しい組織を作る"
      headingId="organization-create-heading"
      description={
        "別の会社やブランド管理などに新しい組織を作成できます。\nユーザー、プラン、支払いは組織ごとに分かれます。\n\n同じ会社に店舗を増やす場合は、「店舗」タブから追加してください。"
      }
      descriptionFontSize="xs"
      actionLabel="作成する"
      actionIcon={<LuPlus aria-hidden />}
      isActionEnabled={canCreate}
      disabledReason={disabledReason}
      disabledReasonId="organization-create-disabled-reason"
      onAction={onCreate}
    />
  );
}
