import { Box, Flex, SegmentGroup } from "@chakra-ui/react";
import { useCallback, useMemo, useState } from "react";
import { ShiftOverview } from "../ShiftOverview";
import type { RequiredStaffingData } from "../ShiftOverview/types";
import { ShiftTableTest } from "../ShiftTableTest";
import { useKeyboardShortcuts } from "../ShiftTableTest/hooks/useKeyboardShortcuts";
import { useUndoRedo } from "../ShiftTableTest/hooks/useUndoRedo";
import type { ShiftData, SortMode } from "../ShiftTableTest/types";
import { sortStaffs } from "../ShiftTableTest/utils/sortStaffs";
import type { ShiftViewSwitcherBaseProps } from "./types";

type ViewMode = "daily" | "overview";

type ShiftViewSwitcherProps = ShiftViewSwitcherBaseProps & {
  allShifts?: ShiftData[];
  requiredStaffing?: RequiredStaffingData[];
};

const VIEW_OPTIONS = [
  { value: "daily", label: "日毎ビュー" },
  { value: "overview", label: "俯瞰ビュー" },
];

export const ShiftViewSwitcher = ({
  shopId,
  staffs,
  positions,
  initialShifts,
  dates,
  timeRange,
  holidays,
  allShifts,
  requiredStaffing,
}: ShiftViewSwitcherProps) => {
  // === ビューモード ===
  const [viewMode, setViewMode] = useState<ViewMode>("daily");

  // === 共有状態 ===
  const { state: shifts, set: setShifts, undo, redo, canUndo, canRedo } = useUndoRedo(initialShifts);
  const [selectedDate, setSelectedDate] = useState(dates[0] ?? "");

  // === 統一ソート状態（両ビュー共通） ===
  const [sortMode, setSortMode] = useState<SortMode>("default");

  const sortedStaffs = useMemo(
    () => sortStaffs({ staffs, shifts, selectedDate, sortMode }),
    [sortMode, staffs, shifts, selectedDate],
  );

  // === キーボードショートカット（日毎ビュー時のみ有効） ===
  const undoHandler = useMemo(() => (viewMode === "daily" ? undo : () => {}), [viewMode, undo]);
  const redoHandler = useMemo(() => (viewMode === "daily" ? redo : () => {}), [viewMode, redo]);

  useKeyboardShortcuts({
    onUndo: undoHandler,
    onRedo: redoHandler,
  });

  // === 俯瞰ビュー → 日毎ビュー遷移 ===
  const handleOverviewDateClick = useCallback((date: string) => {
    setSelectedDate(date);
    setViewMode("daily");
  }, []);

  return (
    <Flex direction="column" maxHeight={{ base: "calc(100dvh - 96px)", lg: "calc(100dvh - 64px + 200px)" }} p={4}>
      {/* ビュー切替 */}
      <Box mb={4} flexShrink={0}>
        <SegmentGroup.Root size="sm" value={viewMode} onValueChange={(e) => setViewMode(e.value as ViewMode)}>
          <SegmentGroup.Indicator />
          <SegmentGroup.Items items={VIEW_OPTIONS} cursor="pointer" />
        </SegmentGroup.Root>
      </Box>

      {/* 日毎ビュー（display:none で常時マウント、UI状態保持） */}
      <Box display={viewMode === "daily" ? "flex" : "none"} flexDirection="column" flex={1} minHeight={0}>
        <ShiftTableTest
          shopId={shopId}
          staffs={sortedStaffs}
          positions={positions}
          shifts={shifts}
          onShiftsChange={setShifts}
          dates={dates}
          timeRange={timeRange}
          selectedDate={selectedDate}
          onDateChange={setSelectedDate}
          onUndo={undo}
          onRedo={redo}
          canUndo={canUndo}
          canRedo={canRedo}
          sortMode={sortMode}
          onSortModeChange={setSortMode}
        />
      </Box>

      {/* 俯瞰ビュー（display:none で常時マウント） */}
      <Box display={viewMode === "overview" ? "block" : "none"} flex={1} minHeight={0} overflow="auto">
        <ShiftOverview
          shopId={shopId}
          dates={dates}
          staffs={sortedStaffs}
          shifts={shifts}
          allShifts={allShifts}
          holidays={holidays}
          onDateClick={handleOverviewDateClick}
          requiredStaffing={requiredStaffing}
          sortMode={sortMode}
          onSortModeChange={setSortMode}
        />
      </Box>
    </Flex>
  );
};
