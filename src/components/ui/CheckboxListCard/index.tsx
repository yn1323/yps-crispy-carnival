import { Box, Checkbox, Flex, Stack } from "@chakra-ui/react";
import { type ReactNode, useId } from "react";

type CheckboxListCardProps = {
  ariaLabel: string;
  children: ReactNode;
};

export function CheckboxListCard({ ariaLabel, children }: CheckboxListCardProps) {
  return (
    <Box
      role="group"
      aria-label={ariaLabel}
      bg="white"
      borderRadius="xl"
      borderWidth="1px"
      borderColor="blackAlpha.100"
      overflow="hidden"
    >
      <Stack gap={0} divideY="1px" divideColor="blackAlpha.100">
        {children}
      </Stack>
    </Box>
  );
}

type CheckboxListCardItemProps = {
  checked: boolean;
  disabled?: boolean;
  ariaLabel: string;
  ariaDescribedBy?: string;
  onCheckedChange: (checked: boolean) => void;
  leading?: ReactNode;
  children: ReactNode;
  trailing?: ReactNode;
  disabledReason?: ReactNode;
  hoverBg?: string;
  tone?: "default" | "danger";
};

export function CheckboxListCardItem({
  checked,
  disabled = false,
  ariaLabel,
  ariaDescribedBy,
  onCheckedChange,
  leading,
  children,
  trailing,
  disabledReason,
  hoverBg = "blackAlpha.50",
  tone = "default",
}: CheckboxListCardItemProps) {
  const generatedReasonId = useId();
  const disabledReasonId = disabledReason ? `checkbox-list-card-reason-${generatedReasonId}` : undefined;
  const describedBy = [ariaDescribedBy, disabledReasonId].filter(Boolean).join(" ") || undefined;

  return (
    <Checkbox.Root
      colorPalette="teal"
      checked={checked}
      disabled={disabled}
      display="flex"
      w="full"
      alignItems={tone === "danger" ? "flex-start" : "center"}
      gap={3}
      px={{ base: 3, lg: 4 }}
      py={3.5}
      minH="72px"
      bg={tone === "danger" ? "red.50" : "white"}
      borderLeftWidth={tone === "danger" ? "3px" : 0}
      borderLeftColor={tone === "danger" ? "red.500" : undefined}
      transition="background-color 150ms ease"
      cursor={disabled ? "not-allowed" : "pointer"}
      _hover={disabled ? undefined : { bg: tone === "danger" ? "red.100" : hoverBg }}
      onCheckedChange={(details) => {
        if (!disabled) onCheckedChange(details.checked === true);
      }}
    >
      <Checkbox.HiddenInput aria-label={ariaLabel} aria-describedby={describedBy} />
      <Checkbox.Control
        flexShrink={0}
        bg="white"
        borderColor="gray.300"
        cursor={disabled ? "not-allowed" : "pointer"}
        _checked={{ bg: "teal.500", borderColor: "teal.500" }}
      />
      <Box flex={1} minW={0} opacity={disabled ? 0.75 : 1}>
        <Checkbox.Label aria-label={ariaLabel} display="block" w="full" cursor={disabled ? "not-allowed" : "pointer"}>
          <Flex align={tone === "danger" ? "flex-start" : "center"} gap={3} minW={0}>
            {leading}
            <Box flex={1} minW={0} overflowWrap="anywhere">
              {children}
            </Box>
            {trailing && (
              <Flex flexShrink={0} align="center">
                {trailing}
              </Flex>
            )}
          </Flex>
        </Checkbox.Label>
        {disabledReason && (
          <Box id={disabledReasonId} mt={1} fontSize="xs" color="fg.muted" lineHeight="tall">
            {disabledReason}
          </Box>
        )}
      </Box>
    </Checkbox.Root>
  );
}
