import { Box, Flex, Icon, Stack, Text } from "@chakra-ui/react";
import { useState } from "react";
import { LuChevronDown, LuChevronUp, LuMessageSquare } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";
import { formatDateWithWeekday } from "@/src/domains/shift/date";
import type { DateOnlySortDateNote } from "./script";

const COLLAPSED_NOTE_LIMIT = 5;

type Props = {
  sortDate: string;
  notes: DateOnlySortDateNote[];
};

/**
 * 並べ替え中の日のメモを、表の上にまとめて全文表示する。
 * 週表のセルは幅が狭く、PCの行の高さも変えないため、本文はこの欄で読む。
 */
export const DateNotesPanel = ({ sortDate, notes }: Props) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [showsAll, setShowsAll] = useState(false);
  const dateLabel = formatDateWithWeekday(sortDate);
  const visibleNotes = showsAll ? notes : notes.slice(0, COLLAPSED_NOTE_LIMIT);
  const hiddenCount = notes.length - visibleNotes.length;

  return (
    <Box px={4} py={2.5} bg="gray.50" borderBottomWidth="1px" borderColor="gray.200">
      <Flex align="center" gap={2} minH="28px">
        <Icon boxSize={4} color="gray.600" flexShrink={0}>
          <LuMessageSquare aria-hidden />
        </Icon>
        <Text textStyle="sm" fontWeight={700} color="gray.800">
          {notes.length > 0 ? `${dateLabel}のメモ ${notes.length}件` : `${dateLabel}のメモはありません`}
        </Text>
        {notes.length > 0 && (
          <Button
            ml="auto"
            size="xs"
            variant="ghost"
            colorPalette="gray"
            aria-expanded={isExpanded}
            onClick={() => setIsExpanded((current) => !current)}
          >
            {isExpanded ? "たたむ" : "開く"}
            {isExpanded ? <LuChevronUp aria-hidden /> : <LuChevronDown aria-hidden />}
          </Button>
        )}
      </Flex>
      {isExpanded && notes.length > 0 && (
        <Stack as="ul" mt={1.5} gap={1} listStyleType="none">
          {visibleNotes.map((entry) => (
            <Flex as="li" key={entry.staffId} gap={3} align="baseline" minW={0}>
              <Text textStyle="sm" fontWeight={600} color="gray.800" w="160px" flexShrink={0} truncate>
                {entry.staffName}
              </Text>
              <Text textStyle="sm" color="gray.700" minW={0} overflowWrap="anywhere" data-clarity-mask="true">
                {entry.note}
              </Text>
            </Flex>
          ))}
        </Stack>
      )}
      {isExpanded && hiddenCount > 0 && (
        <Button mt={1} size="xs" variant="ghost" colorPalette="gray" onClick={() => setShowsAll(true)}>
          すべて表示（ほか{hiddenCount}件）
        </Button>
      )}
    </Box>
  );
};
