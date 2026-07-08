import { Badge, Box, Button, Flex, Grid, HStack, Text } from "@chakra-ui/react";

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
      <Box minW={0}>
        <HStack gap={2} mb={2} wrap="wrap">
          <Badge colorPalette={envLabel === "production" ? "green" : "orange"} variant="subtle">
            {envLabel ?? "unknown"}
          </Badge>
          {convexHost ? (
            <Badge maxW="full" overflow="hidden" textOverflow="ellipsis" variant="surface" whiteSpace="nowrap">
              {convexHost}
            </Badge>
          ) : null}
          {latestDate ? <Badge variant="surface">最新集計日 {latestDate}</Badge> : null}
        </HStack>
        <Text color="gray.600" fontSize="sm">
          表示期間 {from} から {to}
        </Text>
      </Box>
      <Grid
        gap={2}
        templateColumns={{ base: "repeat(5, minmax(0, 1fr))", sm: "repeat(5, max-content)" }}
        w={{ base: "full", sm: "fit-content" }}
      >
        {(Object.keys(PERIOD_LABELS) as PeriodPreset[]).map((preset) => (
          <Button
            key={preset}
            colorPalette={period === preset ? "teal" : "gray"}
            minW={0}
            onClick={() => onPeriodChange(preset)}
            px={{ base: 0, sm: 3 }}
            size="sm"
            variant={period === preset ? "solid" : "outline"}
            w="full"
          >
            {PERIOD_LABELS[preset]}
          </Button>
        ))}
      </Grid>
    </Flex>
  );
};
