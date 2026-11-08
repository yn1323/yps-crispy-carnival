import { Button, Stack, Text } from "@chakra-ui/react";
import { useId } from "react";

/** 管理者を含めて2名以上の組織・店舗だけに絞るトグル。URLの`multiStaff=1`と対応する。 */
export function MultiStaffToggle({ value, onChange }: { value: boolean; onChange: (multiStaff: boolean) => void }) {
  const labelId = useId();
  return (
    <Stack gap={1} role="group" aria-labelledby={labelId}>
      <Text id={labelId} fontSize="xs" color="gray.700" fontWeight="bold">
        人数
      </Text>
      <Button
        type="button"
        variant={value ? "solid" : "outline"}
        bg={value ? undefined : "white"}
        aria-pressed={value}
        onClick={() => onChange(!value)}
      >
        2名以上
      </Button>
    </Stack>
  );
}
