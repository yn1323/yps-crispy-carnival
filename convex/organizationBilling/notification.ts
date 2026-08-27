import type { Infer } from "convex/values";
import { v } from "convex/values";
import { formatDateTimeLabel } from "../_lib/dateFormat";
import { organizationPaidPlanLabel, organizationPlanLabel, organizationPlanSentenceLabel } from "./planPresentation";

const FREE_PLAN_LABEL = `${organizationPlanLabel("free")}プラン`;
const FREE_PLAN_SENTENCE_LABEL = organizationPlanSentenceLabel("free");

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
  v.literal("graceStarted"),
  v.literal("graceEndingSoon"),
  v.literal("recovered"),
  v.literal("billingEmailChanged"),
);

/**
 * 旧revisionがrunAfter(0)へ保存したaction引数だけをdrainするvalidator。
 * 現行writer・query・copyのevent型へ旧値を戻さない。
 */
export const scheduledOrganizationBillingNotificationEventValidator = v.union(
  organizationBillingNotificationEventValidator,
  v.literal("paidActivationFailedRestrictedContinued"),
  v.literal("restrictedStarted"),
);

const organizationBillingNotificationDetailsFields = {
  // Widen中は旧scheduled actionのunversioned pro/businessも受理する。
  targetPlan: v.optional(v.union(v.literal("free"), v.literal("standard"), v.literal("pro"), v.literal("business"))),
  planIdVersion: v.optional(v.literal(2)),
  amountDue: v.optional(v.number()),
  currency: v.optional(v.string()),
  effectiveAt: v.optional(v.number()),
  restrictAtPeriodEnd: v.optional(v.literal(true)),
  usageLimitExceeded: v.optional(v.literal(true)),
};

export const organizationBillingNotificationDetailsValidator = v.object(organizationBillingNotificationDetailsFields);

const legacyOrganizationBillingRestrictionReasonValidator = v.union(
  v.literal("trialEndedWithoutSubscription"),
  v.literal("scheduledCancellation"),
  v.literal("trialFreeConditionsNotMet"),
  v.literal("freeConditionsNotMet"),
  v.literal("paymentGraceExpired"),
  v.literal("paymentActivationFailed"),
  v.literal("unexpectedCancellation"),
  v.literal("planLimitExceeded"),
);

export const scheduledOrganizationBillingNotificationDetailsValidator = v.object({
  ...organizationBillingNotificationDetailsFields,
  restrictionReason: v.optional(legacyOrganizationBillingRestrictionReasonValidator),
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
  | "graceStarted"
  | "graceEndingSoon"
  | "recovered"
  | "billingEmailChanged";

export type ScheduledOrganizationBillingNotificationEvent = Infer<
  typeof scheduledOrganizationBillingNotificationEventValidator
>;

export type TrialEndingNotificationDetails = {
  trialEndsAt: number;
  selectedPaidPlan?: "standard" | "pro";
};

export type OrganizationBillingNotificationDetails = {
  targetPlan?: "free" | "standard" | "pro";
  amountDue?: number;
  currency?: string;
  effectiveAt?: number;
  restrictAtPeriodEnd?: true;
  usageLimitExceeded?: true;
};

export type PersistedOrganizationBillingNotificationDetails = Omit<
  OrganizationBillingNotificationDetails,
  "targetPlan"
> & {
  targetPlan?: "free" | "standard" | "pro" | "business";
  planIdVersion?: 2;
};

type ScheduledOrganizationBillingNotificationDetails = Infer<
  typeof scheduledOrganizationBillingNotificationDetailsValidator
>;

/** 旧scheduled argsのpro/businessを意味で読み替え、copy生成前にcanonicalへ閉じる。 */
export function canonicalizeOrganizationBillingNotificationDetails(
  details?: ScheduledOrganizationBillingNotificationDetails,
): OrganizationBillingNotificationDetails | undefined {
  if (!details) return undefined;
  const rest: OrganizationBillingNotificationDetails = {
    ...(details.amountDue !== undefined ? { amountDue: details.amountDue } : {}),
    ...(details.currency !== undefined ? { currency: details.currency } : {}),
    ...(details.effectiveAt !== undefined ? { effectiveAt: details.effectiveAt } : {}),
    ...(details.restrictAtPeriodEnd ? { restrictAtPeriodEnd: true } : {}),
    ...(details.usageLimitExceeded ? { usageLimitExceeded: true } : {}),
  };
  if (!details.targetPlan) return rest;
  const { planIdVersion, targetPlan } = details;
  if (planIdVersion === 2) {
    if (targetPlan === "business") throw new Error("billing_notification_plan_id_version_invalid");
    return { ...rest, targetPlan };
  }
  if (targetPlan === "standard") throw new Error("billing_notification_plan_id_version_missing");
  return { ...rest, targetPlan: targetPlan === "pro" ? "standard" : targetPlan === "business" ? "pro" : "free" };
}

/** 旧scheduled eventを現行の通知copyとOutbox contextへ収束させる。 */
export function canonicalizeScheduledOrganizationBillingNotification(
  event: ScheduledOrganizationBillingNotificationEvent,
  details?: ScheduledOrganizationBillingNotificationDetails,
): {
  event: OrganizationBillingNotificationEvent;
  details: OrganizationBillingNotificationDetails | undefined;
} {
  const canonicalDetails = canonicalizeOrganizationBillingNotificationDetails(details);
  if (event === "paidActivationFailedRestrictedContinued") {
    return { event: "paidActivationFailedFreeContinued", details: canonicalDetails };
  }
  if (event === "restrictedStarted") {
    if (canonicalDetails?.targetPlan === "standard" || canonicalDetails?.targetPlan === "pro") {
      return {
        event: "planActivated",
        details: { ...canonicalDetails, usageLimitExceeded: true },
      };
    }
    return {
      event: "freeApplied",
      details: { ...canonicalDetails, usageLimitExceeded: true },
    };
  }
  return { event, details: canonicalDetails };
}

export function organizationBillingNotificationCopy(
  event: OrganizationBillingNotificationEvent,
  trialEnding?: TrialEndingNotificationDetails,
  details?: OrganizationBillingNotificationDetails,
) {
  switch (event) {
    case "trialEnding": {
      const trialEndsAtLabel = trialEnding ? formatDateTimeLabel(trialEnding.trialEndsAt) : "トライアル終了日時";
      const selectedPlanLabel = trialEnding?.selectedPaidPlan
        ? organizationPaidPlanLabel(trialEnding.selectedPaidPlan)
        : null;
      return {
        subject: "トライアル終了まで7日です",
        heading: "トライアル終了まで7日です",
        paragraphs: selectedPlanLabel
          ? [
              `トライアルは${trialEndsAtLabel}に終了します。`,
              `選択済みの契約プランは${selectedPlanLabel}です。\n初回請求は${trialEndsAtLabel}を予定しています。`,
              `継続を取り消す場合の期限は${trialEndsAtLabel}です。\n取り消すと、トライアル終了後は${FREE_PLAN_SENTENCE_LABEL}へ変更されます。`,
              `${FREE_PLAN_SENTENCE_LABEL}の利用上限を超えている場合は、上限内へ整理するまで業務操作が制限されます。`,
            ]
          : [
              `トライアルは${trialEndsAtLabel}に終了します。\n有料プランはまだ契約されていません。`,
              `有料プランを契約しない場合、トライアル終了後は${FREE_PLAN_SENTENCE_LABEL}へ変更されます。\n店舗・ユーザー・過去のシフトは削除されません。`,
              `${FREE_PLAN_SENTENCE_LABEL}の利用上限を超えている場合は、上限内へ整理するまで業務操作が制限されます。\nStandardまたはProへ変更することもできます。`,
            ],
      };
    }
    case "initialPaymentPending":
      return {
        subject: "初回請求の結果を確認しています",
        heading: "初回請求の結果を確認しています",
        paragraphs: [
          "支払い結果を確認しています。\n確認中も、Standard相当の機能を利用できます。",
          "支払い結果が確定すると、組織設定に反映されます。",
        ],
      };
    case "freeApplied": {
      const paragraphs = [
        `${FREE_PLAN_SENTENCE_LABEL}へ変更しました。\n店舗・ユーザー・過去のシフトは削除されません。`,
        details?.usageLimitExceeded
          ? overLimitParagraph(FREE_PLAN_SENTENCE_LABEL)
          : `${FREE_PLAN_SENTENCE_LABEL}の範囲内で引き続き利用できます。\n現在の利用状況は組織設定で確認できます。`,
      ];
      return {
        subject: `${FREE_PLAN_LABEL}へ変更しました`,
        heading: `${FREE_PLAN_LABEL}へ変更しました`,
        paragraphs,
      };
    }
    case "scheduledChange": {
      if (details?.restrictAtPeriodEnd) {
        const effectiveAtLabel = details.effectiveAt
          ? formatDateTimeLabel(details.effectiveAt)
          : "現在の支払い済み期間の終了時";
        return {
          subject: "解約を受け付けました",
          heading: "解約を受け付けました",
          paragraphs: [
            `${effectiveAtLabel}をもって解約します。\nそれまでは現在の有料プランを利用できます。`,
            `解約後は${FREE_PLAN_SENTENCE_LABEL}へ変更されます。\n店舗・ユーザー・過去のシフトは削除されません。`,
            `${FREE_PLAN_SENTENCE_LABEL}の利用上限を超えている場合は、上限内へ整理するまで業務操作が制限されます。`,
          ],
        };
      }
      const targetPlanLabel = details?.targetPlan ? organizationPlanLabel(details.targetPlan) : "変更先プラン";
      const effectiveAtLabel = details?.effectiveAt
        ? formatDateTimeLabel(details.effectiveAt)
        : "現在の支払い済み期間の終了時";
      return {
        subject: `${targetPlanLabel}への変更を予約しました`,
        heading: `${targetPlanLabel}への変更を予約しました`,
        paragraphs: [
          `${effectiveAtLabel}に${targetPlanLabel}へ変更します。\nそれまでは現在の有料プランを利用できます。`,
          `変更後に${targetPlanLabel}の利用上限を超えている場合は、上限内へ整理するまで業務操作が制限されます。`,
        ],
      };
    }
    case "scheduledChangeCanceled":
      if (details?.restrictAtPeriodEnd) {
        return {
          subject: "解約予約を取り消しました",
          heading: "解約予約を取り消しました",
          paragraphs: [
            "期間末に予定していた解約を取り消しました。",
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
      const targetPlanLabel = details?.targetPlan ? organizationPlanLabel(details.targetPlan) : "有料プラン";
      const billingSummary = formatBillingSummary(details);
      return {
        subject: `${targetPlanLabel}を開始しました`,
        heading: `${targetPlanLabel}を開始しました`,
        paragraphs: [
          billingSummary
            ? `支払い結果を確認し、${targetPlanLabel}を開始しました。\n${billingSummary}`
            : `支払い結果を確認し、${targetPlanLabel}を開始しました。`,
          details?.usageLimitExceeded
            ? overLimitParagraph(`${targetPlanLabel}プラン`)
            : "現在の利用状況は組織設定で確認できます。",
        ],
      };
    }
    case "proDowngradeNotApplied":
      return {
        subject: "Standardへの変更を適用できませんでした",
        heading: "Standardを継続しています",
        paragraphs: [
          "予約されていたプラン変更を適用できませんでした。",
          "Standardを継続しています。\n現在の利用状況は組織設定で確認できます。",
        ],
      };
    case "paidActivationFailedFreeContinued":
      return {
        subject: "有料プランを開始できませんでした",
        heading: "Freeを継続しています",
        paragraphs: [
          "支払いを確認できなかったため、有料プランを開始できませんでした。",
          `${FREE_PLAN_SENTENCE_LABEL}を継続しています。\n支払い方法を確認してから、もう一度手続きしてください。`,
          ...(details?.usageLimitExceeded ? [overLimitParagraph(FREE_PLAN_SENTENCE_LABEL)] : []),
        ],
      };
    case "paidActivationFailedProContinued":
      return {
        subject: "Proへの変更を完了できませんでした",
        heading: "Standardを継続しています",
        paragraphs: [
          "支払いを確認できなかったため、Proへの変更を適用できませんでした。",
          "Standardを継続しています。\n支払い方法を確認してから、もう一度手続きしてください。",
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
          `未払いのまま猶予期間が終了すると、${FREE_PLAN_SENTENCE_LABEL}へ変更されます。`,
          `${FREE_PLAN_SENTENCE_LABEL}の利用上限を超えている場合は、上限内へ整理するまで業務操作が制限されます。`,
          "組織設定から支払い方法を確認してください。",
        ],
      };
    case "recovered": {
      const targetPlanLabel = details?.targetPlan ? organizationPlanLabel(details.targetPlan) : null;
      const billingSummary = formatBillingSummary(details);
      const recoverySummary = [
        targetPlanLabel
          ? `支払い結果を確認し、${targetPlanLabel}の契約を復旧しました。`
          : "支払い結果を確認し、業務を再開しました。",
        billingSummary,
      ]
        .filter(Boolean)
        .join("\n");
      return {
        subject: "契約を復旧しました",
        heading: "契約を復旧しました",
        paragraphs: [
          recoverySummary,
          ...(details?.usageLimitExceeded && targetPlanLabel ? [overLimitParagraph(`${targetPlanLabel}プラン`)] : []),
          "契約状態により送信されなかった通知は、自動では再送されません。",
        ],
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

function overLimitParagraph(planLabel: string) {
  return `${planLabel}の利用上限を超えているため、現在は利用人数・稼働店舗・有効管理者を減らす操作と、契約・利用終了に必要な操作だけ利用できます。\n上限内になると、業務操作は自動的に再開されます。`;
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
