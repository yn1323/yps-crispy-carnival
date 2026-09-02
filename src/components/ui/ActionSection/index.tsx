import { Box, Heading, Stack, Text } from "@chakra-ui/react";
import { type ReactNode, useId } from "react";
import { Button, type ButtonProps } from "@/src/components/ui/Button";

type Props = {
  title: string;
  headingAs?: "h2" | "h3";
  headingId?: string;
  description?: ReactNode;
  descriptionFontSize?: "sm" | "xs";
  descriptionId?: string;
  actionLabel: string;
  actionIcon?: ReactNode;
  actionVariant?: ButtonProps["variant"];
  tone?: "neutral" | "danger";
  isActionEnabled: boolean;
  disabledReason?: string;
  disabledReasonId?: string;
  onAction: () => void;
  children?: ReactNode;
};

export function ActionSection({
  title,
  headingAs = "h2",
  headingId,
  description,
  descriptionFontSize = "sm",
  descriptionId,
  actionLabel,
  actionIcon,
  actionVariant = "solid",
  tone = "neutral",
  isActionEnabled,
  disabledReason,
  disabledReasonId,
  onAction,
  children,
}: Props) {
  const generatedHeadingId = useId();
  const generatedDisabledReasonId = useId();
  const resolvedHeadingId = headingId ?? generatedHeadingId;
  const resolvedDisabledReasonId = disabledReasonId ?? generatedDisabledReasonId;
  const isDanger = tone === "danger";

  return (
    <Box
      as="section"
      borderWidth="1px"
      borderColor={isDanger ? "red.100" : "blackAlpha.100"}
      borderRadius="xl"
      bg="white"
      p={{ base: 4, md: 5 }}
      aria-labelledby={resolvedHeadingId}
    >
      <Stack gap={4}>
        <Stack gap={description ? 1 : 0}>
          <Heading
            id={resolvedHeadingId}
            as={headingAs}
            fontSize="md"
            fontWeight="semibold"
            color={isDanger ? "red.700" : "gray.900"}
          >
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
            colorPalette={isDanger ? "red" : "teal"}
            disabled={!isActionEnabled}
            title={!isActionEnabled ? disabledReason : undefined}
            aria-describedby={!isActionEnabled && disabledReason ? resolvedDisabledReasonId : undefined}
            onClick={onAction}
            gap={1.5}
          >
            {actionIcon}
            {actionLabel}
          </Button>
          {!isActionEnabled && disabledReason && (
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
