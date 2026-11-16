import { Field, HStack, Text } from "@chakra-ui/react";
import { NativeSelect } from "@/src/components/ui/FormControls";
import type { ShiftTimeOption } from "@/src/domains/shift/time";
import { getEndOptions, getStartOptions } from "./script";

type BarTimeFieldsProps = {
  start: string;
  end: string;
  /** 受付時間の中で選べる時刻 */
  options: readonly ShiftTimeOption[];
  onChange: (time: { start: string; end: string }) => void;
};

/** バーの開始と終了を選ぶ欄。開始は終了より前、終了は開始より後の時刻だけを選べる。 */
export const BarTimeFields = ({ start, end, options, onChange }: BarTimeFieldsProps) => (
  <HStack gap={2} align="end">
    <Field.Root flex={1} minW={0}>
      <Field.Label>開始</Field.Label>
      <NativeSelect.Root size="sm">
        <NativeSelect.Field
          value={start}
          bg="white"
          minH={{ base: "44px", md: "36px" }}
          fontVariantNumeric="tabular-nums"
          onChange={(event) => onChange({ start: event.target.value, end })}
        >
          {getStartOptions(options, end).map((option) => (
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
          onChange={(event) => onChange({ start, end: event.target.value })}
        >
          {getEndOptions(options, start).map((option) => (
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
