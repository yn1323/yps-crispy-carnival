import { Grid, Stack, Text } from "@chakra-ui/react";
import { KpiCard } from "@/components/KpiCard";
import { Comparison } from "./Presentation";
import type { KpiViewModel } from "./viewModels";

function metricDetail(item: KpiViewModel) {
  if (item.completeness === "partial") return "この指標の集計が一部未完了です。";
  if (item.completeness === "pending") return "この指標は集計中です。";
  if (item.completeness === "unavailable") return "この期間では、算出に必要なデータがありません。";
  if (item.completeness === "error") return "この指標を取得できませんでした。";
  return item.detail;
}

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
                {metricDetail(item)}
              </Text>
              {item.completeness === "complete" && item.comparisonEnabled ? (
                <Comparison delta={item.delta} isComparable={item.comparable} suffix={item.deltaSuffix} />
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
