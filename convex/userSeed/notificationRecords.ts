import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { formatPeriodLabel, getDeadlineCutoff, getReminderScheduledAt } from "../_lib/dateFormat";
import { formatResendSubject } from "../_lib/emailFormat";
import {
  buildRecruitmentEmailSubject,
  buildReminderEmailSubject,
  STAFF_LEGAL_CONSENT_SUBJECT,
} from "../notification/templates";
import { normalizeNotificationHistoryInput } from "../notificationOutbox/history";
import {
  LINE_INVITE_NOTIFICATION_KIND,
  SHIFT_CONFIRMATION_NOTIFICATION_KIND,
  SHIFT_RECRUITMENT_NOTIFICATION_KIND,
} from "../notificationOutbox/historyKinds";
import type { NotificationChannel } from "../notificationOutbox/types";

// 送ったことにした通知の記録。実際には何も送らず、通知履歴と送信済みのOutboxの行だけを書く。
// 通知の種類、題名、文脈の名前は、本来の送信処理（notification/actions.ts、notification/reminderActions.ts、
// line/actions.ts、legal/actions.ts）と同じ値にする。
// Outboxの本文と宛先は、保存期間を過ぎた行と同じ「消したあと」の形で入れ、メールアドレスもLINEのIDも持たせない。
// 重複を防ぐキーは本来の送信と別の形にして、入れたあとに画面から送る通知を止めないようにする。

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const STAFF_PER_SHOP_LIMIT = 100;
const RECRUITMENT_PER_SHOP_LIMIT = 20;
const RECORD_PER_RECRUITMENT_LIMIT = 200;
const LINE_LINK_PER_ORGANIZATION_LIMIT = 100;

/** スタッフを登録して、使い方の案内とLINE連携の案内が届いた日。どの募集の通知よりも前にする。 */
const STAFF_REGISTERED_DAYS_AGO = 30;
/** 募集の通知が届く日。提出期限の何日前の10:00かで決める。 */
const RECRUITMENT_NOTICE_DAYS_BEFORE_DEADLINE = 7;

// 本来の送信処理の中だけにある値。変えるときは、送信処理と合わせる。
const SHIFT_REMINDER_NOTIFICATION_KIND = "shift.reminder";
const LEGAL_CONSENT_NOTIFICATION_KIND = "legal.consent";
const LINE_INVITE_SUBJECT = "シフト通知をLINEで受け取れます";
const RECRUITMENT_LINE_TITLE = "シフト募集のお知らせ";
const REMINDER_LINE_TITLE = "シフト提出のお願い";
const CONFIRMATION_LINE_TITLE = "確定シフトのお知らせ";

type LineLink = Pick<Doc<"organizationPersonLineLinks">, "_id" | "generation" | "linkedAt">;

type SentNotification = {
  organizationId: Id<"organizations">;
  shopId: Id<"shops">;
  staff: Doc<"staffs">;
  recruitmentId?: Id<"recruitments">;
  /** LINE連携済みの人の連携。連携した時刻より前の通知はメールにする。 */
  lineLink: LineLink | undefined;
  notificationKind: string;
  notificationContext: string;
  /** 重複を防ぐキーの、通知ごとの部分。 */
  key: string;
  emailTitle: string;
  lineTitle: string;
  requestedAt: number;
  now: number;
};

export type UserSeedNotificationCounts = { email: number; line: number };

/**
 * 入れ終えた店舗、スタッフ、募集、LINE連携を読み、その流れで届いたはずの通知を記録する。
 * スタッフの登録（使い方の案内、LINE連携の案内）、募集の通知、提出の催促、確定の通知を入れる。
 * LINE連携済みの人は、連携した時刻より前をメール、あとをLINEにする。
 * 入れ先の管理者本人には何も入れない。
 */
export async function insertNotificationRecords(
  ctx: MutationCtx,
  args: { organizationId: Id<"organizations">; shopIds: Id<"shops">[]; ownerUserId: Id<"users">; now: number },
): Promise<UserSeedNotificationCounts> {
  const { organizationId, now } = args;
  const lineLinks = await ctx.db
    .query("organizationPersonLineLinks")
    .withIndex("by_organizationId_and_isDeleted", (q) => q.eq("organizationId", organizationId).eq("isDeleted", false))
    .take(LINE_LINK_PER_ORGANIZATION_LIMIT);
  const lineLinkByPerson = new Map(lineLinks.map((link) => [link.organizationPersonId, link]));
  const counts: UserSeedNotificationCounts = { email: 0, line: 0 };
  const record = async (notification: SentNotification) => {
    counts[await insertSentNotification(ctx, notification)] += 1;
  };

  for (const shopId of args.shopIds) {
    const shop = await ctx.db.get(shopId);
    if (!shop) throw new Error("Seeded shop was not found");
    const staffs = (
      await ctx.db
        .query("staffs")
        .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", shopId).eq("isDeleted", false))
        .take(STAFF_PER_SHOP_LIMIT)
    ).filter((staff) => staff.userId !== args.ownerUserId);
    const base = (staff: Doc<"staffs">) => ({
      organizationId,
      shopId,
      staff,
      lineLink: staff.organizationPersonId ? lineLinkByPerson.get(staff.organizationPersonId) : undefined,
      now,
    });

    // スタッフを登録したときの案内。管理者として入っている人には送らない。
    const registeredAt = now - STAFF_REGISTERED_DAYS_AGO * DAY_MS;
    for (const staff of staffs.filter((candidate) => candidate.userId === undefined)) {
      await record({
        ...base(staff),
        notificationKind: LEGAL_CONSENT_NOTIFICATION_KIND,
        notificationContext: "legal.sendStaffConsentEmail",
        key: "legalConsent",
        emailTitle: formatResendSubject(shop.name, STAFF_LEGAL_CONSENT_SUBJECT),
        lineTitle: formatResendSubject(shop.name, STAFF_LEGAL_CONSENT_SUBJECT),
        requestedAt: registeredAt,
      });
      await record({
        ...base(staff),
        notificationKind: LINE_INVITE_NOTIFICATION_KIND,
        notificationContext: "line.sendInviteEmail",
        key: "lineInvite",
        emailTitle: formatResendSubject(shop.name, LINE_INVITE_SUBJECT),
        lineTitle: formatResendSubject(shop.name, LINE_INVITE_SUBJECT),
        requestedAt: registeredAt + 60 * 1000,
      });
    }

    const shiftTargets = staffs.filter((staff) => !staff.excludedFromShift);
    const recruitments = await ctx.db
      .query("recruitments")
      .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", shopId).eq("isDeleted", false))
      .take(RECRUITMENT_PER_SHOP_LIMIT);
    for (const recruitment of recruitments) {
      const periodLabel = formatPeriodLabel(recruitment.periodStart, recruitment.periodEnd);
      const forRecruitment = (staff: Doc<"staffs">) => ({ ...base(staff), recruitmentId: recruitment._id });

      // 募集の通知は、シフトの対象の全員に届く。
      const noticeAt = Math.min(
        getDeadlineCutoff(recruitment.deadline) - 14 * HOUR_MS - RECRUITMENT_NOTICE_DAYS_BEFORE_DEADLINE * DAY_MS,
        now - HOUR_MS,
      );
      for (const staff of shiftTargets) {
        await record({
          ...forRecruitment(staff),
          notificationKind: SHIFT_RECRUITMENT_NOTIFICATION_KIND,
          notificationContext: "notification.sendRecruitmentNotificationEmails",
          key: `recruitment:${recruitment._id}`,
          emailTitle: formatResendSubject(shop.name, buildRecruitmentEmailSubject(periodLabel)),
          lineTitle: `${RECRUITMENT_LINE_TITLE} ${periodLabel}`,
          requestedAt: noticeAt,
        });
      }

      // 催促は、提出期限の前日17:00に、まだ提出していない人へ届く。その時刻がまだ来ていない募集には入れない。
      const reminderAt = getReminderScheduledAt(recruitment.deadline);
      if (reminderAt <= now - HOUR_MS) {
        const submissions = await ctx.db
          .query("shiftSubmissions")
          .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", recruitment._id))
          .take(RECORD_PER_RECRUITMENT_LIMIT);
        const submittedStaffIds = new Set(submissions.map((submission) => submission.staffId));
        for (const staff of shiftTargets.filter((candidate) => !submittedStaffIds.has(candidate._id))) {
          await record({
            ...forRecruitment(staff),
            notificationKind: SHIFT_REMINDER_NOTIFICATION_KIND,
            notificationContext: "notification.sendReminderEmails",
            key: `reminder:${recruitment._id}`,
            emailTitle: formatResendSubject(shop.name, buildReminderEmailSubject(periodLabel)),
            lineTitle: REMINDER_LINE_TITLE,
            requestedAt: reminderAt,
          });
        }
      }

      // 確定の通知は、確定時の通知の記録（勤務の控え）を入れた人へ、その時刻に届く。
      if (recruitment.status !== "confirmed") continue;
      const snapshots = await ctx.db
        .query("shiftConfirmationSnapshots")
        .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", recruitment._id))
        .take(RECORD_PER_RECRUITMENT_LIMIT);
      const sentAtByStaff = new Map(snapshots.map((snapshot) => [snapshot.staffId, snapshot.sentAt]));
      for (const staff of shiftTargets) {
        const sentAt = sentAtByStaff.get(staff._id);
        if (sentAt === undefined) continue;
        await record({
          ...forRecruitment(staff),
          notificationKind: SHIFT_CONFIRMATION_NOTIFICATION_KIND,
          notificationContext: "notification.sendConfirmationEmail",
          key: `confirmation:${recruitment._id}`,
          emailTitle: formatResendSubject(shop.name, `${periodLabel} シフト確定のお知らせ`),
          lineTitle: `${CONFIRMATION_LINE_TITLE} ${periodLabel}`,
          requestedAt: sentAt,
        });
      }
    }
  }
  return counts;
}

/** 送信済みのOutboxの行と通知履歴を1組入れ、使った連絡手段を返す。 */
async function insertSentNotification(ctx: MutationCtx, input: SentNotification): Promise<NotificationChannel> {
  const { staff, lineLink, requestedAt, now } = input;
  const channel: NotificationChannel = lineLink && lineLink.linkedAt <= requestedAt ? "line" : "email";
  const sentAt = requestedAt + 5 * 1000;
  const history = normalizeNotificationHistoryInput({
    notificationKind: input.notificationKind,
    displayTitle: channel === "line" ? input.lineTitle : input.emailTitle,
  });

  const outboxId = await ctx.db.insert("notificationOutbox", {
    channel,
    status: "sent",
    dedupeKey: `user-seed:${channel}:${input.key}:${staff._id}`,
    shopId: input.shopId,
    organizationId: input.organizationId,
    purpose: "business",
    ...(input.recruitmentId ? { recruitmentId: input.recruitmentId } : {}),
    staffId: staff._id,
    ...(channel === "line" && lineLink
      ? {
          organizationPersonLineLinkId: lineLink._id,
          organizationPersonLineGenerationAtEnqueue: lineLink.generation,
        }
      : {}),
    notificationContext: input.notificationContext,
    deliverySuppressed: true,
    payload:
      channel === "line"
        ? { kind: "line", toUserId: "", text: "", suppressDelivery: true }
        : {
            kind: "email",
            from: "",
            to: "",
            subject: "",
            html: "",
            context: input.notificationContext,
            suppressDelivery: true,
          },
    attemptCount: 1,
    nextRunAt: requestedAt,
    sentAt,
    terminalAt: sentAt,
    payloadRedactedAt: now,
    createdAt: requestedAt,
    updatedAt: sentAt,
  });
  // メールは「配信済み」、LINEは配信の結果を受け取れないため「送信済み」になる。
  const deliveredAt = sentAt + 20 * 1000;
  await ctx.db.insert("notificationHistory", {
    outboxId,
    shopId: input.shopId,
    staffId: staff._id,
    channel,
    ...history,
    sendStatus: "sent",
    deliveryStatus: channel === "email" ? "delivered" : "not_supported",
    requestedAt,
    sentAt,
    ...(channel === "email" ? { deliveredAt, deliveryStatusAt: deliveredAt } : {}),
    updatedAt: channel === "email" ? deliveredAt : sentAt,
  });
  return channel;
}
