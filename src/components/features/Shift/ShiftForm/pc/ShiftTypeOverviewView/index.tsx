import { Box, Flex, Stack, Text } from "@chakra-ui/react";
import dayjs from "dayjs";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useMemo, useState } from "react";
import { LuChevronDown, LuChevronRight } from "react-icons/lu";
import { buildWeeklyGrid, getWeekdayLabel, type WeekStart } from "@/src/domains/shift/date";
import { getAssignedShiftTypeOptionIdsInOptionOrder } from "@/src/domains/shift/shiftTypeAssignments";
import type { ShiftData, StaffType } from "@/src/domains/shift/types";
import { selectedDateAtom, shiftConfigAtom, shiftsAtom, viewModeAtom } from "../../stores";
import { getShiftTypeOptionColor, type ShiftTypeOptionColor } from "../shiftTypeOptionStyles";

type DateInfo = {
  iso: string;
  label: string;
  wk: string;
  inRange: boolean;
};

const toDateInfo = (cell: { iso: string; inRange: boolean }): DateInfo => {
  const d = dayjs(cell.iso);
  return {
    iso: cell.iso,
    label: `${d.month() + 1}/${d.date()}`,
    wk: getWeekdayLabel(cell.iso),
    inRange: cell.inRange,
  };
};

const dayColor = (iso: string): string => {
  const day = dayjs(iso).day();
  if (day === 0) return "#ef4444";
  if (day === 6) return "#3b82f6";
  return "#3f3f46";
};

type ShiftTypeOverviewViewProps = {
  weekStart?: WeekStart;
};

export const ShiftTypeOverviewView = ({ weekStart = "mon" }: ShiftTypeOverviewViewProps) => {
  const config = useAtomValue(shiftConfigAtom);
  const shifts = useAtomValue(shiftsAtom);
  const setSelectedDate = useSetAtom(selectedDateAtom);
  const setViewMode = useSetAtom(viewModeAtom);
  const { dates, holidays, isReadOnly, staffs, submissionPattern } = config;
  const options = useMemo(
    () =>
      submissionPattern?.kind === "shiftType"
        ? [...submissionPattern.options].sort((a, b) => a.sortOrder - b.sortOrder)
        : [],
    [submissionPattern],
  );
  const optionNameById = useMemo(() => new Map(options.map((option) => [option.id, option.name])), [options]);
  const optionColorById = useMemo(
    () => new Map(options.map((option, index) => [option.id, getShiftTypeOptionColor(index)])),
    [options],
  );
  const sortedOptionIds = useMemo(() => options.map((option) => option.id), [options]);

  const weeks = useMemo<DateInfo[][]>(
    () => buildWeeklyGrid(dates, weekStart).map((week) => week.map(toDateInfo)),
    [dates, weekStart],
  );
  const shiftByStaffDate = useMemo(() => {
    const map = new Map<string, ShiftData>();
    for (const shift of shifts) {
      map.set(`${shift.staffId}-${shift.date}`, shift);
    }
    return map;
  }, [shifts]);
  const [open, setOpen] = useState<Record<number, boolean>>({});

  const handleDateClick = useCallback(
    (iso: string) => {
      if (isReadOnly) return;
      setSelectedDate(iso);
      setViewMode("daily");
    },
    [isReadOnly, setSelectedDate, setViewMode],
  );

  return (
    <Box bg="gray.50" h="100%" overflow="auto" px={5} py={5}>
      <Stack gap={3}>
        {weeks.map((wkDates, wi) => {
          if (wkDates.length === 0) return null;
          const isOpen = open[wi] !== false;
          return (
            <WeekCard
              key={wkDates[0].iso}
              wkDates={wkDates}
              staffs={staffs}
              shiftByStaffDate={shiftByStaffDate}
              holidays={holidays}
              optionNameById={optionNameById}
              optionColorById={optionColorById}
              sortedOptionIds={sortedOptionIds}
              isOpen={isOpen}
              onToggle={() => setOpen({ ...open, [wi]: !isOpen })}
              onDateClick={handleDateClick}
              isReadOnly={isReadOnly}
            />
          );
        })}
      </Stack>
    </Box>
  );
};

type WeekCardProps = {
  wkDates: DateInfo[];
  staffs: StaffType[];
  shiftByStaffDate: Map<string, ShiftData>;
  holidays: string[];
  optionNameById: Map<string, string>;
  optionColorById: Map<string, ShiftTypeOptionColor>;
  sortedOptionIds: string[];
  isOpen: boolean;
  onToggle: () => void;
  onDateClick: (iso: string) => void;
  isReadOnly: boolean;
};

const WeekCard = ({
  wkDates,
  staffs,
  shiftByStaffDate,
  holidays,
  optionNameById,
  optionColorById,
  sortedOptionIds,
  isOpen,
  onToggle,
  onDateClick,
  isReadOnly,
}: WeekCardProps) => {
  const inRangeDates = wkDates.filter((d) => d.inRange);
  const rangeLabel =
    inRangeDates.length > 0 ? `${inRangeDates[0].label} – ${inRangeDates[inRangeDates.length - 1].label}` : "";
  return (
    <Box bg="white" borderRadius="lg" borderWidth="1px" borderColor="gray.200" overflow="hidden">
      <Flex
        align="center"
        gap={3}
        px={5}
        py={3}
        cursor="pointer"
        onClick={onToggle}
        borderBottomWidth={isOpen ? "1px" : "0"}
        borderColor="gray.100"
      >
        <Flex
          w="28px"
          h="28px"
          borderRadius="md"
          bg={isOpen ? "teal.600" : "gray.100"}
          color={isOpen ? "white" : "gray.500"}
          align="center"
          justify="center"
          flexShrink={0}
        >
          {isOpen ? <LuChevronDown size={16} /> : <LuChevronRight size={16} />}
        </Flex>
        <Box textStyle="numeric" fontWeight={700} color="gray.800">
          {rangeLabel}
        </Box>
      </Flex>

      {isOpen && (
        <WeekTable
          staffs={staffs}
          wkDates={wkDates}
          shiftByStaffDate={shiftByStaffDate}
          holidays={holidays}
          optionNameById={optionNameById}
          optionColorById={optionColorById}
          sortedOptionIds={sortedOptionIds}
          onDateClick={onDateClick}
          isReadOnly={isReadOnly}
        />
      )}
    </Box>
  );
};

type WeekTableProps = {
  staffs: StaffType[];
  wkDates: DateInfo[];
  shiftByStaffDate: Map<string, ShiftData>;
  holidays: string[];
  optionNameById: Map<string, string>;
  optionColorById: Map<string, ShiftTypeOptionColor>;
  sortedOptionIds: string[];
  onDateClick: (iso: string) => void;
  isReadOnly: boolean;
};

const WeekTable = ({
  staffs,
  wkDates,
  shiftByStaffDate,
  holidays,
  optionNameById,
  optionColorById,
  sortedOptionIds,
  onDateClick,
  isReadOnly,
}: WeekTableProps) => (
  <Box overflowX="auto">
    <Box
      as="table"
      minW="920px"
      w="100%"
      textStyle="tableDense"
      style={{ borderCollapse: "collapse", tableLayout: "fixed" }}
    >
      <Box as="colgroup">
        <Box as="col" style={{ width: 200 }} />
        {wkDates.map((d) => (
          <Box as="col" key={d.iso} />
        ))}
      </Box>
      <Box as="thead">
        <Box as="tr" bg="gray.50" borderBottomWidth="1px" borderColor="gray.200">
          <Box as="th" px={4} py={3} textAlign="left" color="gray.600" fontWeight={600}>
            スタッフ
          </Box>
          {wkDates.map((d) => {
            const isClickable = !isReadOnly && d.inRange;
            const isClosed = holidays.includes(d.iso);
            return (
              <Box
                as="th"
                key={d.iso}
                onClick={isClickable ? () => onDateClick(d.iso) : undefined}
                px={2}
                py={3}
                textAlign="center"
                cursor={isClickable ? "pointer" : "default"}
                opacity={d.inRange ? 1 : 0.35}
                bg={isClosed ? "gray.100" : undefined}
              >
                <Box textStyle="numeric" color="gray.700" fontWeight={700}>
                  {d.label}
                </Box>
                <Box textStyle="2xs" fontWeight={600} mt="2px" style={{ color: dayColor(d.iso) }}>
                  {d.wk}
                </Box>
              </Box>
            );
          })}
        </Box>
      </Box>
      <Box as="tbody">
        {staffs.map((staff) => (
          <Box as="tr" key={staff.id} borderBottomWidth="1px" borderColor="gray.100">
            <Box as="td" px={4} py={3}>
              <Text fontSize="sm" fontWeight={700} color={staff.isSubmitted ? "gray.800" : "gray.500"} truncate>
                {staff.name}
              </Text>
            </Box>
            {wkDates.map((d) => {
              const isClosed = holidays.includes(d.iso);
              const shift = shiftByStaffDate.get(`${staff.id}-${d.iso}`);
              const assignedOptionIds =
                d.inRange && !isClosed ? getAssignedShiftTypeOptionIdsInOptionOrder(shift, sortedOptionIds) : [];
              return (
                <Box
                  as="td"
                  key={d.iso}
                  px={2}
                  py={2}
                  textAlign="center"
                  bg={isClosed ? "gray.100" : undefined}
                  verticalAlign="middle"
                >
                  {isClosed ? (
                    <Text color="gray.500" textStyle="caption" fontWeight={700}>
                      定休日
                    </Text>
                  ) : assignedOptionIds.length > 0 ? (
                    <Flex gap={1} justify="center" wrap="wrap">
                      {assignedOptionIds.map((optionId) => {
                        const optionColor = optionColorById.get(optionId);
                        return (
                          <Box
                            key={optionId}
                            px={2}
                            py="2px"
                            borderRadius="full"
                            bg={optionColor?.requestedBg ?? "teal.50"}
                            color={optionColor?.accent ?? "teal.700"}
                            fontSize="xs"
                            fontWeight={700}
                          >
                            {optionNameById.get(optionId) ?? "勤務"}
                          </Box>
                        );
                      })}
                    </Flex>
                  ) : !staff.isSubmitted ? (
                    <Text color="orange.600" textStyle="caption" fontWeight={700}>
                      未提出
                    </Text>
                  ) : (
                    <Text color={d.inRange ? "gray.300" : "gray.200"} textStyle="caption">
                      —
                    </Text>
                  )}
                </Box>
              );
            })}
          </Box>
        ))}
      </Box>
    </Box>
  </Box>
);
