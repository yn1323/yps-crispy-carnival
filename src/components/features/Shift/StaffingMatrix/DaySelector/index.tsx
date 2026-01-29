import { Box, Checkbox, Flex, Text } from "@chakra-ui/react";

const DAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

type DaySelectorProps = {
  selectedDays: number[];
  onChange: (days: number[]) => void;
  disabledDays?: number[];
  label?: string;
};

export const DaySelector = ({
  selectedDays,
  onChange,
  disabledDays = [],
  label = "適用する曜日",
}: DaySelectorProps) => {
  const handleToggle = (dayIndex: number) => {
    if (disabledDays.includes(dayIndex)) return;

    if (selectedDays.includes(dayIndex)) {
      onChange(selectedDays.filter((d) => d !== dayIndex));
    } else {
      onChange([...selectedDays, dayIndex].sort((a, b) => a - b));
    }
  };

  // 平日（月〜金）を一括選択
  const selectWeekdays = () => {
    const weekdays = [1, 2, 3, 4, 5].filter((d) => !disabledDays.includes(d));
    onChange(weekdays);
  };

  // 休日（土日）を一括選択
  const selectWeekends = () => {
    const weekends = [0, 6].filter((d) => !disabledDays.includes(d));
    onChange(weekends);
  };

  // 全選択
  const selectAll = () => {
    const allDays = [0, 1, 2, 3, 4, 5, 6].filter((d) => !disabledDays.includes(d));
    onChange(allDays);
  };

  return (
    <Box>
      <Flex align="center" justify="space-between" mb={2}>
        <Text fontWeight="medium" color="gray.700">
          {label}
        </Text>
        <Flex gap={2}>
          <Text
            as="button"
            fontSize="xs"
            color="teal.600"
            cursor="pointer"
            _hover={{ textDecoration: "underline" }}
            onClick={selectWeekdays}
          >
            平日
          </Text>
          <Text
            as="button"
            fontSize="xs"
            color="teal.600"
            cursor="pointer"
            _hover={{ textDecoration: "underline" }}
            onClick={selectWeekends}
          >
            休日
          </Text>
          <Text
            as="button"
            fontSize="xs"
            color="teal.600"
            cursor="pointer"
            _hover={{ textDecoration: "underline" }}
            onClick={selectAll}
          >
            全て
          </Text>
        </Flex>
      </Flex>

      {/* 曜日チェックボックス - 月曜始まり */}
      <Flex gap={{ base: 2, md: 4 }} wrap="wrap">
        {/* 月〜金 */}
        {[1, 2, 3, 4, 5].map((dayIndex) => (
          <Checkbox.Root
            key={dayIndex}
            checked={selectedDays.includes(dayIndex)}
            onCheckedChange={() => handleToggle(dayIndex)}
            disabled={disabledDays.includes(dayIndex)}
          >
            <Checkbox.HiddenInput />
            <Checkbox.Control />
            <Checkbox.Label>{DAY_LABELS[dayIndex]}</Checkbox.Label>
          </Checkbox.Root>
        ))}
      </Flex>
      <Flex gap={{ base: 2, md: 4 }} mt={2}>
        {/* 土日 */}
        {[6, 0].map((dayIndex) => (
          <Checkbox.Root
            key={dayIndex}
            checked={selectedDays.includes(dayIndex)}
            onCheckedChange={() => handleToggle(dayIndex)}
            disabled={disabledDays.includes(dayIndex)}
          >
            <Checkbox.HiddenInput />
            <Checkbox.Control />
            <Checkbox.Label>{DAY_LABELS[dayIndex]}</Checkbox.Label>
          </Checkbox.Root>
        ))}
      </Flex>
    </Box>
  );
};
