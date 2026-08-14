import { Badge, Flex, Heading, Icon, Menu, Portal, Stack, type StackProps, Text } from "@chakra-ui/react";
import type { ReactNode } from "react";
import type { IconType } from "react-icons";
import { LuCheck, LuChevronDown, LuFilter } from "react-icons/lu";
import { AuthenticatedPageContent } from "@/src/components/templates/AuthenticatedPageContent";
import { Button } from "@/src/components/ui/Button";

export function PrototypePage({ children, ...props }: { children: ReactNode } & StackProps) {
  return (
    <AuthenticatedPageContent>
      <Stack as="main" gap={{ base: 6, md: 8 }} w="full" {...props}>
        {children}
      </Stack>
    </AuthenticatedPageContent>
  );
}

export function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <Heading as="h2" fontSize={{ base: "lg", md: "xl" }} color="gray.900">
      {children}
    </Heading>
  );
}

export function IconSurface({ icon }: { icon: IconType }) {
  return (
    <Flex
      boxSize={{ base: "44px", md: "48px" }}
      borderRadius="full"
      bg="teal.50"
      color="teal.700"
      align="center"
      justify="center"
      flexShrink={0}
      aria-hidden
    >
      <Icon as={icon} boxSize={{ base: 5, md: 6 }} />
    </Flex>
  );
}

export function AvatarCircle({
  initial,
  strong = false,
  size = "44px",
}: {
  initial: string;
  strong?: boolean;
  size?: string;
}) {
  return (
    <Flex
      boxSize={size}
      borderRadius="full"
      bg={strong ? "teal.500" : "teal.50"}
      color={strong ? "white" : "teal.700"}
      align="center"
      justify="center"
      fontWeight="bold"
      flexShrink={0}
      aria-hidden
    >
      {initial}
    </Flex>
  );
}

export type ShopFilterOption = {
  value: string;
  label: string;
};

export function ShopFilterMenu({
  value,
  options,
  onChange,
  prefix = "店舗",
  allLabel = "すべて",
}: {
  value: string | null;
  options: readonly ShopFilterOption[];
  onChange: (value: string | null) => void;
  prefix?: string;
  allLabel?: string;
}) {
  const selectedLabel = options.find((option) => option.value === value)?.label ?? allLabel;

  return (
    <Menu.Root positioning={{ placement: "bottom-start", gutter: 8 }}>
      <Menu.Trigger asChild>
        <Button
          type="button"
          variant="outline"
          minH="44px"
          maxW="full"
          px={3}
          bg="white"
          borderColor="gray.300"
          aria-label={`${prefix}で絞り込む（現在：${selectedLabel}）`}
        >
          <LuFilter aria-hidden />
          <Text as="span" flex={1} minW={0} textAlign="left" truncate>
            {prefix}：{selectedLabel}
          </Text>
          <LuChevronDown aria-hidden />
        </Button>
      </Menu.Trigger>

      <Portal>
        <Menu.Positioner>
          <Menu.Content w="min(280px, calc(100vw - 24px))" maxH="min(420px, calc(100dvh - 96px))" overflowY="auto">
            <Menu.RadioItemGroup
              value={value ?? "all"}
              onValueChange={({ value: nextValue }) => onChange(nextValue === "all" ? null : nextValue)}
            >
              <ShopFilterMenuItem value="all" label={allLabel} selected={value === null} />
              {options.map((option) => (
                <ShopFilterMenuItem
                  key={option.value}
                  value={option.value}
                  label={option.label}
                  selected={value === option.value}
                />
              ))}
            </Menu.RadioItemGroup>
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
}

function ShopFilterMenuItem({ value, label, selected }: { value: string; label: string; selected: boolean }) {
  return (
    <Menu.RadioItem value={value} cursor="pointer" ps={8} pe={3} py={2.5}>
      <Menu.ItemIndicator color="teal.600">
        <LuCheck aria-hidden />
      </Menu.ItemIndicator>
      <Menu.ItemText>
        <Text fontSize="sm" fontWeight={selected ? "bold" : "medium"} truncate>
          {label}
        </Text>
      </Menu.ItemText>
    </Menu.RadioItem>
  );
}

export function MutedBadge({ children, color = "gray" }: { children: ReactNode; color?: "gray" | "teal" }) {
  return (
    <Badge colorPalette={color} variant="subtle" borderRadius="full" px={2.5} py={1}>
      {children}
    </Badge>
  );
}
