import { Box, Stack, Text } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { LuTrash2 } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";

type Props = {
  description: string;
  descriptionId?: string;
  actionLabel: string;
  canDelete: boolean;
  disabledReason?: string;
  disabledReasonId?: string;
  onDelete: () => void;
  confirmation?: ReactNode;
};

export function DeletionActionSection({
  description,
  descriptionId,
  actionLabel,
  canDelete,
  disabledReason,
  disabledReasonId,
  onDelete,
  confirmation,
}: Props) {
  return (
    <Box borderWidth="1px" borderColor="red.200" borderRadius="xl" bg="white" p={{ base: 4, md: 5 }}>
      <Stack gap={3} alignItems="flex-start">
        <Stack gap={1}>
          <Text fontWeight="bold" color="red.700">
            危険な操作
          </Text>
          <Text id={descriptionId} fontSize="sm" color="fg.muted" lineHeight="tall">
            {description}
          </Text>
        </Stack>

        {confirmation ? (
          <Box w="full">{confirmation}</Box>
        ) : (
          <Stack gap={2} align="flex-end" w="full">
            <Button
              variant="outline"
              colorPalette="red"
              disabled={!canDelete}
              title={!canDelete ? disabledReason : undefined}
              aria-describedby={!canDelete && disabledReason ? disabledReasonId : undefined}
              onClick={onDelete}
              gap={1.5}
            >
              <LuTrash2 aria-hidden />
              {actionLabel}
            </Button>
            {!canDelete && disabledReason && (
              <Text id={disabledReasonId} fontSize="xs" color="orange.700" textAlign="right">
                {disabledReason}
              </Text>
            )}
          </Stack>
        )}
      </Stack>
    </Box>
  );
}
