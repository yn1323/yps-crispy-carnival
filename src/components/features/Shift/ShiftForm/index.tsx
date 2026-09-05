import { Box, Flex, Grid, Heading, Text, useBreakpointValue } from "@chakra-ui/react";
import { Provider, useAtom, useAtomValue, useSetAtom } from "jotai";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import type { AssignmentIssue } from "@/convex/shiftBoard/validation";
import type { ShiftSubmissionPattern } from "@/convex/shop/schemas";
import { FocusedFlowBackButton } from "@/src/components/templates/FocusedFlowHeader";
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
import { selectDateWithDailyStaffOrderAtom, shiftsAtom, viewModeAtom } from "./stores";
import { ValidationErrorPanel } from "./ValidationErrorPanel";

export type { ReminderStatus } from "./components";

export type ShiftFormHeader = {
  desktopTitle: string;
  mobileTitle: string;
  backLabel?: string;
  backAriaLabel?: string;
};

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
  submissionPattern: ShiftSubmissionPattern;
  displayMode?: "request" | "confirmed";
  defaultToToday?: boolean;
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
  header?: ShiftFormHeader;
  action?: ReactNode;
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
  defaultToToday,
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
  header,
  action,
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
    defaultToToday,
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
  const isShiftTypePattern = submissionPattern.kind === "shiftType";
  const isDateOnlyPattern = submissionPattern.kind === "dateOnly";

  const selectDate = useSetAtom(selectDateWithDailyStaffOrderAtom);
  const displayIssues = useMemo(() => toDisplayIssues(validationIssues ?? [], staffs), [validationIssues, staffs]);
  const layoutMode = useBreakpointValue({ base: "sp", lg: "pc" }) ?? "pc";

  // エラー行クリックで該当日付の日別ビューへ移動し、該当スタッフ行までスクロールする
  const handleSelectIssue = useCallback(
    (issue: DisplayIssue) => {
      selectDate(issue.date);
      setViewMode("daily");
      requestAnimationFrame(() => {
        for (const row of document.querySelectorAll(`[data-tour="shift-row-${issue.staffId}"]`)) {
          row.scrollIntoView({ block: "center", behavior: "smooth" });
        }
      });
    },
    [selectDate, setViewMode],
  );

  if (layoutMode === "pc") {
    return (
      <Box display="flex" flexDirection="column" h="100%" minH={0} overflow="hidden" bg="gray.50">
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
          header={header}
          action={action}
        >
          {isDateOnlyPattern ? (
            <DateOnlyView />
          ) : viewMode === "daily" ? (
            <Box display="flex" flexDirection="column" flex={1} minH={0}>
              {isShiftTypePattern ? <ShiftTypeDailyView /> : <DailyView />}
            </Box>
          ) : (
            <Box flex={1} minH={0} overflow="auto">
              {isShiftTypePattern ? <ShiftTypeOverviewView /> : <OverviewView />}
            </Box>
          )}
        </Shell>
      </Box>
    );
  }

  return (
    <Box display="flex" flexDirection="column" h="100%" minH={0} overflow="hidden" bg="gray.50">
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
        header={header}
        action={action}
      >
        {isDateOnlyPattern ? (
          viewMode === "daily" ? (
            <Box display="flex" flexDirection="column" flex={1} minH={0}>
              <SPDateOnlyDailyView />
            </Box>
          ) : (
            <Box flex={1} minH={0} overflow="auto">
              <SPDateOnlyOverviewView />
            </Box>
          )
        ) : isShiftTypePattern ? (
          viewMode === "daily" ? (
            <Box display="flex" flexDirection="column" flex={1} minH={0}>
              <SPShiftTypeDailyView />
            </Box>
          ) : (
            <Box flex={1} minH={0} overflow="auto">
              <SPShiftTypeOverviewView />
            </Box>
          )
        ) : viewMode === "daily" ? (
          <Box flex={1} overflow="auto">
            <SPDailyView />
          </Box>
        ) : (
          <Box flex={1} minH={0} overflow="auto">
            <SPOverviewView />
          </Box>
        )}
      </Shell>
    </Box>
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
  header?: ShiftFormHeader;
  action?: ReactNode;
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
  header,
  action,
  children,
}: ShellProps) => (
  <Flex direction="column" h="100%" minH={0}>
    <Grid
      templateColumns={
        header ? (compact ? "minmax(0, 1fr) auto minmax(0, 1fr)" : "auto minmax(0, 1fr) auto") : "minmax(0, 1fr) auto"
      }
      px={compact ? 3 : 5}
      bg="white"
      borderBottomWidth="1px"
      borderColor="gray.200"
      alignItems="center"
      flexShrink={0}
    >
      <Flex minW={0} align="center" alignSelf="stretch" gap={header ? { base: 3, lg: 4 } : undefined}>
        {header && <FocusedFlowBackButton backLabel={header.backLabel} backAriaLabel={header.backAriaLabel} />}
        {singleViewLabel ? (
          <Text py="10px" textStyle="sm" fontWeight={700} color="gray.800">
            {singleViewLabel}
          </Text>
        ) : (
          <ViewTabs value={viewMode} onChange={setViewMode} compactSpacing={compact && Boolean(header)} />
        )}
      </Flex>
      {header && (
        <Heading
          as="h1"
          alignSelf="stretch"
          display="flex"
          alignItems="center"
          justifyContent="center"
          minW={0}
          color="gray.950"
          fontSize={compact ? "md" : "lg"}
          textAlign="center"
          truncate
        >
          {compact ? header.mobileTitle : header.desktopTitle}
        </Heading>
      )}
      {!isReadOnly || action ? (
        <Flex justifySelf="end" gap={2} align="center" py={2} flexShrink={0}>
          {action}
          {!isReadOnly && (
            <>
              <SaveButton compact={compact} isSaving={isSavingDraft} onClick={onSaveDraft} />
              <ConfirmButton
                compact={compact}
                isConfirmed={isConfirmed}
                isConfirming={isConfirming}
                onClick={onConfirm}
              />
            </>
          )}
        </Flex>
      ) : (
        header && <Box justifySelf="end" minW="44px" />
      )}
    </Grid>

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
