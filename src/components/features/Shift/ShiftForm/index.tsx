import { Box, Flex, SegmentGroup } from "@chakra-ui/react";
import { Provider, useAtom, useAtomValue, useSetAtom } from "jotai";
import { useEffect, useRef } from "react";
import { useShiftFormInit } from "./hooks/useShiftFormInit";
import { DailyView } from "./pc/DailyView";
import { OverviewView } from "./pc/OverviewView";
import { SPDailyView } from "./sp/DailyView";
import { SPOverviewView } from "./sp/OverviewView";
import { shiftsAtom, viewModeAtom, viewModeCallbackAtom } from "./stores";
import type { PositionType, RequiredStaffingData, ShiftData, SortMode, StaffType, TimeRange, ViewMode } from "./types";
import { VIEW_OPTIONS } from "./types";

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
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
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
  viewMode: externalViewMode,
  onViewModeChange,
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

  const [internalViewMode, setInternalViewMode] = useAtom(viewModeAtom);

  // Write-through callback: atomへの書き込み時に親へ自動通知（外部sync中は抑制）
  const setViewModeCallback = useSetAtom(viewModeCallbackAtom);
  const onViewModeChangeRef = useRef(onViewModeChange);
  onViewModeChangeRef.current = onViewModeChange;
  const isSyncingRef = useRef(false);

  useEffect(() => {
    setViewModeCallback(() => (mode: ViewMode) => {
      if (!isSyncingRef.current) {
        onViewModeChangeRef.current?.(mode);
      }
    });
    return () => setViewModeCallback(undefined);
  }, [setViewModeCallback]);

  // 外部 → 内部: 親のviewModeをatomに反映（コールバック抑制で不要な親通知を防止）
  useEffect(() => {
    if (externalViewMode !== undefined) {
      isSyncingRef.current = true;
      setInternalViewMode(externalViewMode);
      isSyncingRef.current = false;
    }
  }, [externalViewMode, setInternalViewMode]);

  const viewMode = externalViewMode ?? internalViewMode;

  return (
    <Flex direction="column">
      {/* SP ヘッダー: SegmentGroup */}
      {!hideViewSwitcher && (
        <Box display={{ base: "block", lg: "none" }}>
          <Flex align="center" justify="flex-end" px={3} py={2} flexShrink={0}>
            <SegmentGroup.Root
              size="sm"
              value={viewMode}
              onValueChange={(e) => setInternalViewMode(e.value as ViewMode)}
            >
              <SegmentGroup.Indicator />
              <SegmentGroup.Items items={VIEW_OPTIONS} cursor="pointer" />
            </SegmentGroup.Root>
          </Flex>
        </Box>
      )}

      {/* PC ツールバー: ビュー切替 */}
      {!hideViewSwitcher && (
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
            <SegmentGroup.Root
              size="sm"
              value={viewMode}
              onValueChange={(e) => setInternalViewMode(e.value as ViewMode)}
            >
              <SegmentGroup.Indicator />
              <SegmentGroup.Items items={VIEW_OPTIONS} cursor="pointer" />
            </SegmentGroup.Root>
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
