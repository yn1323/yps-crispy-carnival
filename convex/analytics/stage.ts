/**
 * 店舗ライフサイクルステージの分類ロジック（純粋関数、DBアクセスなし）。
 *
 * ステージはKPIそのものではなく「店舗が今どの利用段階にいるか」の分類。
 * KPIはステージ間の遷移（開始前→実利用開始率など）を日次スナップショットの推移から読む。
 *
 * - beforeStart:        下記ステージに該当しない
 * - activeTrial:        スタッフ2人以上で現在/未来の募集または確定シフトがあり、継続条件に該当しない
 * - activeTrialDormant: 過去に立ち上げ/継続で確定シフト経験があるが、現在/未来シフトと直近30日活動がない
 * - retained:           スタッフ2人以上で今日に被る確定シフトがあり、未来の募集または確定シフトがある
 * - retainedDormant:    過去に継続で確定シフト経験があるが、現在/未来シフトと直近30日活動がない
 */

export const SHOP_STAGES = ["beforeStart", "activeTrial", "activeTrialDormant", "retained", "retainedDormant"] as const;

export type ShopStage = (typeof SHOP_STAGES)[number];

// ステージ判定に使う最小スタッフ数
export const STAGE_ACTIVATION_STAFF_MIN = 2;
export const STAGE_ACTIVATION_RECRUITMENT_MIN = 2;
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
  /** 期間が集計日と重なる確定済み募集があるか（今日に被る確定シフト） */
  hasCurrentConfirmedShift: boolean;
  /** 進行中（open）の募集があるか */
  hasOpenRecruitment: boolean;
  /** 集計日より後に開始する進行中（open）の募集があるか */
  hasFutureOpenRecruitment: boolean;
  /** 集計日より後に開始する確定済み募集があるか */
  hasFutureConfirmedShift: boolean;
  /** 過去に立ち上げまたは継続だったことがあるか */
  hadActiveOrRetainedStage: boolean;
  /** 過去に継続だったことがあるか */
  hadRetainedStage: boolean;
  /** 主要イベント（店舗作成・スタッフ追加・募集作成・提出・確定・催促・LINE連携）の最終発生時刻 */
  lastActivityAt: number;
};

export function hasStageReadyStaff(inputs: ShopStageInputs): boolean {
  return inputs.realStaffCount >= STAGE_ACTIVATION_STAFF_MIN;
}

export function daysSince(at: number, nowMs: number): number {
  return Math.max(0, Math.floor((nowMs - at) / DAY_MS));
}

export function hasCurrentOrFutureShift(inputs: ShopStageInputs): boolean {
  return inputs.hasOpenRecruitment || inputs.hasCurrentOrFutureConfirmedShift;
}

export function hasFutureShift(inputs: ShopStageInputs): boolean {
  return inputs.hasFutureOpenRecruitment || inputs.hasFutureConfirmedShift;
}

export function hasRecentActivity(inputs: ShopStageInputs, nowMs: number): boolean {
  return daysSince(inputs.lastActivityAt, nowMs) <= STAGE_DORMANT_AFTER_DAYS;
}

export function isRetainedStageCandidate(inputs: ShopStageInputs): boolean {
  return hasStageReadyStaff(inputs) && inputs.hasCurrentConfirmedShift && hasFutureShift(inputs);
}

export function isActiveTrialStageCandidate(inputs: ShopStageInputs): boolean {
  return hasStageReadyStaff(inputs) && hasCurrentOrFutureShift(inputs) && !isRetainedStageCandidate(inputs);
}

export function isDormantStageCandidate(inputs: ShopStageInputs, nowMs: number): boolean {
  return (
    hasStageReadyStaff(inputs) &&
    inputs.confirmedRecruitmentCount >= 1 &&
    inputs.hadActiveOrRetainedStage &&
    !inputs.hasOpenRecruitment &&
    !inputs.hasCurrentOrFutureConfirmedShift &&
    !hasRecentActivity(inputs, nowMs)
  );
}

export function isActivated(inputs: ShopStageInputs): boolean {
  return isActiveTrialStageCandidate(inputs) || isRetainedStageCandidate(inputs);
}

export function classifyShopStage(inputs: ShopStageInputs, nowMs: number): ShopStage {
  if (isRetainedStageCandidate(inputs)) return "retained";
  if (isActiveTrialStageCandidate(inputs)) return "activeTrial";
  if (isDormantStageCandidate(inputs, nowMs)) return inputs.hadRetainedStage ? "retainedDormant" : "activeTrialDormant";
  return "beforeStart";
}

// ========================================
// オンボーディング進捗（開始前店舗が「どこまで進んだか」）
// ========================================

export const ONBOARDING_STEPS = [
  { key: "shopCreated", label: "店舗登録" },
  { key: "testRecruitmentCreated", label: "テスト募集作成" },
  { key: "selfTestSubmissionReceived", label: "テスト申請" },
  { key: "testRecruitmentConfirmed", label: "テスト確定" },
  { key: "firstStaffRegistered", label: "スタッフ登録" },
  { key: "staffReady", label: "スタッフ2人登録" },
  { key: "productionRecruitmentCreated", label: "本番シフト作成" },
  { key: "notificationSent", label: "通知送信" },
  { key: "activated", label: "実利用開始" },
] as const;

export type OnboardingStepKey = (typeof ONBOARDING_STEPS)[number]["key"];

function onboardingStepReached(key: OnboardingStepKey, inputs: ShopStageInputs): boolean {
  switch (key) {
    case "shopCreated":
      return true;
    case "testRecruitmentCreated":
      return inputs.recruitmentCount >= 1;
    case "selfTestSubmissionReceived":
      return inputs.hasSubmission;
    case "testRecruitmentConfirmed":
      return inputs.confirmedRecruitmentCount >= 1;
    case "firstStaffRegistered":
      return inputs.realStaffCount >= 1;
    case "staffReady":
      return inputs.realStaffCount >= STAGE_ACTIVATION_STAFF_MIN;
    case "productionRecruitmentCreated":
      return inputs.recruitmentCount >= STAGE_ACTIVATION_RECRUITMENT_MIN;
    case "notificationSent":
      return inputs.hasNotificationSent;
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
