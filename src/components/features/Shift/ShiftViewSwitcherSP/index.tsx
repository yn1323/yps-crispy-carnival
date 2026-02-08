import { Box, Flex, HStack, IconButton, SegmentGroup } from "@chakra-ui/react";
import { useCallback, useMemo, useState } from "react";
import { LuRedo2, LuUndo2 } from "react-icons/lu";
import { ShiftDailyCardSP } from "../ShiftDailyCardSP";
import { ShiftOverviewCardSP } from "../ShiftOverviewCardSP";
import { useUndoRedo } from "../ShiftTableTest/hooks/useUndoRedo";
import type { SortMode } from "../ShiftTableTest/types";
import { sortStaffs } from "../ShiftTableTest/utils/sortStaffs";
import type { ShiftViewSwitcherBaseProps } from "../ShiftViewSwitcher/types";

type ViewMode = "daily" | "overview";

type ShiftViewSwitcherSPProps = ShiftViewSwitcherBaseProps;

const VIEW_OPTIONS = [
  { value: "daily", label: "日毎" },
  { value: "overview", label: "俯瞰" },
];

export const ShiftViewSwitcherSP = ({
  shopId,
  staffs,
  positions,
  initialShifts,
  dates,
  timeRange,
  holidays,
}: ShiftViewSwitcherSPProps) => {
  const [viewMode, setViewMode] = useState<ViewMode>("daily");
  const { state: shifts, set: setShifts, undo, redo, canUndo, canRedo } = useUndoRedo(initialShifts);
  const [selectedDate, setSelectedDate] = useState(dates[0] ?? "");
  const [sortMode, setSortMode] = useState<SortMode>("default");

  const sortedStaffs = useMemo(
    () => sortStaffs({ staffs, shifts, selectedDate, sortMode }),
    [sortMode, staffs, shifts, selectedDate],
  );

  const handleOverviewDateClick = useCallback((date: string) => {
    setSelectedDate(date);
    setViewMode("daily");
  }, []);

  return (
    <Flex direction="column" maxHeight="calc(100dvh - 96px)">
      {/* ヘッダー: Undo/Redo + ビュー切替 */}
      <Flex align="center" justify="space-between" px={3} py={2} flexShrink={0}>
        <HStack gap={1}>
          <IconButton aria-label="元に戻す" size="sm" variant="ghost" onClick={undo} disabled={!canUndo}>
            <LuUndo2 />
          </IconButton>
          <IconButton aria-label="やり直し" size="sm" variant="ghost" onClick={redo} disabled={!canRedo}>
            <LuRedo2 />
          </IconButton>
        </HStack>
        <SegmentGroup.Root size="sm" value={viewMode} onValueChange={(e) => setViewMode(e.value as ViewMode)}>
          <SegmentGroup.Indicator />
          <SegmentGroup.Items items={VIEW_OPTIONS} cursor="pointer" />
        </SegmentGroup.Root>
      </Flex>

      {/* 日毎ビュー */}
      <Box display={viewMode === "daily" ? "block" : "none"} flex={1} overflow="auto">
        <ShiftDailyCardSP
          shopId={shopId}
          staffs={sortedStaffs}
          positions={positions}
          shifts={shifts}
          onShiftsChange={setShifts}
          dates={dates}
          timeRange={timeRange}
          selectedDate={selectedDate}
          onDateChange={setSelectedDate}
          sortMode={sortMode}
          onSortModeChange={setSortMode}
        />
      </Box>

      {/* 俯瞰ビュー */}
      <Box display={viewMode === "overview" ? "block" : "none"} flex={1} overflow="auto">
        <ShiftOverviewCardSP
          shopId={shopId}
          dates={dates}
          staffs={sortedStaffs}
          shifts={shifts}
          holidays={holidays}
          onDateClick={handleOverviewDateClick}
          sortMode={sortMode}
          onSortModeChange={setSortMode}
          positions={positions}
          timeRange={timeRange}
          onShiftsChange={setShifts}
        />
      </Box>
    </Flex>
  );
};
