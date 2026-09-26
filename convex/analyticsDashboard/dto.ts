/** 本人用BFFとの契約。集計DTOへ問い合わせの個人情報を混ぜない。 */
export type AnalyticsMetric = "registered" | "submitted" | "confirmed";
export type AnalyticsRangeDays = 7 | 30 | 90;
export type AnalyticsCountsDto = Record<AnalyticsMetric, number>;
export type AnalyticsDayStatus = "before_start" | "pending" | "running" | "failed" | "complete" | "partial";
export type AnalyticsPageInfoDto = {
  cursor: string | null;
  continueCursor: string | null;
  isDone: boolean;
  pageSize: number;
  returnedCount: number;
};
export type AnalyticsDayDto = {
  date: string;
  status: AnalyticsDayStatus;
  counts: AnalyticsCountsDto | null;
  observationStartAt: number | null;
  observationEndAt: number | null;
  computedAt: number | null;
  errorCode: string | null;
};
export type OverviewResponse = {
  kind: "overview";
  asOf: number;
  definitionVersion: number;
  startedAt: number | null;
  nextAggregationAt: number;
  range: { from: string; to: string; days: AnalyticsRangeDays };
  yesterday: AnalyticsDayDto;
  series: AnalyticsDayDto[];
  period: {
    status: "complete" | "partial" | "unavailable";
    counts: AnalyticsCountsDto | null;
    observedDays: number;
    observationStartAt: number | null;
  };
  billing: BillingOverviewDto;
};
export type AnalyticsShopRowDto = {
  shopId: string;
  name: string;
  organizationId: string | null;
  organizationName: string | null;
  registeredAt: number | null;
  isDeleted: boolean;
};
export type OrganizationBillingSummaryDto = {
  kind:
    | "trial"
    | "initialPaymentPending"
    | "pendingActivation"
    | "active"
    | "complimentary"
    | "scheduledChange"
    | "paymentTerminationPending";
  /** 現在利用中のプラン。トライアルと切替待ちでは未確定のためnull。 */
  plan: "free" | "standard" | "pro" | null;
  /** 選択済み・切替先・変更予定のプラン。 */
  targetPlan: "free" | "standard" | "pro" | null;
  /** トライアル終了日時または変更予定日時。 */
  dueAt: number | null;
};
/** 店舗一覧で問い合わせ前に気づきたい状態。 */
export type AnalyticsShopAttention = "shift_ended" | "inactive";
export type AnalyticsShopListRowDto = AnalyticsShopRowDto & {
  staffCount: number | null;
  latestShift: { periodStart: string; periodEnd: string } | null;
  /** 計測開始後に提出・確定を記録した最終日。 */
  lastActivityDate: string | null;
  billing: OrganizationBillingSummaryDto | null;
  attention: AnalyticsShopAttention[];
};
export type BillingOverviewDto = {
  organizationCount: number;
  counts: Record<OrganizationBillingSummaryDto["kind"], number>;
  activeByPlan: Record<"free" | "standard" | "pro", number>;
  trialEndingWithin7Days: number;
  /** 走査上限に達し、件数が下限値であることを示す。 */
  isPartial: boolean;
};
export type ShopsResponse = {
  kind: "shops";
  asOf: number;
  rows: AnalyticsShopListRowDto[];
  pageInfo: AnalyticsPageInfoDto;
  scope: { date: string; metric: AnalyticsMetric } | null;
  scopeStatus: "current" | "available" | "unavailable" | "outside_retention";
};
export type StaffRowDto = {
  staffId: string;
  name: string;
  accountLinked: boolean;
  isManager: boolean;
  excludedFromShift: boolean;
  lineStatus: "unlinked" | "linked_following" | "linked_unfollowed" | "unavailable";
};
export type CycleRowDto = {
  recruitmentId: string;
  periodStart: string;
  periodEnd: string;
  deadline: string;
  status: "open" | "confirmed";
  confirmedAt: number | null;
};
export type CycleEvidenceDto = {
  recruitmentId: string;
  isDeleted: boolean;
  firstSubmittedAt: number | null;
  lastSubmittedAt: number | null;
  firstConfirmedAt: number | null;
  lastConfirmedAt: number | null;
  confirmedPeriodStartAt: number | null;
};
export type ShopDetailResponse = {
  kind: "shop";
  asOf: number;
  shop: AnalyticsShopRowDto;
  regularClosedDays: string[];
  submissionPattern: string;
  billing: OrganizationBillingSummaryDto | null;
  staff: StaffRowDto[];
  pageInfo: AnalyticsPageInfoDto;
  cycles: CycleRowDto[];
  activity: {
    startedAt: number | null;
    from: string;
    to: string;
    days: Array<{ date: string; registered: boolean; submitted: boolean; confirmed: boolean }>;
    evidence: CycleEvidenceDto[];
    hasMoreEvidence: boolean;
  };
};
export type StaffNotificationDto = {
  id: string;
  channel: "email" | "line";
  notificationKind: string;
  sendStatus: "queued" | "sent" | "failed" | "cancelled";
  deliveryStatus: "not_supported" | "unknown" | "delivered" | "delayed" | "failed" | "bounced" | "suppressed";
  requestedAt: number;
  sentAt: number | null;
  deliveredAt: number | null;
  failedAt: number | null;
};
export type StaffDetailResponse = {
  kind: "staff";
  asOf: number;
  shop: AnalyticsShopRowDto;
  staff: StaffRowDto & { email: string };
  memberships: Array<{ shopId: string; shopName: string; staffId: string; excludedFromShift: boolean }>;
  submissions: Array<CycleRowDto & { firstSubmittedAt: number | null; submittedAt: number | null }>;
  notifications: StaffNotificationDto[];
  pageInfo: AnalyticsPageInfoDto;
};
export type CycleDetailResponse = {
  kind: "cycle";
  asOf: number;
  shop: AnalyticsShopRowDto;
  cycle: CycleRowDto;
  currentSubmission: { numerator: number; denominator: number; rate: number | null } | null;
  currentSubmissionStatus: "available" | "scan_limit";
  confirmedBeforeStart: boolean | null;
  deadlineSubmissionRate: null;
};
export type FeatureRequestRowDto = {
  id: string;
  targetKind: "shop" | "organization";
  organizationId: string | null;
  organizationName: string | null;
  shopId: string | null;
  shopName: string;
  senderType: "manager" | "staff";
  comment: string;
  createdAt: number;
  isDeleted: boolean;
};
export type FeatureRequestsResponse = {
  kind: "requests";
  asOf: number;
  rows: FeatureRequestRowDto[];
  pageInfo: AnalyticsPageInfoDto;
};
export type FeatureRequestUpdateResponse = { kind: "requestUpdated"; id: string; isDeleted: boolean };
export type NotificationOutboxStatus = "pending" | "processing" | "sent" | "failed" | "cancelled";
export type NotificationCategory =
  | "recruitment"
  | "reminder"
  | "confirmation"
  | "lineInvite"
  | "legalConsent"
  | "manager"
  | "other";
export type RecruitmentPeriodDto = { recruitmentId: string; periodStart: string; periodEnd: string };
/** 宛先、本文、capability URL、dedupeKey、lease、providerの生エラーは含めない。 */
export type NotificationSearchRowDto = {
  id: string;
  createdAt: number;
  status: NotificationOutboxStatus;
  channel: "email" | "line";
  purpose: "business" | "billing";
  category: NotificationCategory;
  notificationContext: string;
  shop: { shopId: string; name: string; isDeleted: boolean } | null;
  organizationName: string | null;
  recipient: {
    kind: "staff" | "manager" | "invitation" | "none";
    name: string | null;
    /** 現在も同じ店舗に所属するスタッフだけ。詳細へのリンクに使う。 */
    staffId: string | null;
  };
  recruitment: RecruitmentPeriodDto | null;
  attemptCount: number;
  nextRunAt: number | null;
  sentAt: number | null;
  failedAt: number | null;
  cancelledAt: number | null;
  errorCode: string | null;
  cancelReason: string | null;
  deliverySuppressed: boolean;
  resendEmailId: string | null;
  /** スタッフ宛は通知履歴、それ以外はResendの配送問題から求める。記録がなければnull。 */
  deliveryStatus: StaffNotificationDto["deliveryStatus"] | null;
  deliveredAt: number | null;
  payloadRedacted: boolean;
};
export type NotificationSearchResponse = {
  kind: "notifications";
  asOf: number;
  mode: "filter" | "lookup";
  range: { from: string; to: string } | null;
  shop: AnalyticsShopRowDto | null;
  rows: NotificationSearchRowDto[];
  /** この要求で読み取った候補数。条件で除いた行を含む。 */
  scannedCount: number;
  pageInfo: AnalyticsPageInfoDto;
};
export type NotificationSummaryResponse = {
  kind: "notificationSummary";
  asOf: number;
  month: { month: string; email: number; line: number; shopCount: number; isPartial: boolean };
  failedLast7Days: { count: number; isPartial: boolean };
  delayed: { pending: number; processing: number; isPartial: boolean };
  lineQuota: {
    status: "normal" | "exceeded";
    remaining: number;
    totalQuota: number;
    checkedAt: number;
  } | null;
};
export type StaffTimelineEventType =
  | "staff_created"
  | "registration_requested"
  | "registration_reviewed"
  | "legal_consent_link_issued"
  | "legal_consent_link_used"
  | "legal_consented"
  | "submit_link_issued"
  | "view_link_issued"
  | "view_link_used"
  | "session_started"
  | "first_submitted"
  | "last_submitted"
  | "line_link_issued"
  | "line_link_used"
  | "line_linked"
  | "line_unlinked"
  | "line_unfollowed"
  | "notification_requested"
  | "feature_request_sent";
export type StaffTimelineEventDto = {
  at: number;
  type: StaffTimelineEventType;
  recruitment: RecruitmentPeriodDto | null;
  /** 種類ごとの安全な分類値。同意経路、通知種別、画面の種類などに限る。 */
  detail: string | null;
  /** 出来事の結果。参加申請は承認・却下、通知は`send.{送信状態}`または`delivery.{到達状態}`。 */
  status: string | null;
};
export type StaffTimelineResponse = {
  kind: "staffTimeline";
  asOf: number;
  events: StaffTimelineEventDto[];
  /** 表示件数の上限で古い出来事を省いた場合にtrue。 */
  isTruncated: boolean;
};
export type OrganizationEventDto = {
  id: string;
  occurredAt: number;
  action: string;
  actorName: string | null;
  targetKind: string | null;
  targetName: string | null;
  fromState: string | null;
  toState: string | null;
};
export type OrganizationEventsResponse = {
  kind: "organizationEvents";
  asOf: number;
  organizationId: string;
  organizationName: string;
  rows: OrganizationEventDto[];
  pageInfo: AnalyticsPageInfoDto;
};
export type AnalyticsDashboardResponse =
  | OverviewResponse
  | ShopsResponse
  | ShopDetailResponse
  | StaffDetailResponse
  | CycleDetailResponse
  | FeatureRequestsResponse
  | NotificationSearchResponse
  | NotificationSummaryResponse
  | StaffTimelineResponse
  | OrganizationEventsResponse;
