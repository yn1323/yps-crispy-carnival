import type { SystemStyleObject } from "@chakra-ui/react";
import {
  createListCollection,
  Portal,
  SelectContent,
  SelectItem,
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
      collection={collection}
      value={selectValue}
      onValueChange={handleValueChange}
      invalid={invalid}
      w={w}
      maxW={maxW}
      {...restProps}
    >
      <SelectTrigger>
        <SelectValueText placeholder={placeholder} />
      </SelectTrigger>
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
