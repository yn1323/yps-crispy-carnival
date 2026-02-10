import { Accordion, Box, Flex, Text } from "@chakra-ui/react";
import { useMemo } from "react";
import { TIME_PERIODS } from "../constants";
import { StepperCell } from "../StaffingTable/StepperCell";
import type { PositionType, StaffingEntry } from "../types";
import { createHourPositionKey, createStaffingMapFromEntries, updateStaffingEntry } from "../utils/staffingMapHelpers";

type TimePeriod = {
  label: string;
  id: string;
  hours: number[];
};

type MobileAccordionViewProps = {
  hours: number[];
  positions: PositionType[];
  staffing: StaffingEntry[];
  onChange: (staffing: StaffingEntry[]) => void;
};

export const MobileAccordionView = ({ hours, positions, staffing, onChange }: MobileAccordionViewProps) => {
  // staffingをマップに変換
  const staffingMap = useMemo(() => createStaffingMapFromEntries(staffing), [staffing]);

  const getCount = (hour: number, position: string) => staffingMap[createHourPositionKey(hour, position)] ?? 0;

  const handleCountChange = (hour: number, position: string, value: number) => {
    onChange(updateStaffingEntry(staffing, hour, position, value));
  };

  // 営業時間に該当する時間帯グループのみ表示
  const periods = useMemo((): TimePeriod[] => {
    return TIME_PERIODS.map((period) => {
      const periodHours = hours.filter((h) => h >= period.rangeStart && h < period.rangeEnd);
      return {
        label: period.label,
        id: `period-${period.label}`,
        hours: periodHours,
      };
    }).filter((p) => p.hours.length > 0);
  }, [hours]);

  // デフォルトで最初の時間帯を開く
  const defaultValues = periods.length > 0 ? [periods[0].id] : [];

  return (
    <Accordion.Root multiple collapsible defaultValue={defaultValues}>
      {periods.map((period) => (
        <Accordion.Item key={period.id} value={period.id} id={period.id}>
          <Accordion.ItemTrigger cursor="pointer" p={3}>
            <Flex flex="1" align="center" justify="space-between">
              <Flex align="center" gap={2}>
                <Text fontWeight="bold">{period.label}</Text>
                <Text fontSize="xs" color="gray.500">
                  {period.hours[0]}:00〜{period.hours[period.hours.length - 1] + 1}:00
                </Text>
              </Flex>
            </Flex>
            <Accordion.ItemIndicator />
          </Accordion.ItemTrigger>
          <Accordion.ItemContent>
            <Accordion.ItemBody p={0}>
              <Box px={3} pb={3}>
                {period.hours.map((hour) => (
                  <Box
                    key={hour}
                    py={2}
                    borderBottomWidth="1px"
                    borderColor="gray.100"
                    _last={{ borderBottomWidth: 0 }}
                  >
                    <Text fontSize="sm" fontWeight="medium" mb={2} color="gray.700">
                      {hour}:00-{hour + 1}:00
                    </Text>
                    <Flex direction="column" gap={2}>
                      {positions.map((position) => (
                        <Flex key={position._id} align="center" justify="space-between">
                          <Text fontSize="sm" color="gray.600">
                            {position.name}
                          </Text>
                          <StepperCell
                            value={getCount(hour, position.name)}
                            onChange={(value) => handleCountChange(hour, position.name, value)}
                          />
                        </Flex>
                      ))}
                    </Flex>
                  </Box>
                ))}
              </Box>
            </Accordion.ItemBody>
          </Accordion.ItemContent>
        </Accordion.Item>
      ))}
    </Accordion.Root>
  );
};
