import { Alert, Badge, Box, Flex, Grid, Heading, HStack, Stack, Table, Text } from "@chakra-ui/react";
import {
  LuCalendarClock,
  LuChevronRight,
  LuCircleAlert,
  LuCircleCheck,
  LuCircleMinus,
  LuClock3,
  LuCreditCard,
  LuExternalLink,
  LuMail,
  LuStore,
  LuUsers,
} from "react-icons/lu";
import { Button, IconButton } from "@/src/components/ui/Button";
import { DrilldownRow } from "@/src/components/ui/DrilldownRow";
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
  const appliesFreeLimit =
    billing.state === "restricted" || (billing.state === "pendingActivation" && billing.currentPlan === null);

  return (
    <Stack gap={{ base: 6, md: 7 }}>
      <Stack as="section" gap={4} aria-labelledby="plan-heading">
        <Heading id="plan-heading" as="h2" fontSize="lg">
          プラン
        </Heading>

        <PlanSummary
          billing={billing}
          currentPlanHeading={planSummaryHeading}
          currentPlanLabel={planSummaryLabel}
          currentPlanDescription={isPlanState(billing.state) ? currentPlanPresentation?.description : undefined}
          presentation={presentation}
          onManagePlan={onManagePlan}
        />

        {billing.state !== "migrationPending" && (
          <Grid templateColumns="repeat(2, minmax(0, 1fr))" gap={{ base: 2, md: 4 }}>
            <UsageMeter
              icon={LuUsers}
              label="利用人数"
              current={billing.peopleUsage.current}
              max={billing.peopleUsage.max}
              helperText={appliesFreeLimit ? "現在はFreeの上限が適用されています" : undefined}
            />
            <UsageMeter
              icon={LuStore}
              label="店舗数"
              current={billing.shopUsage.current}
              max={billing.shopUsage.max}
              helperText={appliesFreeLimit ? "現在はFreeの上限が適用されています" : undefined}
            />
          </Grid>
        )}

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
      </Stack>

      <PaymentInformation
        billing={billing}
        onUpdatePaymentMethod={onUpdatePaymentMethod}
        onUpdateBillingEmail={onUpdateBillingEmail}
      />

      {!billing.isComplimentary && <InvoiceList invoices={billing.invoices} onOpenInvoice={onOpenInvoice} />}
    </Stack>
  );
};

function PlanSummary({
  billing,
  currentPlanHeading,
  currentPlanLabel,
  currentPlanDescription,
  presentation,
  onManagePlan,
}: {
  billing: OrganizationBillingView;
  currentPlanHeading: string;
  currentPlanLabel: string;
  currentPlanDescription?: string;
  presentation: (typeof STATE_PRESENTATION)[BillingDisplayState];
  onManagePlan: () => void;
}) {
  return (
    <Stack gap={2}>
      <Flex
        direction={{ base: "column", lg: "row" }}
        align={{ base: "stretch", lg: "center" }}
        gap={{ base: 3, lg: 4 }}
      >
        <Box
          flex={1}
          minW={0}
          borderWidth="1px"
          borderColor="blackAlpha.100"
          borderRadius="xl"
          bg="white"
          overflow="hidden"
        >
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
                {billing.isComplimentary && (
                  <Badge variant="subtle" colorPalette="teal">
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
                  早期利用特典として、追加料金なしでBusinessプランと同等の機能を利用できます。
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
              <BillingStatus
                state={billing.state}
                status={presentation.status}
                label={billingStatusLabel(billing.state)}
              />
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
                {billing.nextEvent?.label ?? "次の予定"}
              </Text>
              <HStack gap={1.5} align="flex-start">
                <Box color="fg.muted" mt={0.5} flexShrink={0}>
                  <LuCalendarClock aria-hidden />
                </Box>
                <Text fontSize="sm" fontWeight="bold" fontVariantNumeric="tabular-nums">
                  {billing.nextEvent?.date ?? "ありません"}
                </Text>
              </HStack>
            </Stack>
          </Grid>
        </Box>

        {!billing.isComplimentary && (
          <Flex align="center" justify="center" flexShrink={0}>
            <Button
              colorPalette="teal"
              w={{ base: "full", lg: "auto" }}
              minW={{ lg: "176px" }}
              minH={{ base: "44px", lg: "40px" }}
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
      </Flex>

      {!billing.isComplimentary && !billing.canManagePlan && billing.managePlanDisabledReason && (
        <Text id="organization-billing-manage-plan-disabled-reason" fontSize="sm" color="orange.700">
          {billing.managePlanDisabledReason}
        </Text>
      )}
    </Stack>
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
  onUpdatePaymentMethod,
}: {
  billing: OrganizationBillingView;
  presentation: (typeof STATE_PRESENTATION)[BillingDisplayState];
  onUpdatePaymentMethod: () => void;
}) {
  const showPaymentRecovery = billing.state === "grace";

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
          <Alert.Description whiteSpace={billing.state === "restricted" ? "pre-line" : undefined}>
            <Stack gap={1}>
              <Text>{presentation.description}</Text>
              {billing.blockedReason && <Text>{billing.blockedReason}</Text>}
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
                ? "organization-billing-payment-method-disabled-reason"
                : undefined
            }
          >
            支払い方法を更新
          </Button>
        )}
      </Flex>
    </Alert.Root>
  );
}

const UsageMeter = ({
  icon: MeterIcon,
  label,
  current,
  max,
  helperText,
}: {
  icon: typeof LuUsers;
  label: string;
  current: number;
  max: number;
  helperText?: string;
}) => {
  const percentage = Math.min((current / Math.max(max, 1)) * 100, 100);
  const isExceeded = current > max;
  return (
    <Box borderWidth="1px" borderColor="blackAlpha.100" borderRadius="xl" bg="white" p={{ base: 3, md: 4 }}>
      <HStack justify="space-between" gap={2} mb={2}>
        <HStack gap={2} color="gray.700" minW={0}>
          <Box flexShrink={0}>
            <MeterIcon aria-hidden />
          </Box>
          <Text fontSize={{ base: "xs", md: "sm" }} fontWeight="semibold" lineClamp={1}>
            {label}
          </Text>
        </HStack>
        <Text
          fontSize={{ base: "xs", md: "sm" }}
          fontWeight="bold"
          color={isExceeded ? "red.600" : "gray.900"}
          whiteSpace="nowrap"
          fontVariantNumeric="tabular-nums"
        >
          {current} / {max}
        </Text>
      </HStack>
      <Box
        role="meter"
        aria-label={`${label} ${current} / ${max}`}
        aria-valuemin={0}
        aria-valuemax={Math.max(max, 1)}
        aria-valuenow={Math.min(current, Math.max(max, 1))}
        aria-valuetext={isExceeded ? `${current} / ${max}、利用上限を超えています` : `${current} / ${max}`}
        h="6px"
        borderRadius="full"
        bg="gray.100"
        overflow="hidden"
      >
        <Box h="full" w={`${percentage}%`} bg={isExceeded ? "red.500" : "teal.500"} borderRadius="full" />
      </Box>
      {(helperText || isExceeded) && (
        <Text mt={2} fontSize="xs" color={isExceeded ? "red.700" : "fg.muted"}>
          {helperText ?? "利用上限を超えています"}
        </Text>
      )}
    </Box>
  );
};

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
          <Text px={{ base: 4, md: 5 }} py={4} fontSize="sm">
            現在の利用料金はかかりません。支払い方法の登録は不要です。
          </Text>
        ) : (
          <Stack gap={0} divideY="1px" divideColor="blackAlpha.100">
            <BillingInformationRow
              icon={LuCreditCard}
              label="支払い方法"
              value={billing.paymentMethodLabel ?? "支払い方法は未登録です"}
              actionLabel="支払い方法を更新"
              onAction={onUpdatePaymentMethod}
              disabled={!billing.canUpdatePaymentMethod}
              disabledReason={billing.paymentMethodDisabledReason}
              disabledReasonId="organization-billing-payment-method-disabled-reason"
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
}: {
  icon: typeof LuCreditCard;
  label: string;
  value: string;
  actionLabel: string;
  onAction: () => void;
  disabled: boolean;
  disabledReason?: string;
  disabledReasonId: string;
}) {
  const descriptionId = disabled && disabledReason ? disabledReasonId : undefined;

  return (
    <Stack gap={1.5} px={{ base: 3, md: 4 }} py={{ base: 3, md: 2.5 }}>
      <Flex align="center" gap={{ base: 2, md: 3 }}>
        <Box color="gray.700" flexShrink={0}>
          <RowIcon aria-hidden />
        </Box>
        <Grid
          flex={1}
          minW={0}
          templateColumns={{ base: "minmax(88px, auto) minmax(0, 1fr)", md: "160px minmax(0, 1fr)" }}
          alignItems="center"
          gap={{ base: 2, md: 4 }}
        >
          <Text fontSize={{ base: "xs", md: "sm" }} fontWeight="semibold" color="gray.700">
            {label}
          </Text>
          <Text
            fontSize={{ base: "xs", md: "sm" }}
            color="gray.900"
            fontWeight={{ base: "normal", md: "medium" }}
            overflowWrap="anywhere"
          >
            {value}
          </Text>
        </Grid>
        <Button
          display={{ base: "none", md: "inline-flex" }}
          size="sm"
          variant="outline"
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
          variant="ghost"
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

function InvoiceList({
  invoices,
  onOpenInvoice,
}: {
  invoices: BillingInvoiceView[];
  onOpenInvoice: (invoiceId: string) => void;
}) {
  return (
    <Stack as="section" gap={3} aria-labelledby="invoices-heading">
      <Heading id="invoices-heading" as="h2" fontSize="lg">
        請求書
      </Heading>
      {invoices.length === 0 ? (
        <Box borderWidth="1px" borderStyle="dashed" borderRadius="xl" p={5} textAlign="center" color="fg.muted">
          発行済みの請求書はありません。
        </Box>
      ) : (
        <>
          <DesktopInvoiceTable invoices={invoices} onOpenInvoice={onOpenInvoice} />
          <MobileInvoiceList invoices={invoices} onOpenInvoice={onOpenInvoice} />
        </>
      )}
    </Stack>
  );
}

function DesktopInvoiceTable({
  invoices,
  onOpenInvoice,
}: {
  invoices: BillingInvoiceView[];
  onOpenInvoice: (invoiceId: string) => void;
}) {
  return (
    <Box
      display={{ base: "none", md: "block" }}
      borderWidth="1px"
      borderColor="blackAlpha.100"
      borderRadius="xl"
      bg="white"
      overflow="hidden"
    >
      <Table.Root size="sm" aria-label="請求書">
        <Table.Header>
          <Table.Row bg="gray.50">
            <Table.ColumnHeader color="gray.600" fontWeight="bold">
              日付
            </Table.ColumnHeader>
            <Table.ColumnHeader color="gray.600" fontWeight="bold">
              ステータス
            </Table.ColumnHeader>
            <Table.ColumnHeader color="gray.600" fontWeight="bold" textAlign="end" w="112px">
              操作
            </Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {invoices.map((invoice) => (
            <Table.Row key={invoice.id}>
              <Table.Cell fontVariantNumeric="tabular-nums">{invoice.issuedAt}</Table.Cell>
              <Table.Cell>
                <InvoiceStatus status={invoice.status} />
              </Table.Cell>
              <Table.Cell textAlign="end">
                <Button
                  size="xs"
                  variant="ghost"
                  colorPalette="teal"
                  gap={1}
                  aria-label={`${invoice.issuedAt}、${invoiceStatusLabel(invoice.status)}の請求書を開く`}
                  onClick={() => onOpenInvoice(invoice.id)}
                >
                  開く
                  <LuExternalLink aria-hidden />
                </Button>
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
    </Box>
  );
}

function MobileInvoiceList({
  invoices,
  onOpenInvoice,
}: {
  invoices: BillingInvoiceView[];
  onOpenInvoice: (invoiceId: string) => void;
}) {
  return (
    <Box
      display={{ base: "block", md: "none" }}
      borderWidth="1px"
      borderColor="blackAlpha.100"
      borderRadius="xl"
      bg="white"
      overflow="hidden"
    >
      <Stack gap={0} divideY="1px" divideColor="blackAlpha.100">
        {invoices.map((invoice) => (
          <DrilldownRow
            key={invoice.id}
            ariaLabel={`${invoice.issuedAt}、${invoiceStatusLabel(invoice.status)}の請求書を開く`}
            title={invoice.issuedAt}
            leading={
              <Box color="gray.700" flexShrink={0}>
                <LuCreditCard aria-hidden />
              </Box>
            }
            badges={<InvoiceStatus status={invoice.status} />}
            onClick={() => onOpenInvoice(invoice.id)}
          />
        ))}
      </Stack>
    </Box>
  );
}

function InvoiceStatus({ status }: { status: BillingInvoiceView["status"] }) {
  const StatusIcon = status === "paid" ? LuCircleCheck : status === "open" ? LuClock3 : LuCircleMinus;
  const color = status === "paid" ? "green.700" : status === "open" ? "orange.700" : "gray.700";

  return (
    <HStack gap={1.5} color={color} whiteSpace="nowrap">
      <StatusIcon aria-hidden />
      <Text fontSize="xs" fontWeight="semibold">
        {invoiceStatusLabel(status)}
      </Text>
    </HStack>
  );
}

function planLabel(plan: NonNullable<OrganizationBillingView["currentPlan"]>): string {
  if (plan === "trial") return "無料体験";
  if (plan === "free") return "Free";
  if (plan === "pro") return "Pro";
  return "Business";
}

function billingStatusLabel(state: BillingDisplayState): string {
  if (state === "trial") return "無料体験中";
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
