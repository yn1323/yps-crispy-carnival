import { Box, Flex, HStack, Stack, Text } from "@chakra-ui/react";
import { LuX } from "react-icons/lu";
import type { ShiftTypeOption } from "@/convex/shop/schemas";
import { Button, IconButton } from "@/src/components/ui/Button";
import { formatDateWithWeekday } from "@/src/domains/shift/date";
import { formatShiftClockTimeRange } from "@/src/domains/shift/time";
import { DateNoteButton, DateNoteLine, DayToggleOverlay } from "../DateNote";
import { getSelectedShiftTypeOptionIds } from "../dayEntryState";
import { getDateColor } from "../timeOptions";
import type { DayEntry } from "../types";

type Props = {
  entry: DayEntry;
  options: ShiftTypeOption[];
  onToggleWorking?: () => void;
  onSelect?: (optionId: string) => void;
  onClear?: () => void;
  isShopClosed: boolean;
  isReadOnly?: boolean;
  note?: string;
  onEditNote?: () => void;
};

export function ShiftTypeSubmissionDayCard({
  entry,
  options,
  onToggleWorking,
  onSelect,
  onClear,
  isShopClosed,
  isReadOnly = false,
  note,
  onEditNote,
}: Props) {
  const dateLabel = formatDateWithWeekday(entry.date);
  const dateColor = getDateColor(entry.date);
  const selectedOptionIds = getSelectedShiftTypeOptionIds(entry);
  const selectedOptionIdSet = new Set(selectedOptionIds);
  const visibleOptions =
    isReadOnly && entry.isWorking ? options.filter((option) => selectedOptionIdSet.has(option.id)) : options;
  const canEditNote = !isReadOnly && !isShopClosed && onEditNote !== undefined;
  const noteButton = canEditNote && (
    <DateNoteButton dateLabel={dateLabel} hasNote={Boolean(note)} onClick={onEditNote} />
  );
  const noteLine = note && (
    <DateNoteLine dateLabel={dateLabel} note={note} onClick={canEditNote ? onEditNote : undefined} />
  );

  if (isShopClosed) {
    return (
      <Flex
        data-day-card={entry.date}
        w="full"
        h="48px"
        px={4}
        align="center"
        justify="space-between"
        bg="gray.100"
        borderRadius="lg"
        borderWidth={1}
        borderColor="border.default"
      >
        <Text fontSize="sm" fontWeight="medium" color={dateColor}>
          {dateLabel}
        </Text>
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
        <Flex position="relative" w="full" minH="48px" px={4} align="center" gap={1.5}>
          {!isReadOnly && onToggleWorking && (
            <DayToggleOverlay
              ariaLabel={`${dateLabel}を出勤希望にする`}
              onClick={onToggleWorking}
              hoverBg="gray.50"
              activeBg="gray.100"
            />
          )}
          <Text position="relative" pointerEvents="none" fontSize="sm" fontWeight="medium" color={dateColor}>
            {dateLabel}
          </Text>
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
    <Box
      data-day-card={entry.date}
      w="full"
      bg="white"
      borderRadius="lg"
      borderWidth={1}
      borderColor={entry.isWorking ? "teal.500" : "border.default"}
      overflow="hidden"
    >
      <Flex w="full" minH="64px" px={3} py={2} gap={3} align="center">
        <Flex minW="68px" h="36px" align="center" gap={1.5} flexShrink={0}>
          <Text fontSize="sm" fontWeight="medium" color={dateColor}>
            {dateLabel}
          </Text>
          {noteButton}
        </Flex>

        <HStack gap={2} wrap="wrap" flex={1} align="center">
          {visibleOptions.map((option) => {
            const isSelected = selectedOptionIdSet.has(option.id);
            return (
              <Button
                key={option.id}
                type="button"
                size="sm"
                h="36px"
                minW="88px"
                px={3}
                py={1}
                variant="outline"
                colorPalette={isSelected ? "teal" : "gray"}
                bg={isSelected ? "teal.600" : "white"}
                borderColor={isSelected ? "teal.600" : "border.default"}
                color={isSelected ? "white" : undefined}
                disabled={isReadOnly}
                aria-pressed={isSelected}
                aria-label={`${dateLabel}の${option.name} ${isSelected ? "選択済み" : "未選択"}`}
                onClick={() => onSelect?.(option.id)}
              >
                <Stack gap={0} align="flex-start">
                  <Text fontSize="xs" fontWeight="semibold" lineHeight={1.1}>
                    {option.name}
                  </Text>
                  <Text fontSize="2xs" lineHeight={1.1} color={isSelected ? "whiteAlpha.900" : "fg.muted"}>
                    {formatShiftClockTimeRange(option.startTime, option.endTime)}
                  </Text>
                </Stack>
              </Button>
            );
          })}
        </HStack>

        {entry.isWorking && !isReadOnly && (
          <IconButton
            aria-label={`${dateLabel}を休みに戻す`}
            size="sm"
            variant="outline"
            borderRadius="full"
            onClick={onClear}
            colorPalette="gray"
            bg="white"
            flexShrink={0}
          >
            <LuX />
          </IconButton>
        )}
      </Flex>
      {noteLine}
    </Box>
  );
}
