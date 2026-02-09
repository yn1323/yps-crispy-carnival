import { Box, Flex, Table, Text } from "@chakra-ui/react";
import { useMemo } from "react";
import { DAY_LABELS, getDayColor, WEEKDAY_ORDER } from "../constants";
import { calculateHeatmapData, HEATMAP_COLORS } from "../utils/heatmapCalculations";

type WeeklyHeatmapProps = {
  staffingMap: Record<string, number>;
  hours: number[];
  positions: { name: string }[];
  onSelectDay: (dayOfWeek: number) => void;
};

export const WeeklyHeatmap = ({ staffingMap, hours, positions, onSelectDay }: WeeklyHeatmapProps) => {
  const { rows, dailyTotals, maxCount } = useMemo(
    () => calculateHeatmapData({ staffingMap, hours, positions }),
    [staffingMap, hours, positions],
  );

  return (
    <Box>
      {/* PC表示 */}
      <Box display={{ base: "none", md: "block" }}>
        <Table.Root size="sm" variant="outline">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeader w="80px">時間帯</Table.ColumnHeader>
              {WEEKDAY_ORDER.map((day) => (
                <Table.ColumnHeader
                  key={day}
                  textAlign="center"
                  cursor="pointer"
                  _hover={{ bg: "gray.100" }}
                  onClick={() => onSelectDay(day)}
                  w="60px"
                >
                  {DAY_LABELS[day]}
                </Table.ColumnHeader>
              ))}
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rows.map((row) => (
              <Table.Row key={row.hour}>
                <Table.Cell fontWeight="medium" fontSize="xs">
                  {row.hour}:00
                </Table.Cell>
                {WEEKDAY_ORDER.map((day) => {
                  const cell = row.cells[day];
                  return (
                    <Table.Cell
                      key={day}
                      textAlign="center"
                      bg={cell.colorToken}
                      color={cell.totalCount > 0 && cell.colorToken === "blue.700" ? "white" : undefined}
                      cursor="pointer"
                      _hover={{ opacity: 0.8 }}
                      onClick={() => onSelectDay(day)}
                      fontSize="xs"
                      p={1}
                    >
                      {cell.totalCount > 0 ? cell.totalCount : ""}
                    </Table.Cell>
                  );
                })}
              </Table.Row>
            ))}
          </Table.Body>
          <Table.Footer>
            <Table.Row>
              <Table.Cell fontWeight="bold" fontSize="xs">
                合計
              </Table.Cell>
              {WEEKDAY_ORDER.map((day) => (
                <Table.Cell key={day} textAlign="center" fontWeight="bold" fontSize="xs">
                  {dailyTotals[day] > 0 ? dailyTotals[day] : "-"}
                </Table.Cell>
              ))}
            </Table.Row>
          </Table.Footer>
        </Table.Root>
      </Box>

      {/* SP表示: コンパクトグリッド */}
      <Box display={{ base: "block", md: "none" }} overflowX="auto">
        <Table.Root size="sm" variant="outline">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeader w="50px" fontSize="xs" p={1}>
                時間
              </Table.ColumnHeader>
              {WEEKDAY_ORDER.map((day) => (
                <Table.ColumnHeader
                  key={day}
                  textAlign="center"
                  fontSize="xs"
                  p={1}
                  cursor="pointer"
                  onClick={() => onSelectDay(day)}
                >
                  {DAY_LABELS[day]}
                </Table.ColumnHeader>
              ))}
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rows.map((row) => (
              <Table.Row key={row.hour}>
                <Table.Cell fontSize="xs" p={1}>
                  {row.hour}
                </Table.Cell>
                {WEEKDAY_ORDER.map((day) => {
                  const cell = row.cells[day];
                  return (
                    <Table.Cell
                      key={day}
                      textAlign="center"
                      bg={cell.colorToken}
                      color={cell.totalCount > 0 && cell.colorToken === "blue.700" ? "white" : undefined}
                      cursor="pointer"
                      onClick={() => onSelectDay(day)}
                      fontSize="xs"
                      p={1}
                    >
                      {cell.totalCount > 0 ? cell.totalCount : ""}
                    </Table.Cell>
                  );
                })}
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      </Box>

      {/* 凡例 */}
      <Flex mt={3} gap={2} align="center" justify="flex-end">
        <Text fontSize="xs" color="gray.500">
          少
        </Text>
        {HEATMAP_COLORS.map((color) => (
          <Box key={color} w="16px" h="16px" bg={color} borderRadius="sm" borderWidth="1px" borderColor="gray.200" />
        ))}
        <Text fontSize="xs" color="gray.500">
          多{maxCount > 0 && `(最大${maxCount}人)`}
        </Text>
      </Flex>
    </Box>
  );
};
