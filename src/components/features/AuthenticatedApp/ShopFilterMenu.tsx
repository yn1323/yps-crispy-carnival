import { Menu, Portal, Text } from "@chakra-ui/react";
import { LuCheck, LuChevronDown, LuFilter } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";

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
