import { Field, Stack } from "@chakra-ui/react";
import { DIALOG_SELECT_POSITIONING } from "@/src/components/shared/ShopSubmissionPatternForm";
import { Select } from "@/src/components/ui/Select";

type TimeOption = { label: string; value: string };

export type TimePatternSettingsProps = {
  invalid: boolean;
  startTime: string;
  endTime: string;
  startTimeOptions: TimeOption[];
  endTimeOptions: TimeOption[];
  onStartTimeChange: (value: string) => void;
  onEndTimeChange: (value: string) => void;
};

export const TimePatternSettings = ({
  invalid,
  startTime,
  endTime,
  startTimeOptions,
  endTimeOptions,
  onStartTimeChange,
  onEndTimeChange,
}: TimePatternSettingsProps) => (
  <Stack direction={{ base: "column", lg: "row" }} gap={3}>
    <Field.Root invalid={invalid}>
      <Select
        label="シフト開始時間"
        items={startTimeOptions}
        value={startTime}
        onChange={onStartTimeChange}
        placeholder="選択してください"
        usePortal={false}
        positioning={DIALOG_SELECT_POSITIONING}
      />
    </Field.Root>
    <Field.Root invalid={invalid}>
      <Select
        label="シフト終了時間"
        items={endTimeOptions}
        value={endTime}
        onChange={onEndTimeChange}
        placeholder="選択してください"
        usePortal={false}
        positioning={DIALOG_SELECT_POSITIONING}
      />
    </Field.Root>
  </Stack>
);
