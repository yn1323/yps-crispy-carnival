import { ORGANIZATION_PLAN_LIMITS } from "@/convex/organizationBilling/planLimits";

const DAY_MS = 24 * 60 * 60 * 1000;
// 2か月のTrialで、次のシフト募集を作る前に判断できるよう2週間前から案内する。
const NOTICE_LEAD_MS = 14 * DAY_MS;
const SOON_LEAD_MS = 7 * DAY_MS;
// trialEndsAtは最終利用日の翌日0:00 JSTという排他的な境界なので、最後の24時間が最終日になる。
const LAST_DAY_LEAD_MS = DAY_MS;

// setTimeoutが32bit整数を超えて即時発火しないよう、長い待機は分割する。
export const MAX_BOUNDARY_TIMER_DELAY_MS = 2_147_483_647;

type UsageViolation = {
  kind: "people" | "shops" | "activeManagers";
  current: number;
  isLowerBound?: true;
};

export type TrialEndingNoticeData = {
  trialEndsAt: number;
  freeLimitStatus: { kind: "withinLimits" } | { kind: "overLimit"; violations: UsageViolation[] } | { kind: "unknown" };
};

/** 残り14日から8日、残り7日から2日、最終日。段階ごとに強さと閉じ方を変える。 */
export type TrialEndingStage = "early" | "soon" | "lastDay";

export type TrialEndingNoticeViewModel = {
  stage: TrialEndingStage;
  tone: "neutral" | "warning";
  title: string;
  descriptions: string[];
  dismissible: boolean;
};

const finalDateFormatter = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "long", day: "numeric" });

const isValidNotice = (notice: TrialEndingNoticeData | null): notice is TrialEndingNoticeData =>
  Boolean(notice && Number.isFinite(notice.trialEndsAt));

export function getTrialEndingStage(trialEndsAt: number, now: number): TrialEndingStage | null {
  const remaining = trialEndsAt - now;
  if (!Number.isFinite(remaining) || remaining <= 0 || remaining > NOTICE_LEAD_MS) return null;
  if (remaining > SOON_LEAD_MS) return "early";
  if (remaining > LAST_DAY_LEAD_MS) return "soon";
  return "lastDay";
}

/** 表示段階が次に変わる時刻。終了後は案内しないためnullを返す。 */
export function getTrialEndingNextBoundary(notice: TrialEndingNoticeData | null, now: number): number | null {
  if (!isValidNotice(notice)) return null;
  const boundaries = [NOTICE_LEAD_MS, SOON_LEAD_MS, LAST_DAY_LEAD_MS, 0].map((lead) => notice.trialEndsAt - lead);
  return boundaries.find((boundary) => boundary > now) ?? null;
}

export function getBoundaryTimerDelay(boundary: number, now: number): number {
  return Math.min(Math.max(boundary - now, 0), MAX_BOUNDARY_TIMER_DELAY_MS);
}

const freeLimitLabel = () => {
  const limits = ORGANIZATION_PLAN_LIMITS.free;
  return `Freeプラン（${limits.maxPeople}名・${limits.maxShops}店舗・管理者${limits.maxActiveManagers}名まで）`;
};

const formatViolation = ({ kind, current, isLowerBound }: UsageViolation) => {
  const suffix = isLowerBound ? "以上" : "";
  if (kind === "people") return `利用人数${current}名${suffix}`;
  if (kind === "shops") return `${current}店舗${suffix}`;
  return `管理者${current}名${suffix}`;
};

const STOPPED_OPERATIONS = "シフト募集やスタッフの希望シフト提出、通知が止まります";
const CONTINUE_WITH_PAID_PLAN = "続けて使うには、有料プランを選んでください。データは消えません。";

function buildDescriptions(freeLimitStatus: TrialEndingNoticeData["freeLimitStatus"]): string[] {
  if (freeLimitStatus.kind === "withinLimits") {
    return [`終了後は${freeLimitLabel()}で続けて使えます。`, "人数や店舗を増やすときは、有料プランを選んでください。"];
  }
  if (freeLimitStatus.kind === "overLimit") {
    const usage = freeLimitStatus.violations.map(formatViolation).join("、");
    return [
      `終了後は${freeLimitLabel()}になります。`,
      `今は${usage}で上限を超えるため、${STOPPED_OPERATIONS}。`,
      CONTINUE_WITH_PAID_PLAN,
    ];
  }
  return [
    `終了後は${freeLimitLabel()}になります。`,
    `上限を超えている場合は、${STOPPED_OPERATIONS}。`,
    CONTINUE_WITH_PAID_PLAN,
  ];
}

export function buildTrialEndingNoticeViewModel(
  notice: TrialEndingNoticeData | null,
  now: number,
): TrialEndingNoticeViewModel | null {
  if (!isValidNotice(notice)) return null;
  const stage = getTrialEndingStage(notice.trialEndsAt, now);
  if (!stage) return null;

  const remainingDays = Math.ceil((notice.trialEndsAt - now) / DAY_MS);
  const finalDateLabel = finalDateFormatter.format(new Date(notice.trialEndsAt - 1));
  // Free上限内なら終了後も業務は止まらないため、どの段階でも要対応の色にしない。
  const affectsBusiness = notice.freeLimitStatus.kind !== "withinLimits";

  return {
    stage,
    tone: affectsBusiness && stage !== "early" ? "warning" : "neutral",
    title:
      stage === "lastDay"
        ? "無料トライアルは今日で終わります"
        : `${finalDateLabel}で無料トライアルが終わります（あと${remainingDays}日）`,
    descriptions: buildDescriptions(notice.freeLimitStatus),
    dismissible: stage !== "lastDay",
  };
}
