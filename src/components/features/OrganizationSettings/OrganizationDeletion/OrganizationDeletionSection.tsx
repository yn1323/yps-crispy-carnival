import { DeletionActionSection } from "@/src/components/shared/DeletionActionSection";

type Props = {
  canDelete: boolean;
  disabledReason?: string;
  onDelete: () => void;
};

export function OrganizationDeletionSection({ canDelete, disabledReason, onDelete }: Props) {
  return (
    <DeletionActionSection
      title="グループ・店舗をすべて削除する"
      actionLabel="削除"
      canDelete={canDelete}
      disabledReason={disabledReason}
      disabledReasonId="organization-delete-disabled-reason"
      onDelete={onDelete}
    />
  );
}
