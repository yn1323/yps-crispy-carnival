import { Badge, Box, chakra, Field, Flex, Grid, HStack, Text, VisuallyHidden, VStack } from "@chakra-ui/react";
import { useAtomValue } from "jotai";
import { useId, useMemo, useRef, useState } from "react";
import { LuPlus, LuTrash2 } from "react-icons/lu";
import { Button, IconButton } from "@/src/components/ui/Button";
import { Dialog } from "@/src/components/ui/Dialog";
import type { SelectItemType } from "@/src/components/ui/Select";
import { Select } from "@/src/components/ui/Select";
import { formatDateWithWeekday } from "@/src/domains/shift/date";
import { resolveDefaultPosition } from "@/src/domains/shift/operations";
import { formatShiftClockTimeRange, generateShiftTimeOptions, timeToMinutes } from "@/src/domains/shift/time";
import type { PositionType, ShiftData, StaffType, TimeRange } from "@/src/domains/shift/types";
import { detailModeAtom, isPositionSelectableAtom, selectedPositionAtom } from "../../stores";
import { getEditableEndMinutes, getEditableStartMinutes } from "../../timelineGeometry";
import {
  buildSPShiftEditNewRow,
  buildSPShiftEditResult,
  findSPShiftEditErrors,
  getSPShiftEditBreakLabels,
  getSPShiftEditLayout,
  getSPShiftEditRows,
  type SPShiftEditErrors,
  type SPShiftEditRow,
} from "./script";

type ShiftEditSheetProps = {
  staff: StaffType;
  shift: ShiftData | undefined;
  positions: PositionType[];
  timeRange: TimeRange;
  selectedDate: string;
  isOpen: boolean;
  onOpenChange: (details: { open: boolean }) => void;
  onShiftUpdate: (updatedShift: ShiftData) => void;
  onShiftDelete: (staffId: string) => void;
  /** 休憩の編集を開く。くわしく表示で編集できる場合だけ渡す。呼ぶ側でこのシートを閉じる。 */
  onEditBreaks?: () => void;
};

export const generateTimeOptions = (timeRange: TimeRange) => {
  return generateShiftTimeOptions({
    startMinutes: getEditableStartMinutes(timeRange),
    endMinutes: getEditableEndMinutes(timeRange),
    stepMinutes: timeRange.unit,
  }) satisfies SelectItemType[];
};

const getStartOptions = (allOptions: SelectItemType[], endTime: string) =>
  endTime ? allOptions.filter((opt) => timeToMinutes(opt.value) < timeToMinutes(endTime)) : allOptions;

const getEndOptions = (allOptions: SelectItemType[], startTime: string) =>
  startTime ? allOptions.filter((opt) => timeToMinutes(opt.value) > timeToMinutes(startTime)) : allOptions;

const isSameRows = (a: readonly SPShiftEditRow[], b: readonly SPShiftEditRow[]): boolean =>
  a.length === b.length &&
  a.every((row, index) => {
    const other = b[index];
    return (
      row.key === other.key &&
      row.startTime === other.startTime &&
      row.endTime === other.endTime &&
      row.positionId === other.positionId
    );
  });

type RowPatch = Partial<Pick<SPShiftEditRow, "startTime" | "endTime" | "positionId">>;

export const ShiftEditSheet = ({
  staff,
  shift,
  positions,
  timeRange,
  selectedDate,
  isOpen,
  onOpenChange,
  onShiftUpdate,
  onShiftDelete,
  onEditBreaks,
}: ShiftEditSheetProps) => {
  const detailMode = useAtomValue(detailModeAtom);
  const isPositionSelectable = useAtomValue(isPositionSelectableAtom);
  const selectedPosition = useAtomValue(selectedPositionAtom);
  // 新しい行には、「入れるもの」で選んでいるポジションを使う。選んでいなければ既定のポジション。
  const newRowPositionId = (selectedPosition ?? resolveDefaultPosition(positions)).id;
  const newRowCountRef = useRef(0);
  const createRowKey = () => {
    newRowCountRef.current += 1;
    return `seg-${Date.now()}-${newRowCountRef.current}`;
  };

  const timeOptions = useMemo(() => generateTimeOptions(timeRange), [timeRange]);
  // 開いたときの勤務から入力を作る。開くたびに作り直すため、呼ぶ側は閉じたときにこのシートを外す。
  const [initialRows] = useState<SPShiftEditRow[]>(() =>
    getSPShiftEditRows(shift, { key: createRowKey(), positionId: newRowPositionId }),
  );
  const [rows, setRows] = useState(initialRows);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [hasAddedRow, setHasAddedRow] = useState(false);
  // 勤務が2件以上ある日と、行を足したあとは、シンプル表示でも複数行で編集する。
  const layout = getSPShiftEditLayout({ shift, detailMode, hasAddedRow });
  // 一度「変更する」を押したあとは、入力のたびに検証し直して、直った文言を消す。
  const errors = useMemo(() => (hasSubmitted ? findSPShiftEditErrors(rows) : null), [hasSubmitted, rows]);

  const dateLabel = formatDateWithWeekday(selectedDate);

  const requestTimes = shift?.requestedTimes ?? (shift?.requestedTime ? [shift.requestedTime] : []);
  // 提出済みで希望時間がない日は休み希望。未提出は希望自体がないため「なし」のまま。
  const requestLabel =
    requestTimes.length > 0
      ? `希望：${requestTimes.map((request) => formatShiftClockTimeRange(request.start, request.end)).join(" / ")}`
      : staff.isSubmitted
        ? "希望：休み"
        : "希望：なし";

  const currentShift: ShiftData = useMemo(
    () =>
      shift ?? {
        id: `shift-${staff.id}-${selectedDate}`,
        staffId: staff.id,
        staffName: staff.name,
        date: selectedDate,
        requestedTime: null,
        positions: [],
      },
    [selectedDate, shift, staff.id, staff.name],
  );
  const breakLabels = useMemo(() => getSPShiftEditBreakLabels(rows, shift?.breaks), [rows, shift?.breaks]);

  const close = () => onOpenChange({ open: false });

  const updateRow = (key: string, patch: RowPatch) => {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const handleAddRow = () => {
    setHasAddedRow(true);
    setRows((current) => [
      ...current,
      buildSPShiftEditNewRow({
        rows: current,
        key: createRowKey(),
        positionId: newRowPositionId,
        latestEndTime: timeOptions.at(-1)?.value,
      }),
    ]);
  };

  const handleClearAll = () => {
    onShiftDelete(staff.id);
    close();
  };

  /** 入力を検証し、通った場合だけその日の勤務を返す。 */
  const buildResult = () => {
    setHasSubmitted(true);
    if (findSPShiftEditErrors(rows)) return null;
    return buildSPShiftEditResult({ shift: currentShift, rows, positions });
  };

  // 確定時にstoreへ反映
  const handleConfirm = () => {
    const result = buildResult();
    if (!result) return;
    if (result.kind === "updated") onShiftUpdate(result.shift);
    else if (currentShift.positions.length > 0) onShiftDelete(staff.id);
    close();
  };

  // 休憩の編集は別のDialogに任せる。入力中の勤務時間を失わないよう、変えていれば先に反映する。
  const handleEditBreaks = () => {
    if (!isSameRows(rows, initialRows)) {
      const result = buildResult();
      if (result?.kind !== "updated") return;
      onShiftUpdate(result.shift);
    }
    onEditBreaks?.();
  };

  return (
    <Dialog
      title={`${staff.name}のシフト  ${dateLabel}`}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      onClose={close}
      onSubmit={handleConfirm}
      submitLabel="変更する"
    >
      <VStack gap={4} align="stretch">
        <Flex align="center" gap={2}>
          <Text fontSize="sm" color="gray.600">
            {requestLabel}
          </Text>
          {!staff.isSubmitted && (
            <Badge colorPalette="orange" size="sm">
              未提出
            </Badge>
          )}
        </Flex>

        {layout === "single" ? (
          <>
            <SingleRangeFields row={rows[0]} errors={errors} timeOptions={timeOptions} onChange={updateRow} />
            {/* 押すと複数行の編集へ切り替わる。押すまでは、開始と終了だけの従来の形を保つ。 */}
            <Flex>
              <AddRowButton onClick={handleAddRow} />
            </Flex>
          </>
        ) : (
          <MultipleRangeFields
            rows={rows}
            errors={errors}
            timeOptions={timeOptions}
            positions={isPositionSelectable ? positions : null}
            onChange={updateRow}
            onDelete={(key) => setRows((current) => current.filter((row) => row.key !== key))}
            onAdd={handleAddRow}
          />
        )}

        {/* 休憩（くわしく表示で、勤務時間が入っているときだけ） */}
        {detailMode && onEditBreaks && breakLabels !== null && (
          <Flex align="center" justify="space-between" gap={2} pt={3} borderTopWidth="1px" borderColor="gray.100">
            <Text fontSize="sm" color="gray.700">
              {breakLabels.length > 0 ? `休憩：${breakLabels.join(" / ")}` : "休憩：なし"}
            </Text>
            <Button type="button" size="sm" variant="outline" minH="44px" flexShrink={0} onClick={handleEditBreaks}>
              休憩を変更
            </Button>
          </Flex>
        )}

        {layout === "single" && currentShift.positions.length > 0 && (
          <Flex justify="flex-end" align="center" gap={1}>
            <Text fontSize="xs" color="gray.500">
              勤務時間を削除
            </Text>
            <IconButton
              aria-label="勤務時間を削除"
              size="xs"
              variant="ghost"
              colorPalette="red"
              onClick={handleClearAll}
            >
              <LuTrash2 />
            </IconButton>
          </Flex>
        )}
      </VStack>
    </Dialog>
  );
};

const AddRowButton = ({ onClick }: { onClick: () => void }) => (
  <Button type="button" size="sm" variant="outline" minH="44px" onClick={onClick}>
    <LuPlus aria-hidden />
    勤務時間を追加
  </Button>
);

type RangeFieldsProps = {
  errors: SPShiftEditErrors | null;
  timeOptions: SelectItemType[];
  onChange: (key: string, patch: RowPatch) => void;
};

/** 開始と終了だけを1組で編集する。シンプル表示で、勤務が0件または1件の日に使う。 */
const SingleRangeFields = ({ row, errors, timeOptions, onChange }: RangeFieldsProps & { row: SPShiftEditRow }) => {
  const workTimeLabelId = useId();
  const rowErrors = errors?.rows[row.key];

  return (
    <VStack role="group" aria-labelledby={workTimeLabelId} gap={1.5} align="stretch">
      <Text id={workTimeLabelId} textStyle="sm" fontWeight="medium" color="gray.700">
        勤務時間
      </Text>
      <HStack gap={2} align="start">
        <Field.Root invalid={!!rowErrors?.startTime}>
          <Field.Label>
            <VisuallyHidden>開始時間</VisuallyHidden>
          </Field.Label>
          <Select
            items={getStartOptions(timeOptions, row.endTime)}
            value={row.startTime}
            onChange={(value) => onChange(row.key, { startTime: value })}
            size="sm"
            usePortal={false}
            invalid={!!rowErrors?.startTime}
          />
          {rowErrors?.startTime && <Field.ErrorText>{rowErrors.startTime}</Field.ErrorText>}
        </Field.Root>
        <Text fontSize="sm" color="gray.400" pt={2}>
          ~
        </Text>
        <Field.Root invalid={!!rowErrors?.endTime}>
          <Field.Label>
            <VisuallyHidden>終了時間</VisuallyHidden>
          </Field.Label>
          <Select
            items={getEndOptions(timeOptions, row.startTime)}
            value={row.endTime}
            onChange={(value) => onChange(row.key, { endTime: value })}
            size="sm"
            usePortal={false}
            invalid={!!rowErrors?.endTime}
          />
          {rowErrors?.endTime && <Field.ErrorText>{rowErrors.endTime}</Field.ErrorText>}
        </Field.Root>
      </HStack>
    </VStack>
  );
};

/** 1日の勤務を複数行で編集する。ポジションを選び分けられる場合は、行ごとにポジションを選ぶ。 */
const MultipleRangeFields = ({
  rows,
  errors,
  timeOptions,
  positions,
  onChange,
  onDelete,
  onAdd,
}: RangeFieldsProps & {
  rows: SPShiftEditRow[];
  /** 行ごとに選べるポジション。選び分けない場合はnull。 */
  positions: PositionType[] | null;
  onDelete: (key: string) => void;
  onAdd: () => void;
}) => {
  const labelIdPrefix = useId();

  return (
    <VStack gap={3} align="stretch">
      {rows.length === 0 && (
        <Text fontSize="sm" color="gray.600">
          勤務時間は入っていません。
        </Text>
      )}
      {rows.map((row, index) => {
        const rowLabel = `勤務時間${index + 1}`;
        const rowLabelId = `${labelIdPrefix}-${row.key}`;
        const rowErrors = errors?.rows[row.key];
        return (
          <Grid
            key={row.key}
            role="group"
            aria-labelledby={rowLabelId}
            templateColumns="minmax(0, 1fr) auto"
            columnGap={2}
            rowGap={2}
            alignItems="center"
            px={3}
            pb={3}
            borderWidth="1px"
            borderColor="gray.200"
            borderRadius="md"
          >
            <Text id={rowLabelId} gridRow={1} gridColumn={1} textStyle="sm" fontWeight="medium" color="gray.700">
              {rowLabel}
            </Text>
            <HStack gridRow={2} gridColumn="1 / -1" gap={2} align="start">
              <Field.Root invalid={!!rowErrors?.startTime} flex={1} minW={0}>
                <Field.Label>
                  <VisuallyHidden>{rowLabel}の開始時間</VisuallyHidden>
                </Field.Label>
                <Select
                  items={getStartOptions(timeOptions, row.endTime)}
                  value={row.startTime}
                  onChange={(value) => onChange(row.key, { startTime: value })}
                  placeholder="開始"
                  size="lg"
                  usePortal={false}
                  invalid={!!rowErrors?.startTime}
                />
                {rowErrors?.startTime && <Field.ErrorText>{rowErrors.startTime}</Field.ErrorText>}
              </Field.Root>
              <Text fontSize="sm" color="gray.400" pt={3}>
                ~
              </Text>
              <Field.Root invalid={!!rowErrors?.endTime} flex={1} minW={0}>
                <Field.Label>
                  <VisuallyHidden>{rowLabel}の終了時間</VisuallyHidden>
                </Field.Label>
                <Select
                  items={getEndOptions(timeOptions, row.startTime)}
                  value={row.endTime}
                  onChange={(value) => onChange(row.key, { endTime: value })}
                  placeholder="終了"
                  size="lg"
                  usePortal={false}
                  invalid={!!rowErrors?.endTime}
                />
                {rowErrors?.endTime && <Field.ErrorText>{rowErrors.endTime}</Field.ErrorText>}
              </Field.Root>
            </HStack>
            {positions && (
              <Flex
                role="radiogroup"
                aria-label={`${rowLabel}のポジション`}
                gridRow={3}
                gridColumn="1 / -1"
                gap={2}
                flexWrap="wrap"
                mt={1}
              >
                {positions.map((position) => {
                  const checked = position.id === row.positionId;
                  return (
                    <chakra.button
                      key={position.id}
                      type="button"
                      role="radio"
                      aria-checked={checked}
                      onClick={() => onChange(row.key, { positionId: position.id })}
                      display="inline-flex"
                      alignItems="center"
                      gap="6px"
                      h="36px"
                      px={3}
                      borderRadius="full"
                      borderWidth="1px"
                      textStyle="sm"
                      fontWeight={600}
                      cursor="pointer"
                      position="relative"
                      color={checked ? "white" : "gray.700"}
                      borderColor={checked ? "transparent" : "gray.300"}
                      // 見た目は小さく保ち、押せる範囲だけを高さ44pxまで広げる。
                      _after={{ content: '""', position: "absolute", insetX: 0, insetY: "-4px" }}
                      _focusVisible={{ outline: "2px solid", outlineColor: "teal.600", outlineOffset: "2px" }}
                      style={{ background: checked ? position.color : "#ffffff" }}
                    >
                      <Box
                        as="span"
                        boxSize="10px"
                        borderRadius="full"
                        flexShrink={0}
                        style={{ background: checked ? "#ffffff" : position.color }}
                        aria-hidden
                      />
                      {position.name}
                    </chakra.button>
                  );
                })}
              </Flex>
            )}
            {/*
              時刻の欄を横いっぱいに使えるよう、削除は見出しの行の右端に置く。
              シートを開いたときの最初のフォーカスが削除に当たらないよう、並びの最後に書く。
            */}
            <IconButton
              aria-label={`${rowLabel}を削除`}
              gridRow={1}
              gridColumn={2}
              size="sm"
              variant="ghost"
              colorPalette="red"
              minW="44px"
              h="44px"
              mr="-8px"
              onClick={() => onDelete(row.key)}
            >
              <LuTrash2 />
            </IconButton>
          </Grid>
        );
      })}
      {errors?.overlap && (
        <Text role="alert" fontSize="sm" color="red.600">
          {errors.overlap}
        </Text>
      )}
      <Flex>
        <AddRowButton onClick={onAdd} />
      </Flex>
    </VStack>
  );
};
