import { Box, Flex, Stack } from "@chakra-ui/react";
import dayjs from "dayjs";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useMemo, useState } from "react";
import { LuChevronDown, LuChevronRight } from "react-icons/lu";
import { buildWeeklyGrid, formatDateShort, getWeekdayLabel } from "@/src/domains/shift/date";
import { getAssignedShiftTypeOptionIdsInOptionOrder } from "@/src/domains/shift/shiftTypeAssignments";
import type { ShiftData, StaffType } from "@/src/domains/shift/types";
import { IssueCountBadge } from "../../components";
import { getShiftTypeOptionColor, type ShiftTypeOptionColor } from "../../pc/shiftTypeOptionStyles";
import {
  selectDateWithDailyStaffOrderAtom,
  shiftConfigAtom,
  shiftsAtom,
  viewModeAtom,
  warningCountByDateAtom,
} from "../../stores";

type DateInfo = {
  iso: string;
  label: string;
  wk: string;
  inRange: boolean;
};

type OptionDisplay = {
  name: string;
  color: ShiftTypeOptionColor;
};

const toDateInfo = (cell: { iso: string; inRange: boolean }): DateInfo => ({
  iso: cell.iso,
  label: formatDateShort(cell.iso),
  wk: getWeekdayLabel(cell.iso),
  inRange: cell.inRange,
});

const buildWeeks = (dates: string[]): DateInfo[][] => buildWeeklyGrid(dates).map((week) => week.map(toDateInfo));

const formatWeekLabel = (dates: DateInfo[]): string => {
  const start = dates[0]?.iso ?? "";
  const end = dates[dates.length - 1]?.iso ?? start;
  return start === end ? formatDateShort(start) : `${formatDateShort(start)} – ${formatDateShort(end)}`;
};

const dayColor = (iso: string): string => {
  const day = dayjs(iso).day();
  if (day === 0) return "#ef4444";
  if (day === 6) return "#3b82f6";
  return "#3f3f46";
};

export const SPShiftTypeOverviewView = () => {
  const config = useAtomValue(shiftConfigAtom);
  const shifts = useAtomValue(shiftsAtom);
  const warningCounts = useAtomValue(warningCountByDateAtom);
  const selectDate = useSetAtom(selectDateWithDailyStaffOrderAtom);
  const setViewMode = useSetAtom(viewModeAtom);
  const { dates, holidays, staffs, isReadOnly, submissionPattern } = config;

  const options = useMemo(
    () =>
      submissionPattern?.kind === "shiftType"
        ? [...submissionPattern.options].sort((a, b) => a.sortOrder - b.sortOrder)
        : [],
    [submissionPattern],
  );
  const sortedOptionIds = useMemo(() => options.map((option) => option.id), [options]);
  const optionDisplayById = useMemo(
    () =>
      new Map(
        options.map((option, index) => [
          option.id,
          {
            name: option.name,
            color: getShiftTypeOptionColor(index),
          },
        ]),
      ),
    [options],
  );

  const weeks = useMemo(() => buildWeeks(dates), [dates]);
  const initialOpen = useMemo(() => {
    const state: Record<number, boolean> = {};
    for (let index = 0; index < weeks.length; index++) state[index] = true;
    return state;
  }, [weeks.length]);
  const [open, setOpen] = useState(initialOpen);

  const shiftByStaffDate = useMemo(() => {
    const map = new Map<string, ShiftData>();
    for (const shift of shifts) {
      map.set(`${shift.staffId}-${shift.date}`, shift);
    }
    return map;
  }, [shifts]);

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
        {weeks.map((weekDates, weekIndex) => {
          if (weekDates.length === 0) return null;
          const isOpen = !!open[weekIndex];
          return (
            <Box
              key={weekIndex}
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
                onClick={() => setOpen({ ...open, [weekIndex]: !isOpen })}
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
                  {formatWeekLabel(weekDates)}
                </Box>
              </Flex>

              {isOpen && (
                <Box>
                  {weekDates.map((date, index) => {
                    const isClosed = date.inRange && holidays.includes(date.iso);
                    const workingStaffs =
                      !date.inRange || isClosed
                        ? []
                        : staffs
                            .map((staff) => {
                              const shift = shiftByStaffDate.get(`${staff.id}-${date.iso}`);
                              const assignedOptionIds = getAssignedShiftTypeOptionIdsInOptionOrder(
                                shift,
                                sortedOptionIds,
                              );
                              return { staff, assignedOptionIds };
                            })
                            .filter((item) => item.assignedOptionIds.length > 0);
                    const canOpenDaily = !isReadOnly && date.inRange;
                    const warningCount = warningCounts.get(date.iso) ?? 0;
                    return (
                      <Flex
                        key={date.iso}
                        gap={3}
                        px={3}
                        py={3}
                        borderTopWidth={index > 0 ? "1px" : "0"}
                        borderColor="gray.100"
                        bg={isClosed || !date.inRange ? "gray.50" : "white"}
                        cursor={canOpenDaily ? "pointer" : "default"}
                        _active={canOpenDaily ? { bg: "gray.50" } : undefined}
                        onClick={canOpenDaily ? () => handleDateTap(date.iso) : undefined}
                      >
                        <Box w="68px" flexShrink={0} position="relative">
                          {warningCount > 0 && <IssueCountBadge count={warningCount} tone="warning" />}
                          <Flex align="baseline" gap="4px" whiteSpace="nowrap">
                            <Box
                              textStyle="numeric"
                              fontWeight={700}
                              color={date.inRange ? "gray.800" : "gray.400"}
                              lineHeight="1.1"
                              style={{ fontVariantNumeric: "tabular-nums" }}
                            >
                              {date.label}
                            </Box>
                            <Box
                              textStyle="2xs"
                              fontWeight={700}
                              flexShrink={0}
                              style={{ color: date.inRange ? dayColor(date.iso) : "#a1a1aa" }}
                            >
                              {date.wk}
                            </Box>
                          </Flex>
                          {isClosed && (
                            <Box textStyle="2xs" fontWeight={700} mt="2px" color="gray.500">
                              定休日
                            </Box>
                          )}
                        </Box>
                        <Box flex={1} minW={0}>
                          {!date.inRange ? (
                            <Box textStyle="caption" color="gray.400" fontWeight={500}>
                              期間外
                            </Box>
                          ) : isClosed ? (
                            <Box textStyle="caption" color="gray.500" fontWeight={700}>
                              定休日
                            </Box>
                          ) : workingStaffs.length > 0 ? (
                            <DayShiftTypeStaffList rows={workingStaffs} optionDisplayById={optionDisplayById} />
                          ) : (
                            <Box textStyle="caption" color="gray.400">
                              出勤なし
                            </Box>
                          )}
                        </Box>
                      </Flex>
                    );
                  })}
                </Box>
              )}
            </Box>
          );
        })}
      </Stack>
    </Box>
  );
};

const DayShiftTypeStaffList = ({
  rows,
  optionDisplayById,
}: {
  rows: { staff: StaffType; assignedOptionIds: string[] }[];
  optionDisplayById: Map<string, OptionDisplay>;
}) => (
  <Stack gap="6px">
    {rows.map(({ staff, assignedOptionIds }) => (
      <Flex key={staff.id} align="center" gap={2} textStyle="tableDense">
        <Box color="gray.800" fontWeight={600} flex={1} minW={0}>
          {staff.name}
        </Box>
        <Flex gap={1} justify="flex-end" wrap="wrap">
          {assignedOptionIds.map((optionId) => {
            const optionDisplay = optionDisplayById.get(optionId);
            return (
              <Box
                key={optionId}
                px={2}
                py="2px"
                borderRadius="full"
                bg={optionDisplay?.color.requestedBg ?? "gray.100"}
                color={optionDisplay?.color.accent ?? "gray.700"}
                textStyle="2xs"
                fontWeight={700}
              >
                {optionDisplay?.name ?? "勤務"}
              </Box>
            );
          })}
        </Flex>
      </Flex>
    ))}
  </Stack>
);
