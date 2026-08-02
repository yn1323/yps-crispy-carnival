import { Grid, Stack, Text } from "@chakra-ui/react";
import { KpiCard } from "@/components/KpiCard";
import { Comparison, MetricAvailability } from "./Presentation";
import type { KpiViewModel } from "./viewModels";

export function KpiGrid({ items }: { items: KpiViewModel[] }) {
  return (
    <Grid gap={4} templateColumns={{ base: "1fr", sm: "repeat(2, 1fr)", xl: "repeat(4, 1fr)" }}>
      {items.map((item) => (
        <KpiCard
          key={item.key}
          accent={item.accent}
          helper={
            <Stack gap={1}>
              <Text color="gray.500" fontSize="xs">
                {item.detail}
              </Text>
              {item.completeness === "complete" && item.comparisonEnabled ? (
                <Comparison delta={item.delta} isComparable={item.comparable} suffix={item.deltaSuffix} />
              ) : item.completeness !== "complete" ? (
                <MetricAvailability completeness={item.completeness} />
              ) : null}
            </Stack>
          }
          label={item.label}
          value={item.value}
        />
      ))}
    </Grid>
  );
}
