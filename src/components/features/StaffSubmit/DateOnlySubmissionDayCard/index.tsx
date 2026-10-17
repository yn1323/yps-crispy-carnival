import { Box, Flex, Text } from "@chakra-ui/react";
import { formatDateWithWeekday } from "@/src/domains/shift/date";
import { DateNoteButton, DateNoteLine, DayToggleOverlay } from "../DateNote";
import { getDateColor } from "../timeOptions";
import type { DayEntry } from "../types";

type Props = {
  entry: DayEntry;
  onToggleWorking?: () => void;
  isShopClosed: boolean;
  isReadOnly?: boolean;
  note?: string;
  onEditNote?: () => void;
};

export function DateOnlySubmissionDayCard({
  entry,
  onToggleWorking,
  isShopClosed,
  isReadOnly = false,
  note,
  onEditNote,
}: Props) {
  const dateLabel = formatDateWithWeekday(entry.date);
  const dateColor = getDateColor(entry.date);
  const isToggleable = !isShopClosed && !isReadOnly && onToggleWorking !== undefined;
  const canEditNote = !isShopClosed && !isReadOnly && onEditNote !== undefined;

  return (
    <Box
      data-day-card={entry.date}
      w="full"
      bg={isShopClosed ? "gray.100" : entry.isWorking ? "teal.50" : "white"}
      borderRadius="lg"
      borderWidth={1}
      borderColor={entry.isWorking && !isShopClosed ? "teal.600" : "border.default"}
      overflow="hidden"
    >
      <Flex position="relative" w="full" minH="48px" px={4} align="center" gap={1.5}>
        {isToggleable && (
          <DayToggleOverlay
            ariaLabel={entry.isWorking ? `${dateLabel}を休みにする` : `${dateLabel}を出勤希望にする`}
            onClick={onToggleWorking}
            hoverBg={entry.isWorking ? "teal.50" : "gray.50"}
            activeBg={entry.isWorking ? "teal.100" : "gray.100"}
          />
        )}
        <Text position="relative" pointerEvents="none" fontSize="sm" fontWeight="medium" color={dateColor}>
          {dateLabel}
        </Text>
        {canEditNote && <DateNoteButton dateLabel={dateLabel} hasNote={Boolean(note)} onClick={onEditNote} />}
        <Box
          position="relative"
          pointerEvents="none"
          ml="auto"
          bg={isShopClosed ? "gray.100" : entry.isWorking ? "teal.100" : "gray.100"}
          px={2.5}
          py={0.5}
          borderRadius="full"
        >
          <Text
            fontSize="xs"
            fontWeight="semibold"
            color={isShopClosed ? "gray.500" : entry.isWorking ? "teal.700" : "fg.muted"}
          >
            {isShopClosed ? "定休日" : entry.isWorking ? "出勤希望" : "休み"}
          </Text>
        </Box>
      </Flex>
      {note && !isShopClosed && (
        <DateNoteLine dateLabel={dateLabel} note={note} onClick={canEditNote ? onEditNote : undefined} />
      )}
    </Box>
  );
}
