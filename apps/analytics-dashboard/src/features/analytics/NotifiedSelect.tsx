import { NativeSelect, Text } from "@chakra-ui/react";

/** 直近14日に通知を受け付けた組織・店舗だけに絞る選択。URLの`notified=1`と対応する。 */
export function NotifiedSelect({ value, onChange }: { value: boolean; onChange: (notified: boolean) => void }) {
  return (
    <Text as="label" minW={{ base: "full", md: "220px" }} fontSize="xs" color="gray.700" fontWeight="bold">
      通知
      <NativeSelect.Root mt={1}>
        <NativeSelect.Field
          bg="white"
          value={value ? "recent" : ""}
          onChange={(event) => onChange(event.target.value === "recent")}
        >
          <option value="">すべて</option>
          <option value="recent">直近14日に通知あり</option>
        </NativeSelect.Field>
        <NativeSelect.Indicator />
      </NativeSelect.Root>
    </Text>
  );
}
