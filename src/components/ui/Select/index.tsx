import type { SystemStyleObject } from "@chakra-ui/react";
import {
  createListCollection,
  Portal,
  SelectContent,
  SelectControl,
  SelectHiddenSelect,
  SelectIndicator,
  SelectIndicatorGroup,
  SelectItem,
  SelectLabel,
  SelectPositioner,
  SelectRoot,
  type SelectRootProps,
  SelectTrigger,
  SelectValueText,
} from "@chakra-ui/react";

export type SelectItemType = {
  value: string;
  label: string;
};

type SelectProps = {
  items?: SelectItemType[];
  collection?: ReturnType<typeof createListCollection<SelectItemType>>;
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  invalid?: boolean;
  usePortal?: boolean;
  w?: SystemStyleObject["w"];
  maxW?: SystemStyleObject["maxW"];
  label?: string;
  note?: string;
} & Omit<SelectRootProps, "collection" | "value" | "onValueChange" | "onChange">;

export const Select = ({
  items,
  collection: externalCollection,
  value,
  onChange,
  placeholder = "選択してください",
  invalid,
  usePortal = true,
  w,
  maxW,
  label,
  note,
  ...restProps
}: SelectProps) => {
  const collection = externalCollection || createListCollection({ items: items || [] });

  const selectValue = value ? [value] : [];

  const handleValueChange = (details: { value: string[] }) => {
    onChange(details.value[0] || "");
  };

  const content = (
    <SelectContent>
      {collection.items.map((item) => (
        <SelectItem key={item.value} item={item.value}>
          {item.label}
        </SelectItem>
      ))}
    </SelectContent>
  );

  return (
    <SelectRoot
      background="white"
      collection={collection}
      value={selectValue}
      onValueChange={handleValueChange}
      invalid={invalid}
      w={w}
      maxW={maxW}
      {...restProps}
    >
      <SelectHiddenSelect />
      {label && <SelectLabel>{label}</SelectLabel>}
      {note && (
        <SelectLabel fontSize={"xs"} fontWeight="normal">
          {note}
        </SelectLabel>
      )}
      <SelectControl>
        <SelectTrigger>
          <SelectValueText placeholder={placeholder} />
        </SelectTrigger>
        <SelectIndicatorGroup>
          <SelectIndicator />
        </SelectIndicatorGroup>
      </SelectControl>
      {usePortal ? (
        <Portal>
          <SelectPositioner>{content}</SelectPositioner>
        </Portal>
      ) : (
        content
      )}
    </SelectRoot>
  );
};
