import { Box, Link, Stack, Text } from "@chakra-ui/react";
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
        {/* 作成操作がトライアル開始になるため、確定前に契約境界を示す。 */}
        <Box borderRadius="lg" bg="blue.50" px={4} py={3}>
          <Text fontSize="sm" color="blue.900" lineHeight="tall">
            新しい組織は2暦月のトライアルで始まります。
            <br />
            終了後はProまたはBusinessの契約が必要です。未契約の場合は利用停止になりますが、店舗・ユーザー・過去のシフトは削除されません。
          </Text>
          <Link href="/pricing" target="_blank" rel="noreferrer" color="teal.700" fontSize="sm" fontWeight="bold">
            料金とプランを確認する（新しいタブ）
          </Link>
        </Box>
        <ShopForm
          defaultValues={CREATE_ORGANIZATION_DEFAULT_VALUES}
          onSubmit={onSubmit}
          onCancel={onClose}
          submitLabel="組織を作ってトライアルを開始"
        />
      </Stack>
    </StepperDialog>
  );
}
