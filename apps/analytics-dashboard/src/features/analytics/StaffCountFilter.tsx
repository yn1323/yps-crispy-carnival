import { Button, Flex, Stack, Text } from "@chakra-ui/react";
import { MIN_STAFF_OPTIONS } from "@convex/analyticsDashboard/schemas";
import { useId } from "react";
import type { AnalyticsMinStaff } from "@/api/analyticsTypes";

const DEFAULT_MIN_STAFF: AnalyticsMinStaff = 2;

/**
 * 一覧の人数の絞り込み。URLで省略した場合は2名以上とし、`minStaff=6`で6名以上、`minStaff=0`ですべてを表示する。
 */
export function readMinStaff(params: URLSearchParams): AnalyticsMinStaff | null {
  const value = params.get("minStaff");
  if (value === "0") return null;
  return MIN_STAFF_OPTIONS.find((option) => String(option) === value) ?? DEFAULT_MIN_STAFF;
}
export function writeMinStaff(params: URLSearchParams, minStaff: AnalyticsMinStaff | null) {
  if (minStaff !== DEFAULT_MIN_STAFF) params.set("minStaff", String(minStaff ?? 0));
}

const OPTIONS: { value: AnalyticsMinStaff | null; label: string }[] = [
  { value: null, label: "すべて" },
  ...MIN_STAFF_OPTIONS.map((value) => ({ value, label: `${value}名以上` })),
];

/** 管理者を含めた人数で組織・店舗を絞り込む。 */
export function StaffCountFilter({
  value,
  onChange,
}: {
  value: AnalyticsMinStaff | null;
  onChange: (minStaff: AnalyticsMinStaff | null) => void;
}) {
  const labelId = useId();
  return (
    <Stack gap={1}>
      <Text id={labelId} fontSize="xs" color="gray.700" fontWeight="bold">
        人数
      </Text>
      <Flex gap={2} role="group" aria-labelledby={labelId}>
        {OPTIONS.map((option) => {
          const selected = option.value === value;
          return (
            <Button
              key={option.label}
              type="button"
              variant={selected ? "solid" : "outline"}
              bg={selected ? undefined : "white"}
              aria-pressed={selected}
              onClick={() => onChange(option.value)}
            >
              {option.label}
            </Button>
          );
        })}
      </Flex>
    </Stack>
  );
}
