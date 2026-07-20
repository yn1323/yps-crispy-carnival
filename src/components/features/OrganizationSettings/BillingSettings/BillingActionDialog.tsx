import { Box, Grid, Stack, Text } from "@chakra-ui/react";
import { Dialog } from "@/src/components/ui/Dialog";
import { type BillingActionDialogState, formatProPrice } from "./script";

type Props = {
  dialog: BillingActionDialogState | null;
  isRunning: boolean;
  onClose: () => void;
  onSubmit: () => void;
};

export function BillingActionDialog({ dialog, isRunning, onClose, onSubmit }: Props) {
  if (!dialog) return null;

  const content = dialogContent(dialog);

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
      isSubmitDisabled={isRunning}
      role="alertdialog"
      maxW={{ base: "calc(100vw - 24px)", md: "560px" }}
    >
      <Stack gap={4}>
        <Text fontSize="sm" lineHeight="tall">
          {content.description}
        </Text>

        <Stack gap={2} borderWidth="1px" borderColor="blackAlpha.100" borderRadius="lg" bg="gray.50" p={4}>
          <SummaryRow label="対象グループ" value={dialog.organizationName} />
          {dialog.kind === "startPro" && (
            <>
              <StartProSummary dialog={dialog} />
              <Text fontSize="xs" color="fg.muted" lineHeight="tall">
                対象店舗は、このグループに現在登録されている店舗です。
              </Text>
            </>
          )}
          {dialog.kind !== "startPro" && content.effectiveLabel && (
            <SummaryRow label={content.effectiveLabel} value={content.effectiveValue ?? "現在の契約状態に従います"} />
          )}
        </Stack>

        {content.note && (
          <Box borderRadius="lg" bg="blue.50" px={4} py={3}>
            <Text fontSize="sm" color="blue.900" lineHeight="tall">
              {content.note}
            </Text>
          </Box>
        )}
      </Stack>
    </Dialog>
  );
}

function StartProSummary({ dialog }: { dialog: Extract<BillingActionDialogState, { kind: "startPro" }> }) {
  const price = formatProPrice(dialog.price);

  return (
    <>
      <SummaryRow label="プラン" value="Pro" />
      <SummaryRow label="料金" value={`${price.amount}（${price.interval}）`} />
      <SummaryRow label="請求開始" value={dialog.billingStartsOn} />
      <SummaryRow
        label="対象店舗"
        value={dialog.shopNames.length > 0 ? dialog.shopNames.join("、") : "現在の店舗はありません"}
      />
    </>
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
  description: string;
  submitLabel: string;
  submitColorPalette: string;
  effectiveLabel?: string;
  effectiveValue?: string;
  note?: string;
} {
  switch (dialog.kind) {
    case "startPro":
      return dialog.source === "trial"
        ? {
            title: "トライアル終了後もProを継続しますか？",
            description: "トライアル終了後のPro継続に使う支払い方法を、Stripeの画面で登録します。",
            submitLabel: "Stripeで登録を続ける",
            submitColorPalette: "teal",
            note: "Stripeから戻っただけでは登録完了になりません。支払い方法の確認結果がこの画面に反映されるまでお待ちください。",
          }
        : {
            title: "Proを開始しますか？",
            description: "表示内容を確認して、Stripeの決済画面へ進みます。",
            submitLabel: "Stripeで支払いを続ける",
            submitColorPalette: "teal",
            note: "Stripeから戻っただけではProは開始されません。支払い結果がこの画面に反映されるまでお待ちください。",
          };
    case "cancelTrialContinuation":
      return {
        title: "Pro継続を取り消しますか？",
        description: "登録済みのトライアル終了後のPro継続を取り消します。トライアルは最終日までそのまま利用できます。",
        submitLabel: "Pro継続を取り消す",
        submitColorPalette: "red",
        effectiveLabel: "トライアル最終日",
        effectiveValue: dialog.trialEndsOn,
        note: "トライアル終了時に無料の上限を超えている場合は、利用が制限されることがあります。",
      };
    case "scheduleFree":
      return {
        title: "無料への変更を予約しますか？",
        description: "現在の支払い済み期間が終わるまではProを利用し、期間終了後に無料へ変更します。",
        submitLabel: "無料への変更を予約",
        submitColorPalette: "orange",
        effectiveLabel: "変更予定日",
        effectiveValue: dialog.effectiveOn,
        note: "無料の上限を超えている場合は、変更後に利用が制限されることがあります。",
      };
    case "cancelScheduledFree":
      return {
        title: "無料への変更予約を取り消しますか？",
        description: "予約を取り消し、次回更新後もProを継続します。",
        submitLabel: "変更予約を取り消す",
        submitColorPalette: "teal",
        effectiveLabel: "予約中の変更日",
        effectiveValue: dialog.effectiveOn,
      };
  }
}
