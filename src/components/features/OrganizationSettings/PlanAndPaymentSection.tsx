import { Alert, Badge, Box, Flex, Grid, Heading, HStack, Stack, Text } from "@chakra-ui/react";
import {
  LuCalendarClock,
  LuChevronRight,
  LuCircleAlert,
  LuCircleCheck,
  LuClock3,
  LuCreditCard,
  LuMail,
  LuReceiptText,
} from "react-icons/lu";
import { ORGANIZATION_PLAN_LIMITS } from "@/convex/organizationBilling/planLimits";
import { Button, IconButton } from "@/src/components/ui/Button";
import {
  type BillingPlanAction,
  formatPlanPrice,
  getRequiredReductions,
  planLabel,
  resolveBillingPlanAction,
} from "./BillingSettings/script";
import type {
  BillingDisplayState,
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
  onOpenBillingDocuments: () => void;
};

function formatPlanLimitsDescription(plan: keyof typeof ORGANIZATION_PLAN_LIMITS, suffix: string): string {
  const limits = ORGANIZATION_PLAN_LIMITS[plan];
  return `利用人数${limits.maxPeople}名・店舗${limits.maxActiveShops}件・管理者${limits.maxActiveManagers}名まで${suffix}`;
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
    label: "無料",
    status: "info",
    description: formatPlanLimitsDescription("free", "、基本的なシフト運用を利用できます。"),
  },
  pro: {
    label: "Pro",
    status: "success",
    description: formatPlanLimitsDescription("pro", "利用できます。"),
  },
  business: {
    label: "Business",
    status: "success",
    description: formatPlanLimitsDescription("business", "利用できます。"),
  },
  initialPaymentPending: {
    label: "初回請求を確認中",
    status: "info",
    description: "初回支払いの結果を確認しています。\n確認中も、選択した有料プランを利用できます。",
  },
  pendingActivation: {
    label: "支払い結果を確認中",
    status: "info",
    description: "支払いの成功を確認するまで、有料プランは開始されず、業務データも更新できません。",
  },
  grace: {
    label: "支払い猶予中",
    status: "warning",
    description: "支払い方法を確認してください。\n期限までは現在のプランを利用できます。",
  },
  restricted: {
    label: "契約制限中",
    status: "error",
    description:
      "プラン移行に伴い、機能を制限しています。\n支払いを確認するか、利用人数・店舗数を変更先プランの上限内に調整してください。",
  },
  scheduledFree: {
    label: "無料へ変更予定",
    status: "warning",
    description: "現在の支払い済み期間が終わるまでは、現在の有料プランを利用できます。",
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
  onOpenBillingDocuments,
}: Props) => {
  const presentation =
    billing.state === "restricted" && billing.limitPlan
      ? {
          ...STATE_PRESENTATION.restricted,
          description: `${planLabel(billing.limitPlan)}の上限に収まるよう、利用人数・店舗数・管理者数を整理してください。`,
        }
      : billing.state === "pendingActivation" && billing.currentPlan === "free"
        ? {
            ...STATE_PRESENTATION.pendingActivation,
            description:
              "支払いの成功を確認するまで、有料プランは開始されません。\n確認中も、無料の基本機能は利用できます。",
          }
        : STATE_PRESENTATION[billing.state];
  const currentPlan =
    billing.currentPlan ??
    (billing.state === "restricted"
      ? // 初回のプラン移行失敗など直前プランがない場合も、復旧基準の無料を表示する。
        (billing.previousPlan ?? "free")
      : isPlanState(billing.state)
        ? billing.state
        : null);
  const currentPlanPresentation = currentPlan ? STATE_PRESENTATION[currentPlan] : null;
  const planSummaryHeading =
    billing.state === "migrationPending" || (billing.state === "pendingActivation" && billing.currentPlan === null)
      ? "現在の利用状態"
      : billing.state === "restricted"
        ? "プラン"
        : "現在のプラン";
  const planSummaryLabel =
    currentPlanPresentation?.label ??
    (billing.state === "migrationPending"
      ? "設定移行中"
      : billing.state === "pendingActivation"
        ? "契約制限中"
        : "確認中");
  return (
    <Stack gap={{ base: 6, md: 7 }}>
      <Stack as="section" gap={4} aria-labelledby="plan-heading">
        <Stack gap={2}>
          <Heading id="plan-heading" as="h2" fontSize="lg">
            プラン
          </Heading>
          {!billing.isComplimentary && !billing.canManagePlan && billing.managePlanDisabledReason && (
            <Text id="organization-billing-manage-plan-disabled-reason" fontSize="sm" color="orange.700">
              {billing.managePlanDisabledReason}
            </Text>
          )}
        </Stack>

        <PlanSummary
          billing={billing}
          currentPlanHeading={planSummaryHeading}
          currentPlanLabel={planSummaryLabel}
          currentPlanDescription={isPlanState(billing.state) ? currentPlanPresentation?.description : undefined}
          presentation={presentation}
        />

        {isExceptionalState(billing.state) && (
          <BillingStateAlert
            billing={billing}
            presentation={presentation}
            onUpdatePaymentMethod={onUpdatePaymentMethod}
          />
        )}

        {!isExceptionalState(billing.state) && billing.blockedReason && (
          <Box borderWidth="1px" borderColor="orange.200" bg="orange.50" borderRadius="lg" p={3}>
            <Text fontSize="sm" fontWeight="semibold" color="orange.900">
              操作できない理由
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
        onOpenBillingDocuments={onOpenBillingDocuments}
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
}: {
  billing: OrganizationBillingView;
  currentPlanHeading: string;
  currentPlanLabel: string;
  currentPlanDescription?: string;
  presentation: (typeof STATE_PRESENTATION)[BillingDisplayState];
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
          <Text fontSize="xs" fontWeight="semibold" color="fg.muted">
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
            <Text fontSize="xs" color="fg.muted">
              {currentPlanDescription}
            </Text>
          )}
          {billing.isComplimentary && (
            <Text fontSize="xs" color="fg.muted">
              Businessの機能を料金なしで利用できます。
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
          <Text fontSize="xs" fontWeight="semibold" color="fg.muted">
            状態
          </Text>
          <BillingStatus state={billing.state} status={presentation.status} label={billingStatusLabel(billing.state)} />
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
          <Text fontSize="xs" fontWeight="semibold" color="fg.muted">
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
            <Text fontSize="xs" color="fg.muted" lineHeight="tall">
              {trialContinuationDescription(billing)}
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
  return (
    <Grid templateColumns={{ base: "1fr", md: "repeat(3, minmax(0, 1fr))" }} gap={3}>
      {(["free", "pro", "business"] as const).map((plan) => {
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
              isComplimentary={billing.isComplimentary && plan === "business"}
              onRetry={plan === "free" ? undefined : () => onRetryPrice(plan)}
            />

            <Stack gap={1} color="fg.muted">
              <Text fontSize="xs">利用人数 {limits.maxPeople}名まで</Text>
              <Text fontSize="xs">店舗 {limits.maxActiveShops}店舗まで</Text>
              <Text fontSize="xs">管理者 {limits.maxActiveManagers}名まで</Text>
            </Stack>

            {action && action.kind !== "openPortal" && (
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
                {planChangeLabel(action.kind, plan)}
              </Button>
            )}
          </Stack>
        );
      })}
    </Grid>
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
    const formatted = formatPlanPrice(price.value);
    return (
      <Stack gap={0}>
        <Text fontSize="lg" fontWeight="bold">
          {formatted.amount}
        </Text>
        <Text fontSize="xs" color="fg.muted">
          {formatted.interval}
        </Text>
      </Stack>
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

function planChangeLabel(kind: BillingPlanAction["kind"], plan: BillingProductPlan) {
  if (kind === "cancelScheduledPlanChange") return "変更予約を取り消す";
  if (kind === "cancelTrialContinuation") return "有料継続を取り消す";
  return `${planLabel(plan)}へ変更`;
}

function isSecondaryPlanAction(action: BillingPlanAction) {
  return action.kind === "schedulePlanChange" || action.kind === "cancelScheduledPlanChange";
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
  onUpdatePaymentMethod,
}: {
  billing: OrganizationBillingView;
  presentation: (typeof STATE_PRESENTATION)[BillingDisplayState];
  onUpdatePaymentMethod: () => void;
}) {
  const showPaymentRecovery = billing.state === "grace";
  const reductions = getRequiredReductions(billing);
  const showReductions =
    ((billing.state === "restricted" && billing.limitPlan !== undefined) ||
      billing.state === "scheduledChange" ||
      billing.state === "scheduledFree") &&
    (reductions.people > 0 || reductions.shops > 0 || reductions.managers > 0);

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
              {showPaymentRecovery && !billing.canUpdatePaymentMethod && billing.paymentMethodDisabledReason && (
                <Text id="organization-billing-recovery-payment-method-disabled-reason">
                  {billing.paymentMethodDisabledReason}
                </Text>
              )}
            </Stack>
          </Alert.Description>
        </Alert.Content>

        {showPaymentRecovery && !billing.isComplimentary && (
          <Button
            size="sm"
            variant="outline"
            colorPalette={presentation.status === "error" ? "red" : "orange"}
            flexShrink={0}
            w={{ base: "full", md: "auto" }}
            minH={{ base: "44px", md: "36px" }}
            onClick={onUpdatePaymentMethod}
            disabled={!billing.canUpdatePaymentMethod}
            title={!billing.canUpdatePaymentMethod ? billing.paymentMethodDisabledReason : undefined}
            aria-describedby={
              !billing.canUpdatePaymentMethod && billing.paymentMethodDisabledReason
                ? "organization-billing-recovery-payment-method-disabled-reason"
                : undefined
            }
          >
            支払い方法を見る
          </Button>
        )}
      </Flex>
    </Alert.Root>
  );
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
  if (billing.targetPlan === "business") return "終了後はBusinessへ継続する予定です。";
  if (billing.targetPlan === "pro") return "終了後はProへ継続する予定です。";
  const limits = ORGANIZATION_PLAN_LIMITS.free;
  return `継続登録がない場合、終了後は利用人数${limits.maxPeople}名・店舗${limits.maxActiveShops}件までとなります。`;
}

function PaymentInformation({
  billing,
  onUpdatePaymentMethod,
  onUpdateBillingEmail,
  onOpenBillingDocuments,
}: {
  billing: OrganizationBillingView;
  onUpdatePaymentMethod: () => void;
  onUpdateBillingEmail: () => void;
  onOpenBillingDocuments: () => void;
}) {
  return (
    <Stack as="section" gap={3} aria-labelledby="payment-heading">
      <Heading id="payment-heading" as="h2" fontSize="lg">
        支払い情報
      </Heading>
      <Box borderWidth="1px" borderColor="blackAlpha.100" borderRadius="xl" bg="white" overflow="hidden">
        {billing.isComplimentary ? (
          <Text px={{ base: 4, md: 5 }} py={4} fontSize="12px">
            早期登録特典により利用料金はかかりません。
          </Text>
        ) : (
          <Stack gap={0} divideY="1px" divideColor="blackAlpha.100">
            <BillingInformationRow
              icon={LuCreditCard}
              label="支払い方法"
              actionLabel="支払い方法を見る"
              onAction={onUpdatePaymentMethod}
              disabled={!billing.canUpdatePaymentMethod}
              disabledReason={billing.paymentMethodDisabledReason}
              disabledReasonId="organization-billing-payment-method-disabled-reason"
              showDisabledReason={false}
            />
            <BillingInformationRow
              icon={LuReceiptText}
              label="請求書・領収書"
              actionLabel="請求書・領収書を見る"
              onAction={onOpenBillingDocuments}
              disabled={!billing.canUpdatePaymentMethod}
              disabledReason={billing.paymentMethodDisabledReason}
              disabledReasonId="organization-billing-documents-disabled-reason"
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
  const descriptionId = disabled && disabledReason && showDisabledReason ? disabledReasonId : undefined;

  return (
    <Stack gap={1.5} px={{ base: 3, md: 4 }} py={{ base: 3, md: 2.5 }}>
      <Flex align="center" gap={{ base: 2, md: 3 }}>
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
          <Text fontSize={{ base: "xs", md: "sm" }} fontWeight="semibold" color="gray.700">
            {label}
          </Text>
          {value && (
            <Text
              fontSize={{ base: "xs", md: "sm" }}
              color="gray.900"
              fontWeight={{ base: "normal", md: "medium" }}
              overflowWrap="anywhere"
            >
              {value}
            </Text>
          )}
        </Grid>
        <Button
          display={{ base: "none", md: "inline-flex" }}
          size="sm"
          variant="solid"
          colorPalette="teal"
          flexShrink={0}
          onClick={onAction}
          disabled={disabled}
          title={disabled ? disabledReason : undefined}
          aria-describedby={descriptionId}
        >
          {actionLabel}
        </Button>
        <IconButton
          display={{ base: "inline-flex", md: "none" }}
          size="sm"
          minW="44px"
          minH="44px"
          variant="solid"
          colorPalette="teal"
          flexShrink={0}
          aria-label={actionLabel}
          onClick={onAction}
          disabled={disabled}
          title={disabled ? disabledReason : undefined}
          aria-describedby={descriptionId}
        >
          <LuChevronRight aria-hidden />
        </IconButton>
      </Flex>
      {descriptionId && (
        <Text id={disabledReasonId} ml={{ base: 7, md: 8 }} fontSize="xs" color="orange.700">
          {disabledReason}
        </Text>
      )}
    </Stack>
  );
}

function billingStatusLabel(state: BillingDisplayState): string {
  if (state === "trial") return "トライアル中";
  if (isPlanState(state)) return "利用中";
  return STATE_PRESENTATION[state].label;
}

function statusColor(status: (typeof STATE_PRESENTATION)[BillingDisplayState]["status"]): string {
  if (status === "error") return "red.700";
  if (status === "warning") return "orange.700";
  if (status === "success") return "green.700";
  return "blue.700";
}

function isPlanState(state: BillingDisplayState): state is "trial" | "free" | "pro" | "business" {
  return state === "trial" || state === "free" || state === "pro" || state === "business";
}

function isExceptionalState(state: BillingDisplayState): boolean {
  return !isPlanState(state);
}

function shouldShowPlanComparison(billing: OrganizationBillingView) {
  if (billing.isComplimentary) return false;
  return (
    isPlanState(billing.state) ||
    billing.state === "scheduledChange" ||
    billing.state === "scheduledFree" ||
    ((billing.state === "restricted" || billing.state === "pendingActivation") && billing.canManagePlan)
  );
}

function shouldShowCurrentPlan(state: BillingDisplayState): boolean {
  return (
    state === "initialPaymentPending" || state === "grace" || state === "scheduledChange" || state === "scheduledFree"
  );
}
