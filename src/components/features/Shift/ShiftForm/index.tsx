import { Box, Flex } from "@chakra-ui/react";
import { Provider, useAtom, useAtomValue } from "jotai";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef } from "react";
import { ConfirmButton, ExportButton, SaveButton, UnsubmittedStrip, ViewTabs } from "./components";
import { useShiftFormInit } from "./hooks/useShiftFormInit";
import { DailyView } from "./pc/DailyView";
import { OverviewView } from "./pc/OverviewView";
import { SPDailyView } from "./sp/DailyView";
import { SPOverviewView } from "./sp/OverviewView";
import { shiftsAtom, viewModeAtom } from "./stores";
import type { PositionType, RequiredStaffingData, ShiftData, SortMode, StaffType, TimeRange, ViewMode } from "./types";

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
  initialSortMode?: SortMode;
  onShiftsChange?: (shifts: ShiftData[]) => void;
  onSaveDraft?: () => void;
  onConfirm?: () => void;
  isConfirmed?: boolean;
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
  initialSortMode,
  onShiftsChange,
  onSaveDraft,
  onConfirm,
  isConfirmed = false,
}: ShiftFormProps) => {
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

  const shifts = useAtomValue(shiftsAtom);
  const onShiftsChangeRef = useRef(onShiftsChange);
  onShiftsChangeRef.current = onShiftsChange;

  useEffect(() => {
    onShiftsChangeRef.current?.(shifts);
  }, [shifts]);

  const [viewMode, setViewMode] = useAtom(viewModeAtom);
  const unsubmittedNames = useMemo(() => staffs.filter((s) => !s.isSubmitted).map((s) => s.name), [staffs]);

  return (
    <>
      {/* PC */}
      <Box
        display={{ base: "none", lg: "flex" }}
        flexDirection="column"
        h="100%"
        minH={0}
        overflow="hidden"
        bg="gray.50"
      >
        <Shell
          viewMode={viewMode}
          setViewMode={(v) => setViewMode(v)}
          compact={false}
          isReadOnly={isReadOnly}
          isConfirmed={isConfirmed}
          onSaveDraft={onSaveDraft}
          onConfirm={onConfirm}
          unsubmittedNames={unsubmittedNames}
        >
          <Box display={viewMode === "daily" ? "flex" : "none"} flexDirection="column" flex={1} minH={0}>
            <DailyView />
          </Box>
          <Box display={viewMode === "overview" ? "block" : "none"} flex={1} minH={0} overflow="auto">
            <OverviewView />
          </Box>
        </Shell>
      </Box>
      {/* SP */}
      <Box
        display={{ base: "flex", lg: "none" }}
        flexDirection="column"
        h="100%"
        minH={0}
        overflow="hidden"
        bg="gray.50"
      >
        <Shell
          viewMode={viewMode}
          setViewMode={(v) => setViewMode(v)}
          compact={true}
          isReadOnly={isReadOnly}
          isConfirmed={isConfirmed}
          onSaveDraft={onSaveDraft}
          onConfirm={onConfirm}
          unsubmittedNames={unsubmittedNames}
        >
          <Box display={viewMode === "daily" ? "block" : "none"} flex={1} overflow="auto">
            <SPDailyView />
          </Box>
          <Box display={viewMode === "overview" ? "block" : "none"} flex={1} minH={0} overflow="auto">
            <SPOverviewView />
          </Box>
        </Shell>
      </Box>
    </>
  );
};

type ShellProps = {
  viewMode: ViewMode;
  setViewMode: (v: ViewMode) => void;
  compact: boolean;
  isReadOnly: boolean;
  isConfirmed: boolean;
  onSaveDraft?: () => void;
  onConfirm?: () => void;
  unsubmittedNames: string[];
  children: ReactNode;
};

const Shell = ({
  viewMode,
  setViewMode,
  compact,
  isReadOnly,
  isConfirmed,
  onSaveDraft,
  onConfirm,
  unsubmittedNames,
  children,
}: ShellProps) => (
  <Flex direction="column" h="100%" minH={0}>
    <Flex
      px={compact ? 3 : 5}
      bg="white"
      borderBottomWidth="1px"
      borderColor="gray.200"
      align="center"
      gap={compact ? 2 : 3}
      flexShrink={0}
    >
      <ViewTabs value={viewMode} onChange={setViewMode} />
      {!isReadOnly && (
        <Flex ml="auto" gap={2} align="center" py={2} flexShrink={0}>
          <SaveButton compact={compact} onClick={onSaveDraft} />
          <ConfirmButton compact={compact} isConfirmed={isConfirmed} onClick={onConfirm} />
          <ExportButton compact={compact} />
        </Flex>
      )}
    </Flex>

    <Flex flex={1} minH={0} direction="column">
      {children}
    </Flex>
    {!isReadOnly && unsubmittedNames.length > 0 && <UnsubmittedStrip names={unsubmittedNames} />}
  </Flex>
);

export const ShiftForm = (props: ShiftFormProps) => (
  <Provider>
    <ShiftFormInner {...props} />
  </Provider>
);
