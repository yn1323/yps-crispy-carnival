import { Box, Flex, Stack, Text } from "@chakra-ui/react";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useMemo, useState } from "react";
import { LuChevronDown, LuChevronRight } from "react-icons/lu";
import type { WeekStart } from "@/src/domains/shift/date";
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
import {
  buildShiftTypeOverviewViewModel,
  type ShiftTypeOverviewCellViewModel,
  type ShiftTypeOverviewDateViewModel,
  type ShiftTypeOverviewRowViewModel,
  type ShiftTypeOverviewWeekViewModel,
} from "./script";

type ShiftTypeOverviewViewProps = {
  weekStart?: WeekStart;
};

export const ShiftTypeOverviewView = ({ weekStart = "mon" }: ShiftTypeOverviewViewProps) => {
  const config = useAtomValue(shiftConfigAtom);
  const shifts = useAtomValue(shiftsAtom);
  const warningCounts = useAtomValue(warningCountByDateAtom);
  const selectDate = useSetAtom(selectDateWithDailyStaffOrderAtom);
  const setViewMode = useSetAtom(viewModeAtom);
  const detailMode = useAtomValue(detailModeAtom);
  const usesPositionColors = useAtomValue(usesPositionColorsAtom);
  const { dates, holidays, isReadOnly, staffs, submissionPattern } = config;
  const viewModel = useMemo(
    () =>
      buildShiftTypeOverviewViewModel({
        dates,
        weekStart,
        holidays,
        isReadOnly,
        staffs,
        shifts,
        submissionPattern,
        warningCounts,
      }),
    [dates, holidays, isReadOnly, shifts, staffs, submissionPattern, warningCounts, weekStart],
  );
  const [open, setOpen] = useState<Record<number, boolean>>({});

  const handleDateClick = useCallback(
    (iso: string) => {
      if (isReadOnly) return;
      selectDate(iso);
      setViewMode("daily");
    },
    [isReadOnly, selectDate, setViewMode],
  );

  return (
    <Box bg="gray.50" h="100%" overflow="auto" px={5} py={5}>
      <Stack gap={3}>
        {viewModel.weeks.map((week) => {
          const isOpen = open[week.index] !== false;
          return (
            <WeekCard
              key={week.key}
              week={week}
              isOpen={isOpen}
              onToggle={() => setOpen({ ...open, [week.index]: !isOpen })}
              onDateClick={handleDateClick}
              detailMode={detailMode}
              usesPositionColors={usesPositionColors}
            />
          );
        })}
      </Stack>
    </Box>
  );
};

type WeekCardProps = WeekTableProps & {
  isOpen: boolean;
  onToggle: () => void;
};

const WeekCard = ({ week, isOpen, onToggle, onDateClick, detailMode, usesPositionColors }: WeekCardProps) => (
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
      bg="transparent"
      transitionProperty="colors"
      transitionDuration="faster"
      _active={{ bg: "gray.100", transitionDuration: "0ms" }}
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
        {week.rangeLabel}
      </Box>
    </Flex>

    {isOpen && (
      <WeekTable
        week={week}
        onDateClick={onDateClick}
        detailMode={detailMode}
        usesPositionColors={usesPositionColors}
      />
    )}
  </Box>
);

type WeekTableProps = {
  week: ShiftTypeOverviewWeekViewModel;
  onDateClick: (iso: string) => void;
  /** くわしく表示かどうか。falseのときは従来の表と同じ内容を出す。 */
  detailMode: boolean;
  /** ポジションを塗り分ける表示（くわしく表示で、ポジションが2つ以上）かどうか。 */
  usesPositionColors: boolean;
};

const WeekTable = ({ week, onDateClick, detailMode, usesPositionColors }: WeekTableProps) => (
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
        {week.dates.map((date) => (
          <Box as="col" key={date.key} />
        ))}
        {detailMode && <Box as="col" style={{ width: 80 }} />}
      </Box>
      <Box as="thead">
        <Box as="tr" bg="gray.50" borderBottomWidth="1px" borderColor="gray.200">
          <Box as="th" px={4} py={3} textAlign="left" color="gray.600" fontWeight={600}>
            スタッフ
          </Box>
          {week.dates.map((date) => (
            <DateHeaderCell key={date.key} date={date} onDateClick={onDateClick} />
          ))}
          {/* くわしく表示では、時間指定の一覧と同じく、週の合計を右端に出す。 */}
          {detailMode && (
            <Box as="th" px={4} py={3} textAlign="right" color="gray.600" fontWeight={600}>
              計
            </Box>
          )}
        </Box>
      </Box>
      <Box as="tbody">
        {week.rows.map((row) => (
          <ShiftTypeOverviewRow
            key={row.key}
            row={row}
            detailMode={detailMode}
            usesPositionColors={usesPositionColors}
          />
        ))}
      </Box>
    </Box>
  </Box>
);

const DateHeaderCell = ({
  date,
  onDateClick,
}: {
  date: ShiftTypeOverviewDateViewModel;
  onDateClick: (iso: string) => void;
}) => (
  <Box
    as="th"
    onClick={date.isClickable ? () => onDateClick(date.iso) : undefined}
    px={2}
    py={3}
    textAlign="center"
    cursor={date.isClickable ? "pointer" : "default"}
    opacity={date.opacity}
    bg={date.isClosed ? "gray.100" : undefined}
    transitionProperty="colors"
    transitionDuration="faster"
    _active={date.isClickable ? { bg: date.isClosed ? "gray.200" : "gray.100", transitionDuration: "0ms" } : undefined}
  >
    <Box display="inline-block" position="relative" px={date.warningCount > 0 ? 1 : 0}>
      {date.warningCount > 0 && <IssueCountBadge count={date.warningCount} tone="warning" top="-10px" right="-14px" />}
      <Box textStyle="numeric" color="gray.700" fontWeight={700}>
        {date.label}
      </Box>
    </Box>
    <Box textStyle="2xs" fontWeight={600} mt="2px" style={{ color: date.weekdayColor }}>
      {date.weekdayLabel}
    </Box>
    {date.rangeStatusLabel && (
      <Box textStyle="2xs" fontWeight={700} mt="2px" color="gray.500">
        {date.rangeStatusLabel}
      </Box>
    )}
  </Box>
);

const ShiftTypeOverviewRow = ({
  row,
  detailMode,
  usesPositionColors,
}: {
  row: ShiftTypeOverviewRowViewModel;
  detailMode: boolean;
  usesPositionColors: boolean;
}) => (
  <Box as="tr" borderBottomWidth="1px" borderColor="gray.100">
    <Box as="td" px={4} py={3}>
      {detailMode ? (
        // 合計は右端の「計」の列に週ごとに出すため、名前には熟練度の印だけを添える。
        <Flex align="center" gap={2} minW={0}>
          <Text fontSize="sm" fontWeight={700} color={row.isStaffNameMuted ? "gray.500" : "gray.800"} truncate>
            {row.staffName}
          </Text>
          <StaffMeta staff={row.staff} showTotal={false} />
        </Flex>
      ) : (
        <Text fontSize="sm" fontWeight={700} color={row.isStaffNameMuted ? "gray.500" : "gray.800"} truncate>
          {row.staffName}
        </Text>
      )}
    </Box>
    {row.cells.map((cell) => (
      <ShiftTypeOverviewCell
        key={cell.key}
        cell={cell}
        detailMode={detailMode}
        usesPositionColors={usesPositionColors}
      />
    ))}
    {detailMode && (
      <Box
        as="td"
        px={4}
        py={3}
        textAlign="right"
        textStyle="sm"
        fontWeight={700}
        color={row.hasTotal ? "gray.800" : "gray.300"}
        fontVariantNumeric="tabular-nums"
        whiteSpace="nowrap"
      >
        {row.totalLabel}
      </Box>
    )}
  </Box>
);

const ShiftTypeOverviewCell = ({
  cell,
  detailMode,
  usesPositionColors,
}: {
  cell: ShiftTypeOverviewCellViewModel;
  detailMode: boolean;
  usesPositionColors: boolean;
}) => (
  <Box as="td" px={2} py={2} textAlign="center" bg={cell.isClosed ? "gray.100" : undefined} verticalAlign="middle">
    {cell.content.kind === "closed" ? (
      <Text color="gray.500" textStyle="caption" fontWeight={700}>
        {cell.content.label}
      </Text>
    ) : cell.content.kind === "assignments" && detailMode ? (
      // 勤務パターンの色は残し、その下にポジション、末尾に休憩の印を添える。
      <Flex gap={1} justify="center" align="flex-start" wrap="wrap">
        {cell.content.badges.map((badge) => (
          <Flex key={badge.key} direction="column" align="center" gap="3px" minW={0} maxW="100%">
            <Box px={2} py="2px" borderRadius="full" bg={badge.bg} color={badge.color} fontSize="xs" fontWeight={700}>
              {badge.label}
            </Box>
            {usesPositionColors && badge.position && (
              <Flex maxW="100%" minW={0} color="gray.700">
                <PositionMark segment={badge.position} />
              </Flex>
            )}
          </Flex>
        ))}
        {cell.breakShift && (
          <Flex align="center" h="22px">
            <BreakMark shift={cell.breakShift} compact />
          </Flex>
        )}
      </Flex>
    ) : cell.content.kind === "assignments" ? (
      <Flex gap={1} justify="center" wrap="wrap">
        {cell.content.badges.map((badge) => (
          <Box
            key={badge.key}
            px={2}
            py="2px"
            borderRadius="full"
            bg={badge.bg}
            color={badge.color}
            fontSize="xs"
            fontWeight={700}
          >
            {badge.label}
          </Box>
        ))}
      </Flex>
    ) : (
      <Text
        color={
          cell.content.tone === "unsubmitted"
            ? "orange.600"
            : cell.content.tone === "outOfRange"
              ? "gray.200"
              : "gray.300"
        }
        textStyle="caption"
        fontWeight={cell.content.tone === "unsubmitted" ? 700 : undefined}
      >
        {cell.content.label}
      </Text>
    )}
  </Box>
);
