import { Field, Flex, HStack, Text, VisuallyHidden, VStack } from "@chakra-ui/react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useEffect, useMemo, useState } from "react";
import { LuPlus, LuTrash2 } from "react-icons/lu";
import { SHIFT_ASSIGNMENT_BREAK_LIMIT } from "@/convex/constants";
import { Button, IconButton } from "@/src/components/ui/Button";
import { Dialog } from "@/src/components/ui/Dialog";
import { Select, type SelectItemType } from "@/src/components/ui/Select";
import { BREAK_TIME_UNIT_MINUTES } from "@/src/domains/shift/breaks";
import { formatDateWithWeekday } from "@/src/domains/shift/date";
import { isCanonicalWorkPosition } from "@/src/domains/shift/positions";
import {
  formatShiftClockTimeRange,
  generateShiftTimeOptions,
  minutesToTime,
  timeToMinutes,
} from "@/src/domains/shift/time";
import type { ShiftData, ShiftTimeRange } from "@/src/domains/shift/types";
import { breakEditorTargetAtom, setShiftBreaksAtom, shiftConfigAtom, shiftsAtom } from "./stores";

const DAY_START_MINUTES = 0;
const DAY_END_MINUTES = 24 * 60;
const DEFAULT_BREAK_MINUTES = 60;

type BreakRow = { key: number; start: string; end: string };

/** 休憩を入れられる時刻の範囲。時刻を持つ勤務は勤務時間の内側、日付選択は1日のどこでも入れられる。 */
export const getBreakEditorRange = (
  shift: Pick<ShiftData, "positions">,
  isDateOnly: boolean,
): { startMinutes: number; endMinutes: number } | null => {
  const work = shift.positions.filter(isCanonicalWorkPosition);
  if (work.length === 0) return null;
  if (isDateOnly) return { startMinutes: DAY_START_MINUTES, endMinutes: DAY_END_MINUTES };
  return {
    startMinutes: Math.min(...work.map((position) => timeToMinutes(position.start))),
    endMinutes: Math.max(...work.map((position) => timeToMinutes(position.end))),
  };
};

/** 休憩の入力を検証し、最初に見つけた違反の文言を返す。違反がなければnullを返す。 */
export const findBreakEditorError = (
  rows: ReadonlyArray<Pick<BreakRow, "start" | "end">>,
  shift: Pick<ShiftData, "positions">,
  isDateOnly: boolean,
): string | null => {
  const ranges = rows.map((row) => ({ start: timeToMinutes(row.start), end: timeToMinutes(row.end) }));
  if (
    ranges.some((range) => !Number.isFinite(range.start) || !Number.isFinite(range.end) || range.start >= range.end)
  ) {
    return "休憩の終了時間は開始時間より後にしてください";
  }
  const sorted = ranges.slice().sort((a, b) => a.start - b.start);
  if (sorted.some((range, index) => index > 0 && range.start < sorted[index - 1].end)) {
    return "休憩の時間帯が重なっています";
  }
  if (isDateOnly) return null;
  const segments = shift.positions
    .filter(isCanonicalWorkPosition)
    .map((position) => ({ start: timeToMinutes(position.start), end: timeToMinutes(position.end) }))
    .sort((a, b) => a.start - b.start || a.end - b.end);
  // 勤務区間をまるごと覆う休憩は、その勤務がないのと同じになるため受け付けない。
  const coversWholeSegment = ranges.some((range) =>
    segments.some((segment) => range.start <= segment.start && range.end >= segment.end),
  );
  if (coversWholeSegment) return "休憩は勤務時間の一部にしてください";
  // ポジションの違う勤務が隣り合う日は、境目をまたぐ休憩も入れられる。隣り合う勤務をひと続きとして確かめる。
  const work: Array<{ start: number; end: number }> = [];
  for (const segment of segments) {
    const previous = work.at(-1);
    if (previous && segment.start <= previous.end) {
      previous.end = Math.max(previous.end, segment.end);
      continue;
    }
    work.push({ ...segment });
  }
  const isInsideWork = ranges.every((range) =>
    work.some((segment) => range.start >= segment.start && range.end <= segment.end),
  );
  return isInsideWork ? null : "休憩は勤務時間内にしてください";
};

const buildNewBreak = (range: { startMinutes: number; endMinutes: number }): ShiftTimeRange => {
  const length = Math.min(
    DEFAULT_BREAK_MINUTES,
    Math.max(BREAK_TIME_UNIT_MINUTES, range.endMinutes - range.startMinutes),
  );
  const centered = range.startMinutes + (range.endMinutes - range.startMinutes - length) / 2;
  const start = Math.round(centered / BREAK_TIME_UNIT_MINUTES) * BREAK_TIME_UNIT_MINUTES;
  return { start: minutesToTime(start), end: minutesToTime(start + length) };
};

/** 選んだ日の休憩を編集するDialog。「入れるもの」で休憩を選び、勤務を押すと開く。 */
export const BreakEditorDialog = () => {
  const [target, setTarget] = useAtom(breakEditorTargetAtom);
  const config = useAtomValue(shiftConfigAtom);
  const shifts = useAtomValue(shiftsAtom);
  const setShiftBreaks = useSetAtom(setShiftBreaksAtom);
  const [rows, setRows] = useState<BreakRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const shift = useMemo(
    () => (target ? shifts.find((item) => item.staffId === target.staffId && item.date === target.date) : undefined),
    [shifts, target],
  );
  const staff = target ? config.staffs.find((item) => item.id === target.staffId) : undefined;
  const isDateOnly = config.submissionPattern.kind === "dateOnly";
  const range = useMemo(() => (shift ? getBreakEditorRange(shift, isDateOnly) : null), [shift, isDateOnly]);

  // 開くたびに、その日の休憩から入力を作り直す。
  // biome-ignore lint/correctness/useExhaustiveDependencies: 編集中に勤務が再描画されても入力を保つため、対象の日が変わったときだけ初期化する。
  useEffect(() => {
    setRows((shift?.breaks ?? []).map((item, index) => ({ key: index, start: item.start, end: item.end })));
    setError(null);
  }, [target]);

  const timeOptions = useMemo<SelectItemType[]>(
    () =>
      range
        ? generateShiftTimeOptions({
            startMinutes: range.startMinutes,
            endMinutes: range.endMinutes,
            stepMinutes: BREAK_TIME_UNIT_MINUTES,
          })
        : [],
    [range],
  );

  const close = () => setTarget(null);
  const isOpen = target !== null && shift !== undefined && staff !== undefined && range !== null;
  if (!isOpen || !target || !shift || !staff || !range) return null;

  const workLabel = isDateOnly
    ? "出勤"
    : shift.positions
        .filter(isCanonicalWorkPosition)
        .map((position) => formatShiftClockTimeRange(position.start, position.end))
        .join(" / ");
  const canAdd = rows.length < SHIFT_ASSIGNMENT_BREAK_LIMIT;

  const updateRow = (key: number, patch: Partial<Pick<BreakRow, "start" | "end">>) => {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
    setError(null);
  };

  const handleSubmit = () => {
    const nextError = findBreakEditorError(rows, shift, isDateOnly);
    if (nextError) {
      setError(nextError);
      return;
    }
    setShiftBreaks({
      staffId: target.staffId,
      date: target.date,
      breaks: rows.map((row) => ({ start: row.start, end: row.end })),
    });
    close();
  };

  return (
    <Dialog
      title={`${staff.name}の休憩  ${formatDateWithWeekday(target.date)}`}
      isOpen
      onOpenChange={(details) => {
        if (!details.open) close();
      }}
      onClose={close}
      onSubmit={handleSubmit}
      submitLabel="変更する"
    >
      <VStack gap={4} align="stretch">
        <Text fontSize="sm" color="gray.600">
          勤務：{workLabel}
        </Text>
        {rows.length === 0 ? (
          <Text fontSize="sm" color="gray.600">
            休憩は入っていません。
          </Text>
        ) : (
          <VStack gap={3} align="stretch">
            {rows.map((row, index) => (
              <HStack key={row.key} gap={2} align="center" role="group" aria-label={`休憩${index + 1}`}>
                <Field.Root flex={1}>
                  <Field.Label>
                    <VisuallyHidden>休憩{index + 1}の開始時間</VisuallyHidden>
                  </Field.Label>
                  <Select
                    items={timeOptions}
                    value={row.start}
                    onChange={(value) => updateRow(row.key, { start: value })}
                    size="sm"
                    usePortal={false}
                  />
                </Field.Root>
                <Text fontSize="sm" color="gray.400">
                  ~
                </Text>
                <Field.Root flex={1}>
                  <Field.Label>
                    <VisuallyHidden>休憩{index + 1}の終了時間</VisuallyHidden>
                  </Field.Label>
                  <Select
                    items={timeOptions}
                    value={row.end}
                    onChange={(value) => updateRow(row.key, { end: value })}
                    size="sm"
                    usePortal={false}
                  />
                </Field.Root>
                <IconButton
                  aria-label={`休憩${index + 1}を削除`}
                  size="sm"
                  variant="ghost"
                  colorPalette="red"
                  minW="44px"
                  h="44px"
                  onClick={() => {
                    setRows((current) => current.filter((item) => item.key !== row.key));
                    setError(null);
                  }}
                >
                  <LuTrash2 />
                </IconButton>
              </HStack>
            ))}
          </VStack>
        )}
        {error && (
          <Text role="alert" fontSize="sm" color="red.600">
            {error}
          </Text>
        )}
        <Flex direction="column" gap={1} align="flex-start">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!canAdd}
            onClick={() => {
              const next = buildNewBreak(range);
              setRows((current) => [
                ...current,
                { key: Math.max(-1, ...current.map((row) => row.key)) + 1, start: next.start, end: next.end },
              ]);
              setError(null);
            }}
          >
            <LuPlus aria-hidden />
            休憩を追加
          </Button>
          {!canAdd && (
            <Text fontSize="xs" color="gray.600">
              休憩は{SHIFT_ASSIGNMENT_BREAK_LIMIT}件まで入れられます
            </Text>
          )}
        </Flex>
      </VStack>
    </Dialog>
  );
};
