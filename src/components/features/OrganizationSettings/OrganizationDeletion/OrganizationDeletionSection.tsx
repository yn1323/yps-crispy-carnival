import { DeletionActionSection } from "../DeletionActionSection";

type Props = {
  canDelete: boolean;
  disabledReason?: string;
  onDelete: () => void;
};

export function OrganizationDeletionSection({ canDelete, disabledReason, onDelete }: Props) {
  return (
    <DeletionActionSection
      description="グループとすべての店舗を利用できない状態にします。この操作は元に戻せません。"
      actionLabel="このグループを削除"
      canDelete={canDelete}
      disabledReason={disabledReason}
      disabledReasonId="organization-delete-disabled-reason"
      onDelete={onDelete}
    />
  );
}
