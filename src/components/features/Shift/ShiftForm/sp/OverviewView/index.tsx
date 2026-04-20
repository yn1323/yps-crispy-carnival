import { Box, Flex, Stack } from "@chakra-ui/react";
import dayjs from "dayjs";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useMemo, useState } from "react";
import { LuChevronDown, LuChevronRight } from "react-icons/lu";
import { selectedDateAtom, shiftConfigAtom, shiftsAtom, viewModeAtom } from "../../stores";
import type { ShiftData, StaffType } from "../../types";
import { getWeekdayLabel } from "../../utils/dateUtils";
import { timeToMinutes } from "../../utils/timeConversion";

type DateInfo = {
  iso: string;
  label: string;
  wk: string;
  weekIdx: number;
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

const dayColor = (iso: string, holidays: string[]): string => {
  const day = dayjs(iso).day();
  if (day === 0 || holidays.includes(iso)) return "#ef4444";
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

  const dateInfos = useMemo(() => buildDateInfos(dates), [dates]);
  const weekCount = Math.max(1, Math.ceil(dateInfos.length / 7));

  const initialOpen = useMemo(() => {
    const o: Record<number, boolean> = {};
    for (let i = 0; i < weekCount; i++) o[i] = true;
    return o;
  }, [weekCount]);
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
        {Array.from({ length: weekCount }).map((_, wi) => {
          const wkDates = dateInfos.filter((d) => d.weekIdx === wi);
          if (wkDates.length === 0) return null;
          const isOpen = !!open[wi];
          return (
            <Box
              key={wi}
              bg="white"
              borderRadius="lg"
              borderWidth="1px"
              borderColor={isOpen ? "teal.300" : "gray.200"}
              overflow="hidden"
              boxShadow={isOpen ? "0 1px 3px rgba(0,0,0,0.04)" : "none"}
            >
              <Flex
                align="center"
                gap={2}
                px={3}
                py={3}
                bg={isOpen ? "teal.50" : "white"}
                cursor="pointer"
                onClick={() => setOpen({ ...open, [wi]: !isOpen })}
                borderBottomWidth={isOpen ? "1px" : "0"}
                borderColor="teal.200"
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
                <Box fontSize="14px" fontWeight={700} color="gray.800" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {wkDates[0].label} – {wkDates[wkDates.length - 1].label}
                </Box>
              </Flex>

              {isOpen && (
                <Box>
                  {wkDates.map((d, i) => {
                    const working = staffs.filter((s) => lookup.has(`${s.id}-${d.iso}`));
                    return (
                      <Flex
                        key={d.iso}
                        gap={3}
                        px={3}
                        py={3}
                        borderTopWidth={i > 0 ? "1px" : "0"}
                        borderColor="gray.100"
                        cursor={isReadOnly ? "default" : "pointer"}
                        _active={isReadOnly ? undefined : { bg: "gray.50" }}
                        onClick={isReadOnly ? undefined : () => handleDateTap(d.iso)}
                      >
                        <Box w="44px" flexShrink={0}>
                          <Box
                            fontSize="14px"
                            fontWeight={700}
                            color="gray.800"
                            lineHeight="1.1"
                            style={{ fontVariantNumeric: "tabular-nums" }}
                          >
                            {d.label}
                          </Box>
                          <Box fontSize="10px" fontWeight={700} mt="2px" style={{ color: dayColor(d.iso, holidays) }}>
                            {d.wk}
                          </Box>
                        </Box>
                        <Box flex={1} minW={0}>
                          {working.length > 0 ? (
                            <DayStaffList staffs={working} iso={d.iso} lookup={lookup} />
                          ) : (
                            <Box fontSize="11px" color="gray.400">
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
        <Flex key={s.id} align="center" gap={2} fontSize="11px">
          <Box color="gray.800" fontWeight={600} flex={1} minW={0}>
            {s.name}
          </Box>
          <Box color="teal.700" fontWeight={600} style={{ fontVariantNumeric: "tabular-nums" }}>
            {asn[0]}–{asn[1]}
          </Box>
        </Flex>
      );
    })}
  </Stack>
);
