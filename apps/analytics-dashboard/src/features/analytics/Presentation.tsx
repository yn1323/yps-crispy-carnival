import { Badge, Box, Flex, HStack, Icon, Stack, Text } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { LuCheck, LuCircleAlert, LuClock3 } from "react-icons/lu";
import type { DataCompleteness } from "./DataStatus";
import { formatCount, formatCountWithUnit, formatDate, formatRate } from "./format";

export type HealthSignalKey =
  | "nextCycleExists"
  | "nextCycleMissing"
  | "cadenceDelayed"
  | "notificationFailure"
  | "submissionDrop"
  | "confirmationDelay"
  | "inactive"
  | "insufficientData"
  | string;

const HEALTH_LABELS: Record<string, { color: string; label: string }> = {
  cadenceDelayed: { color: "orange", label: "通常周期からの遅れ" },
  confirmationDelay: { color: "red", label: "確定遅れ" },
  hasUpcomingCycle: { color: "green", label: "次回シフトあり" },
  inactive: { color: "purple", label: "長期無活動" },
  insufficientData: { color: "gray", label: "判定材料不足" },
  nextCycleExists: { color: "green", label: "次回シフトあり" },
  nextCycleMissing: { color: "orange", label: "次回未作成" },
  notificationFailure: { color: "red", label: "通知失敗" },
  submissionDrop: { color: "orange", label: "提出低下" },
  longInactive: { color: "purple", label: "長期無活動" },
};

export function healthSignalPresentation(key: HealthSignalKey) {
  return HEALTH_LABELS[key] ?? { color: "gray", label: key };
}

export function HealthSignals({
  completeness = "complete",
  signals,
}: {
  completeness?: DataCompleteness;
  signals: Array<{ key: HealthSignalKey; count?: number; delta?: number | null; startedAt?: string | number | null }>;
}) {
  if (completeness !== "complete") {
    const unavailableLabel =
      completeness === "partial"
        ? "要確認状態は一部のみ集計"
        : completeness === "error"
          ? "要確認状態を取得できません"
          : "要確認状態を判定できません";
    return (
      <Badge colorPalette={completeness === "error" ? "red" : "gray"} variant="subtle">
        {unavailableLabel}
      </Badge>
    );
  }
  if (signals.length === 0) {
    return (
      <Badge colorPalette="green" variant="subtle">
        要確認なし
      </Badge>
    );
  }
  return (
    <HStack align="start" gap={2} wrap="wrap">
      {signals.map((signal) => {
        const presentation = healthSignalPresentation(signal.key);
        const suffix = signal.count === undefined ? "" : ` ${formatCount(signal.count, completeness)}店舗`;
        const delta =
          signal.delta === null || signal.delta === undefined
            ? ""
            : ` · 前回比 ${signal.delta > 0 ? "+" : ""}${signal.delta}店舗`;
        const title = signal.startedAt ? `${formatDate(signal.startedAt)}から継続` : undefined;
        return (
          <Badge
            key={`${signal.key}-${String(signal.startedAt ?? "")}`}
            colorPalette={presentation.color}
            title={title}
            variant="subtle"
          >
            {presentation.label}
            {suffix}
            {delta}
          </Badge>
        );
      })}
    </HStack>
  );
}

export type MilestoneItem = {
  key: string;
  label: string;
  excluded?: boolean;
  reachedAt?: string | number | null;
  reachedCount?: number | null;
  rate?: number | null;
  previousStepConversionRate?: number | null;
  completeness?: DataCompleteness;
};

export function MilestoneTimeline({ items }: { items: MilestoneItem[] }) {
  return (
    <GridList>
      {items.map((item, index) => {
        const reached = !item.excluded && item.reachedAt !== null && item.reachedAt !== undefined;
        const aggregate =
          (item.completeness === undefined || item.completeness === "complete") &&
          item.reachedCount !== null &&
          item.reachedCount !== undefined &&
          item.reachedCount > 0;
        return (
          <Flex key={item.key} align="stretch" gap={3} minW={0}>
            <Stack align="center" flexShrink={0} gap={0}>
              <Flex
                align="center"
                bg={reached || aggregate ? "green.500" : "gray.100"}
                borderRadius="full"
                color={reached || aggregate ? "white" : "gray.500"}
                h="30px"
                justify="center"
                w="30px"
              >
                <Icon as={reached || aggregate ? LuCheck : item.excluded ? LuCircleAlert : LuClock3} boxSize={4} />
              </Flex>
              {index < items.length - 1 ? <Box bg="gray.200" flex="1" minH="18px" w="2px" /> : null}
            </Stack>
            <Box minW={0} pb={index < items.length - 1 ? 4 : 0} pt={1}>
              <Text fontSize="sm" fontWeight="bold">
                {item.label}
              </Text>
              {item.excluded ? (
                <Text color="gray.500" fontSize="xs" mt={1}>
                  算出対象外
                </Text>
              ) : item.reachedAt !== undefined ? (
                <Text color="gray.500" fontSize="xs" mt={1}>
                  {reached ? formatDate(item.reachedAt) : "未到達"}
                </Text>
              ) : null}
              {item.reachedCount !== undefined ? (
                <HStack gap={2} mt={1} wrap="wrap">
                  <Text color="gray.700" fontSize="sm">
                    {formatCountWithUnit(item.reachedCount, "店舗", item.completeness)}
                  </Text>
                  <Text color="gray.500" fontSize="xs">
                    到達率 {formatRate(item.rate, item.completeness)}
                  </Text>
                  {item.previousStepConversionRate !== undefined ? (
                    <Text color="gray.500" fontSize="xs">
                      前段比 {formatRate(item.previousStepConversionRate, item.completeness)}
                    </Text>
                  ) : null}
                </HStack>
              ) : null}
            </Box>
          </Flex>
        );
      })}
    </GridList>
  );
}

function GridList({ children }: { children: ReactNode }) {
  return <Stack gap={0}>{children}</Stack>;
}

export function Comparison({
  delta,
  isComparable,
  suffix = "",
}: {
  delta: number | null;
  isComparable: boolean;
  suffix?: string;
}) {
  if (!isComparable || delta === null) {
    return (
      <HStack color="gray.500" gap={1}>
        <Icon as={LuCircleAlert} boxSize={3.5} />
        <Text fontSize="xs">前期間と比較できません</Text>
      </HStack>
    );
  }
  const displayedDelta = suffix === "pt" ? delta * 100 : delta;
  const color = displayedDelta > 0 ? "green.600" : displayedDelta < 0 ? "red.600" : "gray.500";
  return (
    <Text color={color} fontSize="xs" fontWeight="bold">
      前期間比 {displayedDelta > 0 ? "+" : ""}
      {displayedDelta.toLocaleString("ja-JP", { maximumFractionDigits: 1 })}
      {suffix}
    </Text>
  );
}
