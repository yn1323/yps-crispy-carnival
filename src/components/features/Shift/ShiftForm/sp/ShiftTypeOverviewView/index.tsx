import { Box, Flex, Stack } from "@chakra-ui/react";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useMemo, useState } from "react";
import { LuChevronDown, LuChevronRight } from "react-icons/lu";
import { IssueCountBadge } from "../../components";
import { getShiftTypeOptionColor } from "../../shiftTypeOptionStyles";
import {
  selectDateWithDailyStaffOrderAtom,
  shiftConfigAtom,
  shiftsAtom,
  viewModeAtom,
  warningCountByDateAtom,
} from "../../stores";
import {
  buildShiftTypeOverviewViewModel,
  type ShiftTypeOverviewDayRowViewModel,
  type ShiftTypeOverviewStaffRowViewModel,
  type ShiftTypeOverviewWeekdayTone,
} from "./script";

const weekdayColor: Record<ShiftTypeOverviewWeekdayTone, string> = {
  weekday: "#3f3f46",
  saturday: "#3b82f6",
  sunday: "#ef4444",
  muted: "#a1a1aa",
};

export const SPShiftTypeOverviewView = () => {
  const config = useAtomValue(shiftConfigAtom);
  const shifts = useAtomValue(shiftsAtom);
  const warningCounts = useAtomValue(warningCountByDateAtom);
  const selectDate = useSetAtom(selectDateWithDailyStaffOrderAtom);
  const setViewMode = useSetAtom(viewModeAtom);
  const { dates, holidays, staffs, isReadOnly, submissionPattern } = config;
  const viewModel = useMemo(
    () =>
      buildShiftTypeOverviewViewModel({
        dates,
        holidays,
        staffs,
        shifts,
        submissionPattern,
        warningCounts,
        isReadOnly,
      }),
    [dates, holidays, staffs, shifts, submissionPattern, warningCounts, isReadOnly],
  );
  const initialOpen = useMemo(() => {
    const state: Record<number, boolean> = {};
    for (let index = 0; index < viewModel.weeks.length; index++) state[index] = true;
    return state;
  }, [viewModel.weeks.length]);
  const [open, setOpen] = useState(initialOpen);

  const handleDateTap = useCallback(
    (iso: string) => {
      if (isReadOnly) return;
      selectDate(iso);
      setViewMode("daily");
    },
    [isReadOnly, selectDate, setViewMode],
  );

  return (
    <Box flex={1} minH={0} overflow="auto" bg="gray.50" px={3} py={3}>
      <Stack gap={2}>
        {viewModel.weeks.map((week) => {
          const isOpen = !!open[week.key];
          return (
            <Box
              key={week.key}
              bg="white"
              borderRadius="lg"
              borderWidth="1px"
              borderColor="gray.200"
              overflow="hidden"
              boxShadow={isOpen ? "0 1px 3px rgba(0,0,0,0.04)" : "none"}
            >
              <Flex
                align="center"
                gap={2}
                px={3}
                py={3}
                cursor="pointer"
                onClick={() => setOpen({ ...open, [week.key]: !isOpen })}
                borderBottomWidth={isOpen ? "1px" : "0"}
                borderColor="gray.100"
              >
                <Flex
                  w="24px"
                  h="24px"
                  borderRadius="md"
                  bg={isOpen ? "teal.500" : "gray.100"}
                  color={isOpen ? "white" : "gray.500"}
                  align="center"
                  justify="center"
                >
                  {isOpen ? <LuChevronDown size={14} /> : <LuChevronRight size={14} />}
                </Flex>
                <Box textStyle="numeric" fontWeight={700} color="gray.800">
                  {week.label}
                </Box>
              </Flex>

              {isOpen && (
                <Box>
                  {week.rows.map((row) => (
                    <DayRow key={row.key} row={row} onDateTap={() => handleDateTap(row.iso)} />
                  ))}
                </Box>
              )}
            </Box>
          );
        })}
      </Stack>
    </Box>
  );
};

const DayRow = ({ row, onDateTap }: { row: ShiftTypeOverviewDayRowViewModel; onDateTap: () => void }) => (
  <Flex
    gap={3}
    px={3}
    py={3}
    borderTopWidth={row.hasTopBorder ? "1px" : "0"}
    borderColor="gray.100"
    bg={row.surfaceTone === "muted" ? "gray.50" : "white"}
    cursor={row.canOpenDaily ? "pointer" : "default"}
    _active={row.canOpenDaily ? { bg: "gray.50" } : undefined}
    onClick={row.canOpenDaily ? onDateTap : undefined}
  >
    <Box w="68px" flexShrink={0} position="relative">
      {row.warningCount > 0 && <IssueCountBadge count={row.warningCount} tone="warning" />}
      <Flex align="baseline" gap="4px" whiteSpace="nowrap">
        <Box
          textStyle="numeric"
          fontWeight={700}
          color={row.dateTone === "default" ? "gray.800" : "gray.400"}
          lineHeight="1.1"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {row.dateLabel}
        </Box>
        <Box textStyle="2xs" fontWeight={700} flexShrink={0} style={{ color: weekdayColor[row.weekdayTone] }}>
          {row.weekdayLabel}
        </Box>
      </Flex>
      {row.closedLabel && (
        <Box textStyle="2xs" fontWeight={700} mt="2px" color="gray.500">
          {row.closedLabel}
        </Box>
      )}
    </Box>
    <Box flex={1} minW={0}>
      {row.staffRows.length > 0 ? (
        <DayShiftTypeStaffList rows={row.staffRows} />
      ) : (
        <Box
          textStyle="caption"
          color={row.statusTone === "closed" ? "gray.500" : "gray.400"}
          fontWeight={row.statusTone === "closed" ? 700 : row.statusTone === "outOfRange" ? 500 : undefined}
        >
          {row.statusLabel}
        </Box>
      )}
    </Box>
  </Flex>
);

const DayShiftTypeStaffList = ({ rows }: { rows: ShiftTypeOverviewStaffRowViewModel[] }) => (
  <Stack gap="6px">
    {rows.map((staff) => (
      <Flex key={staff.key} align="center" gap={2} textStyle="tableDense">
        <Box color="gray.800" fontWeight={600} flex={1} minW={0}>
          {staff.name}
        </Box>
        <Flex gap={1} justify="flex-end" wrap="wrap">
          {staff.optionChips.map((option) => {
            const color = getShiftTypeOptionColor(option.colorIndex);
            return (
              <Box
                key={option.key}
                px={2}
                py="2px"
                borderRadius="full"
                bg={color.requestedBg}
                color={color.accent}
                textStyle="2xs"
                fontWeight={700}
              >
                {option.label}
              </Box>
            );
          })}
        </Flex>
      </Flex>
    ))}
  </Stack>
);
