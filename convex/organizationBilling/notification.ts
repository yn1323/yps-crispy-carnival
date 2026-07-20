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
  v.literal("paidActivationFailedRestrictedContinued"),
  v.literal("graceStarted"),
  v.literal("graceEndingSoon"),
  v.literal("restrictedStarted"),
  v.literal("recovered"),
  v.literal("billingEmailChanged"),
);

export type OrganizationBillingNotificationEvent =
  | "trialEnding"
  | "initialPaymentPending"
  | "freeApplied"
  | "scheduledChange"
  | "scheduledChangeCanceled"
  | "planActivated"
  | "proDowngradeNotApplied"
  | "paidActivationFailedFreeContinued"
  | "paidActivationFailedRestrictedContinued"
  | "graceStarted"
  | "graceEndingSoon"
  | "restrictedStarted"
  | "recovered"
  | "billingEmailChanged";

export type TrialEndingNotificationDetails = {
  trialEndsAt: number;
  selectedPaidPlan?: "pro";
};

export function organizationBillingNotificationCopy(
  event: OrganizationBillingNotificationEvent,
  trialEnding?: TrialEndingNotificationDetails,
) {
  switch (event) {
    case "trialEnding": {
      const trialEndsAtLabel = trialEnding ? formatDateTimeLabel(trialEnding.trialEndsAt) : "トライアル終了日時";
      const selectedPlanLabel = trialEnding?.selectedPaidPlan === "pro" ? "Pro" : null;
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
          "支払い結果を確認しています。確認中も、選択した有料プランの機能を利用できます。",
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
    case "scheduledChange":
      return {
        subject: "プラン変更を予約しました",
        heading: "プラン変更を予約しました",
        paragraphs: [
          "現在の支払い済み期間が終わるまでは、現在の有料プランを利用できます。",
          "適用時には利用人数、管理者、店舗の状態をもう一度確認します。",
        ],
      };
    case "scheduledChangeCanceled":
      return {
        subject: "プラン変更予約を取り消しました",
        heading: "プラン変更予約を取り消しました",
        paragraphs: [
          "期間末に予定していたプラン変更を取り消しました。",
          "現在の有料プランを継続します。現在の契約状態はグループ設定で確認できます。",
        ],
      };
    case "planActivated":
      return {
        subject: "有料プランを開始しました",
        heading: "有料プランを開始しました",
        paragraphs: ["支払い結果を確認し、有料プランを開始しました。現在の利用状況はグループ設定で確認できます。"],
      };
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
    case "restrictedStarted":
      return {
        subject: "契約制限中へ移行しました",
        heading: "契約制限中へ移行しました",
        paragraphs: [
          "既存データは引き続き閲覧できますが、シフト作成や通知などの業務操作を停止しています。",
          "グループ設定で有料契約を再開するか、無料で残す管理者と店舗を整理してください。",
        ],
      };
    case "recovered":
      return {
        subject: "契約を復旧しました",
        heading: "契約を復旧しました",
        paragraphs: [
          "支払い結果を確認し、確認済みの管理者と店舗で業務を再開しました。",
          "契約制限中に停止した過去の通知は自動では再送しません。",
        ],
      };
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
