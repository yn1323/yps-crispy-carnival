import { Box, Flex, Icon, Text } from "@chakra-ui/react";
import { LuMessageSquare } from "react-icons/lu";
import { formatDateShort, formatDateWithWeekday } from "@/src/domains/shift/date";
import type { DateInfo } from "./types";

type Props = {
  dates: DateInfo[];
  selectedDate: string;
  onSelect: (date: string) => void;
  noteCountByDate?: ReadonlyMap<string, number>;
};

export const DateSortToolbar = ({ dates, selectedDate, onSelect, noteCountByDate }: Props) => {
  if (dates.length === 0) return null;

  return (
    <Flex align="center" gap={3} px={4} py={3} bg="white" borderBottomWidth="1px" borderColor="gray.200">
      <Text textStyle="xs" fontWeight={700} color="gray.600" flexShrink={0}>
        この日で並べ替える
      </Text>
      <Flex gap={2} overflowX="auto" minW={0}>
        {dates.map((date) => {
          const selected = date.iso === selectedDate;
          const noteCount = noteCountByDate?.get(date.iso) ?? 0;
          return (
            <Box
              as="button"
              key={date.iso}
              aria-label={`${formatDateWithWeekday(date.iso)}で並べ替える${noteCount > 0 ? `、メモ${noteCount}件` : ""}`}
              aria-pressed={selected}
              onClick={() => onSelect(date.iso)}
              flexShrink={0}
              px={3}
              py="6px"
              borderRadius="full"
              borderWidth="1px"
              borderColor={selected ? "teal.500" : "gray.200"}
              bg={selected ? "teal.500" : "white"}
              color={selected ? "white" : "gray.700"}
              textStyle="xs"
              fontWeight={700}
              fontVariantNumeric="tabular-nums"
              cursor="pointer"
              transitionProperty="colors"
              transitionDuration="faster"
              _hover={{ bg: selected ? "teal.600" : "gray.50" }}
              _active={{ bg: selected ? "teal.600" : "gray.100", transitionDuration: "0ms" }}
              _focusVisible={{ outline: "2px solid", outlineColor: "teal.600", outlineOffset: "1px" }}
            >
              <Flex as="span" align="center" gap={1}>
                {formatDateShort(date.iso)}
                {noteCount > 0 && (
                  <Flex as="span" align="center" gap="2px" fontWeight={600} color={selected ? "white" : "gray.600"}>
                    <Icon boxSize={3}>
                      <LuMessageSquare aria-hidden />
                    </Icon>
                    {noteCount}
                  </Flex>
                )}
              </Flex>
            </Box>
          );
        })}
      </Flex>
    </Flex>
  );
};
