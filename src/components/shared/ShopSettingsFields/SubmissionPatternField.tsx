import { Flex, HStack, SimpleGrid, Stack, Text } from "@chakra-ui/react";
import { LuCalendarDays, LuClock3, LuListChecks } from "react-icons/lu";
import type { ShiftSubmissionPattern } from "@/convex/shop/schemas";
import { Button } from "@/src/components/ui/Button";

const OPTIONS: Array<{
  kind: ShiftSubmissionPattern["kind"];
  label: string;
  description: string;
}> = [
  { kind: "dateOnly", label: "日ごと", description: "出勤できる日付だけを集めます。" },
  { kind: "time", label: "時間指定", description: "日ごとに働ける時間を、スタッフが自由に入力します。" },
  {
    kind: "shiftType",
    label: "勤務区分",
    description: "早番・遅番など、あらかじめ決めた時間帯から選んでもらいます。",
  },
];

export type SubmissionPatternFieldProps = {
  selectedKind: ShiftSubmissionPattern["kind"];
  onSelect: (kind: ShiftSubmissionPattern["kind"]) => void;
};

export function SubmissionPatternField({ selectedKind, onSelect }: SubmissionPatternFieldProps) {
  return (
    <SimpleGrid columns={{ base: 1, md: 3 }} gap={3}>
      {OPTIONS.map((option) => {
        const isSelected = selectedKind === option.kind;
        return (
          <Button
            key={option.kind}
            type="button"
            h="100%"
            minH="212px"
            variant="outline"
            borderColor={isSelected ? "teal.500" : "border.default"}
            borderWidth={isSelected ? 2 : 1}
            bg={isSelected ? "gray.50" : "white"}
            color="fg.default"
            p={0}
            overflow="hidden"
            aria-pressed={isSelected}
            onClick={() => onSelect(option.kind)}
            _hover={{ bg: isSelected ? "gray.100" : "gray.50" }}
          >
            <Stack gap={0} align="stretch" w="full" h="full" textAlign="left">
              <Flex
                h="96px"
                align="center"
                justify="center"
                bg={isSelected ? "gray.100" : "gray.50"}
                borderBottomWidth={1}
                borderColor={isSelected ? "border.emphasized" : "border.default"}
              >
                <HStack gap={2} color={isSelected ? "teal.700" : "fg.muted"} fontWeight="bold">
                  {option.kind === "time" && <LuClock3 aria-hidden />}
                  {option.kind === "dateOnly" && <LuCalendarDays aria-hidden />}
                  {option.kind === "shiftType" && <LuListChecks aria-hidden />}
                  <Text fontSize="sm">{option.label}</Text>
                </HStack>
              </Flex>
              <Stack gap={2} p={4} flex={1}>
                <Text fontSize="sm" fontWeight="semibold" color="gray.900">
                  {option.label}
                </Text>
                <Text fontSize="xs" color="fg.muted" whiteSpace="normal" lineHeight="tall">
                  {option.description}
                </Text>
              </Stack>
            </Stack>
          </Button>
        );
      })}
    </SimpleGrid>
  );
}
