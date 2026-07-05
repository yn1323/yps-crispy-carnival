import { Badge, Box, Button, Flex, HStack, Text } from "@chakra-ui/react";

export type PeriodPreset = "7d" | "30d" | "90d" | "180d" | "365d";

const PERIOD_LABELS: Record<PeriodPreset, string> = {
  "7d": "7日",
  "30d": "30日",
  "90d": "90日",
  "180d": "180日",
  "365d": "365日",
};

type FilterBarProps = {
  period: PeriodPreset;
  from: string;
  to: string;
  envLabel?: string;
  convexHost?: string | null;
  latestDate?: string | null;
  onPeriodChange: (period: PeriodPreset) => void;
};

export const FilterBar = ({ period, from, to, envLabel, convexHost, latestDate, onPeriodChange }: FilterBarProps) => {
  return (
    <Flex
      align={{ base: "stretch", lg: "center" }}
      bg="white"
      border="1px solid"
      borderColor="gray.200"
      borderRadius="lg"
      direction={{ base: "column", lg: "row" }}
      gap={4}
      justify="space-between"
      p={4}
    >
      <Box>
        <HStack gap={2} mb={2} wrap="wrap">
          <Badge colorPalette={envLabel === "production" ? "green" : "orange"} variant="subtle">
            {envLabel ?? "unknown"}
          </Badge>
          {convexHost ? <Badge variant="surface">{convexHost}</Badge> : null}
          {latestDate ? <Badge variant="surface">最新集計日 {latestDate}</Badge> : null}
        </HStack>
        <Text color="gray.600" fontSize="sm">
          表示期間 {from} から {to}
        </Text>
      </Box>
      <HStack gap={2} overflowX="auto">
        {(Object.keys(PERIOD_LABELS) as PeriodPreset[]).map((preset) => (
          <Button
            key={preset}
            colorPalette={period === preset ? "teal" : "gray"}
            onClick={() => onPeriodChange(preset)}
            size="sm"
            variant={period === preset ? "solid" : "outline"}
          >
            {PERIOD_LABELS[preset]}
          </Button>
        ))}
      </HStack>
    </Flex>
  );
};
