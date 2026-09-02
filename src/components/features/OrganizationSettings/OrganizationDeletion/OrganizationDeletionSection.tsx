import { DeletionActionSection } from "@/src/components/shared/DeletionActionSection";

type Props = {
  canDelete: boolean;
  disabledReason?: string;
  onDelete: () => void;
};

export function OrganizationDeletionSection({ canDelete, disabledReason, onDelete }: Props) {
  return (
    <DeletionActionSection
      title="組織、店舗、スタッフを完全に削除する"
      description={"組織に紐づくすべての情報を削除します。\nこの操作はもとに戻せません。"}
      descriptionFontSize="xs"
      actionLabel="削除する"
      actionVariant="solid"
      canDelete={canDelete}
      disabledReason={disabledReason}
      disabledReasonId="organization-delete-disabled-reason"
      onDelete={onDelete}
    />
  );
}
