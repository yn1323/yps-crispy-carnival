import { Box, Flex, Grid, Heading, useBreakpointValue, VisuallyHidden } from "@chakra-ui/react";
import { Provider, useAtom, useAtomValue, useSetAtom } from "jotai";
import type { MutableRefObject, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import type { AssignmentIssue } from "@/convex/shiftBoard/validation";
import type { ShiftSubmissionPattern } from "@/convex/shop/schemas";
import { FocusedFlowBackButton } from "@/src/components/templates/FocusedFlowHeader";
import { type DisplayIssue, toDisplayIssues } from "@/src/domains/shift/assignmentIssues";
import type { AssignmentWarning } from "@/src/domains/shift/assignmentWarnings";
import type { NewcomerOnlyPeriod } from "@/src/domains/shift/staffing";
import type { PositionType, ShiftData, SortMode, StaffType, TimeRange, ViewMode } from "@/src/domains/shift/types";
import { AutoCreateDialog } from "./AutoCreateDialog";
import { AutoCreateButton } from "./AutoCreateDialog/entrances";
import { BreakEditorDialog } from "./BreakEditorDialog";
import {
  ConfirmButton,
  ExportButton,
  type ReminderStatus,
  SaveButton,
  type ShiftFormExportAction,
  UnsubmittedStrip,
  ViewTabs,
} from "./components";
import { type ShiftDateNote, ShiftDateNotesProvider } from "./dateNotes";
import {
  PositionLegend,
  type ShiftFormDetailActions,
  ShiftFormDetailActionsProvider,
  useShiftFormDetailActions,
} from "./detailParts";
import { useChromeHideOnScroll } from "./hooks/useChromeHideOnScroll";
import { useShiftFormInit } from "./hooks/useShiftFormInit";
import { DailyView } from "./pc/DailyView";
import { DateOnlyView } from "./pc/DateOnlyView";
import { OverviewView } from "./pc/OverviewView";
import { ShiftTypeDailyView } from "./pc/ShiftTypeDailyView";
import { ShiftTypeOverviewView } from "./pc/ShiftTypeOverviewView";
import { ActionsMenu } from "./sp/ActionsMenu";
import { SPDailyView } from "./sp/DailyView";
import { SPDateOnlyDailyView } from "./sp/DateOnlyDailyView";
import { SPDateOnlyOverviewView } from "./sp/DateOnlyOverviewView";
import { SPOverviewView } from "./sp/OverviewView";
import { SPShiftTypeDailyView } from "./sp/ShiftTypeDailyView";
import { SPShiftTypeOverviewView } from "./sp/ShiftTypeOverviewView";
import {
  applyShiftDraftsAtom,
  autoCreateDialogOpenAtom,
  chromeHiddenAtom,
  detailModeAtom,
  detailToggleEnabledAtom,
  selectDateWithDailyStaffOrderAtom,
  selectedDateAtom,
  shiftsAtom,
  viewModeAtom,
} from "./stores";
import type { ShiftFormStaffing } from "./types";
import { ValidationErrorPanel } from "./ValidationErrorPanel";

export type { ReminderStatus } from "./components";
export type { ShiftDateNote } from "./dateNotes";
export type { ShiftFormDayStaffingActions, ShiftFormDetailActions } from "./detailParts";
export { shouldDefaultToDetailMode } from "./staffingPresentation";
export type { ShiftFormDayRequirements, ShiftFormStaffing, ShiftFormStaffingDay } from "./types";

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
  /** 「くわしく」表示で使う店舗の設定（日ごとの必要人数、当てられるテンプレート、休憩の決まり）。 */
  staffing?: ShiftFormStaffing;
  submissionPattern: ShiftSubmissionPattern;
  displayMode?: "request" | "confirmed";
  defaultToToday?: boolean;
  initialViewMode?: ViewMode;
  initialSortMode?: SortMode;
  /** 「くわしく」表示で開くかどうか。省略時はシンプル（従来の画面）で開く。 */
  initialDetailMode?: boolean;
  /** 渡した場合だけ「シンプル / くわしく」の切り替えを出し、切り替えを通知する。 */
  onDetailModeChange?: (isDetailMode: boolean) => void;
  /** 設定ページへの移動、その日の必要人数、仮の勤務など、画面の外へ出す操作。 */
  detailActions?: ShiftFormDetailActions;
  /** 画面の外で組み立てた編集結果（仮の勤務の差し込みなど）を取り込むための受け口。 */
  applyShiftsRef?: MutableRefObject<((update: (current: ShiftData[]) => ShiftData[]) => void) | null>;
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
  /** 見習いだけの時間帯（確認事項）。くわしく表示のときに、日付の確認事項の件数へ足す。 */
  newcomerOnlyPeriods?: NewcomerOnlyPeriod[];
  onDismissValidationIssues?: () => void;
  header?: ShiftFormHeader;
  exportAction?: ShiftFormExportAction;
  /** スタッフが提出した日付メモ。割当状態には入れず、表示だけに使う。 */
  dateNotes?: readonly ShiftDateNote[];
  /**
   * 内側の入れ物のスクロールで、上の行を隠した・表示したときに通知する。
   * 置く側は、これに合わせてアプリのヘッダーを隠し、シフト表を画面の上端まで広げる。
   */
  onChromeHiddenChange?: (isHidden: boolean) => void;
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
  staffing,
  submissionPattern,
  displayMode,
  defaultToToday,
  initialViewMode,
  initialSortMode,
  initialDetailMode,
  onDetailModeChange,
  applyShiftsRef,
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
  newcomerOnlyPeriods,
  onDismissValidationIssues,
  header,
  exportAction,
  onChromeHiddenChange,
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
    staffing,
    submissionPattern,
    displayMode,
    defaultToToday,
    initialViewMode,
    initialSortMode,
    initialDetailMode,
    validationIssues,
    validationWarnings,
    newcomerOnlyPeriods,
  });

  const shifts = useAtomValue(shiftsAtom);
  const onShiftsChangeRef = useRef(onShiftsChange);
  onShiftsChangeRef.current = onShiftsChange;

  useEffect(() => {
    onShiftsChangeRef.current?.(shifts);
  }, [shifts]);

  const detailMode = useAtomValue(detailModeAtom);
  const onDetailModeChangeRef = useRef(onDetailModeChange);
  onDetailModeChangeRef.current = onDetailModeChange;
  // 初期値がstoreへ入るまでは通知せず、そのあとで利用者が切り替えたときだけ通知する。
  // 初期値の反映を通知すると、開いただけで「利用者が選んだ表示」として端末に覚えてしまう。
  const expectedInitialDetailMode = initialDetailMode ?? false;
  const isDetailModeSyncedRef = useRef(false);
  useEffect(() => {
    if (!isDetailModeSyncedRef.current) {
      if (detailMode === expectedInitialDetailMode) isDetailModeSyncedRef.current = true;
      return;
    }
    onDetailModeChangeRef.current?.(detailMode);
  }, [detailMode, expectedInitialDetailMode]);

  // 「表示設定」メニューの中へ切り替えを出すため、出してよいかをstoreへ伝える。
  const setDetailToggleEnabled = useSetAtom(detailToggleEnabledAtom);
  const isDetailToggleEnabled = Boolean(onDetailModeChange);
  useEffect(() => {
    setDetailToggleEnabled(isDetailToggleEnabled);
  }, [isDetailToggleEnabled, setDetailToggleEnabled]);

  const applyShifts = useSetAtom(applyShiftDraftsAtom);
  useEffect(() => {
    if (!applyShiftsRef) return;
    applyShiftsRef.current = applyShifts;
    return () => {
      applyShiftsRef.current = null;
    };
  }, [applyShifts, applyShiftsRef]);

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
  // 内側の入れ物を下へスクロールすると、上の行を隠す。選んだ日か表示を変えると、表示した状態へ戻す。
  const selectedDateForChrome = useAtomValue(selectedDateAtom);
  const handleScrollCapture = useChromeHideOnScroll(`${viewMode}:${selectedDateForChrome}`, onChromeHiddenChange);

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
      <Box
        display="flex"
        flexDirection="column"
        h="100%"
        minH={0}
        overflow="hidden"
        bg="gray.50"
        onScrollCapture={handleScrollCapture}
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
          hideViewTabs={isDateOnlyPattern}
          validationIssues={displayIssues}
          onSelectIssue={handleSelectIssue}
          onDismissValidationIssues={onDismissValidationIssues}
          header={header}
          exportAction={exportAction}
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
    <Box
      display="flex"
      flexDirection="column"
      h="100%"
      minH={0}
      overflow="hidden"
      bg="gray.50"
      onScrollCapture={handleScrollCapture}
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
        header={header}
        exportAction={exportAction}
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
  hideViewTabs?: boolean;
  validationIssues: DisplayIssue[];
  onSelectIssue: (issue: DisplayIssue) => void;
  onDismissValidationIssues?: () => void;
  header?: ShiftFormHeader;
  exportAction?: ShiftFormExportAction;
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
  hideViewTabs,
  validationIssues,
  onSelectIssue,
  onDismissValidationIssues,
  header,
  exportAction,
  children,
}: ShellProps) => {
  const detailMode = useAtomValue(detailModeAtom);
  const isChromeHidden = useAtomValue(chromeHiddenAtom);
  const [isAutoCreateOpen, setAutoCreateOpen] = useAtom(autoCreateDialogOpenAtom);
  const { provisionalAction } = useShiftFormDetailActions();
  // 自動作成は、勤務にポジションを持たせる「くわしく」で、未確定の募集を編集できるときだけ出す。
  const canAutoCreate = detailMode && !isReadOnly && !isConfirmed;
  const openAutoCreate = () => setAutoCreateOpen(true);
  return (
    <Flex direction="column" h="100%" minH={0}>
      {header && compact && (
        <VisuallyHidden asChild>
          <Heading as="h1">{header.mobileTitle}</Heading>
        </VisuallyHidden>
      )}
      {/*
        上の行（戻る、日別と一覧、保存）。内側の入れ物を下へスクロールすると、高さを0へ縮めて隠す。
        隠している間は、中のボタンへフォーカスが移らないようにする。
      */}
      <Box
        display="grid"
        gridTemplateRows={isChromeHidden ? "0fr" : "1fr"}
        transition="grid-template-rows 0.3s cubic-bezier(0.4, 0, 0.2, 1)"
        _motionReduce={{ transition: "none" }}
        flexShrink={0}
        data-chrome-row
        data-chrome-hidden={isChromeHidden ? "" : undefined}
        inert={isChromeHidden}
      >
        <Box minH={0} overflow="hidden">
          <Grid
            templateColumns={header && !compact ? "auto minmax(0, 1fr) auto" : "minmax(0, 1fr) auto"}
            px={compact ? 3 : 5}
            bg="white"
            borderBottomWidth="1px"
            borderColor="gray.200"
            alignItems="center"
          >
            <Flex minW={0} align="center" alignSelf="stretch" gap={header ? { base: 3, lg: 4 } : undefined}>
              {header && <FocusedFlowBackButton backLabel={header.backLabel} backAriaLabel={header.backAriaLabel} />}
              {!hideViewTabs && (
                <ViewTabs value={viewMode} onChange={setViewMode} compactSpacing={compact && Boolean(header)} />
              )}
            </Flex>
            {header && !compact && (
              <Heading
                as="h1"
                alignSelf="stretch"
                display="flex"
                alignItems="center"
                justifyContent="center"
                minW={0}
                color="gray.950"
                fontSize="lg"
                textAlign="center"
                truncate
              >
                {header.desktopTitle}
              </Heading>
            )}
            {!isReadOnly || exportAction ? (
              <Flex justifySelf="end" gap={2} align="center" py={compact ? 1 : 2} flexShrink={0}>
                {compact && !isReadOnly ? (
                  <ActionsMenu
                    isConfirmed={isConfirmed}
                    isSavingDraft={isSavingDraft}
                    isConfirming={isConfirming}
                    onSaveDraft={onSaveDraft}
                    onConfirm={onConfirm}
                    exportAction={exportAction}
                    onAutoCreate={canAutoCreate ? openAutoCreate : undefined}
                  />
                ) : (
                  <>
                    {/* 自動作成、下書き保存、PDF・Excel、確定の順に並べる。 */}
                    {canAutoCreate && <AutoCreateButton onClick={openAutoCreate} />}
                    {!isReadOnly && <SaveButton compact={compact} isSaving={isSavingDraft} onClick={onSaveDraft} />}
                    {exportAction && <ExportButton {...exportAction} />}
                    {!isReadOnly && (
                      <ConfirmButton
                        compact={compact}
                        isConfirmed={isConfirmed}
                        isConfirming={isConfirming}
                        onClick={onConfirm}
                      />
                    )}
                  </>
                )}
              </Flex>
            ) : (
              header && <Box justifySelf="end" minW="44px" />
            )}
          </Grid>
        </Box>
      </Box>

      <PositionLegend />

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
          provisionalAction={detailMode ? provisionalAction : undefined}
        />
      )}
      {canAutoCreate && <AutoCreateDialog isOpen={isAutoCreateOpen} onClose={() => setAutoCreateOpen(false)} />}
    </Flex>
  );
};

const EMPTY_DETAIL_ACTIONS: ShiftFormDetailActions = {};

export const ShiftForm = (props: ShiftFormProps) => (
  <Provider>
    <ShiftDateNotesProvider notes={props.dateNotes}>
      <ShiftFormDetailActionsProvider actions={props.detailActions ?? EMPTY_DETAIL_ACTIONS}>
        <ShiftFormInner {...props} />
        <BreakEditorDialog />
      </ShiftFormDetailActionsProvider>
    </ShiftDateNotesProvider>
  </Provider>
);
