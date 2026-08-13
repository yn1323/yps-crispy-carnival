import { Heading, HStack, Icon, Skeleton, Text, VisuallyHidden } from "@chakra-ui/react";
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

type SkeletonProps = {
  titleWidth?: string | { base: string; md?: string; lg?: string };
  showAction?: boolean;
  showIcon?: boolean;
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

export function DetailPageHeaderSkeleton({
  titleWidth = { base: "168px", md: "240px" },
  showAction = false,
  showIcon = true,
}: SkeletonProps) {
  return (
    <HStack gap={3} minW={0} minH="44px" justify="space-between" align="center">
      <HStack gap={2} minW={0} flex={1}>
        <Skeleton boxSize={5} borderRadius="sm" flexShrink={0} />
        {showIcon && <Skeleton boxSize={5} borderRadius="sm" flexShrink={0} />}
        <Skeleton
          h={{ base: "28px", md: "32px", lg: "38px" }}
          w={titleWidth}
          maxW={showIcon ? "calc(100% - 56px)" : "calc(100% - 28px)"}
          borderRadius="sm"
        />
      </HStack>
      {showAction && <Skeleton boxSize="44px" borderRadius="md" flexShrink={0} />}
    </HStack>
  );
}
