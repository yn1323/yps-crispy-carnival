import { Box, Checkbox, Flex, Stack, Text } from "@chakra-ui/react";
import { useAtom, useAtomValue } from "jotai";
import { useEffect, useMemo, useState } from "react";
import {
  SHIFT_DAY_TEMPLATE_BAR_LIMIT,
  SHIFT_DAY_TEMPLATE_CONCURRENT_BAR_LIMIT,
  SHIFT_DAY_TEMPLATE_REQUIRED_COUNT_MAX,
} from "@/convex/constants";
import { getEditableEndMinutes, getEditableStartMinutes } from "@/src/components/shared/ShiftTimeline/timelineGeometry";
import { RequiredCountStrip, StaffingBarEditor } from "@/src/components/shared/StaffingBarEditor";
import { StaffingCountTable } from "@/src/components/shared/StaffingCountTable";
import { Button } from "@/src/components/ui/Button";
import { Dialog } from "@/src/components/ui/Dialog";
import { Select, type SelectItemType } from "@/src/components/ui/Select";
import { formatDateWithWeekday } from "@/src/domains/shift/date";
import {
  BULK_RESET_VALUE,
  type BulkApplyPreset,
  buildBulkApplyRows,
  buildCountTableRows,
  buildDayRequirementsDraft,
  type DayRequirementsDraft,
  describeCustomRequirements,
  findDayRequirementsError,
  formatDayRequirementsTitle,
  selectBulkApplyDates,
  setDraftCount,
  toBulkTemplateId,
  toDayRequirements,
} from "./dayStaffingDrafts";
import { useShiftFormDetailActions } from "./detailParts";
import { useDayStaffingEditor } from "./staffingParts";
import { buildDayTemplateView } from "./staffingPresentation";
import { dayStaffingDialogAtom, shiftConfigAtom } from "./stores";

const BAR_LIMITS = {
  maxConcurrentPerPosition: SHIFT_DAY_TEMPLATE_CONCURRENT_BAR_LIMIT,
  maxBars: SHIFT_DAY_TEMPLATE_BAR_LIMIT,
};

const BULK_PRESETS: ReadonlyArray<{ preset: BulkApplyPreset; label: string }> = [
  { preset: "weekday", label: "平日" },
  { preset: "weekend", label: "土日" },
  { preset: "all", label: "すべて" },
];

/** 募集期間の日をチェックで選び、同じ型を1回で当てるDialog。 */
const BulkApplyDialog = () => {
  const [target, setTarget] = useAtom(dayStaffingDialogAtom);
  const config = useAtomValue(shiftConfigAtom);
  const editor = useDayStaffingEditor();
  const [selectedDates, setSelectedDates] = useState<ReadonlySet<string>>(new Set());
  const [choice, setChoice] = useState("");

  const rows = useMemo(
    () => buildBulkApplyRows({ dates: config.dates, holidays: config.holidays, days: config.staffing?.days ?? [] }),
    [config.dates, config.holidays, config.staffing?.days],
  );
  const templateItems = useMemo<SelectItemType[]>(
    () => [
      ...(config.staffing?.templates ?? []).map((template) => ({ value: template.id, label: template.name })),
      { value: BULK_RESET_VALUE, label: "曜日の設定に戻す" },
    ],
    [config.staffing?.templates],
  );

  // 開くたびに、メニューを開いた日だけを選んだ状態から始める。
  useEffect(() => {
    if (target?.kind !== "bulk") return;
    setSelectedDates(new Set([target.date]));
    setChoice("");
  }, [target]);

  const close = () => setTarget(null);
  const isOpen = target?.kind === "bulk" && editor !== null;
  const selectedCount = rows.filter((row) => selectedDates.has(row.date)).length;

  const handleSubmit = async () => {
    if (!editor || choice === "" || selectedCount === 0) return;
    // 日付は募集期間の並び順で送る。
    const dates = rows.filter((row) => selectedDates.has(row.date)).map((row) => row.date);
    if (await editor.onApplyTemplate(dates, toBulkTemplateId(choice))) close();
  };

  return (
    <Dialog
      title="型をまとめて変える"
      isOpen={isOpen}
      onOpenChange={(details) => {
        if (!details.open) close();
      }}
      onClose={close}
      onSubmit={handleSubmit}
      submitLabel="変更する"
      isLoading={editor?.isPending ?? false}
      isSubmitDisabled={choice === "" || selectedCount === 0}
      mobileFullScreen
      maxW={{ md: "520px" }}
      maxH={{ md: "85dvh" }}
    >
      <Stack gap={4}>
        <Select
          label="当てる型"
          items={templateItems}
          value={choice}
          onChange={setChoice}
          placeholder="型を選択"
          usePortal={false}
        />
        <Stack gap={2}>
          <Flex align="center" justify="space-between" gap={2} wrap="wrap">
            <Text textStyle="sm" fontWeight={600} color="gray.800">
              変える日
            </Text>
            <Text textStyle="xs" color="gray.600" aria-live="polite" fontVariantNumeric="tabular-nums">
              {selectedCount}日を選択中
            </Text>
          </Flex>
          <Flex gap={2} wrap="wrap">
            {BULK_PRESETS.map(({ preset, label }) => (
              <Button
                key={preset}
                type="button"
                size="sm"
                variant="outline"
                minH={{ base: "44px", md: "32px" }}
                onClick={() => setSelectedDates(new Set(selectBulkApplyDates(rows, preset)))}
              >
                {label}
              </Button>
            ))}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              minH={{ base: "44px", md: "32px" }}
              disabled={selectedCount === 0}
              onClick={() => setSelectedDates(new Set())}
            >
              選択を外す
            </Button>
          </Flex>
          <Box
            role="group"
            aria-label="変える日"
            borderWidth="1px"
            borderColor="gray.200"
            borderRadius="lg"
            overflow="hidden"
          >
            {rows.map((row) => {
              const dateLabel = formatDateWithWeekday(row.date);
              return (
                <Checkbox.Root
                  key={row.date}
                  colorPalette="teal"
                  checked={selectedDates.has(row.date)}
                  disabled={row.isClosed}
                  display="flex"
                  alignItems="center"
                  gap={3}
                  w="full"
                  minH="44px"
                  px={3}
                  py={2}
                  borderTopWidth="1px"
                  borderColor="gray.100"
                  _first={{ borderTopWidth: 0 }}
                  bg={row.isClosed ? "gray.50" : "white"}
                  cursor={row.isClosed ? "not-allowed" : "pointer"}
                  _active={row.isClosed ? undefined : { bg: "gray.100" }}
                  onCheckedChange={(details) => {
                    setSelectedDates((current) => {
                      const next = new Set(current);
                      if (details.checked === true) next.add(row.date);
                      else next.delete(row.date);
                      return next;
                    });
                  }}
                >
                  <Checkbox.HiddenInput aria-label={dateLabel} />
                  <Checkbox.Control
                    flexShrink={0}
                    bg="white"
                    borderColor="gray.300"
                    _checked={{ bg: "teal.500", borderColor: "teal.500" }}
                  />
                  {/* 読み上げる名前は日付だけにする。いまの型は、行の補足として見せる。 */}
                  <Checkbox.Label
                    aria-label={dateLabel}
                    display="flex"
                    flex={1}
                    minW={0}
                    alignItems="center"
                    gap={3}
                    cursor="inherit"
                  >
                    <Box as="span" w="80px" flexShrink={0} fontWeight={600} fontVariantNumeric="tabular-nums">
                      {dateLabel}
                    </Box>
                    <Box as="span" flex={1} minW={0} textStyle="xs" color="gray.600" truncate>
                      {row.isClosed ? "定休日" : row.templateLabel}
                    </Box>
                  </Checkbox.Label>
                </Checkbox.Root>
              );
            })}
          </Box>
        </Stack>
      </Stack>
    </Dialog>
  );
};

/** その日だけの必要人数を変えるDialog。いまの必要人数を初期値にし、型は変えない。 */
const CustomRequirementsDialog = () => {
  const [target, setTarget] = useAtom(dayStaffingDialogAtom);
  const config = useAtomValue(shiftConfigAtom);
  const editor = useDayStaffingEditor();
  const { onOpenSetup } = useShiftFormDetailActions();
  const [draft, setDraft] = useState<DayRequirementsDraft | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { positions, submissionPattern, timeRange } = config;
  const date = target?.kind === "custom" ? target.date : null;
  const day = date ? config.staffing?.days.find((item) => item.date === date) : undefined;

  // 開くたびに、その日のいまの必要人数から入力を作り直す。
  // biome-ignore lint/correctness/useExhaustiveDependencies: 編集中に必要人数が再取得されても入力を保つため、対象の日が変わったときだけ初期化する。
  useEffect(() => {
    if (target?.kind !== "custom") return;
    setDraft(buildDayRequirementsDraft(day?.requirements ?? null, submissionPattern));
    setError(null);
  }, [target]);

  const range = useMemo(
    () => ({ startMinutes: getEditableStartMinutes(timeRange), endMinutes: getEditableEndMinutes(timeRange) }),
    [timeRange],
  );
  const countRows = useMemo(() => buildCountTableRows(submissionPattern), [submissionPattern]);

  const close = () => setTarget(null);
  const isOpen = date !== null && editor !== null;

  const handleSubmit = async () => {
    if (!editor || !date || !draft) return;
    const requirements = toDayRequirements(
      draft,
      submissionPattern,
      positions.map((position) => position.id),
    );
    const nextError = findDayRequirementsError(requirements, submissionPattern);
    if (nextError) {
      setError(nextError);
      return;
    }
    if (await editor.onSaveCustom(date, requirements)) close();
  };

  const updateDraft = (next: DayRequirementsDraft) => {
    setDraft(next);
    setError(null);
  };

  return (
    <Dialog
      title={date ? formatDayRequirementsTitle(date) : "必要人数"}
      isOpen={isOpen}
      onOpenChange={(details) => {
        if (!details.open) close();
      }}
      onClose={close}
      onSubmit={handleSubmit}
      submitLabel="保存する"
      isLoading={editor?.isPending ?? false}
      mobileFullScreen
      maxW={{ md: submissionPattern.kind === "time" ? "min(1040px, calc(100vw - 48px))" : "640px" }}
      maxH={{ md: "90dvh" }}
    >
      <Stack gap={4}>
        <Text textStyle="sm" color="gray.700" lineHeight="tall">
          {describeCustomRequirements(buildDayTemplateView(day).templateName)}
        </Text>
        {draft?.kind === "time" && (
          <>
            <StaffingBarEditor
              positions={positions}
              bars={draft.bars}
              onChange={(bars) => updateDraft({ kind: "time", bars })}
              range={range}
              limits={BAR_LIMITS}
              formPresentation="inline"
            />
            <Box pt={3} borderTopWidth="1px" borderColor="gray.200">
              <RequiredCountStrip positions={positions} bars={draft.bars} range={range} />
            </Box>
          </>
        )}
        {draft?.kind === "counts" && (
          <StaffingCountTable
            positions={positions}
            rows={countRows}
            counts={draft.counts}
            onChange={(rowId, positionId, count) => updateDraft(setDraftCount(draft, rowId, positionId, count))}
            max={SHIFT_DAY_TEMPLATE_REQUIRED_COUNT_MAX}
          />
        )}
        {error && (
          <Text role="alert" textStyle="sm" color="red.600">
            {error}
          </Text>
        )}
        <Flex align="center" columnGap={3} rowGap={1} wrap="wrap" pt={3} borderTopWidth="1px" borderColor="gray.200">
          <Text textStyle="xs" color="gray.600">
            毎週の人数を変えるには型を編集します
          </Text>
          {onOpenSetup && (
            <Button
              type="button"
              size="xs"
              variant="outline"
              minH={{ base: "44px", md: "28px" }}
              onClick={() => {
                // Dialogを重ねないよう、閉じてから設定ページへ移る。
                close();
                onOpenSetup();
              }}
            >
              シフト作成の設定を開く
            </Button>
          )}
        </Flex>
      </Stack>
    </Dialog>
  );
};

/** その日の型のメニューから開くDialog。シフト表に1つだけ置く。 */
export const DayStaffingDialogs = () => (
  <>
    <BulkApplyDialog />
    <CustomRequirementsDialog />
  </>
);
