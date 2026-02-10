import { Box, Table } from "@chakra-ui/react";
import { useMemo } from "react";
import { MobileAccordionView } from "../MobileAccordionView";
import type { PositionType, StaffingEntry } from "../types";
import { createHourPositionKey, createStaffingMapFromEntries, updateStaffingEntry } from "../utils/staffingMapHelpers";
import { generateHourRange } from "../utils/timeHelpers";
import { StepperCell } from "./StepperCell";

type StaffingTableProps = {
  openTime: string;
  closeTime: string;
  positions: PositionType[];
  staffing: StaffingEntry[];
  onChange: (staffing: StaffingEntry[]) => void;
  disabled?: boolean;
  initialStaffing?: StaffingEntry[];
};

export const StaffingTable = ({
  openTime,
  closeTime,
  positions,
  staffing,
  onChange,
  disabled = false,
  initialStaffing,
}: StaffingTableProps) => {
  // 営業時間から時間帯リストを生成
  const hours = useMemo(() => generateHourRange(openTime, closeTime), [openTime, closeTime]);

  // staffingをマップに変換
  const staffingMap = useMemo(() => createStaffingMapFromEntries(staffing), [staffing]);

  // 初期値マップ（変更検出用）
  const initialMap = useMemo(
    () => (initialStaffing ? createStaffingMapFromEntries(initialStaffing) : {}),
    [initialStaffing],
  );

  // 人員数取得
  const getCount = (hour: number, position: string) => staffingMap[createHourPositionKey(hour, position)] ?? 0;

  // 変更検出
  const checkChanged = (hour: number, position: string) => {
    if (!initialStaffing) return false;
    const key = createHourPositionKey(hour, position);
    return (staffingMap[key] ?? 0) !== (initialMap[key] ?? 0);
  };

  // 人員数更新
  const handleCountChange = (hour: number, position: string, value: number) => {
    onChange(updateStaffingEntry(staffing, hour, position, value));
  };

  // ポジション別合計
  const positionTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const position of positions) {
      totals[position.name] = staffing
        .filter((e) => e.position === position.name)
        .reduce((sum, e) => sum + e.requiredCount, 0);
    }
    return totals;
  }, [staffing, positions]);

  return (
    <Box>
      {/* PC表示: Table形式 */}
      <Box display={{ base: "none", md: "block" }}>
        <Table.Root size="sm" variant="outline">
          <Table.Header>
            <Table.Row position="sticky" top={0} zIndex={10} bg="gray.50" boxShadow="0 2px 4px rgba(0,0,0,0.04)">
              <Table.ColumnHeader>時間帯</Table.ColumnHeader>
              {positions.map((position) => (
                <Table.ColumnHeader key={position._id} textAlign="center">
                  {position.name}
                  <Box as="span" fontSize="xs" color="gray.500" ml={1}>
                    ({positionTotals[position.name] ?? 0})
                  </Box>
                </Table.ColumnHeader>
              ))}
              <Table.ColumnHeader textAlign="center">合計</Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {hours.map((hour) => {
              const rowTotal = positions.reduce((sum, position) => sum + getCount(hour, position.name), 0);
              return (
                <Table.Row key={hour}>
                  <Table.Cell fontWeight="medium">
                    {hour}:00-{hour + 1}:00
                  </Table.Cell>
                  {positions.map((position) => (
                    <Table.Cell key={position._id} textAlign="center">
                      <StepperCell
                        value={getCount(hour, position.name)}
                        onChange={(value) => handleCountChange(hour, position.name, value)}
                        disabled={disabled}
                        isChanged={checkChanged(hour, position.name)}
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
    </Box>
  );
};
