import { Alert, Badge, Box, chakra, Flex, Grid, Heading, HStack, Stack, Text, VisuallyHidden } from "@chakra-ui/react";
import {
  LuCalendarClock,
  LuChevronRight,
  LuCircleAlert,
  LuCircleCheck,
  LuClock3,
  LuCreditCard,
  LuMail,
} from "react-icons/lu";
import { ORGANIZATION_PLAN_LIMITS } from "@/convex/organizationBilling/planLimits";
import { OrganizationPaymentFailureAlert } from "@/src/components/shared/OrganizationPaymentFailureAlert";
import { Button } from "@/src/components/ui/Button";
import {
  type BillingPlanAction,
  formatPlanPriceLine,
  getRequiredReductions,
  planLabel,
  resolveBillingPlanAction,
} from "./BillingSettings/script";
import type {
  BillingDisplayState,
  BillingPendingCheckoutStatus,
  BillingPlanPrices,
  BillingProductPlan,
  OrganizationBillingView,
  PaidBillingPlan,
} from "./types";

type Props = {
  billing: OrganizationBillingView;
  planPrices: BillingPlanPrices;
  onManagePlan: (targetPlan: BillingProductPlan) => void;
  onRetryPlanPrice: (targetPlan: PaidBillingPlan) => void;
  onUpdatePaymentMethod: () => void;
  onUpdateBillingEmail: () => void;
  pendingCheckout: {
    status: BillingPendingCheckoutStatus;
    isCancelling: boolean;
    onContinue: () => void;
    onCancel: () => void;
    onRetry: () => void;
  };
};

function formatPlanLimitsDescription(plan: keyof typeof ORGANIZATION_PLAN_LIMITS, suffix: string): string {
  const limits = ORGANIZATION_PLAN_LIMITS[plan];
  return `利用人数${limits.maxPeople}名・店舗${limits.maxShops}件・管理者${limits.maxActiveManagers}名まで${suffix}`;
}

const STATE_PRESENTATION: Record<
  BillingDisplayState,
  { label: string; status: "info" | "success" | "warning" | "error"; description: string }
> = {
  trial: {
    label: "トライアル",
    status: "info",
    description: formatPlanLimitsDescription("trial", "、Proと同じ機能を利用できます。"),
  },
  free: {
    label: "Free",
    status: "info",
    description: formatPlanLimitsDescription("free", "、基本的なシフト運用を利用できます。"),
  },
  standard: {
    label: "Standard",
    status: "success",
    description: formatPlanLimitsDescription("standard", "利用できます。"),
  },
  pro: {
    label: "Pro",
    status: "success",
    description: formatPlanLimitsDescription("pro", "利用できます。"),
  },
  initialPaymentPending: {
    label: "初回請求を確認中",
    status: "info",
    description: "初回支払いの結果を確認しています。\n確認中も、Freeの基本機能を利用できます。",
  },
  pendingActivation: {
    label: "支払い結果を確認中",
    status: "info",
    description: "支払いの結果を確認しています。",
  },
  scheduledChange: {
    label: "プラン変更予定",
    status: "warning",
    description: "現在の支払い済み期間が終わるまでは、現在のプランを利用できます。",
  },
  migrationPending: {
    label: "設定を移行中",
    status: "info",
    description: "組織単位のプラン設定を準備しています。\n完了するまでは、既存データを閲覧できます。",
  },
};

export const PlanAndPaymentSection = ({
  billing,
  planPrices,
  onManagePlan,
  onRetryPlanPrice,
  onUpdatePaymentMethod,
  onUpdateBillingEmail,
  pendingCheckout,
}: Props) => {
  const isServiceStopScheduled = isServiceStopScheduledState(billing);
  const isUsageLimitExceeded = isActivePlanUsageLimitExceeded(billing);
  const presentation = isServiceStopScheduled
    ? {
        ...STATE_PRESENTATION.scheduledChange,
        label: "解約予定",
        description:
          "現在の支払い済み期間が終わるまでは、現在のプランを利用できます。\n解約後はFreeプランへ変更されます。データは削除されません。",
      }
    : isUsageLimitExceeded
      ? {
          ...STATE_PRESENTATION[billing.state],
          status: "warning" as const,
          description: "現在のプランの利用上限を超えています。\n上限内まで減らすと、業務操作は自動的に再開されます。",
        }
      : billing.state === "pendingActivation" && billing.currentPlan === "free"
        ? {
            ...STATE_PRESENTATION.pendingActivation,
            description:
              "支払いの成功を確認するまで、有料プランは開始されません。\n確認中も、Freeの基本機能は利用できます。",
          }
        : billing.state === "pendingActivation" && billing.currentPlan === "standard"
          ? {
              ...STATE_PRESENTATION.pendingActivation,
              description: "Proプランへの変更結果を確認しています。\n確認中も、Standardプランを利用できます。",
            }
          : STATE_PRESENTATION[billing.state];
  const currentPlan = billing.currentPlan ?? (isPlanState(billing.state) ? billing.state : null);
  const currentPlanPresentation = currentPlan ? STATE_PRESENTATION[currentPlan] : null;
  const currentPlanDescription = billing.isComplimentary
    ? `利用人数${billing.peopleUsage.max}名・店舗${billing.shopUsage.max}件・管理者${billing.managerUsage.max}名まで利用できます。`
    : isPlanState(billing.state)
      ? currentPlanPresentation?.description
      : undefined;
  const planSummaryHeading =
    billing.state === "migrationPending" || (billing.state === "pendingActivation" && billing.currentPlan === null)
      ? "現在の利用状態"
      : "現在のプラン";
  const planSummaryLabel =
    currentPlanPresentation?.label ??
    (billing.state === "migrationPending"
      ? "設定移行中"
      : billing.state === "pendingActivation"
        ? "契約状態の確認が必要"
        : "確認中");
  return (
    <Stack gap={{ base: 6, md: 7 }}>
      <Stack gap={4}>
        {billing.currentPlan === "free" && billing.paymentFailure && (
          <OrganizationPaymentFailureAlert
            terminationPending={billing.paymentFailure.terminationPending}
            onStartPaidPlan={() => onManagePlan("standard")}
          />
        )}

        {!billing.isComplimentary && !billing.canManagePlan && billing.managePlanDisabledReason && (
          <Text id="organization-billing-manage-plan-disabled-reason" fontSize="sm" color="orange.700">
            {billing.managePlanDisabledReason}
          </Text>
        )}

        <PlanSummary
          billing={billing}
          currentPlanHeading={planSummaryHeading}
          currentPlanLabel={planSummaryLabel}
          currentPlanDescription={currentPlanDescription}
          presentation={presentation}
          isServiceStopScheduled={isServiceStopScheduled}
        />

        {isExceptionalState(billing.state) && !isServiceStopScheduled && (
          <BillingStateAlert billing={billing} presentation={presentation} pendingCheckout={pendingCheckout} />
        )}

        {!isExceptionalState(billing.state) && billing.blockedReason && (
          <Box borderWidth="1px" borderColor="orange.200" bg="orange.50" borderRadius="lg" p={3}>
            <Text fontSize="sm" fontWeight="semibold" color="orange.900">
              {isUsageLimitExceeded ? "上限超過のため利用を制限しています" : "操作できない理由"}
            </Text>
            <Text mt={1} fontSize="sm" color="orange.800">
              {billing.blockedReason}
            </Text>
          </Box>
        )}

        {shouldShowPlanComparison(billing) && (
          <PlanComparisonCards
            billing={billing}
            prices={planPrices}
            onSelectPlan={onManagePlan}
            onRetryPrice={onRetryPlanPrice}
          />
        )}
      </Stack>

      <PaymentInformation
        billing={billing}
        onUpdatePaymentMethod={onUpdatePaymentMethod}
        onUpdateBillingEmail={onUpdateBillingEmail}
      />
    </Stack>
  );
};

function PlanSummary({
  billing,
  currentPlanHeading,
  currentPlanLabel,
  currentPlanDescription,
  presentation,
  isServiceStopScheduled,
}: {
  billing: OrganizationBillingView;
  currentPlanHeading: string;
  currentPlanLabel: string;
  currentPlanDescription?: string;
  presentation: (typeof STATE_PRESENTATION)[BillingDisplayState];
  isServiceStopScheduled: boolean;
}) {
  return (
    <Box minW={0} borderWidth="1px" borderColor="blackAlpha.100" borderRadius="xl" bg="white" overflow="hidden">
      <Grid
        templateColumns={{
          base: "repeat(2, minmax(0, 1fr))",
          lg: "minmax(180px, 1.2fr) minmax(150px, 1fr) minmax(180px, 1fr)",
        }}
        alignItems="stretch"
      >
        <Stack
          gridColumn={{ base: "1 / -1", lg: "auto" }}
          gap={1.5}
          px={{ base: 4, md: 5 }}
          py={{ base: 4, md: 5 }}
          justify="center"
        >
          <Text textStyle="label" fontWeight="semibold" color="fg.muted">
            {currentPlanHeading}
          </Text>
          <HStack gap={2} wrap="wrap">
            <Heading as="h3" fontSize={{ base: "xl", md: "2xl" }} lineHeight="shorter">
              {currentPlanLabel}
            </Heading>
            {billing.state === "trial" && billing.hasTrialContinuation && (
              <Badge variant="subtle" colorPalette="teal" bg="teal.100">
                {billing.targetPlan ? planLabel(billing.targetPlan) : "有料プラン"}継続登録済み
              </Badge>
            )}
            {billing.isComplimentary && (
              <Badge variant="subtle" colorPalette="teal" bg="teal.100">
                支払い不要
              </Badge>
            )}
          </HStack>
          {currentPlanDescription && (
            <Text textStyle="bodySm" color="fg.muted">
              {currentPlanDescription}
            </Text>
          )}
          {billing.isComplimentary && (
            <Text textStyle="bodySm" color="fg.muted">
              Proプラン相当の機能を期限なく無料で利用できます。
            </Text>
          )}
        </Stack>

        <Stack
          gap={1.5}
          px={{ base: 4, md: 5 }}
          py={{ base: 3, md: 5 }}
          borderTopWidth={{ base: "1px", lg: 0 }}
          borderRightWidth={{ base: "1px", lg: 0 }}
          borderLeftWidth={{ base: 0, lg: "1px" }}
          borderColor="blackAlpha.100"
          justify="center"
        >
          <Text textStyle="label" fontWeight="semibold" color="fg.muted">
            状態
          </Text>
          <BillingStatus
            state={billing.state}
            status={presentation.status}
            label={isActivePlanUsageLimitExceeded(billing) ? "上限超過" : billingStatusLabel(billing.state)}
          />
          {isScheduledPlanTransition(billing.state) && billing.currentPlan && billing.targetPlan && (
            <Text ps={5} fontSize="sm" color="fg.muted">
              {planLabel(billing.currentPlan)} → {planLabel(billing.targetPlan)}
            </Text>
          )}
        </Stack>

        <Stack
          gap={1.5}
          px={{ base: 4, md: 5 }}
          py={{ base: 3, md: 5 }}
          borderTopWidth={{ base: "1px", lg: 0 }}
          borderLeftWidth={{ base: 0, lg: "1px" }}
          borderColor="blackAlpha.100"
          justify="center"
        >
          <Text textStyle="label" fontWeight="semibold" color="fg.muted">
            {billing.nextEvent?.label ?? "次の支払日"}
          </Text>
          <HStack gap={1.5} align="flex-start">
            <Box color="fg.muted" mt={0.5} flexShrink={0}>
              <LuCalendarClock aria-hidden />
            </Box>
            <Text fontSize="sm" fontWeight="bold" fontVariantNumeric="tabular-nums">
              {billing.nextEvent?.date ?? "なし"}
            </Text>
          </HStack>
          {billing.state === "trial" && (
            <Text textStyle="bodySm" color="fg.muted">
              {trialContinuationDescription(billing)}
            </Text>
          )}
          {isServiceStopScheduled && (
            <Text fontSize="12px" color="fg.muted">
              解約後もデータを閲覧できます。
            </Text>
          )}
        </Stack>
      </Grid>
    </Box>
  );
}

function PlanComparisonCards({
  billing,
  prices,
  onSelectPlan,
  onRetryPrice,
}: {
  billing: OrganizationBillingView;
  prices: BillingPlanPrices;
  onSelectPlan: (targetPlan: BillingProductPlan) => void;
  onRetryPrice: (targetPlan: PaidBillingPlan) => void;
}) {
  const visiblePlans =
    billing.currentPlan === "free" ||
    (billing.state === "scheduledChange" && billing.targetPlan === "free" && billing.restrictAtPeriodEnd !== true)
      ? (["free", "standard", "pro"] as const)
      : (["standard", "pro"] as const);
  const serviceStopAction = resolveBillingPlanAction(billing, "free");
  return (
    <Stack gap={3}>
      <Grid templateColumns={{ base: "1fr", md: `repeat(${visiblePlans.length}, minmax(0, 1fr))` }} gap={3}>
        {visiblePlans.map((plan) => {
          const isCurrent = billing.currentPlan === plan;
          const action = resolveBillingPlanAction(billing, plan);
          const limits = ORGANIZATION_PLAN_LIMITS[plan];
          return (
            <Stack
              key={plan}
              borderWidth="1px"
              borderColor={isCurrent ? "teal.600" : "blackAlpha.100"}
              borderRadius="xl"
              bg={isCurrent ? "teal.50" : "white"}
              p={4}
              gap={3}
            >
              <HStack justify="space-between" align="flex-start" gap={2}>
                <Heading as="h3" fontSize="md">
                  {planLabel(plan)}
                </Heading>
                {isCurrent && (
                  <Badge colorPalette="teal" variant="subtle" bg="teal.100">
                    利用中
                  </Badge>
                )}
              </HStack>

              <PlanPrice
                plan={plan}
                price={plan === "free" ? null : prices[plan]}
                isComplimentary={billing.isComplimentary && plan === "pro"}
                onRetry={plan === "free" ? undefined : () => onRetryPrice(plan)}
              />

              <Stack gap={1} color="fg.muted">
                <Text textStyle="sm">利用人数 {limits.maxPeople}名まで</Text>
                <Text textStyle="sm">店舗 {limits.maxShops}店舗まで</Text>
                <Text textStyle="sm">管理者 {limits.maxActiveManagers}名まで</Text>
              </Stack>

              {action && (
                <Button
                  size="sm"
                  variant={isSecondaryPlanAction(action) ? "outline" : "solid"}
                  colorPalette={
                    action.kind === "schedulePlanChange"
                      ? "orange"
                      : action.kind === "cancelScheduledPlanChange"
                        ? "gray"
                        : "teal"
                  }
                  mt="auto"
                  minH="40px"
                  onClick={() => onSelectPlan(plan)}
                >
                  {planChangeLabel(action, plan)}
                </Button>
              )}
            </Stack>
          );
        })}
      </Grid>
      {(serviceStopAction?.kind === "scheduleServiceStop" || serviceStopAction?.kind === "cancelTrialContinuation") && (
        <Flex justify="flex-end">
          <Button size="sm" variant="outline" colorPalette="red" minH="40px" onClick={() => onSelectPlan("free")}>
            {serviceStopAction.kind === "scheduleServiceStop" ? "期間末に利用を停止" : "有料継続を取り消す"}
          </Button>
        </Flex>
      )}
    </Stack>
  );
}

function PlanPrice({
  plan,
  price,
  isComplimentary,
  onRetry,
}: {
  plan: BillingProductPlan;
  price: BillingPlanPrices[PaidBillingPlan] | null;
  isComplimentary: boolean;
  onRetry?: () => void;
}) {
  if (plan === "free") {
    return (
      <Text fontSize="lg" fontWeight="bold">
        ¥0
      </Text>
    );
  }
  if (isComplimentary) {
    return (
      <Text fontSize="lg" fontWeight="bold">
        支払い不要
      </Text>
    );
  }
  if (!price || price.status === "loading") {
    return (
      <Text fontSize="sm" color="fg.muted">
        料金を読み込み中
      </Text>
    );
  }
  if (price.status === "available") {
    return (
      <Text fontSize="lg" fontWeight="bold">
        {formatPlanPriceLine(price.value)}
      </Text>
    );
  }
  return (
    <Stack gap={1.5}>
      <Text fontSize="sm" color="orange.700">
        {price.status === "unavailable" ? "料金を表示できません" : "料金を取得できませんでした"}
      </Text>
      {onRetry && (
        <Button size="xs" variant="outline" alignSelf="flex-start" onClick={onRetry}>
          料金を再読み込み
        </Button>
      )}
    </Stack>
  );
}

function planChangeLabel(action: BillingPlanAction, plan: BillingProductPlan) {
  if (action.kind === "cancelScheduledPlanChange") {
    return action.isServiceStop ? "解約予約を取り消す" : "変更予約を取り消す";
  }
  if (action.kind === "cancelTrialContinuation") return "有料継続を取り消す";
  if (action.kind === "scheduleServiceStop") return "期間末で解約";
  return `${planLabel(plan)}へ変更`;
}

function isSecondaryPlanAction(action: BillingPlanAction) {
  return (
    action.kind === "schedulePlanChange" ||
    action.kind === "scheduleServiceStop" ||
    action.kind === "cancelScheduledPlanChange"
  );
}

function BillingStatus({
  state,
  status,
  label,
}: {
  state: BillingDisplayState;
  status: (typeof STATE_PRESENTATION)[BillingDisplayState]["status"];
  label: string;
}) {
  const color = statusColor(status);
  const StatusIcon = isPlanState(state) ? LuCircleCheck : status === "error" ? LuCircleAlert : LuClock3;

  return (
    <HStack gap={1.5} color={color} align="flex-start">
      <Box mt={0.5} flexShrink={0}>
        <StatusIcon aria-hidden />
      </Box>
      <Text fontSize="sm" fontWeight="bold">
        {label}
      </Text>
    </HStack>
  );
}

function BillingStateAlert({
  billing,
  presentation,
  pendingCheckout,
}: {
  billing: OrganizationBillingView;
  presentation: (typeof STATE_PRESENTATION)[BillingDisplayState];
  pendingCheckout: Props["pendingCheckout"];
}) {
  const showPendingCheckoutRecovery = billing.state === "pendingActivation" && !billing.isComplimentary;
  const reductions = getRequiredReductions(billing);
  const showReductions =
    billing.state === "scheduledChange" && (reductions.people > 0 || reductions.shops > 0 || reductions.managers > 0);

  return (
    <Alert.Root
      status={presentation.status}
      borderWidth="1px"
      borderRadius="xl"
      alignItems="flex-start"
      py={{ base: 3, md: 3 }}
    >
      <Alert.Indicator mt={1} />
      <Flex flex={1} minW={0} gap={3} direction={{ base: "column", md: "row" }} align={{ md: "center" }}>
        <Alert.Content>
          <HStack gap={2} wrap="wrap">
            <Alert.Title>{presentation.label}</Alert.Title>
            {billing.targetPlan && (
              <Badge variant="subtle" colorPalette="teal" bg="teal.100">
                変更先: {planLabel(billing.targetPlan)}
              </Badge>
            )}
            {shouldShowCurrentPlan(billing.state) && billing.currentPlan && (
              <Badge variant="outline" colorPalette="gray">
                現在: {planLabel(billing.currentPlan)}
              </Badge>
            )}
          </HStack>
          <Alert.Description whiteSpace="pre-line">
            <Stack gap={1}>
              <Text>{presentation.description}</Text>
              {billing.blockedReason && <Text>{billing.blockedReason}</Text>}
              {showReductions && <ReductionGuidance reductions={reductions} />}
              {showPendingCheckoutRecovery && <PendingCheckoutGuidance status={pendingCheckout.status} />}
            </Stack>
          </Alert.Description>
        </Alert.Content>

        {showPendingCheckoutRecovery ? <PendingCheckoutActions pendingCheckout={pendingCheckout} /> : null}
      </Flex>
    </Alert.Root>
  );
}

function PendingCheckoutGuidance({ status }: { status: BillingPendingCheckoutStatus }) {
  if (status === "checking") return <Text>Stripeの支払い状況を確認しています。</Text>;
  if (status === "open") {
    return <Text>支払い手続きはまだ完了していません。続けるか、支払いをやめるか選んでください。</Text>;
  }
  if (status === "pending") return <Text>支払い完了後の反映を待っています。この画面でお待ちください。</Text>;
  if (status === "unavailable") {
    return <Text>支払い状況を確認できませんでした。通信状態を確認して、もう一度お試しください。</Text>;
  }
  return null;
}

function PendingCheckoutActions({ pendingCheckout }: { pendingCheckout: Props["pendingCheckout"] }) {
  if (pendingCheckout.status === "open") {
    return (
      <Flex
        gap={2}
        direction={{ base: "column", sm: "row" }}
        align={{ sm: "center" }}
        flexShrink={0}
        w={{ base: "full", md: "auto" }}
      >
        <Button
          size="sm"
          variant="outline"
          minH={{ base: "44px", md: "36px" }}
          onClick={pendingCheckout.onCancel}
          loading={pendingCheckout.isCancelling}
          loadingText="支払いをやめる"
        >
          支払いをやめる
        </Button>
        <Button
          size="sm"
          colorPalette="teal"
          minH={{ base: "44px", md: "36px" }}
          onClick={pendingCheckout.onContinue}
          disabled={pendingCheckout.isCancelling}
        >
          支払いを続ける
        </Button>
      </Flex>
    );
  }
  if (pendingCheckout.status === "unavailable") {
    return (
      <Button
        size="sm"
        variant="outline"
        flexShrink={0}
        w={{ base: "full", md: "auto" }}
        minH={{ base: "44px", md: "36px" }}
        onClick={pendingCheckout.onRetry}
      >
        もう一度確認
      </Button>
    );
  }
  return null;
}

function ReductionGuidance({ reductions }: { reductions: ReturnType<typeof getRequiredReductions> }) {
  return (
    <Stack gap={0.5} fontWeight="semibold">
      {reductions.people > 0 && <Text>あと{reductions.people}名削除してください</Text>}
      {reductions.shops > 0 && <Text>あと{reductions.shops}店舗を整理してください</Text>}
      {reductions.managers > 0 && <Text>あと{reductions.managers}名分の管理者権限または招待を整理してください</Text>}
    </Stack>
  );
}

function trialContinuationDescription(billing: OrganizationBillingView) {
  if (billing.targetPlan === "pro") return "終了後はProへ継続する予定です。";
  if (billing.targetPlan === "standard") return "終了後はStandardへ継続する予定です。";
  return "終了後はFreeプランに移行します。";
}

function PaymentInformation({
  billing,
  onUpdatePaymentMethod,
  onUpdateBillingEmail,
}: {
  billing: OrganizationBillingView;
  onUpdatePaymentMethod: () => void;
  onUpdateBillingEmail: () => void;
}) {
  return (
    <Stack as="section" gap={3} aria-labelledby="payment-heading">
      <Heading id="payment-heading" as="h2" fontSize="lg">
        支払い情報
      </Heading>
      <Box borderWidth="1px" borderColor="blackAlpha.100" borderRadius="xl" bg="white" overflow="hidden">
        {billing.isComplimentary ? (
          <Text px={{ base: 4, md: 5 }} py={4} textStyle="bodySm">
            支払い不要の利用条件が適用されているため、利用料金はかかりません。
          </Text>
        ) : (
          <Stack gap={0} divideY="1px" divideColor="blackAlpha.100">
            <BillingInformationRow
              icon={LuCreditCard}
              label="支払い方法・請求書・領収書"
              actionLabel="支払い方法・請求書・領収書を見る"
              onAction={onUpdatePaymentMethod}
              disabled={!billing.canUpdatePaymentMethod}
              disabledReason={billing.paymentMethodDisabledReason}
              disabledReasonId="organization-billing-payment-method-disabled-reason"
              showDisabledReason={false}
            />
            <BillingInformationRow
              icon={LuMail}
              label="請求先メールアドレス"
              value={billing.billingEmail}
              actionLabel="請求先を変更"
              onAction={onUpdateBillingEmail}
              disabled={!billing.canUpdateBillingEmail}
              disabledReason={billing.billingEmailDisabledReason}
              disabledReasonId="organization-billing-email-disabled-reason"
            />
          </Stack>
        )}
      </Box>
    </Stack>
  );
}

function BillingInformationRow({
  icon: RowIcon,
  label,
  value,
  actionLabel,
  onAction,
  disabled,
  disabledReason,
  disabledReasonId,
  showDisabledReason = true,
}: {
  icon: typeof LuCreditCard;
  label: string;
  value?: string;
  actionLabel: string;
  onAction: () => void;
  disabled: boolean;
  disabledReason?: string;
  disabledReasonId: string;
  showDisabledReason?: boolean;
}) {
  const descriptionId = disabled && disabledReason ? disabledReasonId : undefined;

  return (
    <Stack gap={0}>
      <chakra.button
        type="button"
        aria-label={actionLabel}
        aria-describedby={descriptionId}
        disabled={disabled}
        title={disabled ? disabledReason : undefined}
        display="flex"
        alignItems="center"
        gap={{ base: 2.5, md: 3 }}
        w="full"
        minH="64px"
        px={{ base: 3, md: 4 }}
        py={3.5}
        textAlign="left"
        bg="transparent"
        color="gray.900"
        cursor={disabled ? "not-allowed" : "pointer"}
        opacity={disabled ? 0.64 : 1}
        transitionProperty="background-color"
        transitionDuration="faster"
        _hover={disabled ? undefined : { bg: "gray.50" }}
        _active={disabled ? undefined : { bg: "gray.100", transitionDuration: "0ms" }}
        _focusVisible={{
          outlineWidth: "2px",
          outlineStyle: "solid",
          outlineColor: "teal.500",
          outlineOffset: "-2px",
        }}
        onClick={onAction}
      >
        <Box color="gray.700" flexShrink={0}>
          <RowIcon aria-hidden />
        </Box>
        <Grid
          flex={1}
          minW={0}
          templateColumns={
            value ? { base: "minmax(88px, auto) minmax(0, 1fr)", md: "160px minmax(0, 1fr)" } : "minmax(0, 1fr)"
          }
          alignItems="center"
          gap={{ base: 2, md: 4 }}
        >
          <Text textStyle="label" fontWeight="semibold" color="gray.700">
            {label}
          </Text>
          {value && (
            <Text textStyle="sm" color="gray.900" fontWeight="medium" overflowWrap="anywhere">
              {value}
            </Text>
          )}
        </Grid>
        <Flex color="fg.muted" fontSize="lg" flexShrink={0} aria-hidden>
          <LuChevronRight aria-hidden />
        </Flex>
      </chakra.button>
      {descriptionId && showDisabledReason && (
        <Text
          id={disabledReasonId}
          px={{ base: 3, md: 4 }}
          pb={3}
          ps={{ base: 10, md: 11 }}
          textStyle="bodySm"
          color="orange.700"
        >
          {disabledReason}
        </Text>
      )}
      {descriptionId && !showDisabledReason && <VisuallyHidden id={disabledReasonId}>{disabledReason}</VisuallyHidden>}
    </Stack>
  );
}

function billingStatusLabel(state: BillingDisplayState): string {
  if (state === "trial") return "トライアル中";
  if (isPlanState(state)) return "利用中";
  return STATE_PRESENTATION[state].label;
}

function isActivePlanUsageLimitExceeded(billing: OrganizationBillingView): boolean {
  if (!isPlanState(billing.state)) return false;
  const reductions = getRequiredReductions(billing);
  return reductions.people > 0 || reductions.shops > 0 || reductions.managers > 0;
}

function statusColor(status: (typeof STATE_PRESENTATION)[BillingDisplayState]["status"]): string {
  if (status === "error") return "red.700";
  if (status === "warning") return "orange.700";
  if (status === "success") return "green.700";
  return "blue.700";
}

function isPlanState(state: BillingDisplayState): state is "trial" | "free" | "standard" | "pro" {
  return state === "trial" || state === "free" || state === "standard" || state === "pro";
}

function isExceptionalState(state: BillingDisplayState): boolean {
  return !isPlanState(state);
}

function isServiceStopScheduledState(billing: Pick<OrganizationBillingView, "state" | "restrictAtPeriodEnd">): boolean {
  return billing.state === "scheduledChange" && billing.restrictAtPeriodEnd === true;
}

function isScheduledPlanTransition(state: BillingDisplayState): boolean {
  return state === "scheduledChange";
}

function shouldShowPlanComparison(billing: OrganizationBillingView) {
  if (billing.isComplimentary) return false;
  return (
    isPlanState(billing.state) ||
    billing.state === "scheduledChange" ||
    (billing.state === "pendingActivation" && billing.canManagePlan)
  );
}

function shouldShowCurrentPlan(state: BillingDisplayState): boolean {
  return state === "initialPaymentPending" || state === "scheduledChange";
}
