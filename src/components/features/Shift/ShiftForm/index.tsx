import { Box, Flex, Text } from "@chakra-ui/react";
import { Provider, useAtom, useAtomValue, useSetAtom } from "jotai";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import type { AssignmentIssue } from "@/convex/shiftBoard/validation";
import type { ShiftSubmissionPattern } from "@/convex/shop/schemas";
import { type DisplayIssue, toDisplayIssues } from "@/src/domains/shift/assignmentIssues";
import type { AssignmentWarning } from "@/src/domains/shift/assignmentWarnings";
import type {
  PositionType,
  RequiredStaffingData,
  ShiftData,
  SortMode,
  StaffType,
  TimeRange,
  ViewMode,
} from "@/src/domains/shift/types";
import { ConfirmButton, type ReminderStatus, SaveButton, UnsubmittedStrip, ViewTabs } from "./components";
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
import { selectedDateAtom, shiftsAtom, viewModeAtom } from "./stores";
import { ValidationErrorPanel } from "./ValidationErrorPanel";

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
  isSavingDraft?: boolean;
  isConfirming?: boolean;
  isConfirmed?: boolean;
  reminderStatus?: ReminderStatus;
  onOpenUnsubmittedDetails?: () => void;
  validationIssues?: AssignmentIssue[];
  validationWarnings?: AssignmentWarning[];
  onDismissValidationIssues?: () => void;
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
  isSavingDraft = false,
  isConfirming = false,
  isConfirmed = false,
  reminderStatus,
  onOpenUnsubmittedDetails,
  validationIssues,
  validationWarnings,
  onDismissValidationIssues,
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
    validationIssues,
    validationWarnings,
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

  const setSelectedDate = useSetAtom(selectedDateAtom);
  const displayIssues = useMemo(() => toDisplayIssues(validationIssues ?? [], staffs), [validationIssues, staffs]);

  // エラー行クリックで該当日付の日別ビューへ移動し、該当スタッフ行までスクロールする
  const handleSelectIssue = useCallback(
    (issue: DisplayIssue) => {
      setSelectedDate(issue.date);
      setViewMode("daily");
      requestAnimationFrame(() => {
        for (const row of document.querySelectorAll(`[data-tour="shift-row-${issue.staffId}"]`)) {
          row.scrollIntoView({ block: "center", behavior: "smooth" });
        }
      });
    },
    [setSelectedDate, setViewMode],
  );

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
          isSavingDraft={isSavingDraft}
          isConfirming={isConfirming}
          unsubmittedNames={unsubmittedNames}
          reminderStatus={reminderStatus}
          onOpenUnsubmittedDetails={onOpenUnsubmittedDetails}
          singleViewLabel={isDateOnlyPattern ? "日ごと" : undefined}
          validationIssues={displayIssues}
          onSelectIssue={handleSelectIssue}
          onDismissValidationIssues={onDismissValidationIssues}
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
          isSavingDraft={isSavingDraft}
          isConfirming={isConfirming}
          unsubmittedNames={unsubmittedNames}
          reminderStatus={reminderStatus}
          onOpenUnsubmittedDetails={onOpenUnsubmittedDetails}
          validationIssues={displayIssues}
          onSelectIssue={handleSelectIssue}
          onDismissValidationIssues={onDismissValidationIssues}
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
  isSavingDraft: boolean;
  isConfirming: boolean;
  unsubmittedNames: string[];
  reminderStatus?: ReminderStatus;
  onOpenUnsubmittedDetails?: () => void;
  singleViewLabel?: string;
  validationIssues: DisplayIssue[];
  onSelectIssue: (issue: DisplayIssue) => void;
  onDismissValidationIssues?: () => void;
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
  isSavingDraft,
  isConfirming,
  unsubmittedNames,
  reminderStatus,
  onOpenUnsubmittedDetails,
  singleViewLabel,
  validationIssues,
  onSelectIssue,
  onDismissValidationIssues,
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
          <SaveButton compact={compact} isSaving={isSavingDraft} onClick={onSaveDraft} />
          <ConfirmButton compact={compact} isConfirmed={isConfirmed} isConfirming={isConfirming} onClick={onConfirm} />
        </Flex>
      )}
    </Flex>

    {!isReadOnly && validationIssues.length > 0 && (
      <ValidationErrorPanel
        issues={validationIssues}
        onSelectIssue={onSelectIssue}
        onDismiss={onDismissValidationIssues}
        compact={compact}
        tone="error"
      />
    )}

    <Flex flex={1} minH={0} direction="column">
      {children}
    </Flex>
    {!isReadOnly && !isConfirmed && reminderStatus && unsubmittedNames.length > 0 && (
      <UnsubmittedStrip
        names={unsubmittedNames}
        reminderStatus={reminderStatus}
        onOpenDetails={onOpenUnsubmittedDetails}
      />
    )}
  </Flex>
);

export const ShiftForm = (props: ShiftFormProps) => (
  <Provider>
    <ShiftFormInner {...props} />
  </Provider>
);
