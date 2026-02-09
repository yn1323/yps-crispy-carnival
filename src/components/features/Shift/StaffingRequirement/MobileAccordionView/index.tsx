import { Accordion, Badge, Box, Flex, Text } from "@chakra-ui/react";
import { useMemo } from "react";
import { QuickNavBar } from "../QuickNavBar";
import { StepperCell } from "../StaffingTable/StepperCell";
import type { PositionType, StaffingEntry } from "../types";

// 時間帯グループ定義
const TIME_PERIODS = [
  { label: "朝", rangeStart: 6, rangeEnd: 11 },
  { label: "ランチ", rangeStart: 11, rangeEnd: 14 },
  { label: "午後", rangeStart: 14, rangeEnd: 17 },
  { label: "ディナー", rangeStart: 17, rangeEnd: 21 },
  { label: "夜", rangeStart: 21, rangeEnd: 30 },
] as const;

type TimePeriod = {
  label: string;
  id: string;
  hours: number[];
  subtotal: number;
};

type MobileAccordionViewProps = {
  hours: number[];
  positions: PositionType[];
  staffing: StaffingEntry[];
  onChange: (staffing: StaffingEntry[]) => void;
};

export const MobileAccordionView = ({ hours, positions, staffing, onChange }: MobileAccordionViewProps) => {
  // staffingをマップに変換
  const staffingMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const entry of staffing) {
      map[`${entry.hour}-${entry.position}`] = entry.requiredCount;
    }
    return map;
  }, [staffing]);

  const getCount = (hour: number, position: string) => staffingMap[`${hour}-${position}`] ?? 0;

  const handleCountChange = (hour: number, position: string, value: number) => {
    const clampedValue = Math.max(0, Math.min(10, value));
    const existingIndex = staffing.findIndex((e) => e.hour === hour && e.position === position);

    let newStaffing: StaffingEntry[];
    if (existingIndex >= 0) {
      newStaffing = staffing.map((e, i) => (i === existingIndex ? { ...e, requiredCount: clampedValue } : e));
    } else {
      newStaffing = [...staffing, { hour, position, requiredCount: clampedValue }];
    }
    onChange(newStaffing);
  };

  // 営業時間に該当する時間帯グループのみ表示
  const periods = useMemo((): TimePeriod[] => {
    return TIME_PERIODS.map((period) => {
      const periodHours = hours.filter((h) => h >= period.rangeStart && h < period.rangeEnd);
      const subtotal = periodHours.reduce(
        (sum, h) => sum + positions.reduce((s, pos) => s + (staffingMap[`${h}-${pos.name}`] ?? 0), 0),
        0,
      );
      return {
        label: period.label,
        id: `period-${period.label}`,
        hours: periodHours,
        subtotal,
      };
    }).filter((p) => p.hours.length > 0);
  }, [hours, positions, staffingMap]);

  // デフォルトで最初の時間帯を開く
  const defaultValues = periods.length > 0 ? [periods[0].id] : [];

  return (
    <>
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
                {period.subtotal > 0 && (
                  <Badge colorPalette="teal" variant="subtle" fontSize="xs">
                    {period.subtotal}人時
                  </Badge>
                )}
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
                      <Flex gap={3} wrap="wrap">
                        {positions.map((pos) => (
                          <Flex key={pos._id} align="center" gap={2}>
                            <Text fontSize="sm" color="gray.600" minW="50px">
                              {pos.name}
                            </Text>
                            <StepperCell
                              value={getCount(hour, pos.name)}
                              onChange={(value) => handleCountChange(hour, pos.name, value)}
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
      <QuickNavBar periods={periods.map((p) => ({ label: p.label, id: p.id }))} />
    </>
  );
};
