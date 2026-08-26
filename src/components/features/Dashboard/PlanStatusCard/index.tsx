import { Badge, Box, Flex, Grid, HStack, Skeleton, Stack, Text, VisuallyHidden } from "@chakra-ui/react";
import { LuBadgeCheck, LuCircleAlert, LuClock3, LuStore, LuUserRoundCog, LuUsers } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";
import type { PlanStatusCardData, PlanStatusCardProps, PlanStatusCardUsage } from "./types";

type PlanStatusCardViewProps = PlanStatusCardProps & {
  onRequestCollapse?: () => void;
};

export function PlanStatusCard({ data, usage, onAction, onRequestCollapse }: PlanStatusCardViewProps) {
  const presentation = getPlanStatusPresentation(data);

  const handleRemindLater = () => {
    onAction("remindLater");
    onRequestCollapse?.();
  };

  return (
    <Box as="section" role="region" aria-label={presentation.detailsLabel} w="full" bg="white">
      <Stack gap={0}>
        <Stack gap={4} px={{ base: 4, md: 5 }} py={4}>
          <PlanStatusHeading presentation={presentation} />
          {data.kind === "paidPlan" && <PaidPlanDetails data={data} />}
          {data.kind === "trial" && <TrialDetails data={data} onRemindLater={handleRemindLater} />}
          {data.kind === "paymentPending" && <PaymentPendingDetails data={data} />}
          {data.kind === "paymentIssue" && <PaymentIssueDetails data={data} />}
        </Stack>
        <PlanUsageFooter usage={usage} />
      </Stack>
    </Box>
  );
}

function PlanStatusHeading({ presentation }: { presentation: ReturnType<typeof getPlanStatusPresentation> }) {
  return (
    <HStack gap={3} align="center">
      <Flex
        boxSize="36px"
        flexShrink={0}
        align="center"
        justify="center"
        borderRadius="full"
        bg={presentation.iconBackground}
        color={presentation.iconColor}
      >
        <presentation.Icon aria-hidden size={18} />
      </Flex>
      <Flex flex={1} minW={0} align="center" gap={2} wrap="wrap">
        <Text fontSize={{ base: "lg", lg: "xl" }} lineHeight="short" fontWeight="bold" color="fg">
          {presentation.title}
        </Text>
        {presentation.badge && !presentation.summaryBadge && <StatusBadge badge={presentation.badge} />}
      </Flex>
    </HStack>
  );
}

function StatusBadge({ badge }: { badge: { label: string; background: string; color: string } }) {
  return (
    <Badge ms="auto" variant="subtle" borderRadius="full" px={2.5} py={1} bg={badge.background} color={badge.color}>
      {badge.label}
    </Badge>
  );
}

function PaidPlanDetails({ data }: { data: Extract<PlanStatusCardData, { kind: "paidPlan" }> }) {
  const isScheduledChange = data.badgeLabel === "変更予定" || data.badgeLabel === "解約予定";
  const hasDescription = isScheduledChange && Boolean(data.description);

  if (!data.nextEventLabel && !hasDescription) return null;

  return (
    <Stack gap={3}>
      {data.nextEventLabel && (
        <Text fontSize="sm" fontWeight="medium" color="fg.muted">
          {data.nextEventLabel}
        </Text>
      )}
      {isScheduledChange && data.description && (
        <Text fontSize="sm" fontWeight="medium">
          {data.description}
        </Text>
      )}
    </Stack>
  );
}

function TrialDetails({
  data,
  onRemindLater,
}: {
  data: Extract<PlanStatusCardData, { kind: "trial" }>;
  onRemindLater: () => void;
}) {
  return (
    <Stack gap={2}>
      <Stack gap={1.5}>
        <Text fontSize="sm" fontWeight="medium">
          {data.trialEndsOnLabel}にトライアルが終了します。
        </Text>
        <Text fontSize="sm" fontWeight="medium" whiteSpace="pre-line">
          {data.description}
        </Text>
      </Stack>
      {data.showRemindLater && (
        <Flex justify="flex-end">
          <Button type="button" size="sm" colorPalette="gray" variant="plain" minH="44px" onClick={onRemindLater}>
            後で確認する
          </Button>
        </Flex>
      )}
    </Stack>
  );
}

function PaymentPendingDetails({ data }: { data: Extract<PlanStatusCardData, { kind: "paymentPending" }> }) {
  return (
    <Text fontSize="sm" fontWeight="medium">
      {data.description}
    </Text>
  );
}

function PaymentIssueDetails({ data }: { data: Extract<PlanStatusCardData, { kind: "paymentIssue" }> }) {
  return (
    <Stack gap={1.5}>
      {data.recoveryDeadlineLabel && (
        <Text fontSize="sm" fontWeight="bold" color="orange.800">
          {data.recoveryDeadlineLabel}
        </Text>
      )}
      <Text fontSize="sm" fontWeight="medium">
        {data.description}
      </Text>
    </Stack>
  );
}

function PlanUsageFooter({ usage }: { usage: PlanStatusCardUsage | null | undefined }) {
  if (usage === null) return null;

  if (usage === undefined) {
    return (
      <Box
        role="status"
        aria-live="polite"
        aria-busy="true"
        borderTopWidth="1px"
        borderTopColor="blackAlpha.100"
        bg="white"
        py={3.5}
      >
        <VisuallyHidden>プランの利用状況を読み込み中です。</VisuallyHidden>
        <Grid aria-hidden="true" templateColumns="repeat(2, minmax(0, 1fr))">
          <UsageSkeleton />
          <UsageSkeleton withDivider />
        </Grid>
      </Box>
    );
  }

  const items = [
    { icon: LuUsers, label: "利用人数", suffix: "人", usage: usage.peopleUsage, pendingInvitations: 0 },
    { icon: LuStore, label: "店舗", suffix: "店舗", usage: usage.shopUsage, pendingInvitations: 0 },
    ...(usage.managerUsage
      ? [
          {
            icon: LuUserRoundCog,
            label: "管理者",
            suffix: "人",
            usage: usage.managerUsage,
            pendingInvitations: usage.pendingManagerInvitations ?? 0,
          },
        ]
      : []),
  ];

  return (
    <Box
      role="group"
      aria-label="プランの利用状況"
      borderTopWidth="1px"
      borderTopColor="blackAlpha.100"
      bg="white"
      py={3.5}
    >
      <Grid templateColumns={`repeat(${items.length}, minmax(0, 1fr))`}>
        {items.map((item, index) => {
          const UsageIcon = item.icon;
          return (
            <Stack
              key={item.label}
              gap={0}
              minW={0}
              align="center"
              px={{ base: 2, md: 3 }}
              borderLeftWidth={index === 0 ? 0 : "1px"}
              borderLeftColor="blackAlpha.100"
            >
              <HStack gap={1.5} minW={0} justify="center">
                <Box color="teal.700" flexShrink={0} fontSize="md">
                  <UsageIcon aria-hidden />
                </Box>
                <Text
                  fontSize={{ base: "sm", md: "md" }}
                  lineHeight="short"
                  fontWeight="bold"
                  fontVariantNumeric="tabular-nums"
                  whiteSpace="nowrap"
                  aria-label={`${item.label} 現在${item.usage.current}${item.suffix} / 上限${item.usage.max}${item.suffix}`}
                >
                  {item.usage.current} / {item.usage.max}
                  {item.suffix}
                </Text>
              </HStack>
              {item.pendingInvitations > 0 && (
                <Text fontSize="xs" lineHeight="short" color="fg.muted" fontWeight="medium" whiteSpace="nowrap">
                  招待中 {item.pendingInvitations}人
                </Text>
              )}
            </Stack>
          );
        })}
      </Grid>
    </Box>
  );
}

function UsageSkeleton({ withDivider = false }: { withDivider?: boolean }) {
  return (
    <Stack
      gap={1.5}
      align="center"
      px={{ base: 2, md: 3 }}
      borderLeftWidth={withDivider ? "1px" : 0}
      borderLeftColor="blackAlpha.100"
    >
      <HStack gap={1.5}>
        <Skeleton boxSize="16px" borderRadius="full" />
        <Skeleton h="18px" w="56px" />
      </HStack>
    </Stack>
  );
}

type PlanStatusTone = "neutral" | "blue" | "orange" | "red";

type PlanStatusBadge = {
  label: string;
  background: string;
  color: string;
};

export type PlanStatusPresentation = {
  Icon: typeof LuBadgeCheck;
  title: string;
  badge: PlanStatusBadge | null;
  summaryBadge: PlanStatusBadge | null;
  tone: PlanStatusTone;
  detailsLabel: string;
  iconBackground: string;
  iconColor: string;
};

export function getPlanStatusPresentation(data: PlanStatusCardData): PlanStatusPresentation {
  if (data.kind === "paidPlan" || data.kind === "freePlan") {
    const planName = data.kind === "paidPlan" ? data.planName : "Free";
    const badgeLabel = data.kind === "paidPlan" ? data.badgeLabel : "利用中";
    const isScheduledChange = badgeLabel === "変更予定" || badgeLabel === "解約予定";
    const badge = isScheduledChange
      ? { label: badgeLabel, background: "orange.100", color: "orange.700" }
      : { label: badgeLabel, background: "teal.100", color: "teal.700" };
    return {
      Icon: LuBadgeCheck,
      title: `${planName}プラン`,
      badge,
      summaryBadge: isScheduledChange ? badge : null,
      tone: isScheduledChange ? "orange" : "neutral",
      detailsLabel: `${planName}プランの詳細`,
      iconBackground: "teal.50",
      iconColor: "teal.700",
    };
  }

  if (data.kind === "trial") {
    const isUrgent = data.remainingDays <= 7;
    const trialEndsOnSummaryLabel = data.trialEndsOnLabel.replace(/^\d{4}\//, "").replace(/\([日月火水木金土]\)$/, "");
    const badge = {
      label: data.remainingDays === 0 ? "本日終了" : `${trialEndsOnSummaryLabel}まで`,
      background: isUrgent ? "orange.100" : "blue.100",
      color: isUrgent ? "orange.700" : "blue.700",
    };
    return {
      Icon: LuClock3,
      title: "無料トライアル中",
      badge,
      summaryBadge: badge,
      tone: isUrgent ? "orange" : "blue",
      detailsLabel: "無料トライアルの詳細",
      iconBackground: isUrgent ? "orange.100" : "blue.100",
      iconColor: isUrgent ? "orange.700" : "blue.700",
    };
  }

  if (data.kind === "paymentPending") {
    const badge = { label: `${data.targetPlanName}へ変更`, background: "blue.100", color: "blue.700" };
    return {
      Icon: LuClock3,
      title: "支払い結果を確認中",
      badge,
      summaryBadge: badge,
      tone: "blue",
      detailsLabel: "支払い結果確認中の詳細",
      iconBackground: "blue.100",
      iconColor: "blue.700",
    };
  }

  const badge = {
    label: data.recoveryDeadlineLabel?.replace(/^支払い期限：/, "期限 ") ?? "要対応",
    background: "orange.100",
    color: "orange.700",
  };
  return {
    Icon: LuCircleAlert,
    title: "支払いに問題があります",
    badge,
    summaryBadge: badge,
    tone: "orange",
    detailsLabel: "支払い問題の詳細",
    iconBackground: "orange.100",
    iconColor: "orange.700",
  };
}

export { buildPlanStatusCardData, formatJstDate, remainingJstDays } from "./script";
export type {
  DashboardPlanStatusSource,
  PlanStatusCardAction,
  PlanStatusCardData,
  PlanStatusCardProps,
  PlanStatusCardUsage,
} from "./types";
export { usePlanStatusCardController } from "./usePlanStatusCardController";
