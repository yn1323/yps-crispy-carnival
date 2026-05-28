import { Box, Flex, Text } from "@chakra-ui/react";
import { Provider, useAtom, useAtomValue } from "jotai";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef } from "react";
import type { ShiftSubmissionPattern } from "@/convex/shop/schemas";
import type {
  PositionType,
  RequiredStaffingData,
  ShiftData,
  SortMode,
  StaffType,
  TimeRange,
  ViewMode,
} from "@/src/domains/shift/types";
import { ConfirmButton, SaveButton, UnsubmittedStrip, ViewTabs } from "./components";
import { useShiftFormInit } from "./hooks/useShiftFormInit";
import { DailyView } from "./pc/DailyView";
import { DateOnlyView } from "./pc/DateOnlyView";
import { OverviewView } from "./pc/OverviewView";
import { ShiftTypeDailyView } from "./pc/ShiftTypeDailyView";
import { ShiftTypeOverviewView } from "./pc/ShiftTypeOverviewView";
import { SPDailyView } from "./sp/DailyView";
import { SPDateOnlyDailyView } from "./sp/DateOnlyDailyView";
import { SPDateOnlyOverviewView } from "./sp/DateOnlyOverviewView";
import { SPOverviewView } from "./sp/OverviewView";
import { SPShiftTypeDailyView } from "./sp/ShiftTypeDailyView";
import { SPShiftTypeOverviewView } from "./sp/ShiftTypeOverviewView";
import { shiftsAtom, viewModeAtom } from "./stores";

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
  submissionPattern?: ShiftSubmissionPattern;
  displayMode?: "request" | "confirmed";
  initialViewMode?: ViewMode;
  initialSortMode?: SortMode;
  onShiftsChange?: (shifts: ShiftData[]) => void;
  onViewModeChange?: (mode: ViewMode) => void;
  onSaveDraft?: () => void;
  onConfirm?: () => void;
  isConfirmed?: boolean;
  onRemind?: () => void;
  lastSentAtLabel?: string;
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
  submissionPattern,
  displayMode,
  initialViewMode,
  initialSortMode,
  onShiftsChange,
  onViewModeChange,
  onSaveDraft,
  onConfirm,
  isConfirmed = false,
  onRemind,
  lastSentAtLabel,
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
    submissionPattern,
    displayMode,
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
  const onViewModeChangeRef = useRef(onViewModeChange);
  onViewModeChangeRef.current = onViewModeChange;

  useEffect(() => {
    onViewModeChangeRef.current?.(viewMode);
  }, [viewMode]);
  const unsubmittedNames = useMemo(() => staffs.filter((s) => !s.isSubmitted).map((s) => s.name), [staffs]);
  const isShiftTypePattern = submissionPattern?.kind === "shiftType";
  const isDateOnlyPattern = submissionPattern?.kind === "dateOnly";

  return (
    <>
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
          onRemind={onRemind}
          lastSentAtLabel={lastSentAtLabel}
          singleViewLabel={isDateOnlyPattern ? "日ごと" : undefined}
        >
          {isDateOnlyPattern ? (
            <DateOnlyView />
          ) : (
            <>
              <Box display={viewMode === "daily" ? "flex" : "none"} flexDirection="column" flex={1} minH={0}>
                {isShiftTypePattern ? <ShiftTypeDailyView /> : <DailyView />}
              </Box>
              <Box display={viewMode === "overview" ? "block" : "none"} flex={1} minH={0} overflow="auto">
                {isShiftTypePattern ? <ShiftTypeOverviewView /> : <OverviewView />}
              </Box>
            </>
          )}
        </Shell>
      </Box>
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
          onRemind={onRemind}
          lastSentAtLabel={lastSentAtLabel}
        >
          {isDateOnlyPattern ? (
            <>
              <Box display={viewMode === "daily" ? "flex" : "none"} flexDirection="column" flex={1} minH={0}>
                <SPDateOnlyDailyView />
              </Box>
              <Box display={viewMode === "overview" ? "block" : "none"} flex={1} minH={0} overflow="auto">
                <SPDateOnlyOverviewView />
              </Box>
            </>
          ) : isShiftTypePattern ? (
            <>
              <Box display={viewMode === "daily" ? "flex" : "none"} flexDirection="column" flex={1} minH={0}>
                <SPShiftTypeDailyView />
              </Box>
              <Box display={viewMode === "overview" ? "block" : "none"} flex={1} minH={0} overflow="auto">
                <SPShiftTypeOverviewView />
              </Box>
            </>
          ) : (
            <>
              <Box display={viewMode === "daily" ? "block" : "none"} flex={1} overflow="auto">
                <SPDailyView />
              </Box>
              <Box display={viewMode === "overview" ? "block" : "none"} flex={1} minH={0} overflow="auto">
                <SPOverviewView />
              </Box>
            </>
          )}
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
  onRemind?: () => void;
  lastSentAtLabel?: string;
  singleViewLabel?: string;
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
  onRemind,
  lastSentAtLabel,
  singleViewLabel,
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
      {singleViewLabel ? (
        <Text py="10px" textStyle="sm" fontWeight={700} color="gray.800">
          {singleViewLabel}
        </Text>
      ) : (
        <ViewTabs value={viewMode} onChange={setViewMode} />
      )}
      {!isReadOnly && (
        <Flex ml="auto" gap={2} align="center" py={2} flexShrink={0}>
          <SaveButton compact={compact} onClick={onSaveDraft} />
          <ConfirmButton compact={compact} isConfirmed={isConfirmed} onClick={onConfirm} />
        </Flex>
      )}
    </Flex>

    <Flex flex={1} minH={0} direction="column">
      {children}
    </Flex>
    {!isReadOnly && unsubmittedNames.length > 0 && (
      <UnsubmittedStrip names={unsubmittedNames} onRemind={onRemind} lastSentAtLabel={lastSentAtLabel} />
    )}
  </Flex>
);

export const ShiftForm = (props: ShiftFormProps) => (
  <Provider>
    <ShiftFormInner {...props} />
  </Provider>
);
