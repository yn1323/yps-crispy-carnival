import { Alert, Badge, Box, Flex, Heading, HStack, Stack, Text } from "@chakra-ui/react";
import { LuCalendarClock, LuCreditCard, LuFileText, LuGauge, LuUsers } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";
import type { BillingDisplayState, BillingInvoiceView, OrganizationBillingView } from "./types";

type Props = {
  billing: OrganizationBillingView;
  onManagePlan: () => void;
  onUpdatePaymentMethod: () => void;
  onUpdateBillingEmail: () => void;
  onOpenInvoice: (invoiceId: string) => void;
};

const STATE_PRESENTATION: Record<
  BillingDisplayState,
  { label: string; status: "info" | "success" | "warning" | "error"; description: string }
> = {
  trial: {
    label: "無料体験",
    status: "info",
    description: "無料体験中はBusinessと同じ上限と有料機能を利用できます。",
  },
  free: {
    label: "Free",
    status: "info",
    description: "1名の管理者と最大1店舗で、基本的なシフト運用を利用できます。",
  },
  pro: {
    label: "Pro",
    status: "success",
    description: "複数管理者・複数店舗を利用できます。",
  },
  business: {
    label: "Business",
    status: "success",
    description: "複数管理者・複数店舗を利用できます。",
  },
  initialPaymentPending: {
    label: "初回請求を確認中",
    status: "info",
    description: "初回支払いの結果を確認しています。確認中も選択した有料プランを利用できます。",
  },
  pendingActivation: {
    label: "支払い結果を確認中",
    status: "info",
    description: "支払い成功を確認するまで有料プランは開始されず、業務データの更新もできません。",
  },
  grace: {
    label: "支払い猶予中",
    status: "warning",
    description: "期限までは現在のプランを利用できます。支払い方法を確認してください。",
  },
  restricted: {
    label: "契約制限中",
    status: "error",
    description:
      "プラン移行に伴い、機能を制限しています。\n支払いを確認するか、人数、店舗数を無料プラン枠に収まるよう調整してください。",
  },
  scheduledFree: {
    label: "Freeへ変更予定",
    status: "warning",
    description: "現在の支払い済み期間が終わるまでは、現在の有料プランを利用できます。",
  },
  scheduledPro: {
    label: "Proへ変更予定",
    status: "info",
    description: "次回更新日まではBusinessを利用し、更新日時点でProの上限を再確認します。",
  },
  migrationPending: {
    label: "設定を移行中",
    status: "info",
    description: "グループ単位のプラン設定を準備しています。完了するまで既存データを閲覧できます。",
  },
};

export const PlanAndPaymentSection = ({
  billing,
  onManagePlan,
  onUpdatePaymentMethod,
  onUpdateBillingEmail,
  onOpenInvoice,
}: Props) => {
  const presentation =
    billing.state === "pendingActivation" && billing.currentPlan === "free"
      ? {
          ...STATE_PRESENTATION.pendingActivation,
          description: "支払い成功を確認するまで有料プランは開始されません。確認中もFreeの基本機能は利用できます。",
        }
      : STATE_PRESENTATION[billing.state];
  const currentPlan =
    billing.currentPlan ??
    (billing.state === "restricted"
      ? // 初回のプラン移行失敗など直前プランがない場合も、復旧基準のFreeを表示する。
        (billing.previousPlan ?? "free")
      : isPlanState(billing.state)
        ? billing.state
        : null);
  const currentPlanPresentation = currentPlan ? STATE_PRESENTATION[currentPlan] : null;
  const stateAlert = isExceptionalState(billing.state) ? (
    <Alert.Root status={presentation.status} borderRadius="xl" alignItems="flex-start">
      <Alert.Indicator mt={1} />
      <Alert.Content>
        {billing.state !== "restricted" && (
          <HStack gap={2} wrap="wrap">
            <Alert.Title>{presentation.label}</Alert.Title>
            {billing.targetPlan && (
              <Badge variant="subtle" colorPalette="teal">
                変更先: {planLabel(billing.targetPlan)}
              </Badge>
            )}
            {shouldShowCurrentPlan(billing.state) && billing.currentPlan && (
              <Badge variant="outline" colorPalette="gray">
                現在: {planLabel(billing.currentPlan)}
              </Badge>
            )}
          </HStack>
        )}
        <Alert.Description whiteSpace={billing.state === "restricted" ? "pre-line" : undefined}>
          {presentation.description}
        </Alert.Description>
      </Alert.Content>
    </Alert.Root>
  ) : null;

  return (
    <Stack gap={6}>
      <Stack as="section" gap={4} aria-labelledby="plan-heading">
        <HStack gap={2}>
          <LuGauge aria-hidden />
          <Heading id="plan-heading" as="h2" fontSize="lg">
            プラン
          </Heading>
        </HStack>

        {currentPlanPresentation && (
          <Box borderWidth="1px" borderRadius="xl" bg="white" p={{ base: 4, md: 5 }}>
            <Stack gap={3}>
              <Text fontSize="sm" fontWeight="semibold" color="fg.muted">
                {billing.state === "restricted" ? "プラン" : "現在のプラン"}
              </Text>
              <HStack gap={2} wrap="wrap">
                <Heading as="h3" fontSize="2xl">
                  {currentPlanPresentation.label}
                </Heading>
                {billing.isComplimentary && (
                  <Badge variant="subtle" colorPalette="teal">
                    支払い不要
                  </Badge>
                )}
              </HStack>
              <Stack gap={2}>
                <Text fontSize="sm">{currentPlanPresentation.description}</Text>
                {billing.isComplimentary && (
                  <Text fontSize="sm">
                    早期利用特典として、追加料金なしでBusinessプランと同等の機能がご利用いただけます。
                  </Text>
                )}
              </Stack>
            </Stack>
          </Box>
        )}

        {billing.state !== "restricted" && stateAlert}

        {billing.state !== "restricted" && billing.blockedReason && (
          <Box borderWidth="1px" borderColor="orange.200" bg="orange.50" borderRadius="lg" p={3}>
            <Text fontSize="sm" fontWeight="semibold" color="orange.900">
              操作できない理由
            </Text>
            <Text mt={1} fontSize="sm" color="orange.800">
              {billing.blockedReason}
            </Text>
          </Box>
        )}

        {billing.state !== "migrationPending" && (
          <Flex gap={3} direction={{ base: "column", md: "row" }}>
            <UsageMeter
              icon={LuUsers}
              label="利用人数"
              current={billing.peopleUsage.current}
              max={billing.peopleUsage.max}
            />
            <UsageMeter icon={LuGauge} label="店舗数" current={billing.shopUsage.current} max={billing.shopUsage.max} />
          </Flex>
        )}

        {billing.state === "restricted" && stateAlert}

        {billing.nextEvent && (
          <HStack borderWidth="1px" borderRadius="lg" bg="white" p={3} gap={3} align="flex-start">
            <Box color="teal.600" mt={0.5}>
              <LuCalendarClock aria-hidden />
            </Box>
            <Stack gap={0.5}>
              <Text fontSize="xs" color="fg.muted">
                {billing.nextEvent.label}
              </Text>
              <Text fontSize="sm" fontWeight="bold">
                {billing.nextEvent.date}
              </Text>
            </Stack>
          </HStack>
        )}

        {!billing.isComplimentary && (
          <Flex gap={2} wrap="wrap">
            <Button
              colorPalette="teal"
              onClick={onManagePlan}
              disabled={!billing.canManagePlan}
              title={!billing.canManagePlan ? billing.managePlanDisabledReason : undefined}
              aria-describedby={
                !billing.canManagePlan && billing.managePlanDisabledReason
                  ? "organization-billing-manage-plan-disabled-reason"
                  : undefined
              }
            >
              {isPaidPlanRecovery(billing) ? "有料プランを開始・再開" : "プランを確認・変更"}
            </Button>
          </Flex>
        )}
        {!billing.isComplimentary && !billing.canManagePlan && billing.managePlanDisabledReason && (
          <Text id="organization-billing-manage-plan-disabled-reason" fontSize="sm" color="orange.700">
            {billing.managePlanDisabledReason}
          </Text>
        )}
      </Stack>

      <Stack as="section" gap={4} aria-labelledby="payment-heading">
        <HStack gap={2}>
          <LuCreditCard aria-hidden />
          <Heading id="payment-heading" as="h2" fontSize="lg">
            支払い
          </Heading>
        </HStack>
        <Box borderWidth="1px" borderRadius="xl" bg="white" p={{ base: 4, md: 5 }}>
          {billing.isComplimentary ? (
            <Text>現在の利用料金はかかりません。支払い方法の登録は不要です。</Text>
          ) : (
            <Stack gap={4}>
              <Flex
                justify="space-between"
                align={{ base: "flex-start", md: "center" }}
                gap={3}
                direction={{ base: "column", md: "row" }}
              >
                <Stack gap={1}>
                  <Text fontSize="xs" color="fg.muted">
                    支払い方法
                  </Text>
                  <Text fontWeight="semibold">{billing.paymentMethodLabel ?? "支払い方法は未登録です"}</Text>
                </Stack>
                <Stack gap={1.5} align={{ base: "stretch", md: "flex-end" }}>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={onUpdatePaymentMethod}
                    disabled={!billing.canUpdatePaymentMethod}
                    title={!billing.canUpdatePaymentMethod ? billing.paymentMethodDisabledReason : undefined}
                    aria-describedby={
                      !billing.canUpdatePaymentMethod && billing.paymentMethodDisabledReason
                        ? "organization-billing-payment-method-disabled-reason"
                        : undefined
                    }
                  >
                    支払い方法を更新
                  </Button>
                  {!billing.canUpdatePaymentMethod && billing.paymentMethodDisabledReason && (
                    <Text
                      id="organization-billing-payment-method-disabled-reason"
                      maxW={{ md: "360px" }}
                      fontSize="xs"
                      color="orange.700"
                      textAlign={{ base: "start", md: "end" }}
                    >
                      {billing.paymentMethodDisabledReason}
                    </Text>
                  )}
                </Stack>
              </Flex>
              <Box h="1px" bg="border.default" />
              <Stack gap={1}>
                <Flex
                  justify="space-between"
                  align={{ base: "flex-start", md: "center" }}
                  gap={3}
                  direction={{ base: "column", md: "row" }}
                >
                  <Stack gap={1}>
                    <Text fontSize="xs" color="fg.muted">
                      請求先メールアドレス
                    </Text>
                    <Text fontWeight="semibold" wordBreak="break-all">
                      {billing.billingEmail}
                    </Text>
                  </Stack>
                  <Stack gap={1.5} align={{ base: "stretch", md: "flex-end" }}>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={onUpdateBillingEmail}
                      disabled={!billing.canUpdateBillingEmail}
                      title={!billing.canUpdateBillingEmail ? billing.billingEmailDisabledReason : undefined}
                      aria-describedby={
                        !billing.canUpdateBillingEmail && billing.billingEmailDisabledReason
                          ? "organization-billing-email-disabled-reason"
                          : undefined
                      }
                    >
                      請求先を変更
                    </Button>
                    {!billing.canUpdateBillingEmail && billing.billingEmailDisabledReason && (
                      <Text
                        id="organization-billing-email-disabled-reason"
                        maxW={{ md: "360px" }}
                        fontSize="xs"
                        color="orange.700"
                        textAlign={{ base: "start", md: "end" }}
                      >
                        {billing.billingEmailDisabledReason}
                      </Text>
                    )}
                  </Stack>
                </Flex>
              </Stack>
            </Stack>
          )}
        </Box>
      </Stack>

      {!billing.isComplimentary && <InvoiceList invoices={billing.invoices} onOpenInvoice={onOpenInvoice} />}
    </Stack>
  );
};

const UsageMeter = ({
  icon: MeterIcon,
  label,
  current,
  max,
}: {
  icon: typeof LuUsers;
  label: string;
  current: number;
  max: number;
}) => {
  const percentage = Math.min((current / Math.max(max, 1)) * 100, 100);
  const isExceeded = current > max;
  return (
    <Box flex={1} borderWidth="1px" borderRadius="xl" bg="white" p={4}>
      <HStack justify="space-between" mb={2}>
        <HStack gap={2} color="fg.muted">
          <MeterIcon aria-hidden />
          <Text fontSize="sm">{label}</Text>
        </HStack>
        <Text fontSize="sm" fontWeight="bold" color={isExceeded ? "red.600" : "gray.900"}>
          {current} / {max}
        </Text>
      </HStack>
      <Box h="8px" borderRadius="full" bg="gray.100" overflow="hidden">
        <Box h="full" w={`${percentage}%`} bg={isExceeded ? "red.500" : "teal.500"} borderRadius="full" />
      </Box>
    </Box>
  );
};

const InvoiceList = ({
  invoices,
  onOpenInvoice,
}: {
  invoices: BillingInvoiceView[];
  onOpenInvoice: (invoiceId: string) => void;
}) => (
  <Stack as="section" gap={3} aria-labelledby="invoices-heading">
    <HStack gap={2}>
      <LuFileText aria-hidden />
      <Heading id="invoices-heading" as="h2" fontSize="lg">
        請求書
      </Heading>
    </HStack>
    {invoices.length === 0 ? (
      <Box borderWidth="1px" borderStyle="dashed" borderRadius="xl" p={5} textAlign="center" color="fg.muted">
        発行済みの請求書はありません。
      </Box>
    ) : (
      <Stack gap={2}>
        {invoices.map((invoice) => (
          <Flex
            key={invoice.id}
            borderWidth="1px"
            borderRadius="lg"
            bg="white"
            p={3}
            justify="space-between"
            align="center"
            gap={3}
          >
            <HStack gap={3}>
              <LuFileText aria-hidden />
              <Stack gap={0.5}>
                <Text fontSize="sm" fontWeight="semibold">
                  {invoice.issuedAt}
                </Text>
                <Badge colorPalette={invoiceStatusColor(invoice.status)} variant="subtle" w="fit-content">
                  {invoiceStatusLabel(invoice.status)}
                </Badge>
              </Stack>
            </HStack>
            <Button size="xs" variant="ghost" onClick={() => onOpenInvoice(invoice.id)}>
              開く
            </Button>
          </Flex>
        ))}
      </Stack>
    )}
  </Stack>
);

function planLabel(plan: NonNullable<OrganizationBillingView["currentPlan"]>): string {
  if (plan === "trial") return "無料体験";
  if (plan === "free") return "Free";
  if (plan === "pro") return "Pro";
  return "Business";
}

function isPlanState(state: BillingDisplayState): state is "trial" | "free" | "pro" | "business" {
  return state === "trial" || state === "free" || state === "pro" || state === "business";
}

function isExceptionalState(state: BillingDisplayState): boolean {
  return !isPlanState(state);
}

function shouldShowCurrentPlan(state: BillingDisplayState): boolean {
  return (
    state === "initialPaymentPending" || state === "grace" || state === "scheduledFree" || state === "scheduledPro"
  );
}

function isPaidPlanRecovery(billing: OrganizationBillingView): boolean {
  return billing.state === "restricted" || (billing.state === "pendingActivation" && billing.currentPlan === null);
}

function invoiceStatusLabel(status: BillingInvoiceView["status"]): string {
  if (status === "paid") return "支払い済み";
  if (status === "open") return "支払い待ち";
  return "無効";
}

function invoiceStatusColor(status: BillingInvoiceView["status"]): "green" | "orange" | "gray" {
  if (status === "paid") return "green";
  if (status === "open") return "orange";
  return "gray";
}
