import { Text } from "@chakra-ui/react";
import { Dialog } from "@/src/components/ui/Dialog";

type CancelInviteModalProps = {
  isOpen: boolean;
  onOpenChange: (details: { open: boolean }) => void;
  onClose: () => void;
  onSubmit: () => void;
  isLoading: boolean;
  displayName: string;
  isExpired?: boolean;
};

export const CancelInviteModal = ({
  isOpen,
  onOpenChange,
  onClose,
  onSubmit,
  isLoading,
  displayName,
  isExpired = false,
}: CancelInviteModalProps) => {
  const title = isExpired ? "招待の削除" : "招待の取り消し";
  const submitLabel = isExpired ? "削除する" : "取り消す";

  return (
    <Dialog
      title={title}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      onClose={onClose}
      onSubmit={onSubmit}
      submitLabel={submitLabel}
      isLoading={isLoading}
      role="alertdialog"
      submitColorPalette="red"
    >
      <Text mb={2}>
        「{displayName}」さんへの{isExpired ? "期限切れ招待を削除" : "招待を取り消し"}しますか？
      </Text>
      {!isExpired && (
        <Text fontSize="sm" color="gray.600">
          再度招待する場合は、新しく招待を作成してください。
        </Text>
      )}
    </Dialog>
  );
};
