import { Box, Stack, Text } from "@chakra-ui/react";
import { ShopForm, type ShopFormData } from "@/src/components/features/ShopForm";
import { StepperDialog } from "@/src/components/ui/StepperDialog";
import type { OrganizationCreationDialogState } from "./types";

const CREATE_ORGANIZATION_DEFAULT_VALUES: ShopFormData = {
  shopName: "",
  regularClosedDays: [],
  submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
};

type Props = {
  dialog: OrganizationCreationDialogState | null;
  isRunning: boolean;
  onClose: () => void;
  onSubmit: (data: ShopFormData) => void | Promise<void>;
};

export function OrganizationCreationDialog({ dialog, isRunning, onClose, onSubmit }: Props) {
  if (!dialog) return null;

  return (
    <StepperDialog
      title="新しい組織を作る"
      isOpen
      onOpenChange={({ open }) => {
        if (!open) onClose();
      }}
      onClose={onClose}
      preventClose={isRunning}
    >
      <Stack gap={4} flex={1} minH={0}>
        {/* 一つ目の組織と開始プランが違うため、作る前に見える位置へ置く。 */}
        <Box borderRadius="lg" bg="blue.50" px={4} py={3}>
          <Text fontSize="sm" color="blue.900" lineHeight="tall">
            新しい組織は無料プランで始まります。
            <br />
            ユーザー5名、店舗1件、管理者1名まで利用できます。
            <br />
            上限を増やす場合は、作成後に「プランと支払い」から変更してください。
          </Text>
        </Box>
        <ShopForm
          defaultValues={CREATE_ORGANIZATION_DEFAULT_VALUES}
          onSubmit={onSubmit}
          onCancel={onClose}
          submitLabel="組織を作る"
        />
      </Stack>
    </StepperDialog>
  );
}
