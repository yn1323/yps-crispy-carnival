import { Box, Flex, Stack } from "@chakra-ui/react";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useMemo, useState } from "react";
import { LuChevronDown, LuChevronRight } from "react-icons/lu";
import { IssueCountBadge } from "../../components";
import { BreakMark, PositionMark, StaffMeta } from "../../detailParts";
import {
  detailModeAtom,
  selectDateWithDailyStaffOrderAtom,
  shiftConfigAtom,
  shiftsAtom,
  usesPositionColorsAtom,
  viewModeAtom,
  warningCountByDateAtom,
} from "../../stores";
import { SHIFT_WEEKDAY_TONE_COLORS } from "../../weekdayPresentation";
import { StaffTotalsCard } from "../StaffTotalsCard";
import { buildOverviewViewModel, type OverviewDayRowViewModel, type OverviewStaffRowViewModel } from "./script";

export const SPOverviewView = () => {
  const config = useAtomValue(shiftConfigAtom);
  const shifts = useAtomValue(shiftsAtom);
  const warningCounts = useAtomValue(warningCountByDateAtom);
  const selectDate = useSetAtom(selectDateWithDailyStaffOrderAtom);
  const setViewMode = useSetAtom(viewModeAtom);
  const { dates, holidays, staffs, isReadOnly } = config;
  const viewModel = useMemo(
    () =>
      buildOverviewViewModel({
        dates,
        holidays,
        staffs,
        shifts,
        warningCounts,
        isReadOnly,
      }),
    [dates, holidays, staffs, shifts, warningCounts, isReadOnly],
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
        <StaffTotalsCard />
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
                bg="transparent"
                transitionProperty="colors"
                transitionDuration="faster"
                _active={{ bg: "gray.100", transitionDuration: "0ms" }}
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

const DayRow = ({ row, onDateTap }: { row: OverviewDayRowViewModel; onDateTap: () => void }) => (
  <Flex
    gap={3}
    px={3}
    py={3}
    borderTopWidth={row.hasTopBorder ? "1px" : "0"}
    borderColor="gray.100"
    bg={row.surfaceTone === "muted" ? "gray.50" : "white"}
    cursor={row.canOpenDaily ? "pointer" : "default"}
    transitionProperty="colors"
    transitionDuration="faster"
    _active={row.canOpenDaily ? { bg: "gray.100", transitionDuration: "0ms" } : undefined}
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
        <Box
          textStyle="2xs"
          fontWeight={700}
          flexShrink={0}
          style={{ color: SHIFT_WEEKDAY_TONE_COLORS[row.weekdayTone] }}
        >
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
        <DayStaffList rows={row.staffRows} />
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

const DayStaffList = ({ rows }: { rows: OverviewStaffRowViewModel[] }) => {
  const detailMode = useAtomValue(detailModeAtom);
  const usesPositionColors = useAtomValue(usesPositionColorsAtom);

  if (!detailMode) {
    return (
      <Stack gap="5px">
        {rows.map((staff) => (
          <Flex key={staff.key} align="center" gap={2} textStyle="tableDense">
            <Box color="gray.800" fontWeight={600} flex={1} minW={0}>
              {staff.name}
            </Box>
            <Box color="teal.700" fontWeight={600} fontVariantNumeric="tabular-nums">
              {staff.assignedTimeLabel}
            </Box>
          </Flex>
        ))}
      </Stack>
    );
  }

  // くわしく表示: 名前の横に熟練度、時刻の左に休憩の印、下の行にポジションを出す。
  return (
    <Stack gap="6px">
      {rows.map((staff) => (
        <Box key={staff.key}>
          <Flex align="center" gap={2} textStyle="tableDense">
            <Flex flex={1} minW={0} align="center" gap="6px">
              <Box color="gray.800" fontWeight={600} minW={0}>
                {staff.name}
              </Box>
              <StaffMeta staff={staff.staff} showTotal={false} />
            </Flex>
            {/* 時刻の右端をそろえるため、休憩の印は時刻の左に置く。 */}
            <BreakMark shift={staff.shift} compact />
            <Box color="teal.700" fontWeight={600} fontVariantNumeric="tabular-nums">
              {staff.assignedTimeLabel}
            </Box>
          </Flex>
          {usesPositionColors && (
            <Flex justify="flex-end" columnGap={2} flexWrap="wrap" color="gray.700">
              {staff.positionMarks.map((mark) => (
                <PositionMark key={mark.key} segment={mark} />
              ))}
            </Flex>
          )}
        </Box>
      ))}
    </Stack>
  );
};
