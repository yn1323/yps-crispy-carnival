import { Box, Flex, Stack, Text } from "@chakra-ui/react";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useMemo, useState } from "react";
import { LuChevronDown, LuChevronRight } from "react-icons/lu";
import {
  buildWeeklyGrid,
  formatDateShort,
  formatDateWithWeekday,
  getWeekdayLabel,
  isSaturday,
  isSunday,
} from "@/src/domains/shift/date";
import { hasDateOnlyAssignment } from "@/src/domains/shift/dateOnlyAssignments";
import type { ShiftData, StaffType } from "@/src/domains/shift/types";
import { selectedDateAtom, shiftConfigAtom, shiftsAtom, viewModeAtom } from "../../stores";

type WeekDate = {
  iso: string;
  inRange: boolean;
};

type WeekItem = {
  key: string;
  label: string;
  dates: WeekDate[];
};

const dayColor = (iso: string): string => {
  if (isSunday(iso)) return "red.500";
  if (isSaturday(iso)) return "blue.500";
  return "gray.700";
};

const buildWeeks = (dates: string[]): WeekItem[] =>
  buildWeeklyGrid(dates).map((week) => {
    const start = week[0]?.iso ?? "";
    const end = week[week.length - 1]?.iso ?? start;
    return {
      key: `${start}-${end}`,
      label: start === end ? formatDateShort(start) : `${formatDateShort(start)} – ${formatDateShort(end)}`,
      dates: week,
    };
  });

export const SPDateOnlyOverviewView = () => {
  const config = useAtomValue(shiftConfigAtom);
  const shifts = useAtomValue(shiftsAtom);
  const setSelectedDate = useSetAtom(selectedDateAtom);
  const setViewMode = useSetAtom(viewModeAtom);
  const { dates, holidays, staffs, isReadOnly } = config;

  const weeks = useMemo(() => buildWeeks(dates), [dates]);
  const [openWeeks, setOpenWeeks] = useState<Record<string, boolean>>(() => {
    const firstKey = buildWeeks(dates)[0]?.key;
    return firstKey ? { [firstKey]: true } : {};
  });

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
      <Stack gap={3}>
        {weeks.map((week, index) => {
          const isOpen = openWeeks[week.key] ?? index === 0;
          return (
            <WeekCard
              key={week.key}
              week={week}
              isOpen={isOpen}
              holidays={holidays}
              staffs={staffs}
              isReadOnly={isReadOnly}
              shiftByStaffDate={shiftByStaffDate}
              onToggle={() => setOpenWeeks((current) => ({ ...current, [week.key]: !isOpen }))}
              onDateTap={handleDateTap}
            />
          );
        })}
      </Stack>
    </Box>
  );
};

const WeekCard = ({
  week,
  isOpen,
  holidays,
  staffs,
  isReadOnly,
  shiftByStaffDate,
  onToggle,
  onDateTap,
}: {
  week: WeekItem;
  isOpen: boolean;
  holidays: string[];
  staffs: StaffType[];
  isReadOnly: boolean;
  shiftByStaffDate: Map<string, ShiftData>;
  onToggle: () => void;
  onDateTap: (iso: string) => void;
}) => (
  <Box bg="white" borderRadius="md" borderWidth="1px" borderColor="gray.200" overflow="hidden">
    <Flex
      as="button"
      w="100%"
      align="center"
      gap={3}
      px={3}
      py={3}
      textAlign="left"
      onClick={onToggle}
      borderBottomWidth={isOpen ? "1px" : "0"}
      borderColor="gray.100"
      cursor="pointer"
    >
      <Flex
        w="28px"
        h="28px"
        flexShrink={0}
        borderRadius="md"
        align="center"
        justify="center"
        bg={isOpen ? "teal.500" : "gray.100"}
        color={isOpen ? "white" : "gray.500"}
      >
        {isOpen ? <LuChevronDown size={16} /> : <LuChevronRight size={16} />}
      </Flex>
      <Text textStyle="md" fontWeight={700} color="gray.800" fontVariantNumeric="tabular-nums">
        {week.label}
      </Text>
    </Flex>

    {isOpen && (
      <Box>
        {week.dates.map((date, index) => {
          const isClosed = date.inRange && holidays.includes(date.iso);
          const assignedStaffs =
            date.inRange && !isClosed
              ? staffs.filter((staff) => hasDateOnlyAssignment(shiftByStaffDate.get(`${staff.id}-${date.iso}`)))
              : [];
          return (
            <DayRow
              key={date.iso}
              date={date}
              isClosed={isClosed}
              assignedStaffs={assignedStaffs}
              hasTopBorder={index > 0}
              isReadOnly={isReadOnly}
              onDateTap={() => onDateTap(date.iso)}
            />
          );
        })}
      </Box>
    )}
  </Box>
);

const DayRow = ({
  date,
  isClosed,
  assignedStaffs,
  hasTopBorder,
  isReadOnly,
  onDateTap,
}: {
  date: WeekDate;
  isClosed: boolean;
  assignedStaffs: StaffType[];
  hasTopBorder: boolean;
  isReadOnly: boolean;
  onDateTap: () => void;
}) => {
  const canOpenDaily = !isReadOnly && date.inRange && !isClosed;

  return (
    <Flex
      as={canOpenDaily ? "button" : "div"}
      aria-label={canOpenDaily ? `${formatDateWithWeekday(date.iso)}の日別を表示` : undefined}
      onClick={canOpenDaily ? onDateTap : undefined}
      w="100%"
      gap={3}
      px={3}
      py={3}
      textAlign="left"
      borderTopWidth={hasTopBorder ? "1px" : "0"}
      borderColor="gray.100"
      bg="white"
      cursor={canOpenDaily ? "pointer" : "default"}
      _active={canOpenDaily ? { bg: "gray.50" } : undefined}
      _focusVisible={{ outline: "2px solid", outlineColor: "teal.600", outlineOffset: "-2px" }}
    >
      <Box w="54px" flexShrink={0}>
        <Text
          textStyle="md"
          fontWeight={700}
          color={date.inRange ? "gray.800" : "gray.400"}
          lineHeight="1.1"
          fontVariantNumeric="tabular-nums"
        >
          {formatDateShort(date.iso)}
        </Text>
        <Text textStyle="2xs" mt="2px" fontWeight={700} color={date.inRange ? dayColor(date.iso) : "gray.400"}>
          {getWeekdayLabel(date.iso)}
        </Text>
      </Box>
      <Box flex={1} minW={0} pt="1px">
        {!date.inRange ? (
          <Text
            textStyle="caption"
            color="gray.400"
            fontWeight={500}
            aria-label={`${formatDateWithWeekday(date.iso)} 期間外`}
          >
            期間外
          </Text>
        ) : isClosed ? (
          <Text textStyle="caption" color="gray.400" fontWeight={500}>
            定休日
          </Text>
        ) : assignedStaffs.length > 0 ? (
          <Stack gap="5px">
            {assignedStaffs.map((staff) => (
              <Text key={staff.id} textStyle="caption" fontWeight={600} color="gray.800">
                {staff.name}
              </Text>
            ))}
          </Stack>
        ) : (
          <Text textStyle="caption" color="gray.400" fontWeight={500}>
            勤務なし
          </Text>
        )}
      </Box>
    </Flex>
  );
};
