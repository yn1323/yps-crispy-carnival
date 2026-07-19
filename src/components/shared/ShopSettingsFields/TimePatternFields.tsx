import { Field, type SelectRootProps, Stack } from "@chakra-ui/react";
import { DIALOG_SELECT_POSITIONING } from "@/src/components/shared/ShopSubmissionPatternForm";
import { Select } from "@/src/components/ui/Select";

type TimeOption = { label: string; value: string };

export type TimePatternFieldsProps = {
  invalid: boolean;
  startTime: string;
  endTime: string;
  startTimeOptions: TimeOption[];
  endTimeOptions: TimeOption[];
  startTimeError?: string;
  endTimeError?: string;
  usePortal?: boolean;
  positioning?: SelectRootProps["positioning"];
  onStartTimeChange: (value: string) => void;
  onEndTimeChange: (value: string) => void;
};

export function TimePatternFields({
  invalid,
  startTime,
  endTime,
  startTimeOptions,
  endTimeOptions,
  startTimeError,
  endTimeError,
  usePortal = false,
  positioning = DIALOG_SELECT_POSITIONING,
  onStartTimeChange,
  onEndTimeChange,
}: TimePatternFieldsProps) {
  const hasSpecificError = !!startTimeError || !!endTimeError;
  const startTimeInvalid = !!startTimeError || (invalid && !hasSpecificError);
  const endTimeInvalid = !!endTimeError || (invalid && !hasSpecificError);

  return (
    <Stack direction={{ base: "column", lg: "row" }} gap={3}>
      <Field.Root invalid={startTimeInvalid}>
        <Select
          label="シフト開始時間"
          items={startTimeOptions}
          value={startTime}
          onChange={onStartTimeChange}
          placeholder="選択してください"
          usePortal={usePortal}
          positioning={positioning}
          invalid={startTimeInvalid}
        />
        {startTimeError && <Field.ErrorText>{startTimeError}</Field.ErrorText>}
      </Field.Root>
      <Field.Root invalid={endTimeInvalid}>
        <Select
          label="シフト終了時間"
          items={endTimeOptions}
          value={endTime}
          onChange={onEndTimeChange}
          placeholder="選択してください"
          usePortal={usePortal}
          positioning={positioning}
          invalid={endTimeInvalid}
        />
        {endTimeError && <Field.ErrorText>{endTimeError}</Field.ErrorText>}
      </Field.Root>
    </Stack>
  );
}
