import { Box, Heading, Stack, Text } from "@chakra-ui/react";
import { LuTrash2 } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";

type Props = {
  title: string;
  description?: string;
  descriptionId?: string;
  actionLabel: string;
  canDelete: boolean;
  disabledReason?: string;
  disabledReasonId?: string;
  onDelete: () => void;
};

export function DeletionActionSection({
  title,
  description,
  descriptionId,
  actionLabel,
  canDelete,
  disabledReason,
  disabledReasonId,
  onDelete,
}: Props) {
  return (
    <Box borderWidth="1px" borderColor="red.100" borderRadius="xl" bg="white" p={{ base: 4, md: 5 }}>
      <Stack gap={4}>
        <Stack gap={description ? 1 : 0}>
          <Heading as="h2" fontSize="md" fontWeight="semibold" color="red.700">
            {title}
          </Heading>
          {description && (
            <Text id={descriptionId} fontSize="sm" color="fg.muted" lineHeight="tall">
              {description}
            </Text>
          )}
        </Stack>

        <Stack gap={2} align="flex-end">
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
      </Stack>
    </Box>
  );
}
