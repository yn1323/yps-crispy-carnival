import { Box, Heading, Stack, Text } from "@chakra-ui/react";
import { type ReactNode, useId } from "react";
import { LuTrash2 } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";

type Props = {
  title: string;
  headingAs?: "h2" | "h3";
  description?: string;
  descriptionId?: string;
  actionLabel: string;
  canDelete: boolean;
  disabledReason?: string;
  disabledReasonId?: string;
  onDelete: () => void;
  children?: ReactNode;
};

export function DeletionActionSection({
  title,
  headingAs = "h2",
  description,
  descriptionId,
  actionLabel,
  canDelete,
  disabledReason,
  disabledReasonId,
  onDelete,
  children,
}: Props) {
  const generatedDisabledReasonId = useId();
  const resolvedDisabledReasonId = disabledReasonId ?? generatedDisabledReasonId;

  return (
    <Box as="section" borderWidth="1px" borderColor="red.100" borderRadius="xl" bg="white" p={{ base: 4, md: 5 }}>
      <Stack gap={4}>
        <Stack gap={description ? 1 : 0}>
          <Heading as={headingAs} fontSize="md" fontWeight="semibold" color="red.700">
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
            aria-describedby={!canDelete && disabledReason ? resolvedDisabledReasonId : undefined}
            onClick={onDelete}
            gap={1.5}
          >
            <LuTrash2 aria-hidden />
            {actionLabel}
          </Button>
          {!canDelete && disabledReason && (
            <Text id={resolvedDisabledReasonId} fontSize="xs" color="orange.700" textAlign="right">
              {disabledReason}
            </Text>
          )}
        </Stack>
        {children}
      </Stack>
    </Box>
  );
}
