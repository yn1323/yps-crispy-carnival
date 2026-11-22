import { Menu, Portal, Text } from "@chakra-ui/react";
import { LuCheck, LuChevronDown, LuFilter, LuStore } from "react-icons/lu";
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
  appearance = "select",
  inlineAllLabel,
}: {
  value: string | null;
  options: readonly ShopFilterOption[];
  onChange: (value: string | null) => void;
  prefix?: string;
  allLabel?: string;
  /**
   * 開くボタンの見た目。`select`は枠付きの「店舗：すべて」。
   * `inline`はページの見出しの上に置く、枠のない「全店舗」の文字のボタンで、シフトとスタッフのページで使う。
   */
  appearance?: "select" | "inline";
  /** `inline`で、何も絞り込んでいないときに出す文字。省くと「全」と`prefix`をつなげる（「全店舗」）。 */
  inlineAllLabel?: string;
}) {
  if (options.length < 2) return null;

  const selectedOption = options.find((option) => option.value === value);
  const selectedLabel = selectedOption?.label ?? allLabel;

  return (
    <Menu.Root positioning={{ placement: "bottom-start", gutter: 8 }}>
      <Menu.Trigger asChild>
        {appearance === "inline" ? (
          <Button
            type="button"
            variant="plain"
            h="auto"
            maxW="full"
            px={0}
            gap={1.5}
            color="teal.700"
            textStyle="sm"
            fontWeight="bold"
            position="relative"
            // 見た目は小さく保ち、押せる範囲だけを高さ44pxまで広げる。
            _after={{ content: '""', position: "absolute", insetX: "-8px", insetY: "-12px" }}
            _hover={{ color: "teal.800" }}
            aria-label={`${prefix}で絞り込む（現在：${selectedLabel}）`}
          >
            <LuStore aria-hidden />
            <Text as="span" minW={0} truncate>
              {selectedOption ? selectedOption.label : (inlineAllLabel ?? `全${prefix}`)}
            </Text>
            <LuChevronDown aria-hidden />
          </Button>
        ) : (
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
        )}
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
