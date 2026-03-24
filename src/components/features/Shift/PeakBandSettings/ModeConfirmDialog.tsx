import { Flex, Icon, Text } from "@chakra-ui/react";
import { LuInfo, LuTriangleAlert } from "react-icons/lu";
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
          かんたんモードに切り替えると、曜日ごとの個別設定は「平日」「休日」の設定で上書きされます。
        </Text>
        <Flex align="center" gap={2} bg="orange.50" borderRadius="md" px={3} py={2}>
          <Icon as={LuInfo} color="orange.500" boxSize={4} />
          <Text fontSize="sm" color="orange.600">
            この操作は取り消せません
          </Text>
        </Flex>
      </Flex>
    </Dialog>
  );
};
