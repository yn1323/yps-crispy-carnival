import { dateJST, dateToUtcMs } from "@convex/_lib/dateFormat";
import type {
  AnalyticsMetric,
  ExportSubmissionPatternDto,
  OrganizationExportResponse,
  ShopBillingFilter,
  ShopExportResponse,
} from "@/api/analyticsTypes";
import { SUBMISSION_PATTERN_LABELS } from "@/features/analytics/format";

/**
 * 外部のAIに読ませる分析用JSON。実名、メールアドレス、自由記述、内部IDを入れない。
 * 仮名はファイルごとに振り、実名との対応表は画面にだけ表示する。
 */
export const ANALYSIS_SCHEMA_VERSION = 1;

export type AnalysisScope =
  | {
      kind: "shopList";
      filters: {
        hasNameSearch: boolean;
        billing: ShopBillingFilter | null;
        attention: boolean;
        notified: boolean;
        multiStaff: boolean;
        activity: { from: string; to: string; metric: AnalyticsMetric } | null;
      };
    }
  | {
      kind: "organizationList";
      filters: { hasNameSearch: boolean; billing: ShopBillingFilter | null; notified: boolean; multiStaff: boolean };
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
  organizations: Array<{ label: string; name: string }>;
  shops: Array<{ label: string; name: string; organizationLabel: string; shopId: string }>;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

const DEFINITIONS = {
  timezone: "日時はJST（+09:00）、日付はJSTの暦日です。",
  "organizations[].label / shops[].label":
    "組織・店舗の仮名です。組織はファイル内で登録の古い順にA、B…、店舗は所属組織の文字に組織内の登録順の文字を続けます。ファイルごとに振るため、別のファイルの同じ仮名は同じ対象とは限りません。",
  person:
    "人物の仮名です。メールアドレスが同じ人は、店舗・組織をまたいで同じ番号です。ファイルごとに振ります。nullは現在在籍していないスタッフです。",
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
/** 0→A、25→Z、26→AA。 */
function alphabetLabel(index: number) {
  let value = index + 1;
  let label = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }
  return label;
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
  const organizationLabel = new Map(orderedOrganizations.map((id, index) => [id, alphabetLabel(index)]));
  const orderedShops = [...source.shops].sort(
    (left, right) =>
      orderedOrganizations.indexOf(left.shop.organizationId) -
        orderedOrganizations.indexOf(right.shop.organizationId) ||
      left.shop.registeredAt - right.shop.registeredAt ||
      left.shop.shopId.localeCompare(right.shop.shopId),
  );
  const shopCountByOrganization = new Map<string, number>();
  const shopLabel = new Map<string, string>();
  for (const row of orderedShops) {
    const index = shopCountByOrganization.get(row.shop.organizationId) ?? 0;
    shopCountByOrganization.set(row.shop.organizationId, index + 1);
    shopLabel.set(row.shop.shopId, `${organizationLabel.get(row.shop.organizationId)}-${alphabetLabel(index)}店舗`);
  }
  const personLabel = new Map<string, string>();
  for (const row of orderedShops)
    for (const member of row.members)
      if (!personLabel.has(member.personKey))
        personLabel.set(member.personKey, `人物${String(personLabel.size + 1).padStart(3, "0")}`);
  const person = (key: string | null) => (key === null ? null : (personLabel.get(key) ?? null));

  const organizations = orderedOrganizations.map((id) => {
    const summary = summaries.get(id);
    const label = `${organizationLabel.get(id)}組織`;
    if (!summary) return { label, isSummaryAvailable: false };
    const organization = summary.organization;
    return {
      label,
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
      shopsInFile: shopCountByOrganization.get(id) ?? 0,
      shopsTruncated: summary.shopsTruncated,
    };
  });

  const shops = orderedShops.map((row) => {
    const members = row.members;
    return {
      label: shopLabel.get(row.shop.shopId),
      organization: `${organizationLabel.get(row.shop.organizationId)}組織`,
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
            person: person(submission.personKey),
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
        person: person(member.personKey),
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
        people: personLabel.size,
        skippedOrganizations: source.skipped.filter((item) => item.target === "organization").length,
        skippedShops: source.skipped.filter((item) => item.target === "shop").length,
      },
      skipped: source.skipped,
      organizations,
      shops,
    },
    mapping: {
      organizations: orderedOrganizations.map((id) => ({
        label: `${organizationLabel.get(id)}組織`,
        name: nameById.get(id) ?? "確認できません",
      })),
      shops: orderedShops.map((row) => ({
        label: shopLabel.get(row.shop.shopId) ?? "",
        name: row.shop.name,
        organizationLabel: `${organizationLabel.get(row.shop.organizationId)}組織`,
        shopId: row.shop.shopId,
      })),
    },
  };
}
