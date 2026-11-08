import { NativeSelect, Text } from "@chakra-ui/react";

/** 一覧の通知の絞り込み。URLで省略した場合は直近14日に通知ありとし、`notified=0`ですべてを表示する。 */
export function readNotified(params: URLSearchParams) {
  return params.get("notified") !== "0";
}
export function writeNotified(params: URLSearchParams, notified: boolean) {
  if (!notified) params.set("notified", "0");
}

/** 直近14日に通知を受け付けた組織・店舗だけに絞る選択。 */
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
