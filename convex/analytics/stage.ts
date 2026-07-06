/**
 * 店舗ライフサイクルステージの分類ロジック（純粋関数、DBアクセスなし）。
 *
 * ステージはKPIそのものではなく「店舗が今どの利用段階にいるか」の分類。
 * KPIはステージ間の遷移（開始前→実利用開始率など）を日次スナップショットの推移から読む。
 *
 * - beforeStart:        実利用開始条件を満たしていない（オンボーディング途中）
 * - activeTrial:        実利用開始済みだが継続実績（確定3件）はまだ。現在稼働中
 * - activeTrialDormant: 実利用開始後、継続実績に到達しないまま稼働が止まった
 * - retained:           確定3件以上の実績があり、現在も稼働中
 * - retainedDormant:    継続実績はあるが、現在/未来の確定シフト・進行中募集・直近活動がない
 */

export const SHOP_STAGES = ["beforeStart", "activeTrial", "activeTrialDormant", "retained", "retainedDormant"] as const;

export type ShopStage = (typeof SHOP_STAGES)[number];

// 実利用開始（アクティベーション）条件
export const STAGE_ACTIVATION_STAFF_MIN = 3;
export const STAGE_ACTIVATION_RECRUITMENT_MIN = 2;
// 継続実績条件
export const STAGE_RETAINED_CONFIRMED_MIN = 3;
// 主要イベントがこの日数以上ないと「現在稼働していない」とみなす
export const STAGE_DORMANT_AFTER_DAYS = 30;
// 開始前ステージでこの日数以上停止していたらアラート
export const STAGE_BEFORE_START_STALLED_ALERT_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export type ShopStageInputs = {
  /** シフト対象スタッフ数（店舗共有アドレス等のシフト対象外を除いた実スタッフ） */
  realStaffCount: number;
  /** 論理削除を除く募集数（open + confirmed） */
  recruitmentCount: number;
  /** 確定済み募集数 */
  confirmedRecruitmentCount: number;
  /** シフト希望の提出が1件以上発生したことがあるか */
  hasSubmission: boolean;
  /** 通知（メール/LINE）を1件以上送信したことがあるか */
  hasNotificationSent: boolean;
  /** 期間末日が集計日以降の確定済み募集があるか（現在/未来の確定シフト） */
  hasCurrentOrFutureConfirmedShift: boolean;
  /** 進行中（open）の募集があるか */
  hasOpenRecruitment: boolean;
  /** 主要イベント（店舗作成・スタッフ追加・募集作成・提出・確定・催促・LINE連携）の最終発生時刻 */
  lastActivityAt: number;
};

/** 実利用開始条件: 実スタッフ3人以上 + 募集2件以上 + 通知送信または提出が発生済み */
export function isActivated(inputs: ShopStageInputs): boolean {
  return (
    inputs.realStaffCount >= STAGE_ACTIVATION_STAFF_MIN &&
    inputs.recruitmentCount >= STAGE_ACTIVATION_RECRUITMENT_MIN &&
    (inputs.hasNotificationSent || inputs.hasSubmission)
  );
}

export function daysSince(at: number, nowMs: number): number {
  return Math.max(0, Math.floor((nowMs - at) / DAY_MS));
}

/** 現在稼働中か: 現在/未来の確定シフト・進行中募集・直近30日以内の主要イベントのいずれかがある */
export function hasCurrentOperation(inputs: ShopStageInputs, nowMs: number): boolean {
  if (inputs.hasCurrentOrFutureConfirmedShift) return true;
  if (inputs.hasOpenRecruitment) return true;
  return daysSince(inputs.lastActivityAt, nowMs) <= STAGE_DORMANT_AFTER_DAYS;
}

export function classifyShopStage(inputs: ShopStageInputs, nowMs: number): ShopStage {
  if (!isActivated(inputs)) return "beforeStart";
  const hasRetainedHistory = inputs.confirmedRecruitmentCount >= STAGE_RETAINED_CONFIRMED_MIN;
  const operating = hasCurrentOperation(inputs, nowMs);
  if (hasRetainedHistory) return operating ? "retained" : "retainedDormant";
  return operating ? "activeTrial" : "activeTrialDormant";
}

// ========================================
// オンボーディング進捗（開始前店舗が「どこまで進んだか」）
// ========================================

export const ONBOARDING_STEPS = [
  { key: "shopCreated", label: "店舗登録" },
  { key: "staffRegistered", label: "スタッフ登録" },
  { key: "recruitmentCreated", label: "募集作成" },
  { key: "notificationSent", label: "通知送信" },
  { key: "submissionReceived", label: "シフト提出" },
  { key: "recruitmentConfirmed", label: "シフト確定" },
  { key: "activated", label: "実利用開始" },
] as const;

export type OnboardingStepKey = (typeof ONBOARDING_STEPS)[number]["key"];

function onboardingStepReached(key: OnboardingStepKey, inputs: ShopStageInputs): boolean {
  switch (key) {
    case "shopCreated":
      return true;
    case "staffRegistered":
      return inputs.realStaffCount >= 1;
    case "recruitmentCreated":
      return inputs.recruitmentCount >= 1;
    case "notificationSent":
      return inputs.hasNotificationSent;
    case "submissionReceived":
      return inputs.hasSubmission;
    case "recruitmentConfirmed":
      return inputs.confirmedRecruitmentCount >= 1;
    case "activated":
      return isActivated(inputs);
  }
}

/** 到達済みステップのうち最も先のもの（開始前店舗の「最終到達ステップ」） */
export function lastReachedOnboardingStep(inputs: ShopStageInputs): OnboardingStepKey {
  let reached: OnboardingStepKey = "shopCreated";
  for (const step of ONBOARDING_STEPS) {
    if (onboardingStepReached(step.key, inputs)) reached = step.key;
  }
  return reached;
}

export function onboardingStepLabel(key: OnboardingStepKey): string {
  return ONBOARDING_STEPS.find((step) => step.key === key)?.label ?? key;
}

// ========================================
// 気になる点タグ（原因の断定はせず、調査の入口として出す）
// ========================================

export type ShopStageAlertContext = {
  inputs: ShopStageInputs;
  stage: ShopStage;
  /** 進行中募集への提出人数合計（進行中募集がない場合は0） */
  openRecruitmentSubmittedCount: number;
  /** 未解決の通知失敗件数 */
  openNotificationFailureCount: number;
  nowMs: number;
};

export function shopStageAlerts(context: ShopStageAlertContext): string[] {
  const { inputs, stage, nowMs } = context;
  const alerts: string[] = [];
  const stalledDays = daysSince(inputs.lastActivityAt, nowMs);

  if (context.openNotificationFailureCount > 0) {
    alerts.push(`通知失敗あり（${context.openNotificationFailureCount}件）`);
  }
  if (inputs.hasOpenRecruitment && context.openRecruitmentSubmittedCount === 0) {
    alerts.push("募集中・提出0件");
  }
  if (inputs.hasSubmission && inputs.confirmedRecruitmentCount === 0) {
    alerts.push("提出あり・確定なし");
  }
  if (stage === "beforeStart" && stalledDays >= STAGE_BEFORE_START_STALLED_ALERT_DAYS) {
    alerts.push(`開始前で${stalledDays}日停止`);
  }
  if (stage !== "beforeStart" && !inputs.hasCurrentOrFutureConfirmedShift && !inputs.hasOpenRecruitment) {
    alerts.push("現在/未来シフトなし");
  }
  if (stalledDays > STAGE_DORMANT_AFTER_DAYS) {
    alerts.push(`${STAGE_DORMANT_AFTER_DAYS}日以上活動なし`);
  }
  return alerts;
}
