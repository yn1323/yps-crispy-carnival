import { Box, Flex, Skeleton, Stack } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { LuTrash2 } from "react-icons/lu";
import { ActionSection } from "@/src/components/ui/ActionSection";
import type { ButtonProps } from "@/src/components/ui/Button";

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
  return (
    <ActionSection
      title={title}
      headingAs={headingAs}
      description={description}
      descriptionFontSize={descriptionFontSize}
      descriptionId={descriptionId}
      actionLabel={actionLabel}
      actionIcon={<LuTrash2 aria-hidden />}
      actionVariant={actionVariant}
      tone="danger"
      isActionEnabled={canDelete}
      disabledReason={disabledReason}
      disabledReasonId={disabledReasonId}
      onAction={onDelete}
    >
      {children}
    </ActionSection>
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
