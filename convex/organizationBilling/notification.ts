import { v } from "convex/values";
import { formatDateTimeLabel } from "../_lib/dateFormat";

export const TRIAL_ENDING_REMINDER_LEAD_MS = 7 * 24 * 60 * 60 * 1000;

export const organizationBillingNotificationEventValidator = v.union(
  v.literal("trialEnding"),
  v.literal("initialPaymentPending"),
  v.literal("freeApplied"),
  v.literal("scheduledChange"),
  v.literal("scheduledChangeCanceled"),
  v.literal("planActivated"),
  v.literal("proDowngradeNotApplied"),
  v.literal("paidActivationFailedFreeContinued"),
  v.literal("paidActivationFailedProContinued"),
  v.literal("paidActivationFailedRestrictedContinued"),
  v.literal("graceStarted"),
  v.literal("graceEndingSoon"),
  v.literal("restrictedStarted"),
  v.literal("recovered"),
  v.literal("billingEmailChanged"),
);

export const organizationBillingNotificationDetailsValidator = v.object({
  targetPlan: v.optional(v.union(v.literal("free"), v.literal("pro"), v.literal("business"))),
  amountDue: v.optional(v.number()),
  currency: v.optional(v.string()),
  effectiveAt: v.optional(v.number()),
});

export type OrganizationBillingNotificationEvent =
  | "trialEnding"
  | "initialPaymentPending"
  | "freeApplied"
  | "scheduledChange"
  | "scheduledChangeCanceled"
  | "planActivated"
  | "proDowngradeNotApplied"
  | "paidActivationFailedFreeContinued"
  | "paidActivationFailedProContinued"
  | "paidActivationFailedRestrictedContinued"
  | "graceStarted"
  | "graceEndingSoon"
  | "restrictedStarted"
  | "recovered"
  | "billingEmailChanged";

export type TrialEndingNotificationDetails = {
  trialEndsAt: number;
  selectedPaidPlan?: "pro" | "business";
};

export type OrganizationBillingNotificationDetails = {
  targetPlan?: "free" | "pro" | "business";
  amountDue?: number;
  currency?: string;
  effectiveAt?: number;
};

export function organizationBillingNotificationCopy(
  event: OrganizationBillingNotificationEvent,
  trialEnding?: TrialEndingNotificationDetails,
  details?: OrganizationBillingNotificationDetails,
) {
  switch (event) {
    case "trialEnding": {
      const trialEndsAtLabel = trialEnding ? formatDateTimeLabel(trialEnding.trialEndsAt) : "トライアル終了日時";
      const selectedPlanLabel =
        trialEnding?.selectedPaidPlan === "pro"
          ? "Pro"
          : trialEnding?.selectedPaidPlan === "business"
            ? "Business"
            : null;
      return {
        subject: "トライアル終了まで7日です",
        heading: "トライアル終了まで7日です",
        paragraphs: selectedPlanLabel
          ? [
              `トライアルは${trialEndsAtLabel}に終了します。`,
              `選択済みの契約プランは${selectedPlanLabel}です。初回請求は${trialEndsAtLabel}を予定しています。`,
              `無料へ変更する場合の設定期限は${trialEndsAtLabel}です。期限までにグループ設定から変更してください。`,
            ]
          : [
              `トライアルは${trialEndsAtLabel}に終了します。有料プランはまだ契約されていません。`,
              "終了後に無料を利用するには、無料で残す管理者と店舗を選び、利用人数を5名以下にしてください。条件を満たさない場合は契約制限中になります。",
              `無料で残す管理者と店舗の設定期限は${trialEndsAtLabel}です。`,
            ],
      };
    }
    case "initialPaymentPending":
      return {
        subject: "初回請求の結果を確認しています",
        heading: "初回請求の結果を確認しています",
        paragraphs: [
          "支払い結果を確認しています。確認中も、トライアルと同じPro相当の機能を利用できます。",
          "結果が確定すると、グループ設定へ反映されます。",
        ],
      };
    case "freeApplied":
      return {
        subject: "無料へ変更しました",
        heading: "無料へ変更しました",
        paragraphs: [
          "選択した管理者と店舗を残して無料へ変更しました。店舗、利用者、過去のシフトは削除されません。",
          "閲覧のみになった管理者とプラン停止中の店舗は、グループ設定から確認できます。",
        ],
      };
    case "scheduledChange": {
      const targetPlanLabel = details?.targetPlan ? planLabel(details.targetPlan) : "変更先プラン";
      const effectiveAtLabel = details?.effectiveAt
        ? formatDateTimeLabel(details.effectiveAt)
        : "現在の支払い済み期間の終了時";
      return {
        subject: `${targetPlanLabel}への変更を予約しました`,
        heading: `${targetPlanLabel}への変更を予約しました`,
        paragraphs: [
          `${effectiveAtLabel}に${targetPlanLabel}へ変更します。それまでは現在の有料プランを利用できます。`,
          "適用時には利用人数、管理者、店舗の状態をもう一度確認します。",
        ],
      };
    }
    case "scheduledChangeCanceled":
      return {
        subject: "プラン変更予約を取り消しました",
        heading: "プラン変更予約を取り消しました",
        paragraphs: [
          "期間末に予定していたプラン変更を取り消しました。",
          "現在の有料プランを継続します。現在の契約状態はグループ設定で確認できます。",
        ],
      };
    case "planActivated": {
      const targetPlanLabel = details?.targetPlan ? planLabel(details.targetPlan) : "有料プラン";
      const billingSummary = formatBillingSummary(details);
      return {
        subject: `${targetPlanLabel}を開始しました`,
        heading: `${targetPlanLabel}を開始しました`,
        paragraphs: [
          `支払い結果を確認し、${targetPlanLabel}を開始しました。${billingSummary}`,
          "現在の利用状況はグループ設定で確認できます。",
        ],
      };
    }
    case "proDowngradeNotApplied":
      return {
        subject: "Proへの変更を適用できませんでした",
        heading: "Proを継続しています",
        paragraphs: [
          "予約されていたプラン変更を適用できませんでした。",
          "Proを継続しています。現在の利用状況はグループ設定で確認できます。",
        ],
      };
    case "paidActivationFailedFreeContinued":
      return {
        subject: "有料プランを開始できませんでした",
        heading: "無料を継続しています",
        paragraphs: [
          "支払いを確認できなかったため、有料プランを開始しませんでした。",
          "無料を継続しています。支払い方法を確認してから、もう一度お手続きください。",
        ],
      };
    case "paidActivationFailedProContinued":
      return {
        subject: "Businessへの変更を完了できませんでした",
        heading: "Proを継続しています",
        paragraphs: [
          "支払いを確認できなかったため、Businessへの変更を適用しませんでした。",
          "Proを継続しています。支払い方法を確認してから、もう一度お手続きください。",
        ],
      };
    case "paidActivationFailedRestrictedContinued":
      return {
        subject: "有料プランを開始できませんでした",
        heading: "契約制限中を継続しています",
        paragraphs: [
          "支払いを確認できなかったため、有料プランを開始しませんでした。",
          "契約制限中を継続しています。支払い方法を確認してから、もう一度お手続きください。",
        ],
      };
    case "graceStarted":
      return {
        subject: "支払い方法を確認してください",
        heading: "支払い猶予が始まりました",
        paragraphs: [
          "支払いを確認できなかったため、14日間の支払い猶予が始まりました。猶予中は現在の有料プランを利用できます。",
          "期限までに支払い方法を確認してください。",
        ],
      };
    case "graceEndingSoon":
      return {
        subject: "支払い猶予の終了まで3日です",
        heading: "支払い猶予の終了まで3日です",
        paragraphs: [
          "未払いのまま猶予が終了すると、業務操作を停止して契約制限中へ移行します。",
          "グループ設定から支払い方法を確認してください。",
        ],
      };
    case "restrictedStarted": {
      const targetPlanLabel = details?.targetPlan ? planLabel(details.targetPlan) : null;
      if (targetPlanLabel) {
        return {
          subject: `${targetPlanLabel}への変更には利用状況の整理が必要です`,
          heading: `${targetPlanLabel}の利用上限を確認してください`,
          paragraphs: [
            `支払い結果を確認しました。${formatBillingSummary(details)}`,
            `${targetPlanLabel}の利用上限を超えているため、契約制限中です。グループ設定で利用人数、管理者、店舗を上限以内に整理してください。`,
          ],
        };
      }
      return {
        subject: "契約制限中へ移行しました",
        heading: "契約制限中へ移行しました",
        paragraphs: [
          "既存データは引き続き閲覧できますが、シフト作成や通知などの業務操作を停止しています。",
          "グループ設定で有料契約を再開するか、無料で残す管理者と店舗を整理してください。",
        ],
      };
    }
    case "recovered": {
      const targetPlanLabel = details?.targetPlan ? planLabel(details.targetPlan) : null;
      const billingSummary = formatBillingSummary(details);
      return {
        subject: "契約を復旧しました",
        heading: "契約を復旧しました",
        paragraphs: [
          targetPlanLabel || billingSummary
            ? `支払い結果を確認し、${targetPlanLabel ? `${targetPlanLabel}の契約を復旧しました。` : ""}確認済みの管理者と店舗で業務を再開しました。${billingSummary}`
            : "支払い結果を確認し、確認済みの管理者と店舗で業務を再開しました。",
          "契約制限中に停止した過去の通知は自動では再送しません。",
        ],
      };
    }
    case "billingEmailChanged":
      return {
        subject: "請求先メールアドレスを変更しました",
        heading: "請求先メールアドレスを変更しました",
        paragraphs: [
          "グループの請求先メールアドレスが変更されました。請求先は通知先であり、契約操作の権限には影響しません。",
        ],
      };
  }
}

function planLabel(plan: "free" | "pro" | "business") {
  if (plan === "free") return "Free";
  if (plan === "pro") return "Pro";
  return "Business";
}

function formatBillingSummary(details?: OrganizationBillingNotificationDetails) {
  const parts: string[] = [];
  if (details?.amountDue !== undefined && details.currency) {
    parts.push(`今回の請求額は${formatCurrencyAmount(details.currency, details.amountDue)}です。`);
  }
  if (details?.effectiveAt !== undefined) {
    parts.push(`適用日時は${formatDateTimeLabel(details.effectiveAt)}です。`);
  }
  return parts.join("");
}

function formatCurrencyAmount(currencyValue: string, amountInMinorUnit: number) {
  const currency = currencyValue.toUpperCase();
  const formatter = new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency,
    currencyDisplay: "code",
  });
  const fractionDigits = formatter.resolvedOptions().maximumFractionDigits ?? 0;
  return formatter.format(amountInMinorUnit / 10 ** fractionDigits);
}
