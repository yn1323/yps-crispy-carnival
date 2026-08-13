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
  restrictAtPeriodEnd: v.optional(v.literal(true)),
  restrictionReason: v.optional(
    v.union(
      v.literal("trialEndedWithoutSubscription"),
      v.literal("scheduledCancellation"),
      v.literal("trialFreeConditionsNotMet"),
      v.literal("freeConditionsNotMet"),
      v.literal("paymentGraceExpired"),
      v.literal("paymentActivationFailed"),
      v.literal("unexpectedCancellation"),
      v.literal("planLimitExceeded"),
    ),
  ),
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
  restrictAtPeriodEnd?: true;
  restrictionReason?:
    | "trialEndedWithoutSubscription"
    | "scheduledCancellation"
    | "trialFreeConditionsNotMet"
    | "freeConditionsNotMet"
    | "paymentGraceExpired"
    | "paymentActivationFailed"
    | "unexpectedCancellation"
    | "planLimitExceeded";
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
              `選択済みの契約プランは${selectedPlanLabel}です。\n初回請求は${trialEndsAtLabel}を予定しています。`,
              `継続を取り消す場合の期限は${trialEndsAtLabel}です。\n取り消すと、トライアル終了後は利用停止になります。`,
            ]
          : [
              `トライアルは${trialEndsAtLabel}に終了します。\n有料プランはまだ契約されていません。`,
              "有料プランを契約しない場合、トライアル終了後は利用停止になります。\n店舗・ユーザー・過去のシフトは削除されません。",
              "利用を再開するには、組織設定からProまたはBusinessを契約してください。",
            ],
      };
    }
    case "initialPaymentPending":
      return {
        subject: "初回請求の結果を確認しています",
        heading: "初回請求の結果を確認しています",
        paragraphs: [
          "支払い結果を確認しています。\n確認中も、トライアルと同じPro相当の機能を利用できます。",
          "支払い結果が確定すると、組織設定に反映されます。",
        ],
      };
    case "freeApplied":
      return {
        subject: "無料へ変更しました",
        heading: "無料へ変更しました",
        paragraphs: [
          "選択した管理者と店舗を残して、無料プランへ変更しました。\n店舗・ユーザー・過去のシフトは削除されません。",
          "閲覧のみになった管理者と利用停止中の店舗は、組織設定から確認できます。",
        ],
      };
    case "scheduledChange": {
      if (details?.restrictAtPeriodEnd) {
        const effectiveAtLabel = details.effectiveAt
          ? formatDateTimeLabel(details.effectiveAt)
          : "現在の支払い済み期間の終了時";
        return {
          subject: "利用停止を予約しました",
          heading: "利用停止を予約しました",
          paragraphs: [
            `${effectiveAtLabel}に利用を停止します。\nそれまでは現在の有料プランを利用できます。`,
            "利用停止後も、店舗・ユーザー・過去のシフトは削除されません。\n再開するには有料プランを契約してください。",
          ],
        };
      }
      const targetPlanLabel = details?.targetPlan ? planLabel(details.targetPlan) : "変更先プラン";
      const effectiveAtLabel = details?.effectiveAt
        ? formatDateTimeLabel(details.effectiveAt)
        : "現在の支払い済み期間の終了時";
      return {
        subject: `${targetPlanLabel}への変更を予約しました`,
        heading: `${targetPlanLabel}への変更を予約しました`,
        paragraphs: [
          `${effectiveAtLabel}に${targetPlanLabel}へ変更します。\nそれまでは現在の有料プランを利用できます。`,
          "適用時に、利用人数・店舗数・管理者数をもう一度確認します。",
        ],
      };
    }
    case "scheduledChangeCanceled":
      if (details?.restrictAtPeriodEnd) {
        return {
          subject: "利用停止予約を取り消しました",
          heading: "利用停止予約を取り消しました",
          paragraphs: [
            "期間末に予定していた利用停止を取り消しました。",
            "現在の有料プランを継続します。\n現在の契約状態は組織設定で確認できます。",
          ],
        };
      }
      return {
        subject: "プラン変更予約を取り消しました",
        heading: "プラン変更予約を取り消しました",
        paragraphs: [
          "期間末に予定していたプラン変更を取り消しました。",
          "現在の有料プランを継続します。\n現在の契約状態は組織設定で確認できます。",
        ],
      };
    case "planActivated": {
      const targetPlanLabel = details?.targetPlan ? planLabel(details.targetPlan) : "有料プラン";
      const billingSummary = formatBillingSummary(details);
      return {
        subject: `${targetPlanLabel}を開始しました`,
        heading: `${targetPlanLabel}を開始しました`,
        paragraphs: [
          billingSummary
            ? `支払い結果を確認し、${targetPlanLabel}を開始しました。\n${billingSummary}`
            : `支払い結果を確認し、${targetPlanLabel}を開始しました。`,
          "現在の利用状況は組織設定で確認できます。",
        ],
      };
    }
    case "proDowngradeNotApplied":
      return {
        subject: "Proへの変更を適用できませんでした",
        heading: "Proを継続しています",
        paragraphs: [
          "予約されていたプラン変更を適用できませんでした。",
          "Proを継続しています。\n現在の利用状況は組織設定で確認できます。",
        ],
      };
    case "paidActivationFailedFreeContinued":
      return {
        subject: "有料プランを開始できませんでした",
        heading: "無料を継続しています",
        paragraphs: [
          "支払いを確認できなかったため、有料プランを開始できませんでした。",
          "無料プランを継続しています。\n支払い方法を確認してから、もう一度手続きしてください。",
        ],
      };
    case "paidActivationFailedProContinued":
      return {
        subject: "Businessへの変更を完了できませんでした",
        heading: "Proを継続しています",
        paragraphs: [
          "支払いを確認できなかったため、Businessへの変更を適用できませんでした。",
          "Proを継続しています。\n支払い方法を確認してから、もう一度手続きしてください。",
        ],
      };
    case "paidActivationFailedRestrictedContinued":
      return {
        subject: "有料プランを開始できませんでした",
        heading: "契約制限中を継続しています",
        paragraphs: [
          "支払いを確認できなかったため、有料プランを開始できませんでした。",
          "契約制限中の状態が続いています。\n支払い方法を確認してから、もう一度手続きしてください。",
        ],
      };
    case "graceStarted":
      return {
        subject: "支払い方法を確認してください",
        heading: "支払い猶予が始まりました",
        paragraphs: [
          "支払いを確認できなかったため、14日間の支払い猶予期間が始まりました。\n猶予期間中は現在の有料プランを利用できます。",
          "期限までに支払い方法を確認してください。",
        ],
      };
    case "graceEndingSoon":
      return {
        subject: "支払い猶予の終了まで3日です",
        heading: "支払い猶予の終了まで3日です",
        paragraphs: [
          "未払いのまま猶予期間が終了すると、業務操作が停止され、契約制限中になります。",
          "組織設定から支払い方法を確認してください。",
        ],
      };
    case "restrictedStarted": {
      const targetPlanLabel = details?.targetPlan ? planLabel(details.targetPlan) : null;
      if (targetPlanLabel) {
        const billingSummary = formatBillingSummary(details);
        return {
          subject: `${targetPlanLabel}への変更には利用状況の整理が必要です`,
          heading: `${targetPlanLabel}の利用上限を確認してください`,
          paragraphs: [
            billingSummary ? `支払い結果を確認しました。\n${billingSummary}` : "支払い結果を確認しました。",
            `${targetPlanLabel}の利用上限を超えているため、契約制限中です。\n組織設定で利用人数・店舗数・管理者数を上限以内に整理してください。`,
          ],
        };
      }
      if (
        details?.restrictionReason === "trialEndedWithoutSubscription" ||
        details?.restrictionReason === "scheduledCancellation" ||
        details?.restrictionReason === "paymentGraceExpired" ||
        details?.restrictionReason === "paymentActivationFailed" ||
        details?.restrictionReason === "unexpectedCancellation"
      ) {
        return {
          subject: "利用停止中になりました",
          heading: "利用停止中になりました",
          paragraphs: [
            "店舗・ユーザー・過去のシフトは削除されていませんが、シフト作成や通知などの業務操作は利用できません。",
            "利用を再開するには、組織設定からProまたはBusinessを契約してください。",
          ],
        };
      }
      return {
        subject: "契約制限中になりました",
        heading: "契約制限中になりました",
        paragraphs: [
          "既存データは引き続き閲覧できますが、シフト作成や通知などの業務操作は利用できません。",
          "組織設定で有料プランを再開するか、無料プランで残す管理者と店舗を整理してください。",
        ],
      };
    }
    case "recovered": {
      const targetPlanLabel = details?.targetPlan ? planLabel(details.targetPlan) : null;
      const billingSummary = formatBillingSummary(details);
      const recoverySummary = [
        targetPlanLabel
          ? `支払い結果を確認し、${targetPlanLabel}の契約を復旧しました。`
          : "支払い結果を確認し、確認済みの管理者と店舗で業務を再開しました。",
        targetPlanLabel ? "確認済みの管理者と店舗で業務を再開しました。" : "",
        billingSummary,
      ]
        .filter(Boolean)
        .join("\n");
      return {
        subject: "契約を復旧しました",
        heading: "契約を復旧しました",
        paragraphs: [recoverySummary, "契約制限中に送信されなかった通知は、自動では再送されません。"],
      };
    }
    case "billingEmailChanged":
      return {
        subject: "請求先メールアドレスを変更しました",
        heading: "請求先メールアドレスを変更しました",
        paragraphs: [
          "組織の請求先メールアドレスが変更されました。\n請求先は通知先であり、契約操作の権限には影響しません。",
        ],
      };
  }
}

function planLabel(plan: "free" | "pro" | "business") {
  if (plan === "free") return "無料";
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
  return parts.join("\n");
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
