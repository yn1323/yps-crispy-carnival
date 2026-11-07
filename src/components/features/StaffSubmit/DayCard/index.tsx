import { Box, Flex, Text } from "@chakra-ui/react";
import { LuX } from "react-icons/lu";
import { IconButton } from "@/src/components/ui/Button";
import { Select, type SelectItemType } from "@/src/components/ui/Select";
import { formatDateWithWeekday } from "@/src/domains/shift/date";
import { formatShiftClockTime } from "@/src/domains/shift/time";
import { DateNoteButton, DateNoteLine, DayToggleOverlay } from "../DateNote";
import { getDateColor } from "../timeOptions";
import type { DayEntry } from "../types";

type Props = {
  entry: DayEntry;
  timeOptions: SelectItemType[];
  onToggleWorking: () => void;
  onTimeChange: (field: "startTime" | "endTime", value: string) => void;
  onClear: () => void;
  isReadOnly?: boolean;
  isShopClosed?: boolean;
  error?: string;
  note?: string;
  onEditNote?: () => void;
};

export type { DayEntry } from "../types";

/** 日付の幅を最も長い日付にそろえ、出勤・休みや日付の違いでメモボタンの縦位置をずらさない。 */
const EditableDateLabel = ({ label, color }: { label: string; color: string }) => (
  <Box
    position="relative"
    pointerEvents="none"
    display="grid"
    flexShrink={0}
    fontSize="sm"
    fontWeight="medium"
    fontVariantNumeric="tabular-nums"
  >
    <Text gridArea="1 / 1" color={color}>
      {label}
    </Text>
    <Text gridArea="1 / 1" visibility="hidden" aria-hidden>
      00/00(月)
    </Text>
  </Box>
);

export const DayCard = ({
  entry,
  timeOptions,
  onToggleWorking,
  onTimeChange,
  onClear,
  isReadOnly = false,
  isShopClosed = false,
  error,
  note,
  onEditNote,
}: Props) => {
  const dateColor = getDateColor(entry.date);
  const dateLabel = formatDateWithWeekday(entry.date);
  const canEditNote = !isReadOnly && !isShopClosed && onEditNote !== undefined;
  const noteLine = note && !isShopClosed && (
    <DateNoteLine dateLabel={dateLabel} note={note} onClick={canEditNote ? onEditNote : undefined} />
  );
  const noteButton = canEditNote && (
    <DateNoteButton dateLabel={dateLabel} hasNote={Boolean(note)} onClick={onEditNote} />
  );

  if (isReadOnly) {
    return (
      <Box
        data-day-card={entry.date}
        w="full"
        bg={isShopClosed ? "gray.100" : "white"}
        borderRadius="lg"
        borderWidth={1}
        borderColor="border.default"
        overflow="hidden"
      >
        <Flex h="48px" px={4} align="center" justify="space-between">
          <Text fontSize="sm" fontWeight="medium" color={dateColor}>
            {dateLabel}
          </Text>
          {isShopClosed ? (
            <Box bg="gray.100" px={2.5} py={0.5} borderRadius="full">
              <Text fontSize="xs" fontWeight="bold" color="gray.500">
                定休日
              </Text>
            </Box>
          ) : entry.isWorking ? (
            <Text fontSize="sm" fontWeight="medium" color="teal.600">
              {formatShiftClockTime(entry.startTime)} 〜 {formatShiftClockTime(entry.endTime)}
            </Text>
          ) : (
            <Text fontSize="xs" fontWeight="medium" color="fg.muted">
              休み
            </Text>
          )}
        </Flex>
        {noteLine}
      </Box>
    );
  }

  if (isShopClosed) {
    return (
      <Flex
        data-day-card={entry.date}
        w="full"
        h="48px"
        pl={3}
        pr={4}
        align="center"
        justify="space-between"
        bg="gray.100"
        borderRadius="lg"
        borderWidth={1}
        borderColor="border.default"
      >
        <EditableDateLabel label={dateLabel} color={dateColor} />
        <Box bg="gray.100" px={2.5} py={0.5} borderRadius="full">
          <Text fontSize="xs" fontWeight="bold" color="gray.500">
            定休日
          </Text>
        </Box>
      </Flex>
    );
  }

  if (!entry.isWorking) {
    return (
      <Box
        data-day-card={entry.date}
        w="full"
        bg="white"
        borderRadius="lg"
        borderWidth={1}
        borderColor="border.default"
        overflow="hidden"
      >
        {/* 左の余白と間隔は、幅360pxで余裕のない出勤行にそろえる。 */}
        <Flex position="relative" h="48px" pl={3} pr={4} align="center" gap={1}>
          <DayToggleOverlay
            ariaLabel={`${dateLabel}を出勤希望にする`}
            onClick={onToggleWorking}
            hoverBg="gray.50"
            activeBg="gray.100"
          />
          <EditableDateLabel label={dateLabel} color={dateColor} />
          {noteButton}
          <Box position="relative" pointerEvents="none" ml="auto" bg="gray.100" px={2.5} py={0.5} borderRadius="full">
            <Text fontSize="xs" fontWeight="medium" color="fg.muted">
              休み
            </Text>
          </Box>
        </Flex>
        {noteLine}
      </Box>
    );
  }

  return (
    <Box w="full">
      <Box
        data-day-card={entry.date}
        bg={error ? "#fff5f5" : "#f0fdfa"}
        borderRadius="lg"
        borderWidth={1}
        borderColor={error ? "red.500" : "teal.600"}
        overflow="hidden"
      >
        <Flex w="full" h="48px" px={2} pl={3} align="center" gap={1}>
          <EditableDateLabel label={dateLabel} color={dateColor} />
          {noteButton}
          <Box flex={1} />
          <Select
            items={timeOptions}
            value={entry.startTime}
            onChange={(v) => onTimeChange("startTime", v)}
            size="xs"
            w="76px"
          />
          <Text fontSize="xs" color="fg.muted">
            〜
          </Text>
          <Select
            items={timeOptions}
            value={entry.endTime}
            onChange={(v) => onTimeChange("endTime", v)}
            size="xs"
            w="76px"
          />
          <IconButton
            aria-label="休みに戻す"
            size="xs"
            variant="outline"
            borderRadius="full"
            onClick={onClear}
            colorPalette="gray"
            bg="white"
            flexShrink={0}
          >
            <LuX />
          </IconButton>
        </Flex>
        {noteLine}
      </Box>
      {error && (
        <Text fontSize="xs" color="red.500" mt={1} pl={1}>
          {error}
        </Text>
      )}
    </Box>
  );
};
