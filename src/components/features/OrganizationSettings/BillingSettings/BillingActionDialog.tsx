import { Box, Grid, Stack, Text } from "@chakra-ui/react";
import { Button } from "@/src/components/ui/Button";
import { Dialog } from "@/src/components/ui/Dialog";
import {
  type BillingActionDialogState,
  formatBillingBoundaryDate,
  formatCurrencyAmount,
  formatPlanPriceLine,
  planLabel,
} from "./script";

type Props = {
  dialog: BillingActionDialogState | null;
  isRunning: boolean;
  onClose: () => void;
  onRetryPrice: () => void;
  onRetryPreview: () => void;
  onSubmit: () => void;
};

export function BillingActionDialog({ dialog, isRunning, onClose, onRetryPrice, onRetryPreview, onSubmit }: Props) {
  if (!dialog) return null;

  const content = dialogContent(dialog);
  const isDataReady =
    (!("price" in dialog) || dialog.price.status === "available") &&
    (dialog.kind !== "changePaidPlanNow" || dialog.preview.status === "available");

  return (
    <Dialog
      title={content.title}
      isOpen
      onOpenChange={({ open }) => {
        if (!open && !isRunning) onClose();
      }}
      onClose={onClose}
      onSubmit={onSubmit}
      submitLabel={content.submitLabel}
      submitColorPalette={content.submitColorPalette}
      isLoading={isRunning}
      isSubmitDisabled={isRunning || !isDataReady}
      role="alertdialog"
      mobileFullScreen
      maxW={{ base: "calc(100vw - 24px)", md: "560px" }}
    >
      <Stack gap={4}>
        {content.description && (
          <Text fontSize="sm" lineHeight="tall" whiteSpace="pre-line">
            {content.description}
          </Text>
        )}

        <Stack gap={2} borderWidth="1px" borderColor="blackAlpha.100" borderRadius="lg" bg="gray.50" p={4}>
          <SummaryRow label="対象組織" value={dialog.organizationName} />
          {dialog.kind === "startPaidPlan" && <StartPaidPlanSummary dialog={dialog} onRetry={onRetryPrice} />}
          {dialog.kind === "changePaidPlanNow" && (
            <PaidPlanChangeSummary dialog={dialog} onRetryPrice={onRetryPrice} onRetryPreview={onRetryPreview} />
          )}
          {dialog.kind === "cancelTrialContinuation" && (
            <>
              <SummaryRow label="取り消す変更" value={formatPlanTransition(dialog.currentPlan, dialog.targetPlan)} />
              <SummaryRow label="プラン変更日" value={dialog.effectiveOn ?? "現在の契約状態に従います"} />
            </>
          )}
          {dialog.kind === "schedulePlanChange" && (
            <ScheduledPlanChangeSummary dialog={dialog} onRetryPrice={onRetryPrice} />
          )}
          {dialog.kind === "scheduleServiceStop" && (
            <>
              <PlanTransitionRow currentPlan={dialog.currentPlan} targetPlan="free" />
              <SummaryRow label="プラン変更日" value={dialog.effectiveOn ?? "現在の契約状態に従います"} />
            </>
          )}
          {dialog.kind === "cancelScheduledPlanChange" && (
            <>
              <SummaryRow label="取り消す変更" value={formatPlanTransition(dialog.currentPlan, dialog.targetPlan)} />
              <SummaryRow
                label={dialog.isServiceStop ? "契約終了日" : "変更予定日"}
                value={dialog.effectiveOn ?? "現在の契約状態に従います"}
              />
            </>
          )}
        </Stack>

        {content.note && (
          <Box borderRadius="lg" bg="blue.50" px={4} py={3}>
            <Text fontSize="sm" color="blue.900" lineHeight="tall" whiteSpace="pre-line">
              {content.note}
            </Text>
          </Box>
        )}
      </Stack>
    </Dialog>
  );
}

function StartPaidPlanSummary({
  dialog,
  onRetry,
}: {
  dialog: Extract<BillingActionDialogState, { kind: "startPaidPlan" }>;
  onRetry: () => void;
}) {
  return (
    <>
      <PlanTransitionRow currentPlan={dialog.currentPlan} targetPlan={dialog.targetPlan} />
      <PlanPriceSummaryRow label="料金" price={dialog.price} onRetry={onRetry} />
      <SummaryRow label="請求開始日" value={dialog.billingStartsOn} />
    </>
  );
}

function PaidPlanChangeSummary({
  dialog,
  onRetryPrice,
  onRetryPreview,
}: {
  dialog: Extract<BillingActionDialogState, { kind: "changePaidPlanNow" }>;
  onRetryPrice: () => void;
  onRetryPreview: () => void;
}) {
  const preview = dialog.preview.status === "available" ? dialog.preview.value : null;
  return (
    <>
      <PlanTransitionRow currentPlan={dialog.currentPlan} targetPlan={dialog.targetPlan} />
      <PlanPriceSummaryRow label="通常料金" price={dialog.price} onRetry={onRetryPrice} />
      <SummaryRow
        label="今回の日割り請求額"
        value={
          dialog.preview.status === "loading"
            ? "見積もり中..."
            : preview
              ? formatCurrencyAmount(preview.currency, preview.amountDue)
              : "見積もりを取得できませんでした"
        }
      />
      {preview && <SummaryRow label="次回更新日" value={formatBillingBoundaryDate(preview.currentPeriodEnd)} />}
      {(dialog.preview.status === "unavailable" || dialog.preview.status === "error") && (
        <RetryButton label="見積もりを再読み込みする" onRetry={onRetryPreview} />
      )}
    </>
  );
}

function ScheduledPlanChangeSummary({
  dialog,
  onRetryPrice,
}: {
  dialog: Extract<BillingActionDialogState, { kind: "schedulePlanChange" }>;
  onRetryPrice: () => void;
}) {
  const reductions = dialog.requiredReductions;
  return (
    <>
      <PlanTransitionRow currentPlan={dialog.currentPlan} targetPlan={dialog.targetPlan} />
      <PlanPriceSummaryRow label="料金" price={dialog.price} onRetry={onRetryPrice} />
      <SummaryRow label="変更予定日" value={dialog.effectiveOn ?? "現在の契約状態に従います"} />
      {reductions.people > 0 && <SummaryRow label="利用人数" value={`あと${reductions.people}名削除してください`} />}
      {reductions.shops > 0 && <SummaryRow label="店舗" value={`あと${reductions.shops}店舗を整理してください`} />}
      {reductions.managers > 0 && (
        <SummaryRow label="管理者" value={`あと${reductions.managers}名分の権限または招待を整理してください`} />
      )}
    </>
  );
}

function PlanPriceSummaryRow({
  label,
  price,
  onRetry,
}: {
  label: string;
  price: Extract<BillingActionDialogState, { kind: "startPaidPlan" }>["price"];
  onRetry: () => void;
}) {
  return (
    <>
      <SummaryRow
        label={label}
        value={
          price.status === "loading"
            ? "取得中..."
            : price.status === "available"
              ? formatPlanPriceLine(price.value)
              : "取得できませんでした"
        }
      />
      {(price.status === "unavailable" || price.status === "error") && (
        <RetryButton label="料金を再読み込みする" onRetry={onRetry} />
      )}
    </>
  );
}

function PlanTransitionRow({
  currentPlan,
  targetPlan,
}: Pick<BillingActionDialogState, "currentPlan"> & {
  targetPlan: BillingActionDialogState["currentPlan"];
}) {
  return <SummaryRow label="プラン" value={formatPlanTransition(currentPlan, targetPlan)} />;
}

function formatPlanTransition(
  currentPlan: BillingActionDialogState["currentPlan"],
  targetPlan: BillingActionDialogState["currentPlan"],
) {
  return `${planLabel(currentPlan)} → ${planLabel(targetPlan)}`;
}

function RetryButton({ label, onRetry }: { label: string; onRetry: () => void }) {
  return (
    <Button size="sm" variant="outline" alignSelf="flex-start" mt={2} onClick={onRetry}>
      {label}
    </Button>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <Grid templateColumns="112px minmax(0, 1fr)" gap={3} alignItems="start">
      <Text fontSize="sm" color="fg.muted">
        {label}
      </Text>
      <Text fontSize="sm" fontWeight="semibold" overflowWrap="anywhere">
        {value}
      </Text>
    </Grid>
  );
}

function dialogContent(dialog: BillingActionDialogState): {
  title: string;
  description?: string;
  submitLabel: string;
  submitColorPalette: string;
  note?: string;
} {
  switch (dialog.kind) {
    case "startPaidPlan":
      return dialog.source === "trial"
        ? {
            title: `トライアル終了後、${planLabel(dialog.targetPlan)}プランを継続しますか？`,
            description: "トライアル終了の翌日から請求開始日となります。",
            submitLabel: "支払いへ進む",
            submitColorPalette: "teal",
          }
        : {
            title: `${planLabel(dialog.targetPlan)}プランを開始しますか？`,
            submitLabel: "支払いを続ける",
            submitColorPalette: "teal",
            note: "",
          };
    case "changePaidPlanNow":
      return {
        title: "Proプランへ変更しますか？",
        submitLabel: "Proへ変更",
        submitColorPalette: "teal",
        note: "",
      };
    case "cancelTrialContinuation":
      return {
        title: "プラン支払い予約を取り消しますか？",
        submitLabel: "取り消す",
        submitColorPalette: "red",
        note: "Trial終了後はFreeプランになります。",
      };
    case "schedulePlanChange":
      return {
        title: `${planLabel(dialog.targetPlan)}プランへの変更を予約しますか？`,
        submitLabel: "プラン変更を予約",
        submitColorPalette: "orange",
        note: "プラン変更予定日までProが継続されます。",
      };
    case "scheduleServiceStop":
      return {
        title: "解約しますか？",
        submitLabel: "解約する",
        submitColorPalette: "red",
        note: "変更日まで現在のプランを利用できます。",
      };
    case "cancelScheduledPlanChange":
      return dialog.isServiceStop
        ? {
            title: "解約予約を取り消しますか？",
            description: "予約を取り消し、次回更新後も現在のプランを継続します。",
            submitLabel: "解約予約を取り消す",
            submitColorPalette: "teal",
          }
        : {
            title: "プラン変更の予約を取り消しますか？",
            description: `予約を取り消し、次回更新後も${planLabel(dialog.currentPlan)}を継続します。`,
            submitLabel: "変更予約を取り消す",
            submitColorPalette: "teal",
          };
  }
}
