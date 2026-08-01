import { Flex, SimpleGrid, Stack, Text } from "@chakra-ui/react";
import type { RegularClosedDay } from "@/convex/shop/schemas";
import { Button } from "@/src/components/ui/Button";

export type RegularClosedDayOption = {
  value: RegularClosedDay;
  label: string;
  ariaLabel: string;
  isClosed: boolean;
};

export type RegularClosedDaysFieldProps = {
  summary: string;
  options: RegularClosedDayOption[];
  onToggle: (day: RegularClosedDay) => void;
};

export function RegularClosedDaysField({ summary, options, onToggle }: RegularClosedDaysFieldProps) {
  return (
    <Stack gap={3}>
      <Flex
        gap={{ base: 1, md: 3 }}
        direction={{ base: "column", md: "row" }}
        justify="space-between"
        align={{ base: "flex-start", md: "center" }}
      >
        <Text fontSize="sm" fontWeight="semibold" color="gray.900">
          毎週休みにする曜日
        </Text>
        <Text fontSize="xs" color="fg.muted">
          現在の設定: {summary}
        </Text>
      </Flex>
      <SimpleGrid columns={{ base: 4, sm: 7 }} gap={2}>
        {options.map((option) => (
          <Button
            key={option.value}
            type="button"
            aria-label={`${option.ariaLabel}を${option.isClosed ? "定休日から外す" : "定休日にする"}`}
            aria-pressed={option.isClosed}
            w="44px"
            h="44px"
            minW="44px"
            justifySelf="center"
            p={0}
            borderRadius="full"
            borderWidth={1}
            borderColor={option.isClosed ? "gray.300" : "teal.600"}
            bg={option.isClosed ? "gray.100" : "teal.600"}
            color={option.isClosed ? "fg.muted" : "white"}
            fontWeight="semibold"
            onClick={() => onToggle(option.value)}
            _hover={{ bg: option.isClosed ? "gray.200" : "teal.700" }}
          >
            {option.label}
          </Button>
        ))}
      </SimpleGrid>
    </Stack>
  );
}
