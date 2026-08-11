import { Accordion, Badge, Box, Flex, Grid, HStack, Skeleton, Stack, Text, VisuallyHidden } from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";
import { LuArrowRight, LuBadgeCheck, LuCircleAlert, LuClock3, LuStore, LuUserRoundCog, LuUsers } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";
import type { PlanPriceDisplayState, PlanStatusCardData, PlanStatusCardProps, PlanStatusCardUsage } from "./types";

const DETAILS_VALUE = "details";

export function PlanStatusCard({
  data,
  usage,
  defaultExpanded = false,
  onAction,
  onExpandedChange,
}: PlanStatusCardProps) {
  const [value, setValue] = useState<string[]>(defaultExpanded ? [DETAILS_VALUE] : []);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const previousDefaultExpanded = useRef(defaultExpanded);
  const presentation = getPresentation(data);

  useEffect(() => {
    if (!previousDefaultExpanded.current && defaultExpanded) setValue([DETAILS_VALUE]);
    previousDefaultExpanded.current = defaultExpanded;
  }, [defaultExpanded]);

  const updateExpanded = (expanded: boolean) => {
    setValue(expanded ? [DETAILS_VALUE] : []);
    onExpandedChange?.(expanded);
  };

  const handleRemindLater = () => {
    triggerRef.current?.focus();
    onAction("remindLater");
    updateExpanded(false);
  };

  return (
    <Box as="section" aria-label={presentation.sectionLabel} w="full">
      <Accordion.Root
        collapsible
        variant="plain"
        colorPalette={presentation.colorPalette}
        value={value}
        onValueChange={(details) => updateExpanded(details.value.includes(DETAILS_VALUE))}
      >
        <Accordion.Item
          value={DETAILS_VALUE}
          borderWidth="1px"
          borderColor="blackAlpha.100"
          borderRadius="xl"
          bg="white"
          boxShadow="xs"
          overflow="hidden"
        >
          <Accordion.ItemTrigger
            ref={triggerRef}
            minH="68px"
            px={{ base: 3, md: 4 }}
            py={3}
            borderRadius="0"
            cursor="pointer"
            _hover={{ bg: "blackAlpha.50" }}
            _focusVisible={{
              outline: "2px solid",
              outlineColor: presentation.focusRingColor,
              outlineOffset: "-2px",
            }}
          >
            <HStack flex={1} minW={0} gap={3}>
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
                {presentation.badge && (
                  <Badge
                    variant="subtle"
                    borderRadius="full"
                    px={2.5}
                    py={1}
                    bg={presentation.badge.background}
                    color={presentation.badge.color}
                  >
                    {presentation.badge.label}
                  </Badge>
                )}
              </Flex>
            </HStack>

            <Accordion.ItemIndicator color="fg.muted" flexShrink={0} />
          </Accordion.ItemTrigger>

          <Accordion.ItemContent>
            <Accordion.ItemBody p={0}>
              <Box role="region" aria-label={presentation.detailsLabel}>
                {data.kind === "paidPlan" && <PaidPlanDetails data={data} onAction={onAction} />}
                {data.kind === "freePlan" && <FreePlanDetails data={data} onAction={onAction} />}
                {data.kind === "trial" && (
                  <TrialDetails data={data} onAction={onAction} onRemindLater={handleRemindLater} />
                )}
                {data.kind === "paymentPending" && <PaymentPendingDetails data={data} onAction={onAction} />}
                {data.kind === "paymentIssue" && <PaymentIssueDetails data={data} onAction={onAction} />}
                {data.kind === "restricted" && <RestrictedDetails data={data} onAction={onAction} />}
                <PlanUsageFooter usage={usage} />
              </Box>
            </Accordion.ItemBody>
          </Accordion.ItemContent>
        </Accordion.Item>
      </Accordion.Root>
    </Box>
  );
}

function PaidPlanDetails({
  data,
  onAction,
}: {
  data: Extract<PlanStatusCardData, { kind: "paidPlan" }>;
  onAction: PlanStatusCardProps["onAction"];
}) {
  return (
    <Stack gap={4} px={{ base: 4, md: 5 }} py={4} bg="teal.50">
      <Stack gap={1.5}>
        {data.description && (
          <Text fontSize="sm" fontWeight="medium">
            {data.description}
          </Text>
        )}
        {data.nextEventLabel && (
          <Text fontSize="sm" fontWeight="medium">
            {data.nextEventLabel}
          </Text>
        )}
        {data.price && <CurrentPrice state={data.price} onAction={onAction} />}
      </Stack>
      <Button
        size="md"
        variant="outline"
        colorPalette="teal"
        w="full"
        minH="44px"
        onClick={() => onAction("openPlanAndPayment")}
      >
        {data.primaryActionLabel}
        <LuArrowRight aria-hidden />
      </Button>
    </Stack>
  );
}

function CurrentPrice({
  state,
  onAction,
}: {
  state: PlanPriceDisplayState;
  onAction: PlanStatusCardProps["onAction"];
}) {
  if (state.status === "idle" || state.status === "loading") {
    return (
      <Box role="status" aria-live="polite" aria-busy="true" py={0.5}>
        <VisuallyHidden>現在の料金を読み込み中です。</VisuallyHidden>
        <Skeleton aria-hidden="true" h="18px" maxW="180px" />
      </Box>
    );
  }

  if (state.status === "available") {
    return (
      <Text fontSize="sm" fontWeight="medium" aria-live="polite">
        {state.label}
      </Text>
    );
  }

  const canRetry = state.status === "error" || state.canRetry;
  return (
    <Stack gap={1.5} align="flex-start" aria-live="polite">
      <Text fontSize="sm" color="fg.muted">
        {state.message}
      </Text>
      {canRetry && (
        <Button size="xs" variant="outline" colorPalette="gray" onClick={() => onAction("retryCurrentPrice")}>
          料金を再読み込み
        </Button>
      )}
    </Stack>
  );
}

function FreePlanDetails({
  data,
  onAction,
}: {
  data: Extract<PlanStatusCardData, { kind: "freePlan" }>;
  onAction: PlanStatusCardProps["onAction"];
}) {
  const actionVariant = data.primaryAction === "choosePlan" ? "solid" : "outline";

  return (
    <Stack gap={4} px={{ base: 4, md: 5 }} py={4} bg="teal.50">
      <Text fontSize="sm" fontWeight="medium">
        {data.description}
      </Text>
      <Button
        size="md"
        variant={actionVariant}
        colorPalette="teal"
        w="full"
        minH="44px"
        onClick={() => onAction(data.primaryAction)}
      >
        {data.primaryActionLabel}
        <LuArrowRight aria-hidden />
      </Button>
    </Stack>
  );
}

function TrialDetails({
  data,
  onAction,
  onRemindLater,
}: {
  data: Extract<PlanStatusCardData, { kind: "trial" }>;
  onAction: PlanStatusCardProps["onAction"];
  onRemindLater: () => void;
}) {
  const isUrgent = data.remainingDays <= 7;
  const actionVariant = data.primaryAction === "choosePlan" ? "solid" : "outline";

  return (
    <Stack gap={4} px={{ base: 4, md: 5 }} py={4} bg={isUrgent ? "orange.50" : "blue.50"}>
      <Stack gap={1.5}>
        <Text fontSize="sm" fontWeight="medium">
          {data.trialEndsOnLabel} にトライアルが終了します。
        </Text>
        <Text fontSize="sm" fontWeight="medium">
          {data.description}
        </Text>
      </Stack>
      <Stack gap={2.5}>
        <Button
          size="md"
          variant={actionVariant}
          colorPalette="teal"
          w="full"
          minH="44px"
          onClick={() => onAction(data.primaryAction)}
        >
          {data.primaryActionLabel}
          <LuArrowRight aria-hidden />
        </Button>
        {data.showRemindLater && (
          <Button size="md" colorPalette="gray" variant="outline" w="full" minH="44px" onClick={onRemindLater}>
            後で確認する
          </Button>
        )}
      </Stack>
    </Stack>
  );
}

function PaymentPendingDetails({
  data,
  onAction,
}: {
  data: Extract<PlanStatusCardData, { kind: "paymentPending" }>;
  onAction: PlanStatusCardProps["onAction"];
}) {
  return (
    <Stack gap={4} px={{ base: 4, md: 5 }} py={4} bg="blue.50">
      <Text fontSize="sm" fontWeight="medium">
        {data.description}
      </Text>
      <Button
        size="md"
        variant="outline"
        colorPalette="teal"
        w="full"
        minH="44px"
        onClick={() => onAction("openPlanAndPayment")}
      >
        {data.primaryActionLabel}
        <LuArrowRight aria-hidden />
      </Button>
    </Stack>
  );
}

function PaymentIssueDetails({
  data,
  onAction,
}: {
  data: Extract<PlanStatusCardData, { kind: "paymentIssue" }>;
  onAction: PlanStatusCardProps["onAction"];
}) {
  const colorPalette = data.phase === "grace" ? "orange" : "red";
  const background = data.phase === "grace" ? "orange.50" : "red.50";
  const deadlineColor = data.phase === "grace" ? "orange.800" : "red.800";
  const primaryColorPalette = data.primaryAction === "updatePaymentMethod" ? colorPalette : "gray";

  return (
    <Stack gap={4} px={{ base: 4, md: 5 }} py={4} bg={background}>
      <Stack gap={1.5}>
        {data.recoveryDeadlineLabel && (
          <Text fontSize="sm" fontWeight="bold" color={deadlineColor}>
            {data.recoveryDeadlineLabel}
          </Text>
        )}
        <Text fontSize="sm" fontWeight="medium">
          {data.description}
        </Text>
      </Stack>
      <Stack gap={2.5}>
        <Button
          size="md"
          variant="outline"
          colorPalette={primaryColorPalette}
          w="full"
          minH="44px"
          onClick={() => onAction(data.primaryAction)}
        >
          {data.primaryActionLabel}
          <LuArrowRight aria-hidden />
        </Button>
        {data.showDetailsAction && (
          <Button
            size="md"
            colorPalette="gray"
            variant="outline"
            w="full"
            minH="44px"
            onClick={() => onAction("viewPaymentIssueDetails")}
          >
            詳細を確認する
          </Button>
        )}
      </Stack>
    </Stack>
  );
}

function RestrictedDetails({
  data,
  onAction,
}: {
  data: Extract<PlanStatusCardData, { kind: "restricted" }>;
  onAction: PlanStatusCardProps["onAction"];
}) {
  return (
    <Stack gap={4} px={{ base: 4, md: 5 }} py={4} bg="red.50">
      <Text fontSize="sm" fontWeight="medium">
        {data.description}
      </Text>
      <Button
        size="md"
        variant="outline"
        colorPalette="teal"
        w="full"
        minH="44px"
        onClick={() => onAction("openPlanAndPayment")}
      >
        {data.primaryActionLabel}
        <LuArrowRight aria-hidden />
      </Button>
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
    { icon: LuUsers, label: "スタッフ", suffix: "人", usage: usage.peopleUsage },
    { icon: LuStore, label: "店舗", suffix: "店舗", usage: usage.shopUsage },
    ...(usage.managerUsage ? [{ icon: LuUserRoundCog, label: "管理者", suffix: "人", usage: usage.managerUsage }] : []),
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
              gap={1}
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
              <Text fontSize="xs" lineHeight="short" color="fg.muted">
                {item.label}
              </Text>
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
      <Skeleton h="12px" w="44px" />
    </Stack>
  );
}

function getPresentation(data: PlanStatusCardData) {
  if (data.kind === "paidPlan" || data.kind === "freePlan") {
    const planName = data.kind === "paidPlan" ? data.planName : "Free";
    const badgeLabel = data.kind === "paidPlan" ? data.badgeLabel : "利用中";
    const isScheduledChange = badgeLabel === "変更予定";
    return {
      Icon: LuBadgeCheck,
      title: `${planName}プラン`,
      sectionLabel: "現在のプラン",
      detailsLabel: `${planName}プランの詳細`,
      colorPalette: "teal",
      focusRingColor: "teal.700",
      iconBackground: "teal.100",
      iconColor: "teal.700",
      badge: isScheduledChange
        ? { label: badgeLabel, background: "orange.100", color: "orange.700" }
        : { label: badgeLabel, background: "teal.100", color: "teal.700" },
    } as const;
  }

  if (data.kind === "trial") {
    const isUrgent = data.remainingDays <= 7;
    return {
      Icon: LuClock3,
      title: "無料トライアル",
      sectionLabel: "無料トライアル",
      detailsLabel: "無料トライアルの詳細",
      colorPalette: isUrgent ? "orange" : "blue",
      focusRingColor: isUrgent ? "orange.500" : "blue.500",
      iconBackground: isUrgent ? "orange.100" : "blue.100",
      iconColor: isUrgent ? "orange.700" : "blue.700",
      badge: {
        label: data.remainingDays === 0 ? "本日終了" : `あと${data.remainingDays}日`,
        background: isUrgent ? "orange.100" : "blue.100",
        color: isUrgent ? "orange.700" : "blue.700",
      },
    } as const;
  }

  if (data.kind === "paymentPending") {
    return {
      Icon: LuClock3,
      title: "支払い結果を確認中",
      sectionLabel: "支払い結果を確認中",
      detailsLabel: "支払い結果確認中の詳細",
      colorPalette: "blue",
      focusRingColor: "blue.500",
      iconBackground: "blue.100",
      iconColor: "blue.700",
      badge: { label: `${data.targetPlanName}へ変更`, background: "blue.100", color: "blue.700" },
    } as const;
  }

  if (data.kind === "restricted") {
    return {
      Icon: LuCircleAlert,
      title: "契約制限中",
      sectionLabel: "契約制限中",
      detailsLabel: "契約制限の詳細",
      colorPalette: "red",
      focusRingColor: "red.500",
      iconBackground: "red.100",
      iconColor: "red.700",
      badge: data.planName ? { label: `${data.planName}プラン`, background: "gray.100", color: "gray.700" } : null,
    } as const;
  }

  const isGrace = data.phase === "grace";
  return {
    Icon: LuCircleAlert,
    title: "支払いに問題があります",
    sectionLabel: "支払いに問題があります",
    detailsLabel: "支払い問題の詳細",
    colorPalette: isGrace ? "orange" : "red",
    focusRingColor: isGrace ? "orange.500" : "red.500",
    iconBackground: isGrace ? "orange.100" : "red.100",
    iconColor: isGrace ? "orange.700" : "red.700",
    badge:
      data.phase === "restricted"
        ? { label: "利用制限中", background: "red.100", color: "red.700" }
        : data.planName
          ? { label: `${data.planName}プラン`, background: "gray.100", color: "gray.700" }
          : null,
  } as const;
}

export { buildPlanStatusCardData, formatCurrentSubscriptionPrice, formatJstDate, remainingJstDays } from "./script";
export type {
  CurrentSubscriptionPrice,
  CurrentSubscriptionPriceState,
  DashboardPlanStatusSource,
  PlanPriceDisplayState,
  PlanStatusCardAction,
  PlanStatusCardData,
  PlanStatusCardProps,
  PlanStatusCardUsage,
} from "./types";
export { usePlanStatusCardController } from "./usePlanStatusCardController";
