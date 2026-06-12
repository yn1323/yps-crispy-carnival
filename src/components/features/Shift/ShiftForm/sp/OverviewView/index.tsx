import { Box, Flex, Stack } from "@chakra-ui/react";
import dayjs from "dayjs";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useMemo, useState } from "react";
import { LuChevronDown, LuChevronRight } from "react-icons/lu";
import { buildWeeklyGrid, formatDateShort, getWeekdayLabel } from "@/src/domains/shift/date";
import { formatShiftClockTime, timeToMinutes } from "@/src/domains/shift/time";
import type { ShiftData, StaffType } from "@/src/domains/shift/types";
import { selectedDateAtom, shiftConfigAtom, shiftsAtom, viewModeAtom } from "../../stores";

type DateInfo = {
  iso: string;
  label: string;
  wk: string;
  inRange: boolean;
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

const shiftAssigned = (shift: ShiftData): [string, string] | null => {
  if (shift.positions.length === 0) return null;
  const sorted = [...shift.positions].sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
  return [sorted[0].start, sorted[sorted.length - 1].end];
};

export const SPOverviewView = () => {
  const config = useAtomValue(shiftConfigAtom);
  const shifts = useAtomValue(shiftsAtom);
  const setSelectedDate = useSetAtom(selectedDateAtom);
  const setViewMode = useSetAtom(viewModeAtom);
  const { dates, holidays, staffs, isReadOnly } = config;

  const weeks = useMemo(() => buildWeeks(dates), [dates]);

  const initialOpen = useMemo(() => {
    const o: Record<number, boolean> = {};
    for (let i = 0; i < weeks.length; i++) o[i] = true;
    return o;
  }, [weeks.length]);
  const [open, setOpen] = useState(initialOpen);

  const lookup = useMemo(() => {
    const map = new Map<string, [string, string]>();
    for (const s of shifts) {
      const asn = shiftAssigned(s);
      if (asn) map.set(`${s.staffId}-${s.date}`, asn);
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
        {weeks.map((wkDates, wi) => {
          if (wkDates.length === 0) return null;
          const isOpen = !!open[wi];
          return (
            <Box
              key={wi}
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
                onClick={() => setOpen({ ...open, [wi]: !isOpen })}
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
                  {formatWeekLabel(wkDates)}
                </Box>
              </Flex>

              {isOpen && (
                <Box>
                  {wkDates.map((d, i) => {
                    const isClosed = d.inRange && holidays.includes(d.iso);
                    const working = d.inRange && !isClosed ? staffs.filter((s) => lookup.has(`${s.id}-${d.iso}`)) : [];
                    const canOpenDaily = !isReadOnly && d.inRange;
                    return (
                      <Flex
                        key={d.iso}
                        gap={3}
                        px={3}
                        py={3}
                        borderTopWidth={i > 0 ? "1px" : "0"}
                        borderColor="gray.100"
                        bg={isClosed || !d.inRange ? "gray.50" : "white"}
                        cursor={canOpenDaily ? "pointer" : "default"}
                        _active={canOpenDaily ? { bg: "gray.50" } : undefined}
                        onClick={canOpenDaily ? () => handleDateTap(d.iso) : undefined}
                      >
                        <Box w="44px" flexShrink={0}>
                          <Box
                            textStyle="numeric"
                            fontWeight={700}
                            color={d.inRange ? "gray.800" : "gray.400"}
                            lineHeight="1.1"
                            style={{ fontVariantNumeric: "tabular-nums" }}
                          >
                            {d.label}
                          </Box>
                          <Box
                            textStyle="2xs"
                            fontWeight={700}
                            mt="2px"
                            style={{ color: d.inRange ? dayColor(d.iso) : "#a1a1aa" }}
                          >
                            {d.wk}
                          </Box>
                          {isClosed && (
                            <Box textStyle="2xs" fontWeight={700} mt="2px" color="gray.500">
                              定休日
                            </Box>
                          )}
                        </Box>
                        <Box flex={1} minW={0}>
                          {!d.inRange ? (
                            <Box textStyle="caption" color="gray.400" fontWeight={500}>
                              期間外
                            </Box>
                          ) : isClosed ? (
                            <Box textStyle="caption" color="gray.500" fontWeight={700}>
                              定休日
                            </Box>
                          ) : working.length > 0 ? (
                            <DayStaffList staffs={working} iso={d.iso} lookup={lookup} />
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

const DayStaffList = ({
  staffs,
  iso,
  lookup,
}: {
  staffs: StaffType[];
  iso: string;
  lookup: Map<string, [string, string]>;
}) => (
  <Stack gap="5px">
    {staffs.map((s) => {
      const asn = lookup.get(`${s.id}-${iso}`);
      if (!asn) return null;
      return (
        <Flex key={s.id} align="center" gap={2} textStyle="tableDense">
          <Box color="gray.800" fontWeight={600} flex={1} minW={0}>
            {s.name}
          </Box>
          <Box color="teal.700" fontWeight={600} fontVariantNumeric="tabular-nums">
            {formatShiftClockTime(asn[0])}–{formatShiftClockTime(asn[1])}
          </Box>
        </Flex>
      );
    })}
  </Stack>
);
