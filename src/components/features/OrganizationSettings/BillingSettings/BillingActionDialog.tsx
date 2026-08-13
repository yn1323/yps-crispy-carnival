import { Box, Grid, Stack, Text } from "@chakra-ui/react";
import { Button } from "@/src/components/ui/Button";
import { Dialog } from "@/src/components/ui/Dialog";
import {
  type BillingActionDialogState,
  formatBillingBoundaryDate,
  formatCurrencyAmount,
  formatPlanPrice,
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
    (dialog.kind !== "startPaidPlan" || dialog.price.status === "available") &&
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
      mobileActionLayout="stacked"
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
          {dialog.kind === "changePaidPlanNow" && <PaidPlanChangeSummary dialog={dialog} onRetry={onRetryPreview} />}
          {dialog.kind === "cancelTrialContinuation" && (
            <>
              <SummaryRow label="取り消すプラン" value={planLabel(dialog.targetPlan)} />
              <SummaryRow label="トライアル最終日" value={dialog.trialEndsOn ?? "現在の契約状態に従います"} />
            </>
          )}
          {dialog.kind === "schedulePlanChange" && <ScheduledPlanChangeSummary dialog={dialog} />}
          {dialog.kind === "scheduleServiceStop" && (
            <>
              <SummaryRow label="現在のプラン" value="支払い済み期間まで継続" />
              <SummaryRow label="利用停止予定日" value={dialog.effectiveOn ?? "現在の契約状態に従います"} />
            </>
          )}
          {dialog.kind === "cancelScheduledPlanChange" && (
            <>
              <SummaryRow
                label="取り消す変更"
                value={dialog.isServiceStop ? "利用停止" : `${planLabel(dialog.targetPlan)}への変更`}
              />
              <SummaryRow
                label={dialog.isServiceStop ? "利用停止予定日" : "変更予定日"}
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
  const price = dialog.price.status === "available" ? formatPlanPrice(dialog.price.value) : null;
  return (
    <>
      <SummaryRow label="プラン" value={planLabel(dialog.targetPlan)} />
      <SummaryRow
        label="料金"
        value={
          dialog.price.status === "loading"
            ? "取得中..."
            : price
              ? `${price.amount}（${price.interval}・${price.tax}）`
              : "取得できませんでした"
        }
      />
      <SummaryRow label="請求開始" value={dialog.billingStartsOn} />
      {(dialog.price.status === "unavailable" || dialog.price.status === "error") && (
        <RetryButton label="料金を再読み込みする" onRetry={onRetry} />
      )}
    </>
  );
}

function PaidPlanChangeSummary({
  dialog,
  onRetry,
}: {
  dialog: Extract<BillingActionDialogState, { kind: "changePaidPlanNow" }>;
  onRetry: () => void;
}) {
  const preview = dialog.preview.status === "available" ? dialog.preview.value : null;
  return (
    <>
      <SummaryRow label="変更先" value="Business" />
      <SummaryRow
        label="今すぐの請求額"
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
        <RetryButton label="見積もりを再読み込みする" onRetry={onRetry} />
      )}
    </>
  );
}

function ScheduledPlanChangeSummary({
  dialog,
}: {
  dialog: Extract<BillingActionDialogState, { kind: "schedulePlanChange" }>;
}) {
  const reductions = dialog.requiredReductions;
  return (
    <>
      <SummaryRow label="変更先" value={planLabel(dialog.targetPlan)} />
      <SummaryRow label="変更予定日" value={dialog.effectiveOn ?? "現在の契約状態に従います"} />
      {reductions.people > 0 && <SummaryRow label="利用人数" value={`あと${reductions.people}名削除してください`} />}
      {reductions.shops > 0 && <SummaryRow label="店舗" value={`あと${reductions.shops}店舗を整理してください`} />}
      {reductions.managers > 0 && (
        <SummaryRow label="管理者" value={`あと${reductions.managers}名分の権限または招待を整理してください`} />
      )}
    </>
  );
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
            title: `トライアル終了後も${planLabel(dialog.targetPlan)}を継続しますか？`,
            description: "トライアル最終日までは請求されません。",
            submitLabel: "支払い情報の登録へ進む",
            submitColorPalette: "teal",
          }
        : {
            title: `${planLabel(dialog.targetPlan)}を開始しますか？`,
            description: "表示内容を確認し、Stripeの決済画面へ進みます。",
            submitLabel: "Stripeで支払いを続ける",
            submitColorPalette: "teal",
            note: "支払い結果がこの画面に反映されるまでは、現在のプランを利用します。",
          };
    case "changePaidPlanNow":
      return {
        title: "Businessへ変更しますか？",
        description: "残りの契約期間に応じた差額を日割りで直ちに請求します。\n次回更新日は変わりません。",
        submitLabel: "Businessへ変更",
        submitColorPalette: "teal",
        note: "支払いの成功を確認するまでは、Proを利用します。",
      };
    case "cancelTrialContinuation":
      return {
        title: "有料プランの継続を取り消しますか？",
        description: "トライアルは最終日までそのまま利用できます。",
        submitLabel: "有料継続を取り消す",
        submitColorPalette: "red",
        note: "取り消すとトライアル終了後は利用停止になります。店舗・ユーザー・過去のシフトは削除されず、有料プランを契約すると再開できます。",
      };
    case "schedulePlanChange":
      return {
        title: `${planLabel(dialog.targetPlan)}への変更を予約しますか？`,
        description: "現在の支払い済み期間が終わるまでは、現在のプランを利用します。",
        submitLabel: "プラン変更を予約",
        submitColorPalette: "orange",
        note: "変更予定日までに、利用人数・店舗数・管理者数を変更先プランの上限以内に整理してください。\n上限を超えるユーザーは自動では削除されません。",
      };
    case "scheduleServiceStop":
      return {
        title: "期間末に利用を停止しますか？",
        description: "現在の支払い済み期間が終わるまでは、現在のプランを利用します。",
        submitLabel: "利用停止を予約",
        submitColorPalette: "red",
        note: "利用停止後も、店舗・ユーザー・過去のシフトは削除されません。再開するにはProまたはBusinessを契約してください。",
      };
    case "cancelScheduledPlanChange":
      return dialog.isServiceStop
        ? {
            title: "利用停止の予約を取り消しますか？",
            description: "予約を取り消し、次回更新後も現在のプランを継続します。",
            submitLabel: "利用停止予約を取り消す",
            submitColorPalette: "teal",
          }
        : {
            title: "プラン変更の予約を取り消しますか？",
            description: "予約を取り消し、次回更新後も現在のプランを継続します。",
            submitLabel: "変更予約を取り消す",
            submitColorPalette: "teal",
          };
  }
}
