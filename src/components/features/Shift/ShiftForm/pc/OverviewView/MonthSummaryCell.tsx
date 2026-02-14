import { HStack, Icon, Table, Text } from "@chakra-ui/react";
import { LuTriangleAlert } from "react-icons/lu";
import { MONTH_TOTAL_CELL_WIDTH, ROW_HEIGHT } from "../../constants";
import type { MonthSummaryCellProps } from "../../types";
import { minutesToHoursLabel } from "../../utils/timeConversion";

export const MonthSummaryCell = ({ totalMinutes, alerts }: MonthSummaryCellProps) => {
  const hasAlert = alerts.length > 0;

  return (
    <Table.Cell
      bg="white"
      w={`${MONTH_TOTAL_CELL_WIDTH}px`}
      minW={`${MONTH_TOTAL_CELL_WIDTH}px`}
      h={`${ROW_HEIGHT}px`}
      p={1}
      textAlign="center"
      borderRight="1px solid"
      borderColor="gray.200"
    >
      <HStack justify="center" gap={1}>
        <Text fontSize="xs" fontWeight="medium" color={hasAlert ? "orange.600" : "gray.700"}>
          {minutesToHoursLabel(totalMinutes)}
        </Text>
        {hasAlert && <Icon as={LuTriangleAlert} boxSize={3} color="orange.500" />}
      </HStack>
    </Table.Cell>
  );
};
