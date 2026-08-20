import { Stack, Text } from "@chakra-ui/react";
import { DeletionActionSection } from "@/src/components/shared/DeletionActionSection";
import { Dialog } from "@/src/components/ui/Dialog";
import type { UserDetailRemovalPreview } from "./types";

export function UserGroupRemovalSection({
  personName,
  isDisabled,
  disabledReason,
  removalPreview,
  isConfirmationOpen,
  isRemoving,
  onRequestRemovePerson,
  onCancelRemovePerson,
  onConfirmRemovePerson,
}: {
  personName: string;
  isDisabled: boolean;
  disabledReason?: string;
  removalPreview: UserDetailRemovalPreview;
  isConfirmationOpen: boolean;
  isRemoving: boolean;
  onRequestRemovePerson: () => void;
  onCancelRemovePerson: () => void;
  onConfirmRemovePerson: () => void | Promise<void>;
}) {
  const disabledReasonId = disabledReason ? "user-detail-group-removal-disabled-reason" : undefined;

  return (
    <>
      <DeletionActionSection
        title="スタッフを完全に削除する"
        description={
          "組織、すべての店舗からこのスタッフを削除します。\n店舗から外す場合、このページの所属店舗を変更するから外してください。"
        }
        descriptionFontSize="xs"
        actionLabel="削除する"
        actionVariant="solid"
        canDelete={!isDisabled}
        disabledReason={disabledReason}
        disabledReasonId={disabledReasonId}
        onDelete={onRequestRemovePerson}
      />

      {isConfirmationOpen && (
        <Dialog
          title="スタッフを削除"
          isOpen
          role="alertdialog"
          submitLabel="削除する"
          submitColorPalette="red"
          closeLabel="やめる"
          isLoading={isRemoving}
          isSubmitDisabled={removalPreview.kind === "tooMany" || isRemoving}
          onOpenChange={({ open }) => {
            if (!open && !isRemoving) onCancelRemovePerson();
          }}
          onClose={() => {
            if (!isRemoving) onCancelRemovePerson();
          }}
          onSubmit={onConfirmRemovePerson}
          maxW={{ base: "calc(100vw - 24px)", md: "560px" }}
        >
          <Stack gap={3} fontSize="sm" color="fg.muted" lineHeight="tall">
            <Text fontWeight="semibold" color="gray.900">
              {personName}さんを完全に削除しますか？
            </Text>
            <Text>組織と所属する全店舗から完全に削除します。</Text>
            {removalPreview.kind === "tooMany" && (
              <Text color="orange.700" fontWeight="medium" whiteSpace="pre-line">
                {getAssignmentRemovalWarning(removalPreview)}
              </Text>
            )}
            <Text color="red.700" fontWeight="semibold">
              この操作はもとに戻せません。
            </Text>
          </Stack>
        </Dialog>
      )}
    </>
  );
}

function getAssignmentRemovalWarning(preview: Extract<UserDetailRemovalPreview, { kind: "tooMany" }>) {
  return `今日以降のシフトの割り当てが${preview.limit}件を超えています。
シフトを整理してから削除してください。`;
}
