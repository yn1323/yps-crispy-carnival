import { Box, Flex, Icon, Stack, Text, VisuallyHidden } from "@chakra-ui/react";
import { createContext, type ReactNode, useContext, useMemo } from "react";
import { LuMessageSquare } from "react-icons/lu";
import { Tooltip } from "@/src/components/ui/tooltip";
import { formatDateWithWeekday } from "@/src/domains/shift/date";

export type ShiftDateNote = { staffId: string; date: string; note: string };

type ShiftDateNotesValue = {
  /** 募集内にメモが1件以上ある。メモ列や欄の表示は日付ごとでなく募集単位で決める。 */
  hasNotes: boolean;
  getNote: (staffId: string, date: string) => string | undefined;
  countByDate: ReadonlyMap<string, number>;
};

const EMPTY_VALUE: ShiftDateNotesValue = { hasNotes: false, getNote: () => undefined, countByDate: new Map() };
const ShiftDateNotesContext = createContext<ShiftDateNotesValue>(EMPTY_VALUE);

const noteKey = (staffId: string, date: string) => `${staffId}:${date}`;

/** スタッフが提出した日付メモを、シフト表の割当状態とは別に読み取り専用で配る。 */
export function ShiftDateNotesProvider({
  notes,
  children,
}: {
  notes: readonly ShiftDateNote[] | undefined;
  children: ReactNode;
}) {
  const value = useMemo<ShiftDateNotesValue>(() => {
    if (!notes || notes.length === 0) return EMPTY_VALUE;
    const noteByKey = new Map(notes.map((entry) => [noteKey(entry.staffId, entry.date), entry.note]));
    const countByDate = new Map<string, number>();
    for (const entry of notes) countByDate.set(entry.date, (countByDate.get(entry.date) ?? 0) + 1);
    return {
      hasNotes: true,
      getNote: (staffId, date) => noteByKey.get(noteKey(staffId, date)),
      countByDate,
    };
  }, [notes]);

  return <ShiftDateNotesContext.Provider value={value}>{children}</ShiftDateNotesContext.Provider>;
}

export const useShiftDateNotes = () => useContext(ShiftDateNotesContext);

const ShiftDateNoteTooltipContent = ({ staffName, date, note }: { staffName: string; date: string; note: string }) => (
  <Stack gap={1}>
    <Text textStyle="xs" fontWeight={700}>
      {staffName}さんのメモ・{formatDateWithWeekday(date)}
    </Text>
    <Text textStyle="xs" lineHeight={1.6} data-clarity-mask="true">
      {note}
    </Text>
  </Stack>
);

/** メモの全文を、ホバーとキーボードfocusで表示する。 */
export const ShiftDateNoteTooltip = ({
  staffName,
  date,
  note,
  children,
}: {
  staffName: string;
  date: string;
  note: string;
  children: ReactNode;
}) => (
  <Tooltip
    showArrow
    openDelay={80}
    contentProps={{ maxW: "280px", bg: "gray.800", color: "white" }}
    content={<ShiftDateNoteTooltipContent staffName={staffName} date={date} note={note} />}
  >
    {children}
  </Tooltip>
);

/**
 * PCの行の高さを変えずに置くメモ本文。指定行数を超える分は省略し、全文はツールチップで読む。
 * 文字12px・行の高さ16pxなので、2行でも40pxの行に収まる。
 */
export const ShiftDateNoteText = ({
  staffName,
  date,
  note,
  lineClamp,
}: {
  staffName: string;
  date: string;
  note: string;
  lineClamp: number;
}) => (
  <ShiftDateNoteTooltip staffName={staffName} date={date} note={note}>
    <Text
      tabIndex={0}
      fontSize="xs"
      lineHeight="16px"
      color="gray.700"
      lineClamp={lineClamp}
      overflowWrap="anywhere"
      cursor="default"
      borderRadius="sm"
      _focusVisible={{ outline: "2px solid", outlineColor: "teal.600", outlineOffset: "1px" }}
      data-clarity-mask="true"
    >
      {note}
    </Text>
  </ShiftDateNoteTooltip>
);

/** SPのカード最下段に置くメモ本文。行数を制限せず全文を折り返す。 */
export const ShiftDateNoteBlock = ({ note }: { note: string }) => (
  <Flex
    mt={2}
    gap={1.5}
    align="flex-start"
    px={2}
    py={1.5}
    bg="gray.50"
    borderWidth="1px"
    borderColor="gray.100"
    borderRadius="md"
    textAlign="left"
  >
    <Icon boxSize={3.5} mt="3px" color="gray.500" flexShrink={0}>
      <LuMessageSquare aria-hidden />
    </Icon>
    <Text textStyle="xs" lineHeight={1.6} color="gray.700" minW={0} overflowWrap="anywhere">
      <VisuallyHidden>メモ：</VisuallyHidden>
      <span data-clarity-mask="true">{note}</span>
    </Text>
  </Flex>
);

/** 週表のセル右上に置く、メモがあることを示す三角の印。 */
export const ShiftDateNoteCornerMark = ({ onFilled }: { onFilled: boolean }) => (
  <Box
    aria-hidden
    position="absolute"
    top={0}
    right={0}
    w={0}
    h={0}
    borderStyle="solid"
    borderTopWidth="9px"
    borderLeftWidth="9px"
    borderTopColor={onFilled ? "white" : "gray.600"}
    borderLeftColor="transparent"
    borderTopRightRadius="md"
    pointerEvents="none"
  />
);
