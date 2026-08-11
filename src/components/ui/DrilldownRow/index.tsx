import { chakra, Flex, Stack, Text, VisuallyHidden } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { LuChevronRight } from "react-icons/lu";

type Props = {
  id?: string;
  ariaLabel: string;
  title: string;
  leading: ReactNode;
  badges?: ReactNode;
  secondary?: ReactNode;
  accessibleDescription?: ReactNode;
  highlighted?: boolean;
  onClick: () => void;
};

export function DrilldownRow({
  id,
  ariaLabel,
  title,
  leading,
  badges,
  secondary,
  accessibleDescription,
  highlighted = false,
  onClick,
}: Props) {
  const descriptionId = accessibleDescription && id ? `${id}-summary` : undefined;

  return (
    <chakra.button
      type="button"
      id={id}
      aria-label={ariaLabel}
      aria-describedby={descriptionId}
      gap={3}
      px={{ base: 3, md: 4 }}
      py={3.5}
      display="flex"
      alignItems="center"
      w="full"
      textAlign="left"
      bg={highlighted ? "teal.50/50" : "transparent"}
      borderWidth={0}
      cursor="pointer"
      transition="background-color 150ms ease"
      _hover={{ bg: "teal.50" }}
      _focusVisible={{
        outlineWidth: "2px",
        outlineStyle: "solid",
        outlineColor: "teal.500",
        outlineOffset: "-2px",
      }}
      onClick={onClick}
    >
      {leading}

      <Flex gap={2} align="center" wrap="wrap" flex={1} minW={0}>
        <Stack gap={secondary ? 1 : 0} flex="1 1 96px" minW={0}>
          <Text fontWeight="semibold" color="gray.900" truncate minW={0}>
            {title}
          </Text>
          {secondary}
        </Stack>
        {badges}
      </Flex>

      <Flex color="fg.muted" fontSize="lg" flexShrink={0} aria-hidden>
        <LuChevronRight />
      </Flex>

      {descriptionId && <VisuallyHidden id={descriptionId}>{accessibleDescription}</VisuallyHidden>}
    </chakra.button>
  );
}
