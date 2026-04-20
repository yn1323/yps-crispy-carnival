import { Box, Flex, Stack } from "@chakra-ui/react";
import dayjs from "dayjs";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useMemo, useState } from "react";
import { LuChevronDown, LuChevronRight } from "react-icons/lu";
import { selectedDateAtom, shiftConfigAtom, shiftsAtom, viewModeAtom } from "../../stores";
import type { ShiftData, StaffType } from "../../types";
import { buildWeeklyGrid, getWeekdayLabel, type WeekStart } from "../../utils/dateUtils";
import { timeToMinutes } from "../../utils/timeConversion";

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

const shiftHours = (range: [string, string] | null): number => {
  if (!range) return 0;
  const minutes = timeToMinutes(range[1]) - timeToMinutes(range[0]);
  return minutes / 60;
};

type OverviewViewProps = {
  weekStart?: WeekStart;
};

export const OverviewView = ({ weekStart = "mon" }: OverviewViewProps) => {
  const config = useAtomValue(shiftConfigAtom);
  const shifts = useAtomValue(shiftsAtom);
  const setSelectedDate = useSetAtom(selectedDateAtom);
  const setViewMode = useSetAtom(viewModeAtom);
  const { dates, holidays, isReadOnly, staffs } = config;

  const weeks = useMemo<DateInfo[][]>(
    () => buildWeeklyGrid(dates, weekStart).map((week) => week.map(toDateInfo)),
    [dates, weekStart],
  );

  const [open, setOpen] = useState<Record<number, boolean>>({});

  const lookup = useMemo(() => {
    const map = new Map<string, [string, string]>();
    for (const s of shifts) {
      const asn = shiftAssigned(s);
      if (asn) map.set(`${s.staffId}-${s.date}`, asn);
    }
    return map;
  }, [shifts]);

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
              lookup={lookup}
              holidays={holidays}
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
  lookup: Map<string, [string, string]>;
  holidays: string[];
  isOpen: boolean;
  onToggle: () => void;
  onDateClick: (iso: string) => void;
  isReadOnly: boolean;
};

const WeekCard = ({ wkDates, staffs, lookup, holidays, isOpen, onToggle, onDateClick, isReadOnly }: WeekCardProps) => {
  const inRangeDates = wkDates.filter((d) => d.inRange);
  const rangeLabel =
    inRangeDates.length > 0 ? `${inRangeDates[0].label} – ${inRangeDates[inRangeDates.length - 1].label}` : "";
  return (
    <Box
      bg="white"
      borderRadius="xl"
      borderWidth="1px"
      borderColor={isOpen ? "teal.200" : "gray.200"}
      overflow="hidden"
      boxShadow="0 1px 2px rgba(0,0,0,0.03)"
      transition="all 120ms"
    >
      <Flex
        align="center"
        gap={3}
        px={5}
        py={3}
        bg={isOpen ? "teal.50" : "white"}
        cursor="pointer"
        onClick={onToggle}
        borderBottomWidth={isOpen ? "1px" : "0"}
        borderColor="teal.200"
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
        <Box fontSize="15px" fontWeight={700} color="gray.800" style={{ fontVariantNumeric: "tabular-nums" }}>
          {rangeLabel}
        </Box>
        <Box fontSize="12px" color="gray.500">
          ({inRangeDates.length}日)
        </Box>
      </Flex>

      {isOpen && (
        <WeekTable
          staffs={staffs}
          wkDates={wkDates}
          lookup={lookup}
          holidays={holidays}
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
  lookup: Map<string, [string, string]>;
  holidays: string[];
  onDateClick: (iso: string) => void;
  isReadOnly: boolean;
};

const WeekTable = ({ staffs, wkDates, lookup, holidays, onDateClick, isReadOnly }: WeekTableProps) => (
  <Box>
    <Box as="table" w="100%" style={{ borderCollapse: "collapse", fontSize: 12, tableLayout: "fixed" }}>
      <Box as="colgroup">
        <Box as="col" style={{ width: 200 }} />
        {wkDates.map((d) => (
          <Box as="col" key={d.iso} />
        ))}
        <Box as="col" style={{ width: 72 }} />
      </Box>
      <Box as="thead">
        <Box as="tr" bg="gray.50" borderBottomWidth="1px" borderColor="gray.200">
          <Box
            as="th"
            style={{
              padding: "10px 18px",
              textAlign: "left",
              fontWeight: 600,
              color: "#52525b",
              fontSize: 11,
            }}
          >
            スタッフ
          </Box>
          {wkDates.map((d) => {
            const isClickable = !isReadOnly && d.inRange;
            return (
              <Box
                as="th"
                key={d.iso}
                onClick={isClickable ? () => onDateClick(d.iso) : undefined}
                style={{
                  padding: "10px 4px",
                  fontWeight: 600,
                  textAlign: "center",
                  cursor: isClickable ? "pointer" : "default",
                  opacity: d.inRange ? 1 : 0.35,
                }}
              >
                <Box fontSize="12px" color="gray.700" fontWeight={600} style={{ fontVariantNumeric: "tabular-nums" }}>
                  {d.label}
                </Box>
                <Box fontSize="10px" fontWeight={600} mt="2px" style={{ color: dayColor(d.iso, holidays) }}>
                  {d.wk}
                </Box>
              </Box>
            );
          })}
          <Box
            as="th"
            style={{
              padding: "10px 18px",
              textAlign: "right",
              fontWeight: 600,
              color: "#52525b",
              fontSize: 11,
            }}
          >
            計
          </Box>
        </Box>
      </Box>
      <Box as="tbody">
        {staffs.map((s) => {
          let total = 0;
          const isUnsub = !s.isSubmitted;
          return (
            <Box as="tr" key={s.id} borderBottomWidth="1px" borderColor="gray.100">
              <Box as="td" style={{ padding: "10px 18px" }}>
                <Flex align="center" gap="10px">
                  <Box fontSize="13px" fontWeight={600} color={isUnsub ? "gray.500" : "gray.800"}>
                    {s.name}
                  </Box>
                  {isUnsub && (
                    <Box fontSize="10px" fontWeight={600} flexShrink={0} style={{ color: "#b45309" }}>
                      未提出
                    </Box>
                  )}
                </Flex>
              </Box>
              {wkDates.map((d) => {
                const asn = d.inRange ? (lookup.get(`${s.id}-${d.iso}`) ?? null) : null;
                if (asn) total += shiftHours(asn);
                return (
                  <Box as="td" key={d.iso} style={{ padding: "8px 4px", textAlign: "center", verticalAlign: "middle" }}>
                    {asn ? (
                      <Box
                        as="span"
                        fontSize="12px"
                        fontWeight={600}
                        color="teal.700"
                        style={{ fontVariantNumeric: "tabular-nums" }}
                      >
                        {asn[0]}–{asn[1]}
                      </Box>
                    ) : (
                      <Box as="span" color={d.inRange ? "gray.300" : "gray.200"} fontSize="12px">
                        —
                      </Box>
                    )}
                  </Box>
                );
              })}
              <Box
                as="td"
                style={{
                  padding: "10px 18px",
                  textAlign: "right",
                  fontWeight: 700,
                  color: total ? "#27272a" : "#d4d4d8",
                  fontVariantNumeric: "tabular-nums",
                  fontSize: 13,
                }}
              >
                {total ? `${total}h` : "—"}
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  </Box>
);
