import { DeletionActionSection } from "@/src/components/shared/DeletionActionSection";

/** アカウント削除の導線。削除処理は別途接続するまで無効化しておく。 */
export function AccountDeletionSection() {
  return (
    <DeletionActionSection
      title="アカウントを完全に削除する"
      actionLabel="削除する"
      actionVariant="solid"
      canDelete={false}
      onDelete={() => undefined}
    />
  );
}
