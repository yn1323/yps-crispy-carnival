import { Field, HStack, Text } from "@chakra-ui/react";
import { NativeSelect } from "@/src/components/ui/FormControls";
import type { ShiftTimeOption } from "@/src/domains/shift/time";
import { getEndOptions, getStartOptions, keepBarTimeOrder } from "./script";

type BarTimeFieldsProps = {
  start: string;
  end: string;
  /** 受付時間の中で選べる時刻 */
  options: readonly ShiftTimeOption[];
  /** 刻み（分）。バーの最小の長さでもある。 */
  unitMinutes: number;
  onChange: (time: { start: string; end: string }) => void;
};

/**
 * バーの開始と終了を選ぶ欄。
 * 選択肢は互いに絞らない。開始を終了以降にすると終了が、終了を開始以前にすると開始が、最小の長さを保つ時刻へ動く。
 */
export const BarTimeFields = ({ start, end, options, unitMinutes, onChange }: BarTimeFieldsProps) => {
  const change = (time: { start: string; end: string }, changed: "start" | "end") =>
    onChange(keepBarTimeOrder({ time, changed, unitMinutes }));

  return (
    <HStack gap={2} align="end">
      <Field.Root flex={1} minW={0}>
        <Field.Label>開始</Field.Label>
        <NativeSelect.Root size="sm">
          <NativeSelect.Field
            value={start}
            bg="white"
            minH={{ base: "44px", md: "36px" }}
            fontVariantNumeric="tabular-nums"
            onChange={(event) => change({ start: event.target.value, end }, "start")}
          >
            {getStartOptions(options).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </NativeSelect.Field>
          <NativeSelect.Indicator />
        </NativeSelect.Root>
      </Field.Root>
      <Text fontSize="sm" color="fg.muted" lineHeight={{ base: "44px", md: "36px" }} aria-hidden>
        〜
      </Text>
      <Field.Root flex={1} minW={0}>
        <Field.Label>終了</Field.Label>
        <NativeSelect.Root size="sm">
          <NativeSelect.Field
            value={end}
            bg="white"
            minH={{ base: "44px", md: "36px" }}
            fontVariantNumeric="tabular-nums"
            onChange={(event) => change({ start, end: event.target.value }, "end")}
          >
            {getEndOptions(options).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </NativeSelect.Field>
          <NativeSelect.Indicator />
        </NativeSelect.Root>
      </Field.Root>
    </HStack>
  );
};
