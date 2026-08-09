import { Heading, HStack, Icon, Text, VisuallyHidden } from "@chakra-ui/react";
import { type ReactNode, useId } from "react";
import type { IconType } from "react-icons";
import { LuChevronLeft } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";

type Props = {
  title: string;
  onBack: () => void;
  backLabel?: string;
  backAriaLabel?: string;
  icon?: IconType;
  action?: ReactNode;
};

export function DetailPageHeader({ title, onBack, backLabel = "前の画面に戻る", backAriaLabel, icon, action }: Props) {
  const descriptionId = useId();

  return (
    <HStack gap={3} minW={0} justify="space-between" align="center">
      <Heading as="h1" minW={0} flex={1}>
        <Button
          type="button"
          variant="plain"
          minH="44px"
          h="auto"
          px={0}
          gap={2}
          color="gray.900"
          textStyle={{ base: "sectionTitle", md: "pageTitle" }}
          justifyContent="flex-start"
          _hover={{ color: "teal.700" }}
          aria-label={backAriaLabel}
          aria-describedby={descriptionId}
          onClick={onBack}
        >
          <LuChevronLeft aria-hidden />
          {icon && <Icon as={icon} boxSize={5} flexShrink={0} aria-hidden />}
          <Text as="span" truncate minW={0}>
            {title}
          </Text>
        </Button>
      </Heading>
      {action}
      <VisuallyHidden id={descriptionId}>{backLabel}</VisuallyHidden>
    </HStack>
  );
}
