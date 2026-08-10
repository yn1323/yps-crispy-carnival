import { DeletionActionSection } from "@/src/components/shared/DeletionActionSection";

const BILLING_CONTINUATION_DISABLED_REASON = "有料契約やプラン変更を終了してから、組織を削除してください。";
const STRIPE_SUBSCRIPTION_DISABLED_REASON = "Stripeの契約終了を確認してから、組織を削除してください。";
const LEGACY_BILLING_CONTINUATION_DISABLED_REASON = "有料契約やプラン変更を終了してから、グループを削除してください。";
const LEGACY_STRIPE_SUBSCRIPTION_DISABLED_REASON = "Stripeの契約終了を確認してから、グループを削除してください。";
const SUBSCRIPTION_DISABLED_REASON =
  "有料契約またはプラン変更の予約が残っています。\n「プランと支払い」で契約や予約を終了してから、組織を削除してください。";

type Props = {
  canDelete: boolean;
  disabledReason?: string;
  onDelete: () => void;
};

export function OrganizationDeletionSection({ canDelete, disabledReason, onDelete }: Props) {
  const displayedDisabledReason =
    disabledReason === BILLING_CONTINUATION_DISABLED_REASON ||
    disabledReason === STRIPE_SUBSCRIPTION_DISABLED_REASON ||
    disabledReason === LEGACY_BILLING_CONTINUATION_DISABLED_REASON ||
    disabledReason === LEGACY_STRIPE_SUBSCRIPTION_DISABLED_REASON
      ? SUBSCRIPTION_DISABLED_REASON
      : disabledReason;

  return (
    <DeletionActionSection
      title="組織、店舗、スタッフを完全に削除する"
      description={"組織に紐づくすべての情報を削除します。\nこの操作はもとに戻せません。"}
      descriptionFontSize="xs"
      actionLabel="削除する"
      actionVariant="solid"
      canDelete={canDelete}
      disabledReason={displayedDisabledReason}
      disabledReasonId="organization-delete-disabled-reason"
      onDelete={onDelete}
    />
  );
}
