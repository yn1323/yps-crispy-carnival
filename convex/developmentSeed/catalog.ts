import type { Doc, TableNames } from "../_generated/dataModel";
import { addDays, dateToUtcMs, formatUtcDate } from "../_lib/dateFormat";
import type { ShiftSubmissionPattern } from "../_lib/submissionPattern";
import type { NOTIFICATION_OUTBOX_STATUSES } from "../notificationOutbox/schemas";
import type { OrganizationBillingState } from "../organizationBilling/policy";

export const DEVELOPMENT_SEED_SCENARIO_KEYS = [
  "free-capacity",
  "trial-ending",
  "standard-operations",
  "pro-notifications",
  "standard-scheduled-change",
  "payment-pending",
  "payment-grace",
  "payment-restricted",
  "policy-restricted",
] as const;

export const DEVELOPMENT_SEED_CONTRACT_VERSION = "development-seed-v2";
export const DEVELOPMENT_SEED_EXPECTED_TABLE_COUNT = 66;

export type DevelopmentSeedScenarioKey = (typeof DEVELOPMENT_SEED_SCENARIO_KEYS)[number];

export const PRIMARY_SEED_AUTH_TOKEN_IDENTIFIER = "https://seed.example.test|replace-with-clerk-token-identifier";
export const READ_ONLY_SEED_AUTH_TOKEN_IDENTIFIER = "https://seed.example.test|readonly-manager";
export const POLICY_RESTRICTED_EXTRA_MANAGER_AUTH_TOKEN_IDENTIFIERS = [
  "https://seed.example.test|policy-restricted-manager-1",
  "https://seed.example.test|policy-restricted-manager-2",
  "https://seed.example.test|policy-restricted-manager-3",
  "https://seed.example.test|policy-restricted-manager-4",
] as const;

export function ownerAuthTokenIdentifier(key: DevelopmentSeedScenarioKey): string {
  return key === "free-capacity" ? PRIMARY_SEED_AUTH_TOKEN_IDENTIFIER : `https://seed.example.test|owner-${key}`;
}

export type DevelopmentSeedRecruitmentWindowKey =
  | "pastConfirmed"
  | "currentConfirmed"
  | "actionRequired"
  | "recruiting"
  | "futureConfirmed";

export type DevelopmentSeedRecruitmentWindow = {
  status: "open" | "confirmed";
  deadline: string;
  periodStart: string;
  periodEnd: string;
};

export function assertSeedDate(date: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || formatUtcDate(dateToUtcMs(date)) !== date) {
    throw new Error("Development seed date must be YYYY-MM-DD");
  }
}

export function buildDevelopmentSeedRecruitmentWindows(
  today: string,
): Record<DevelopmentSeedRecruitmentWindowKey, DevelopmentSeedRecruitmentWindow> {
  assertSeedDate(today);
  return {
    pastConfirmed: {
      status: "confirmed",
      deadline: addDays(today, -24),
      periodStart: addDays(today, -21),
      periodEnd: addDays(today, -15),
    },
    currentConfirmed: {
      status: "confirmed",
      deadline: addDays(today, -5),
      periodStart: addDays(today, -2),
      periodEnd: addDays(today, 4),
    },
    actionRequired: {
      status: "open",
      deadline: addDays(today, -1),
      periodStart: addDays(today, 2),
      periodEnd: addDays(today, 8),
    },
    recruiting: {
      status: "open",
      deadline: addDays(today, 2),
      periodStart: addDays(today, 6),
      periodEnd: addDays(today, 12),
    },
    futureConfirmed: {
      status: "confirmed",
      deadline: addDays(today, 10),
      periodStart: addDays(today, 14),
      periodEnd: addDays(today, 20),
    },
  };
}

export const TIME_SUBMISSION_PATTERN = {
  kind: "time",
  startTime: "09:00",
  endTime: "22:00",
} as const satisfies ShiftSubmissionPattern;

export const DATE_ONLY_SUBMISSION_PATTERN = { kind: "dateOnly" } as const satisfies ShiftSubmissionPattern;

export const SHIFT_TYPE_SUBMISSION_PATTERN = {
  kind: "shiftType",
  options: [
    { id: "early", name: "早番", startTime: "09:00", endTime: "17:00", sortOrder: 0 },
    { id: "late", name: "遅番", startTime: "13:00", endTime: "21:00", sortOrder: 1 },
  ],
} as const satisfies ShiftSubmissionPattern;

type RelativeBillingState = (now: number) => OrganizationBillingState;

export type DevelopmentSeedScenario = {
  key: DevelopmentSeedScenarioKey;
  organizationName: string;
  shopNames: readonly string[];
  shopPatterns: readonly ShiftSubmissionPattern[];
  billingState: RelativeBillingState;
  dataProfile: "capacity" | "operations" | "notifications" | "billingOnly";
};

const DAY_MS = 24 * 60 * 60 * 1000;

export const DEVELOPMENT_SEED_SCENARIOS = [
  {
    key: "free-capacity",
    organizationName: "[SEED] Free・上限確認",
    shopNames: ["[SEED] Free店舗"],
    shopPatterns: [DATE_ONLY_SUBMISSION_PATTERN],
    billingState: () => ({ kind: "active", planIdVersion: 2, plan: "free" }),
    dataProfile: "capacity",
  },
  {
    key: "trial-ending",
    organizationName: "[SEED] Trial・終了間近",
    shopNames: ["[SEED] Trial店舗"],
    shopPatterns: [TIME_SUBMISSION_PATTERN],
    billingState: (now) => ({
      kind: "trial",
      planIdVersion: 2,
      selectedPaidPlan: "standard",
      trialEndsAt: now + 3 * DAY_MS,
    }),
    dataProfile: "operations",
  },
  {
    key: "standard-operations",
    organizationName: "[SEED] Standard・複数店舗",
    shopNames: ["[SEED] 本店", "[SEED] 駅前店", "[SEED] 商業施設店"],
    shopPatterns: [TIME_SUBMISSION_PATTERN, DATE_ONLY_SUBMISSION_PATTERN, SHIFT_TYPE_SUBMISSION_PATTERN],
    billingState: () => ({ kind: "active", planIdVersion: 2, plan: "standard" }),
    dataProfile: "operations",
  },
  {
    key: "pro-notifications",
    organizationName: "[SEED] Pro・通知",
    shopNames: ["[SEED] 通知確認店舗"],
    shopPatterns: [SHIFT_TYPE_SUBMISSION_PATTERN],
    billingState: () => ({ kind: "complimentary", planIdVersion: 2, plan: "pro" }),
    dataProfile: "notifications",
  },
  {
    key: "standard-scheduled-change",
    organizationName: "[SEED] Standard・解約予約",
    shopNames: ["[SEED] 解約予約店舗"],
    shopPatterns: [TIME_SUBMISSION_PATTERN],
    billingState: (now) => ({
      kind: "scheduledChange",
      planIdVersion: 2,
      currentPlan: "standard",
      targetPlan: "free",
      effectiveAt: now + 14 * DAY_MS,
      restrictAtPeriodEnd: true,
    }),
    dataProfile: "billingOnly",
  },
  {
    key: "payment-pending",
    organizationName: "[SEED] 支払反映待ち",
    shopNames: ["[SEED] 支払反映待ち店舗"],
    shopPatterns: [TIME_SUBMISSION_PATTERN],
    billingState: (now) => ({
      kind: "pendingActivation",
      planIdVersion: 2,
      plan: "standard",
      fallback: "free",
      startedAt: now - DAY_MS,
    }),
    dataProfile: "billingOnly",
  },
  {
    key: "payment-grace",
    organizationName: "[SEED] 支払猶予中",
    shopNames: ["[SEED] 支払猶予店舗"],
    shopPatterns: [TIME_SUBMISSION_PATTERN],
    billingState: (now) => ({
      kind: "grace",
      planIdVersion: 2,
      plan: "standard",
      startedAt: now - 7 * DAY_MS,
      endsAt: now + 7 * DAY_MS,
    }),
    dataProfile: "billingOnly",
  },
  {
    key: "payment-restricted",
    organizationName: "[SEED] Free・上限超過",
    shopNames: ["[SEED] Free上限超過店舗"],
    shopPatterns: [TIME_SUBMISSION_PATTERN],
    billingState: () => ({ kind: "active", planIdVersion: 2, plan: "free" }),
    dataProfile: "capacity",
  },
  {
    key: "policy-restricted",
    organizationName: "[SEED] Standard・上限超過",
    shopNames: ["[SEED] Standard上限超過店舗"],
    shopPatterns: [TIME_SUBMISSION_PATTERN],
    billingState: () => ({ kind: "active", planIdVersion: 2, plan: "standard" }),
    dataProfile: "billingOnly",
  },
] as const satisfies readonly DevelopmentSeedScenario[];

export function getDevelopmentSeedScenario(key: DevelopmentSeedScenarioKey): DevelopmentSeedScenario {
  const scenario = DEVELOPMENT_SEED_SCENARIOS.find((candidate) => candidate.key === key);
  if (!scenario) throw new Error("Unknown development seed scenario");
  return scenario;
}

type CoverageDisposition =
  | { kind: "seeded"; scenarioKeys: readonly DevelopmentSeedScenarioKey[] }
  | {
      kind: "intentionallyEmpty" | "derived" | "runtimeOnly";
      reason: string;
    };

const ALL = DEVELOPMENT_SEED_SCENARIO_KEYS;
const OPERATIONS = ["free-capacity", "trial-ending", "standard-operations", "pro-notifications"] as const;
const STANDARD_OPERATIONS = ["standard-operations"] as const;
const PRO_NOTIFICATIONS = ["pro-notifications"] as const;
const empty = (reason: string): CoverageDisposition => ({ kind: "intentionallyEmpty", reason });
const seeded = (scenarioKeys: readonly DevelopmentSeedScenarioKey[]): CoverageDisposition => ({
  kind: "seeded",
  scenarioKeys,
});

export const DEVELOPMENT_SEED_TABLE_COVERAGE = {
  rateLimits: {
    kind: "runtimeOnly",
    reason: "全table置換中だけscheduler audit証跡を保持し、完了検証と同じtransactionで削除する",
  },
  shops: seeded(ALL),
  organizations: seeded(ALL),
  organizationPeople: seeded(ALL),
  organizationStaffOrderStates: seeded(STANDARD_OPERATIONS),
  organizationStaffOrderEntries: seeded(STANDARD_OPERATIONS),
  shopStaffOrderEntries: seeded(STANDARD_OPERATIONS),
  organizationMembers: seeded(ALL),
  organizationInvitations: empty("実credentialとなる招待tokenを作らない"),
  organizationBillingStates: seeded(ALL),
  organizationStripeCustomers: empty("実Stripe mirrorは対象外"),
  organizationStripeSubscriptions: empty("実Stripe mirrorは対象外"),
  organizationStripeOperations: empty("active billing workflowを作らない"),
  stripeWebhookEvents: empty("provider Webhook receiptを作らない"),
  organizationAuditEvents: empty("direct seedを利用者操作のauditとして記録しない"),
  organizationMigrationConflicts: empty("migration conflictはruntimeで検知する"),
  deletionCleanupJobs: empty("active cleanup workflowを作らない"),
  accountDeletionJobs: empty("active deletion workflowを作らない"),
  shopBillingStates: empty("organization billingを正本にする"),
  users: seeded(ALL),
  shopMembers: empty("canonical organization memberを使用する"),
  featureRequests: empty("開発者の要望投稿を装わない"),
  dashboardAnnouncements: seeded(STANDARD_OPERATIONS),
  staffs: seeded(OPERATIONS),
  staffLineAccounts: seeded(PRO_NOTIFICATIONS),
  lineProviderUsers: seeded(PRO_NOTIFICATIONS),
  organizationPersonLineLinks: seeded(PRO_NOTIFICATIONS),
  lineFriendshipFanoutJobs: empty("active LINE workflowを作らない"),
  lineWebhookMessageReceipts: empty("provider Webhook receiptを作らない"),
  shopRegistrationLinks: seeded(["trial-ending"]),
  staffRegistrationRequests: seeded(["free-capacity", "trial-ending"]),
  legalConsentStates: seeded(OPERATIONS),
  recruitments: seeded(OPERATIONS),
  shiftSubmissionSlots: seeded(["trial-ending", "standard-operations", "pro-notifications"]),
  shiftSubmissionDates: seeded(["free-capacity", "standard-operations"]),
  shiftAssignments: seeded(OPERATIONS),
  shiftConfirmationSnapshots: seeded(PRO_NOTIFICATIONS),
  shiftSubmissions: seeded(OPERATIONS),
  recruitmentStats: seeded(OPERATIONS),
  positions: seeded(OPERATIONS),
  magicLinks: empty("実credentialとなるmagic linkを作らない"),
  sessions: empty("実credentialとなるstaff sessionを作らない"),
  lineLinkTokens: empty("実credentialとなるLINE OAuth stateを作らない"),
  lineQuotaStatus: seeded(PRO_NOTIFICATIONS),
  notificationFanoutOperations: empty("active fanoutを作らない"),
  notificationOutbox: seeded(PRO_NOTIFICATIONS),
  notificationResendDelayedFailureDeadlines: empty("delayed recovery jobを作らない"),
  notificationHistory: seeded(PRO_NOTIFICATIONS),
  notificationDeliveryEvents: seeded(PRO_NOTIFICATIONS),
  notificationFailureInbox: seeded(PRO_NOTIFICATIONS),
  notificationUsage: empty("seed通知は実送信ではないため集計しない"),
  analyticsRuns: empty("nightly analytics workflowを作らない"),
  analyticsSourceEvents: empty("seed操作をproduct eventとして扱わない"),
  analyticsOrganizations: empty("derived analyticsはnightly処理が所有する"),
  analyticsShops: empty("derived analyticsはnightly処理が所有する"),
  analyticsPeople: empty("derived analyticsはnightly処理が所有する"),
  analyticsMemberships: empty("derived analyticsはnightly処理が所有する"),
  analyticsShiftCycles: empty("derived analyticsはnightly処理が所有する"),
  analyticsShiftCycleOpportunities: empty("derived analyticsはnightly処理が所有する"),
  analyticsDailyServiceKpis: empty("derived analyticsはnightly処理が所有する"),
  analyticsDailyNotificationKpis: empty("derived analyticsはnightly処理が所有する"),
  analyticsDailyOrganizationKpis: empty("derived analyticsはnightly処理が所有する"),
  analyticsDailyShopKpis: empty("derived analyticsはnightly処理が所有する"),
  analyticsDailySegmentKpis: empty("derived analyticsはnightly処理が所有する"),
  legalConsentTokens: empty("実credentialとなる同意tokenを作らない"),
  legalConsentEvents: seeded(OPERATIONS),
} satisfies Record<TableNames, CoverageDisposition>;

type UnionCoverageDisposition =
  | { kind: "seeded"; scenarioKeys: readonly DevelopmentSeedScenarioKey[] }
  | {
      kind: "intentionallyEmpty";
      reason: string;
    };

type SubmissionKind = ShiftSubmissionPattern["kind"];
type BillingKind = OrganizationBillingState["kind"];
type RecruitmentStatus = Doc<"recruitments">["status"];
type MemberStatus = Doc<"organizationMembers">["status"];
type RegistrationStatus = Doc<"staffRegistrationRequests">["status"];
type OutboxStatus = (typeof NOTIFICATION_OUTBOX_STATUSES)[number];
type FailureStatus = Doc<"notificationFailureInbox">["status"];

export const DEVELOPMENT_SEED_UNION_COVERAGE = {
  submissionKind: {
    time: { kind: "seeded", scenarioKeys: ["trial-ending", "standard-operations"] },
    dateOnly: { kind: "seeded", scenarioKeys: ["free-capacity", "standard-operations"] },
    shiftType: { kind: "seeded", scenarioKeys: ["standard-operations", "pro-notifications"] },
  } satisfies Record<SubmissionKind, UnionCoverageDisposition>,
  billingKind: {
    trial: { kind: "seeded", scenarioKeys: ["trial-ending"] },
    initialPaymentPending: { kind: "intentionallyEmpty", reason: "pendingActivationを代表表示にする" },
    pendingActivation: { kind: "seeded", scenarioKeys: ["payment-pending"] },
    active: {
      kind: "seeded",
      scenarioKeys: ["free-capacity", "standard-operations", "payment-restricted", "policy-restricted"],
    },
    complimentary: { kind: "seeded", scenarioKeys: ["pro-notifications"] },
    scheduledChange: { kind: "seeded", scenarioKeys: ["standard-scheduled-change"] },
    grace: { kind: "seeded", scenarioKeys: ["payment-grace"] },
    restricted: { kind: "intentionallyEmpty", reason: "旧データmigration互換だけで、新しいseedからは作らない" },
  } satisfies Record<BillingKind, UnionCoverageDisposition>,
  recruitmentStatus: {
    open: { kind: "seeded", scenarioKeys: OPERATIONS },
    confirmed: { kind: "seeded", scenarioKeys: OPERATIONS },
  } satisfies Record<RecruitmentStatus, UnionCoverageDisposition>,
  memberStatus: {
    active: { kind: "seeded", scenarioKeys: ALL },
    readOnly: { kind: "seeded", scenarioKeys: STANDARD_OPERATIONS },
    removed: { kind: "intentionallyEmpty", reason: "現行画面ではactive/readOnlyを代表状態にする" },
  } satisfies Record<MemberStatus, UnionCoverageDisposition>,
  registrationStatus: {
    pending: { kind: "seeded", scenarioKeys: ["free-capacity", "trial-ending"] },
    approved: { kind: "intentionallyEmpty", reason: "approved後はstaff graphを正本にする" },
    rejected: { kind: "intentionallyEmpty", reason: "pendingの承認可否を代表状態にする" },
  } satisfies Record<RegistrationStatus, UnionCoverageDisposition>,
  outboxStatus: {
    pending: { kind: "intentionallyEmpty", reason: "active deliveryを禁止する" },
    processing: { kind: "intentionallyEmpty", reason: "active deliveryを禁止する" },
    sent: { kind: "seeded", scenarioKeys: PRO_NOTIFICATIONS },
    failed: { kind: "seeded", scenarioKeys: PRO_NOTIFICATIONS },
    cancelled: { kind: "intentionallyEmpty", reason: "sent/failedを代表terminal状態にする" },
  } satisfies Record<OutboxStatus, UnionCoverageDisposition>,
  failureStatus: {
    open: { kind: "seeded", scenarioKeys: PRO_NOTIFICATIONS },
    retrying: { kind: "intentionallyEmpty", reason: "active retryを禁止する" },
    resolved: { kind: "seeded", scenarioKeys: PRO_NOTIFICATIONS },
  } satisfies Record<FailureStatus, UnionCoverageDisposition>,
};

function contractDispositionFingerprint(disposition: UnionCoverageDisposition | CoverageDisposition): string {
  return disposition.kind === "seeded"
    ? `${disposition.kind}:${[...disposition.scenarioKeys].sort().join(",")}`
    : disposition.kind;
}

function hashContractDescriptor(descriptor: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < descriptor.length; index += 1) {
    hash ^= descriptor.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

const DEVELOPMENT_SEED_CONTRACT_DESCRIPTOR = [
  ...DEVELOPMENT_SEED_SCENARIO_KEYS.map((key) => `scenario:${key}`),
  ...Object.entries(DEVELOPMENT_SEED_TABLE_COVERAGE)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([tableName, disposition]) => `table:${tableName}:${contractDispositionFingerprint(disposition)}`),
  ...Object.entries(DEVELOPMENT_SEED_UNION_COVERAGE).flatMap(([unionName, variants]) =>
    Object.entries(variants)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([variant, disposition]) => `union:${unionName}:${variant}:${contractDispositionFingerprint(disposition)}`),
  ),
].join("|");

export const DEVELOPMENT_SEED_CONTRACT_FINGERPRINT = hashContractDescriptor(DEVELOPMENT_SEED_CONTRACT_DESCRIPTOR);
