import { Box, HStack, Stack, Text } from "@chakra-ui/react";
import { LuTrash2 } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";

type Props = {
  organizationName: string;
  canDelete: boolean;
  disabledReason?: string;
  onDelete: () => void;
};

export function OrganizationDeletionSection({ organizationName, canDelete, disabledReason, onDelete }: Props) {
  return (
    <Stack gap={5}>
      <Box borderWidth="1px" borderRadius="xl" bg="white" p={{ base: 4, md: 5 }}>
        <Stack gap={1}>
          <Text fontWeight="bold">グループ情報</Text>
          <HStack justify="space-between" gap={4} pt={2}>
            <Text fontSize="sm" color="fg.muted">
              グループ名
            </Text>
            <Text fontSize="sm" fontWeight="semibold" textAlign="end">
              {organizationName}
            </Text>
          </HStack>
        </Stack>
      </Box>

      <Box borderWidth="1px" borderColor="red.200" borderRadius="xl" bg="white" p={{ base: 4, md: 5 }}>
        <Stack gap={3} alignItems="flex-start">
          <Stack gap={1}>
            <Text fontWeight="bold" color="red.700">
              危険な操作
            </Text>
            <Text fontSize="sm" color="fg.muted" lineHeight="tall">
              グループとすべての店舗を利用できない状態にします。この操作は元に戻せません。
            </Text>
          </Stack>
          <Button
            variant="outline"
            colorPalette="red"
            disabled={!canDelete}
            title={!canDelete ? disabledReason : undefined}
            onClick={onDelete}
            gap={1.5}
          >
            <LuTrash2 aria-hidden />
            このグループを削除
          </Button>
          {!canDelete && disabledReason && (
            <Text fontSize="xs" color="orange.700">
              {disabledReason}
            </Text>
          )}
        </Stack>
      </Box>
    </Stack>
  );
}
