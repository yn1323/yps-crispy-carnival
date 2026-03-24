import { Box, Flex, SegmentGroup } from "@chakra-ui/react";
import { Provider, useAtom, useAtomValue } from "jotai";
import { useEffect, useRef } from "react";
import { useShiftFormInit } from "./hooks/useShiftFormInit";
import { DailyView } from "./pc/DailyView";
import { PositionToolbar } from "./pc/DailyView/PositionToolbar";
import { OverviewView } from "./pc/OverviewView";
import { SPDailyView } from "./sp/DailyView";
import { SPOverviewView } from "./sp/OverviewView";
import { selectedPositionIdAtom, shiftConfigAtom, shiftsAtom, viewModeAtom } from "./stores";
import type { PositionType, RequiredStaffingData, ShiftData, SortMode, StaffType, TimeRange, ViewMode } from "./types";

const VIEW_OPTIONS = [
  { value: "daily", label: "日別" },
  { value: "overview", label: "一覧" },
];

type ShiftFormProps = {
  shopId: string;
  staffs: StaffType[];
  positions: PositionType[];
  initialShifts: ShiftData[];
  dates: string[];
  timeRange: TimeRange;
  holidays?: string[];
  isReadOnly?: boolean;
  currentStaffId?: string;
  allShifts?: ShiftData[];
  requiredStaffing?: RequiredStaffingData[];
  initialViewMode?: ViewMode;
  hideViewSwitcher?: boolean;
  initialSortMode?: SortMode;
  onShiftsChange?: (shifts: ShiftData[]) => void;
};

const ShiftFormInner = ({
  shopId,
  staffs,
  positions,
  initialShifts,
  dates,
  timeRange,
  holidays = [],
  isReadOnly = false,
  currentStaffId,
  allShifts,
  requiredStaffing,
  initialViewMode,
  hideViewSwitcher = false,
  initialSortMode,
  onShiftsChange,
}: ShiftFormProps) => {
  // props → atoms 初期化
  useShiftFormInit({
    shopId,
    staffs,
    positions,
    initialShifts,
    dates,
    timeRange,
    holidays,
    isReadOnly,
    currentStaffId,
    allShifts,
    requiredStaffing,
    initialViewMode,
    initialSortMode,
  });

  // シフトデータの変更を親に通知
  const shifts = useAtomValue(shiftsAtom);
  const onShiftsChangeRef = useRef(onShiftsChange);
  onShiftsChangeRef.current = onShiftsChange;

  useEffect(() => {
    onShiftsChangeRef.current?.(shifts);
  }, [shifts]);

  const [viewMode, setViewMode] = useAtom(viewModeAtom);
  const config = useAtomValue(shiftConfigAtom);
  const [selectedPositionId, setSelectedPositionId] = useAtom(selectedPositionIdAtom);

  const showViewSwitcher = !hideViewSwitcher;
  const showPositionButtons = !config.isReadOnly && viewMode === "daily";
  const showToolbar = showViewSwitcher || showPositionButtons;

  return (
    <Flex direction="column" maxHeight={{ base: "calc(100dvh - 96px)", lg: "calc(100dvh - 64px + 200px)" }}>
      {/* SP ヘッダー: SegmentGroup */}
      {!hideViewSwitcher && (
        <Box display={{ base: "block", lg: "none" }}>
          <Flex align="center" justify="flex-end" px={3} py={2} flexShrink={0}>
            <SegmentGroup.Root size="sm" value={viewMode} onValueChange={(e) => setViewMode(e.value as ViewMode)}>
              <SegmentGroup.Indicator />
              <SegmentGroup.Items items={VIEW_OPTIONS} cursor="pointer" />
            </SegmentGroup.Root>
          </Flex>
        </Box>
      )}

      {/* PC ツールバー: ビュー切替 + ポジション */}
      {showToolbar && (
        <Box display={{ base: "none", lg: "block" }} mb={4} flexShrink={0}>
          <Flex
            bg="white"
            border="1px solid"
            borderColor="gray.200"
            borderRadius="lg"
            py={3}
            px={4}
            align="center"
            gap={4}
            height="60px"
          >
            {showViewSwitcher && (
              <SegmentGroup.Root size="sm" value={viewMode} onValueChange={(e) => setViewMode(e.value as ViewMode)}>
                <SegmentGroup.Indicator />
                <SegmentGroup.Items items={VIEW_OPTIONS} cursor="pointer" />
              </SegmentGroup.Root>
            )}
            {showPositionButtons && (
              <PositionToolbar
                positions={config.positions}
                selectedPositionId={selectedPositionId}
                onPositionSelect={setSelectedPositionId}
              />
            )}
          </Flex>
        </Box>
      )}

      {/* 日別ビュー（display:none で常時マウント、UI状態保持） */}
      <Box display={viewMode === "daily" ? "flex" : "none"} flexDirection="column" flex={1} minHeight={0}>
        {/* PC */}
        <Box display={{ base: "none", lg: "flex" }} flexDirection="column" flex={1} minHeight={0}>
          <DailyView />
        </Box>
        {/* SP */}
        <Box display={{ base: "block", lg: "none" }} flex={1} overflow="auto">
          <SPDailyView />
        </Box>
      </Box>

      {/* 一覧ビュー（display:none で常時マウント） */}
      <Box display={viewMode === "overview" ? "block" : "none"} flex={1} minHeight={0} overflow="auto">
        {/* PC */}
        <Box display={{ base: "none", lg: "block" }}>
          <OverviewView />
        </Box>
        {/* SP */}
        <Box display={{ base: "block", lg: "none" }}>
          <SPOverviewView />
        </Box>
      </Box>
    </Flex>
  );
};

export const ShiftForm = (props: ShiftFormProps) => (
  <Provider>
    <ShiftFormInner {...props} />
  </Provider>
);
