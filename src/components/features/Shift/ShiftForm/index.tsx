import { Box, Flex, HStack, IconButton, SegmentGroup } from "@chakra-ui/react";
import { Provider, useAtom } from "jotai";
import { LuRedo2, LuUndo2 } from "react-icons/lu";
import { useShiftFormInit } from "./hooks/useShiftFormInit";
import { useUndoRedo } from "./hooks/useUndoRedo";
import { DailyView } from "./pc/DailyView";
import { OverviewView } from "./pc/OverviewView";
import { SPDailyView } from "./sp/DailyView";
import { SPOverviewView } from "./sp/OverviewView";
import { viewModeAtom } from "./stores";
import type { PositionType, RequiredStaffingData, ShiftData, StaffType, TimeRange, ViewMode } from "./types";

const VIEW_OPTIONS = [
  { value: "daily", label: "日毎" },
  { value: "overview", label: "俯瞰" },
];

const VIEW_OPTIONS_PC = [
  { value: "daily", label: "日毎ビュー" },
  { value: "overview", label: "俯瞰ビュー" },
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
  });

  const [viewMode, setViewMode] = useAtom(viewModeAtom);
  const { undo, redo, canUndo, canRedo } = useUndoRedo();

  return (
    <Flex direction="column" maxHeight={{ base: "calc(100dvh - 96px)", lg: "calc(100dvh - 64px + 200px)" }}>
      {/* SP ヘッダー: Undo/Redo + SegmentGroup */}
      <Box display={{ base: "block", lg: "none" }}>
        <Flex align="center" justify={isReadOnly ? "flex-end" : "space-between"} px={3} py={2} flexShrink={0}>
          {!isReadOnly && (
            <HStack gap={1}>
              <IconButton aria-label="元に戻す" size="sm" variant="ghost" onClick={undo} disabled={!canUndo}>
                <LuUndo2 />
              </IconButton>
              <IconButton aria-label="やり直し" size="sm" variant="ghost" onClick={redo} disabled={!canRedo}>
                <LuRedo2 />
              </IconButton>
            </HStack>
          )}
          <SegmentGroup.Root size="sm" value={viewMode} onValueChange={(e) => setViewMode(e.value as ViewMode)}>
            <SegmentGroup.Indicator />
            <SegmentGroup.Items items={VIEW_OPTIONS} cursor="pointer" />
          </SegmentGroup.Root>
        </Flex>
      </Box>

      {/* PC ヘッダー: SegmentGroup */}
      <Box display={{ base: "none", lg: "block" }} mb={4} flexShrink={0} p={4}>
        <SegmentGroup.Root size="sm" value={viewMode} onValueChange={(e) => setViewMode(e.value as ViewMode)}>
          <SegmentGroup.Indicator />
          <SegmentGroup.Items items={VIEW_OPTIONS_PC} cursor="pointer" />
        </SegmentGroup.Root>
      </Box>

      {/* 日毎ビュー（display:none で常時マウント、UI状態保持） */}
      <Box display={viewMode === "daily" ? "flex" : "none"} flexDirection="column" flex={1} minHeight={0}>
        {/* PC */}
        <Box display={{ base: "none", lg: "flex" }} flexDirection="column" flex={1} minHeight={0} px={4}>
          <DailyView undo={undo} redo={redo} canUndo={canUndo} canRedo={canRedo} />
        </Box>
        {/* SP */}
        <Box display={{ base: "block", lg: "none" }} flex={1} overflow="auto">
          <SPDailyView />
        </Box>
      </Box>

      {/* 俯瞰ビュー（display:none で常時マウント） */}
      <Box display={viewMode === "overview" ? "block" : "none"} flex={1} minHeight={0} overflow="auto">
        {/* PC */}
        <Box display={{ base: "none", lg: "block" }} px={4}>
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
