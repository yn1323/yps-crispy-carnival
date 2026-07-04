import { Stack, Text } from "@chakra-ui/react";
import { Dialog } from "@/src/components/ui/Dialog";

type Props = {
  shopName: string;
  isOpen: boolean;
  onOpenChange: (details: { open: boolean }) => void;
  onClose: () => void;
  onSubmit: () => void | Promise<void>;
  isLoading?: boolean;
};

export const DeleteShopConfirmDialog = ({
  shopName,
  isOpen,
  onOpenChange,
  onClose,
  onSubmit,
  isLoading = false,
}: Props) => {
  return (
    <Dialog
      title="店舗を削除"
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      onClose={onClose}
      onSubmit={onSubmit}
      submitLabel="この店舗を削除"
      submitColorPalette="red"
      isLoading={isLoading}
      isSubmitDisabled={isLoading}
      role="alertdialog"
    >
      <Stack gap={3}>
        <Text color="fg.muted" lineHeight="tall">
          店舗情報、スタッフ、これまでのシフトをすべて削除します。
        </Text>

        <Text fontWeight="semibold" color="gray.900">
          「{shopName}」を削除してよろしいですか？
        </Text>
      </Stack>
    </Dialog>
  );
};
