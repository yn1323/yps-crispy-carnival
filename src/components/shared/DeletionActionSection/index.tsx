import { Box, Flex, Heading, Skeleton, Stack, Text } from "@chakra-ui/react";
import { type ReactNode, useId } from "react";
import { LuTrash2 } from "react-icons/lu";
import { Button, type ButtonProps } from "@/src/components/ui/Button";

type Props = {
  title: string;
  headingAs?: "h2" | "h3";
  description?: ReactNode;
  descriptionFontSize?: "sm" | "xs";
  descriptionId?: string;
  actionLabel: string;
  actionVariant?: ButtonProps["variant"];
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
  descriptionFontSize = "sm",
  descriptionId,
  actionLabel,
  actionVariant = "outline",
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
            <Text
              id={descriptionId}
              fontSize={descriptionFontSize}
              color="fg.muted"
              lineHeight="tall"
              whiteSpace="pre-line"
            >
              {description}
            </Text>
          )}
        </Stack>

        <Stack gap={2} align="flex-end">
          <Button
            variant={actionVariant}
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
            <Text
              id={resolvedDisabledReasonId}
              fontSize="xs"
              color="orange.700"
              textAlign="right"
              whiteSpace="pre-line"
            >
              {disabledReason}
            </Text>
          )}
        </Stack>
        {children}
      </Stack>
    </Box>
  );
}

export function DeletionActionSectionSkeleton({
  titleWidth = "240px",
  titleTrailingWidth,
  descriptionLines = 2,
  actionWidth = "104px",
}: {
  titleWidth?: string | { base: string; md?: string };
  titleTrailingWidth?: string;
  descriptionLines?: number;
  actionWidth?: string;
}) {
  return (
    <Box borderWidth="1px" borderColor="red.100" borderRadius="xl" bg="white" p={{ base: 4, md: 5 }}>
      <Stack gap={4}>
        <Stack gap={descriptionLines > 0 ? 1 : 0}>
          {titleTrailingWidth ? (
            <Flex wrap="wrap" maxW="100%">
              <Skeleton h="24px" w={titleWidth} maxW="100%" flexShrink={0} />
              <Skeleton h="24px" w={titleTrailingWidth} maxW="100%" flexShrink={0} />
            </Flex>
          ) : (
            <Skeleton h="24px" w={titleWidth} maxW="100%" />
          )}
          {Array.from({ length: descriptionLines }, (_, index) => (
            <Skeleton key={index} h="18px" w={index === descriptionLines - 1 ? "72%" : "92%"} />
          ))}
        </Stack>
        <Stack align="flex-end">
          <Skeleton h="40px" w={actionWidth} borderRadius="md" />
        </Stack>
      </Stack>
    </Box>
  );
}
