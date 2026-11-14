import { dateJST, dateToUtcMs } from "@convex/_lib/dateFormat";
import type {
  AnalyticsMetric,
  AnalyticsMinStaff,
  ExportSubmissionPatternDto,
  OrganizationExportResponse,
  ShopBillingFilter,
  ShopExportResponse,
} from "@/api/analyticsTypes";
import { SUBMISSION_PATTERN_LABELS } from "@/features/analytics/format";

/**
 * 外部のAIに読ませる分析用JSON。実名、メールアドレス、自由記述を入れない。
 * 組織・店舗・スタッフ・ユーザーはDBのIDで出力し、別のファイルやConvex Dashboardと照合できるようにする。
 * 組織名・店舗名との対応表は画面にだけ表示する。
 */
export const ANALYSIS_SCHEMA_VERSION = 2;

export type AnalysisScope =
  | {
      kind: "shopList";
      filters: {
        hasNameSearch: boolean;
        billing: ShopBillingFilter | null;
        attention: boolean;
        notified: boolean;
        minStaff: AnalyticsMinStaff | null;
        activity: { from: string; to: string; metric: AnalyticsMetric } | null;
      };
    }
  | {
      kind: "organizationList";
      filters: {
        hasNameSearch: boolean;
        billing: ShopBillingFilter | null;
        notified: boolean;
        minStaff: AnalyticsMinStaff | null;
      };
    }
  | { kind: "organization" }
  | { kind: "shop" };

export type SkippedTarget = { target: "organization" | "shop"; reason: "deleted" | "not_found" | "failed" };
export type AnalysisSource = {
  scope: AnalysisScope;
  exportedAt: number;
  organizations: OrganizationExportResponse[];
  shops: ShopExportResponse[];
  skipped: SkippedTarget[];
};
export type AnalysisMapping = {
  organizations: Array<{ organizationId: string; name: string }>;
  shops: Array<{ shopId: string; name: string; organizationId: string }>;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

const DEFINITIONS = {
  timezone: "日時はJST（+09:00）、日付はJSTの暦日です。",
  "organizations[].organizationId / shops[].shopId":
    "組織・店舗のDB上のIDです。別のファイルでも同じIDは同じ対象です。shops[].organizationIdは所属組織のIDです。組織・店舗は登録の古い順に並べています。",
  staffId:
    "スタッフのDB上のIDです。店舗ごとに振られるため、同じ人でも店舗が違えば別のIDです。submissionsのnullは現在在籍していないスタッフです。",
  "members[].userId":
    "ログイン用アカウントのDB上のIDです。同じアカウントなら店舗・組織をまたいで同じIDです。アカウント未連携のスタッフはnullです。",
  personKey:
    "同じ人物を店舗・組織をまたいで照合するキーです。メールアドレスが同じスタッフのうち最も古いスタッフのIDで、別のファイルでも同じ値です。submissionsのnullは現在在籍していないスタッフです。",
  "submissionPattern.time": "時間指定。スタッフが日付ごとに開始・終了時刻を提出します。",
  "submissionPattern.dateOnly": "日付選択。スタッフは出勤できる日付だけを選びます。",
  "submissionPattern.shiftType":
    "パターン選択。店舗が登録した勤務パターン（時間帯）から選びます。パターン名は出力していません。",
  "shops[].settings.submissionPattern":
    "店舗の現在の設定です。recruitments[].submissionPatternは、その募集を作成した時点の設定です。",
  "organizations[].billing.kind":
    "trial=トライアル、initialPaymentPending=初回支払い待ち、pendingActivation=有効化待ち、active=有効な契約、complimentary=無償提供、scheduledChange=プラン変更予定、paymentTerminationPending=支払い停止による終了待ち。",
  "organizations[].peopleCount":
    "プラン上限と同じ数え方の利用人数です。管理者を含み、複数店舗に所属する人も1人と数えます。nullは確認できなかった値です。",
  "shops[].staff.count": "現在有効なスタッフ数です。管理者とシフト対象外のスタッフも含みます。",
  "shops[].usage.analyticsStartedAt":
    "利用状況の計測開始日時です。lastActivityDateとactiveDaysはこれより前の利用を含みません。",
  "shops[].usage.lastActivityDate": "計測開始後に提出・確定を記録した最終日です。",
  "shops[].usage.attention":
    "shift_ended=最新の募集期間が終わり次の募集がない、inactive=最後の提出・確定から14日以上たった。",
  "shops[].usage.activeDays": "直近90日で、提出（submitted）・確定（confirmed）があった日です。",
  "shops[].recruitments": "直近8件の募集です。期間開始日の新しい順です。",
  "recruitments[].confirmedBeforeStart": "募集期間の開始前に確定したかどうかです。未確定はnullです。",
  "recruitments[].editCount": "募集を作成後に編集した回数です。",
  "recruitments[].submission.shiftTargetCountAtLastUpdate":
    "最後に提出数を更新した時点のシフト対象人数です。提出率の分母の目安で、期限時点の人数ではありません。",
  "recruitments[].submissions[].firstSubmittedByDeadline": "初回提出が提出期限日の23:59までだったかどうかです。",
  "recruitments[].submissions[].assigned":
    "確定シフトに割当があるかどうかです。割当の走査が上限に達した募集ではnullです。",
  "members[].line":
    "LINE連携の状態です。linked_following=連携済み・友だち、linked_unfollowed=連携済み・友だち解除、unlinked=未連携、unavailable=確認できない。",
  isTruncated: "読み取りの上限で打ち切った項目です。人数・件数は下限値です。",
  skipped:
    "取得できなかった組織・店舗と理由です。deleted=削除済み、not_found=取得中に見つからなくなった、failed=取得に失敗した。",
} as const;

function toJstIso(ms: number | null) {
  if (ms === null) return null;
  return `${new Date(ms + JST_OFFSET_MS).toISOString().slice(0, 19)}+09:00`;
}
function daysBetween(from: string, to: string) {
  return Math.round((dateToUtcMs(to) - dateToUtcMs(from)) / DAY_MS);
}
function pattern(value: ExportSubmissionPatternDto) {
  const label = SUBMISSION_PATTERN_LABELS[value.kind];
  switch (value.kind) {
    case "time":
      return { kind: value.kind, label, startTime: value.startTime, endTime: value.endTime };
    case "dateOnly":
      return { kind: value.kind, label };
    case "shiftType":
      return { kind: value.kind, label, optionCount: value.options.length, options: value.options };
  }
}

export function buildAnalysisJson(source: AnalysisSource): { json: unknown; mapping: AnalysisMapping } {
  const summaries = new Map(source.organizations.map((row) => [row.organization.organizationId, row]));
  const organizationIds = new Set([
    ...source.organizations.map((row) => row.organization.organizationId),
    ...source.shops.map((row) => row.shop.organizationId),
  ]);
  const registeredAt = (organizationId: string) =>
    summaries.get(organizationId)?.organization.registeredAt ??
    Math.min(
      ...source.shops.filter((row) => row.shop.organizationId === organizationId).map((row) => row.shop.registeredAt),
    );
  const orderedOrganizations = [...organizationIds].sort(
    (left, right) => registeredAt(left) - registeredAt(right) || left.localeCompare(right),
  );
  const orderedShops = [...source.shops].sort(
    (left, right) =>
      orderedOrganizations.indexOf(left.shop.organizationId) -
        orderedOrganizations.indexOf(right.shop.organizationId) ||
      left.shop.registeredAt - right.shop.registeredAt ||
      left.shop.shopId.localeCompare(right.shop.shopId),
  );
  const shopCountByOrganization = new Map<string, number>();
  for (const row of orderedShops)
    shopCountByOrganization.set(
      row.shop.organizationId,
      (shopCountByOrganization.get(row.shop.organizationId) ?? 0) + 1,
    );
  const personKeys = new Set(orderedShops.flatMap((row) => row.members.map((member) => member.personKey)));

  const organizations = orderedOrganizations.map((organizationId) => {
    const summary = summaries.get(organizationId);
    if (!summary) return { organizationId, isSummaryAvailable: false };
    const organization = summary.organization;
    return {
      organizationId,
      isSummaryAvailable: true,
      registeredOn: dateJST(organization.registeredAt),
      billing: organization.billing && {
        kind: organization.billing.kind,
        plan: organization.billing.plan,
        targetPlan: organization.billing.targetPlan,
        dueAt: toJstIso(organization.billing.dueAt),
      },
      peopleCount: organization.peopleCount,
      managerCount: organization.activeManagerCount,
      shopCount: organization.shopCount,
      lastNotifiedAt: toJstIso(organization.lastNotifiedAt),
      shopsInFile: shopCountByOrganization.get(organizationId) ?? 0,
      shopsTruncated: summary.shopsTruncated,
    };
  });

  const shops = orderedShops.map((row) => {
    const members = row.members;
    return {
      shopId: row.shop.shopId,
      organizationId: row.shop.organizationId,
      registeredOn: dateJST(row.shop.registeredAt),
      settings: {
        submissionPattern: pattern(row.shop.submissionPattern),
        regularClosedDays: row.shop.regularClosedDays,
      },
      staff: {
        count: row.usage.staffCount,
        managerCount: members.filter((member) => member.isManager).length,
        excludedFromShiftCount: members.filter((member) => member.excludedFromShift).length,
        accountLinkedCount: members.filter((member) => member.accountLinked).length,
        lineLinkedCount: members.filter((member) => member.lineStatus === "linked_following").length,
        isTruncated: row.membersTruncated,
      },
      usage: {
        analyticsStartedAt: toJstIso(row.usage.analyticsStartedAt),
        lastActivityDate: row.usage.lastActivityDate,
        lastNotifiedAt: toJstIso(row.usage.lastNotifiedAt),
        attention: row.usage.attention,
        activeDays: {
          submitted: row.usage.activeDays.filter((day) => day.submitted).map((day) => day.date),
          confirmed: row.usage.activeDays.filter((day) => day.confirmed).map((day) => day.date),
        },
      },
      recruitments: row.recruitments.map((recruitment) => {
        const createdOn = dateJST(recruitment.createdAt);
        return {
          periodStart: recruitment.periodStart,
          periodEnd: recruitment.periodEnd,
          periodDays: daysBetween(recruitment.periodStart, recruitment.periodEnd) + 1,
          deadline: recruitment.deadline,
          daysFromDeadlineToStart: daysBetween(recruitment.deadline, recruitment.periodStart),
          createdAt: toJstIso(recruitment.createdAt),
          daysFromCreatedToDeadline: daysBetween(createdOn, recruitment.deadline),
          status: recruitment.status,
          confirmedAt: toJstIso(recruitment.confirmedAt),
          confirmedBeforeStart: recruitment.confirmedBeforeStart,
          submissionPattern: pattern(recruitment.submissionPattern),
          shopClosedDateCount: recruitment.shopClosedDateCount,
          editCount: recruitment.editCount,
          reminder: {
            scheduledAt: toJstIso(recruitment.reminderScheduledAt),
            sentAt: toJstIso(recruitment.reminderSentAt),
          },
          draftSavedAt: toJstIso(recruitment.draftSavedAt),
          submission: {
            submittedPeople: recruitment.submissions.length,
            firstSubmittedByDeadlineCount: recruitment.submissions.filter((item) => item.firstSubmittedByDeadline)
              .length,
            needsResubmissionCount: recruitment.submissions.filter((item) => item.needsResubmission).length,
            shiftTargetCountAtLastUpdate: recruitment.stats?.shiftTargetCount ?? null,
            isTruncated: recruitment.submissionsTruncated,
          },
          assignment: recruitment.assignment,
          submissions: recruitment.submissions.map((submission) => ({
            staffId: submission.staffId,
            personKey: submission.personKey,
            firstSubmittedAt: toJstIso(submission.firstSubmittedAt),
            lastSubmittedAt: toJstIso(submission.lastSubmittedAt),
            firstSubmittedByDeadline: submission.firstSubmittedByDeadline,
            needsResubmission: submission.needsResubmission,
            assigned: submission.assigned,
          })),
        };
      }),
      recruitmentsTruncated: row.recruitmentsTruncated,
      members: members.map((member) => ({
        staffId: member.staffId,
        userId: member.userId,
        personKey: member.personKey,
        isManager: member.isManager,
        excludedFromShift: member.excludedFromShift,
        accountLinked: member.accountLinked,
        line: member.lineStatus,
        joinedOn: dateJST(member.joinedAt),
      })),
    };
  });

  const nameById = new Map([
    ...source.shops.map((row) => [row.shop.organizationId, row.shop.organizationName] as const),
    ...source.organizations.map((row) => [row.organization.organizationId, row.organization.name] as const),
  ]);
  return {
    json: {
      schemaVersion: ANALYSIS_SCHEMA_VERSION,
      exportedAt: toJstIso(source.exportedAt),
      timezone: "Asia/Tokyo",
      scope: source.scope,
      definitions: DEFINITIONS,
      counts: {
        organizations: organizations.length,
        shops: shops.length,
        people: personKeys.size,
        skippedOrganizations: source.skipped.filter((item) => item.target === "organization").length,
        skippedShops: source.skipped.filter((item) => item.target === "shop").length,
      },
      skipped: source.skipped,
      organizations,
      shops,
    },
    mapping: {
      organizations: orderedOrganizations.map((organizationId) => ({
        organizationId,
        name: nameById.get(organizationId) ?? "確認できません",
      })),
      shops: orderedShops.map((row) => ({
        shopId: row.shop.shopId,
        name: row.shop.name,
        organizationId: row.shop.organizationId,
      })),
    },
  };
}
