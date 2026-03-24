import { Flex, Icon, Text } from "@chakra-ui/react";
import { LuTriangleAlert } from "react-icons/lu";
import { Dialog } from "@/src/components/ui/Dialog";

type ModeConfirmDialogProps = {
  isOpen: boolean;
  onOpenChange: (details: { open: boolean }) => void;
  onConfirm: () => void;
  onCancel: () => void;
};

export const ModeConfirmDialog = ({ isOpen, onOpenChange, onConfirm, onCancel }: ModeConfirmDialogProps) => {
  return (
    <Dialog
      title=""
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      onSubmit={onConfirm}
      submitLabel="切り替える"
      submitColorPalette="orange"
      onClose={onCancel}
      closeLabel="キャンセル"
      role="alertdialog"
    >
      <Flex direction="column" gap={4}>
        <Flex align="center" gap={2}>
          <Icon as={LuTriangleAlert} color="orange.500" boxSize={5} />
          <Text fontWeight="bold" fontSize="lg">
            モード切替の確認
          </Text>
        </Flex>
        <Text color="gray.700" fontSize="sm">
          かんたんモードで保存すると、平日・休日それぞれ同じ設定が全曜日に適用されます。
        </Text>
      </Flex>
    </Dialog>
  );
};
