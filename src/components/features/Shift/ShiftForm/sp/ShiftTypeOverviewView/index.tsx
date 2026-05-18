import { Box, Flex, Stack } from "@chakra-ui/react";
import dayjs from "dayjs";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useMemo, useState } from "react";
import { LuChevronDown, LuChevronRight } from "react-icons/lu";
import { getWeekdayLabel } from "@/src/domains/shift/date";
import { getAssignedShiftTypeOptionIdsInOptionOrder } from "@/src/domains/shift/shiftTypeAssignments";
import type { ShiftData, StaffType } from "@/src/domains/shift/types";
import { getShiftTypeOptionColor, type ShiftTypeOptionColor } from "../../pc/shiftTypeOptionStyles";
import { selectedDateAtom, shiftConfigAtom, shiftsAtom, viewModeAtom } from "../../stores";

type DateInfo = {
  iso: string;
  label: string;
  wk: string;
  weekIdx: number;
};

type OptionDisplay = {
  name: string;
  color: ShiftTypeOptionColor;
};

const buildDateInfos = (dates: string[]): DateInfo[] =>
  dates.map((iso, i) => {
    const d = dayjs(iso);
    return {
      iso,
      label: `${d.month() + 1}/${d.date()}`,
      wk: getWeekdayLabel(iso),
      weekIdx: Math.floor(i / 7),
    };
  });

const dayColor = (iso: string): string => {
  const day = dayjs(iso).day();
  if (day === 0) return "#ef4444";
  if (day === 6) return "#3b82f6";
  return "#3f3f46";
};

export const SPShiftTypeOverviewView = () => {
  const config = useAtomValue(shiftConfigAtom);
  const shifts = useAtomValue(shiftsAtom);
  const setSelectedDate = useSetAtom(selectedDateAtom);
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

  const dateInfos = useMemo(() => buildDateInfos(dates), [dates]);
  const weekCount = Math.max(1, Math.ceil(dateInfos.length / 7));
  const initialOpen = useMemo(() => {
    const state: Record<number, boolean> = {};
    for (let index = 0; index < weekCount; index++) state[index] = true;
    return state;
  }, [weekCount]);
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
      setSelectedDate(iso);
      setViewMode("daily");
    },
    [isReadOnly, setSelectedDate, setViewMode],
  );

  return (
    <Box flex={1} minH={0} overflow="auto" bg="gray.50" px={3} py={3}>
      <Stack gap={2}>
        {Array.from({ length: weekCount }).map((_, weekIndex) => {
          const weekDates = dateInfos.filter((date) => date.weekIdx === weekIndex);
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
                  {weekDates[0].label} – {weekDates[weekDates.length - 1].label}
                </Box>
              </Flex>

              {isOpen && (
                <Box>
                  {weekDates.map((date, index) => {
                    const isClosed = holidays.includes(date.iso);
                    const workingStaffs = isClosed
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
                    return (
                      <Flex
                        key={date.iso}
                        gap={3}
                        px={3}
                        py={3}
                        borderTopWidth={index > 0 ? "1px" : "0"}
                        borderColor="gray.100"
                        bg={isClosed ? "gray.50" : "white"}
                        cursor={isReadOnly ? "default" : "pointer"}
                        _active={isReadOnly ? undefined : { bg: "gray.50" }}
                        onClick={isReadOnly ? undefined : () => handleDateTap(date.iso)}
                      >
                        <Box w="44px" flexShrink={0}>
                          <Box
                            textStyle="numeric"
                            fontWeight={700}
                            color="gray.800"
                            lineHeight="1.1"
                            style={{ fontVariantNumeric: "tabular-nums" }}
                          >
                            {date.label}
                          </Box>
                          <Box textStyle="2xs" fontWeight={700} mt="2px" style={{ color: dayColor(date.iso) }}>
                            {date.wk}
                          </Box>
                          {isClosed && (
                            <Box textStyle="2xs" fontWeight={700} mt="2px" color="gray.500">
                              定休日
                            </Box>
                          )}
                        </Box>
                        <Box flex={1} minW={0}>
                          {isClosed ? (
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
