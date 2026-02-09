import { Box, Flex, Table, Text } from "@chakra-ui/react";
import { useMemo } from "react";
import { MobileAccordionView } from "../MobileAccordionView";
import type { PositionType, StaffingEntry } from "../types";
import { StepperCell } from "./StepperCell";

type StaffingTableProps = {
  openTime: string;
  closeTime: string;
  positions: PositionType[];
  staffing: StaffingEntry[];
  onChange: (staffing: StaffingEntry[]) => void;
  disabled?: boolean;
};

export const StaffingTable = ({
  openTime,
  closeTime,
  positions,
  staffing,
  onChange,
  disabled = false,
}: StaffingTableProps) => {
  // 営業時間から時間帯リストを生成
  const hours = useMemo(() => {
    const openHour = Number.parseInt(openTime.split(":")[0], 10);
    const closeHour = Number.parseInt(closeTime.split(":")[0], 10);
    const result: number[] = [];
    for (let h = openHour; h < closeHour; h++) {
      result.push(h);
    }
    return result;
  }, [openTime, closeTime]);

  // staffingをマップに変換
  const staffingMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const entry of staffing) {
      const key = `${entry.hour}-${entry.position}`;
      map[key] = entry.requiredCount;
    }
    return map;
  }, [staffing]);

  // 人員数取得
  const getCount = (hour: number, position: string) => {
    const key = `${hour}-${position}`;
    return staffingMap[key] ?? 0;
  };

  // 人員数更新
  const handleCountChange = (hour: number, position: string, value: number) => {
    const clampedValue = Math.max(0, Math.min(10, value));

    // 既存のエントリを更新または追加
    const existingIndex = staffing.findIndex((e) => e.hour === hour && e.position === position);

    let newStaffing: StaffingEntry[];
    if (existingIndex >= 0) {
      newStaffing = staffing.map((e, i) => (i === existingIndex ? { ...e, requiredCount: clampedValue } : e));
    } else {
      newStaffing = [...staffing, { hour, position, requiredCount: clampedValue }];
    }

    onChange(newStaffing);
  };

  // 1日の合計人時を計算
  const totalPersonHours = useMemo(() => {
    return staffing.reduce((sum, entry) => sum + entry.requiredCount, 0);
  }, [staffing]);

  return (
    <Box>
      {/* PC表示: Table形式 */}
      <Box display={{ base: "none", md: "block" }}>
        <Table.Root size="sm" variant="outline">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeader>時間帯</Table.ColumnHeader>
              {positions.map((pos) => (
                <Table.ColumnHeader key={pos._id} textAlign="center">
                  {pos.name}
                </Table.ColumnHeader>
              ))}
              <Table.ColumnHeader textAlign="center">合計</Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {hours.map((hour) => {
              const rowTotal = positions.reduce((sum, pos) => sum + getCount(hour, pos.name), 0);
              return (
                <Table.Row key={hour}>
                  <Table.Cell fontWeight="medium">
                    {hour}:00-{hour + 1}:00
                  </Table.Cell>
                  {positions.map((pos) => (
                    <Table.Cell key={pos._id} textAlign="center">
                      <StepperCell
                        value={getCount(hour, pos.name)}
                        onChange={(value) => handleCountChange(hour, pos.name, value)}
                        disabled={disabled}
                      />
                    </Table.Cell>
                  ))}
                  <Table.Cell textAlign="center" fontWeight="medium" color="gray.600">
                    {rowTotal}
                  </Table.Cell>
                </Table.Row>
              );
            })}
          </Table.Body>
        </Table.Root>
      </Box>

      {/* SP表示: アコーディオン形式 */}
      <Box display={{ base: "block", md: "none" }}>
        <MobileAccordionView hours={hours} positions={positions} staffing={staffing} onChange={onChange} />
      </Box>

      {/* 合計表示 */}
      <Flex justify="flex-end" mt={4}>
        <Text fontSize="sm" color="gray.600">
          1日の合計:{" "}
          <Text as="span" fontWeight="bold">
            {totalPersonHours}人時
          </Text>
        </Text>
      </Flex>
    </Box>
  );
};
