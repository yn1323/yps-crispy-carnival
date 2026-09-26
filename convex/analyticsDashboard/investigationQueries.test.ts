import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { seedStaff } from "../_test/scenarioBuilders";
import { seedOrganizationMembership, seedShop, seedUser } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { DAY_MS, MINUTE_MS } from "../constants";
import {
  getMagicLinkLookupRef,
  getNotificationSummaryRef,
  getNotificationsRef,
  getOrganizationEventsRef,
  getStaffTimelineRef,
} from "./refs";

const NOW = new Date("2026-09-09T12:00:00+09:00").getTime();
const SECRET_EMAIL = "staff-secret@example.com";
const SECRET_URL = "https://example.com/s?token=capability-secret";
const FILTER = {
  cursor: null,
  limit: 50,
  from: null,
  to: null,
  shopId: null,
  status: null,
  channel: null,
  category: null,
  lookup: null,
} as const;

type OutboxOverrides = Partial<Omit<Doc<"notificationOutbox">, "_id" | "_creationTime">>;

async function insertOutbox(ctx: MutationCtx, shopId: Id<"shops">, overrides: OutboxOverrides = {}) {
  const shop = await ctx.db.get(shopId);
  if (!shop) throw new Error("missing fixture shop");
  const now = Date.now();
  return await ctx.db.insert("notificationOutbox", {
    channel: "email",
    status: "sent",
    dedupeKey: `email:recruitment:dedupe-secret:${now}`,
    shopId,
    organizationId: shop.organizationId,
    purpose: "business",
    notificationContext: "notification.sendRecruitmentNotificationEmails",
    deliverySuppressed: false,
    payload: {
      kind: "email",
      from: "シフトリ <noreply@example.com>",
      to: SECRET_EMAIL,
      subject: "シフト募集のお知らせ",
      html: `<a href="${SECRET_URL}">提出する</a>`,
      context: "notification.sendRecruitmentNotificationEmails",
    },
    attemptCount: 1,
    nextRunAt: now,
    leaseToken: "lease-secret",
    sentAt: now,
    terminalAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

async function seedRecruitment(ctx: MutationCtx, shopId: Id<"shops">) {
  return await ctx.db.insert("recruitments", {
    shopId,
    periodStart: "2026-09-10",
    periodEnd: "2026-09-16",
    deadline: "2026-09-09",
    shopClosedDates: [],
    status: "open",
    isDeleted: false,
    submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
  });
}

async function advance(ms = MINUTE_MS) {
  vi.setSystemTime(Date.now() + ms);
}

function expectNoSecrets(value: unknown) {
  const serialized = JSON.stringify(value);
  for (const secret of [SECRET_EMAIL, "capability-secret", "lease-secret", "dedupe-secret"])
    expect(serialized).not.toContain(secret);
}

describe("analyticsDashboardの通知検索", () => {
  let t: TestConvex<typeof schema>;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW - 2 * DAY_MS);
    t = convexTest(schema, modules);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("宛先・本文・token・dedupeKeyを返さず、店舗・宛先・募集・到達状態を解決する", async () => {
    const ids = await t.run(async (ctx) => {
      const shopId = await seedShop(ctx, "通知店舗");
      const staffId = await seedStaff(ctx, { shopId, name: "通知スタッフ", email: SECRET_EMAIL });
      const recruitmentId = await seedRecruitment(ctx, shopId);
      const outboxId = await insertOutbox(ctx, shopId, {
        staffId,
        recruitmentId,
        resendEmailId: "re_lookup_1",
        lastError: "provider body with staff-secret@example.com",
      });
      await ctx.db.insert("notificationHistory", {
        outboxId,
        shopId,
        staffId,
        channel: "email",
        notificationKind: "shift.recruitment",
        displayTitle: "シフト募集",
        sendStatus: "sent",
        deliveryStatus: "delivered",
        requestedAt: Date.now(),
        sentAt: Date.now(),
        deliveredAt: Date.now() + 1000,
        updatedAt: Date.now(),
      });
      return { shopId, staffId, recruitmentId, outboxId };
    });
    const response = await t.query(getNotificationsRef, { ...FILTER, asOf: NOW });
    expect(response?.range).toEqual({ from: "2026-09-03", to: "2026-09-09" });
    expect(response?.rows).toHaveLength(1);
    expect(response?.rows[0]).toMatchObject({
      id: ids.outboxId,
      status: "sent",
      category: "recruitment",
      shop: { shopId: ids.shopId, name: "通知店舗", isDeleted: false },
      organizationName: "通知店舗事業者",
      recipient: { kind: "staff", name: "通知スタッフ", staffId: ids.staffId },
      recruitment: { recruitmentId: ids.recruitmentId, periodStart: "2026-09-10", periodEnd: "2026-09-16" },
      errorCode: "notification_delivery_failed",
      deliveryStatus: "delivered",
      resendEmailId: "re_lookup_1",
      payloadRedacted: false,
      ids: {
        organizationId: expect.any(String),
        shopId: ids.shopId,
        staffId: ids.staffId,
        userId: null,
        recruitmentId: ids.recruitmentId,
        invitationId: null,
      },
    });
    expectNoSecrets(response);

    const byId = await t.query(getNotificationsRef, { ...FILTER, lookup: ids.outboxId, asOf: NOW });
    const byResendId = await t.query(getNotificationsRef, { ...FILTER, lookup: "re_lookup_1", asOf: NOW });
    const missing = await t.query(getNotificationsRef, { ...FILTER, lookup: "re_missing", asOf: NOW });
    expect(byId?.rows.map((row) => row.id)).toEqual([ids.outboxId]);
    expect(byResendId?.rows.map((row) => row.id)).toEqual([ids.outboxId]);
    expect(missing).toMatchObject({ mode: "lookup", rows: [] });
  });

  it("店舗指定は状態をまたいで新しい順に統合し、他店舗と期間外を含めずcursorで続きを返す", async () => {
    const ids = await t.run(async (ctx) => {
      // convex-testの作成時刻は単調増加のため、期間外の行を最初に作る。
      vi.setSystemTime(NOW - 10 * DAY_MS);
      const shopId = await seedShop(ctx, "対象店舗");
      const otherShopId = await seedShop(ctx, "別店舗");
      const old = await insertOutbox(ctx, shopId);
      vi.setSystemTime(NOW - 2 * DAY_MS);
      const sent = await insertOutbox(ctx, shopId);
      await advance();
      const failed = await insertOutbox(ctx, shopId, { status: "failed", channel: "line", failedAt: Date.now() });
      await advance();
      await insertOutbox(ctx, otherShopId);
      await advance();
      const cancelled = await insertOutbox(ctx, shopId, {
        status: "cancelled",
        cancelReason: "recipient_inactive",
        cancelledAt: Date.now(),
      });
      return { shopId, old, sent, failed, cancelled };
    });
    const first = await t.query(getNotificationsRef, { ...FILTER, shopId: ids.shopId, limit: 2, asOf: NOW });
    expect(first?.rows.map((row) => row.id)).toEqual([ids.cancelled, ids.failed]);
    expect(first?.rows[0].cancelReason).toBe("recipient_inactive");
    expect(first?.pageInfo.isDone).toBe(false);
    const second = await t.query(getNotificationsRef, {
      ...FILTER,
      shopId: ids.shopId,
      limit: 2,
      cursor: first?.pageInfo.continueCursor ?? null,
      asOf: NOW,
    });
    expect(second?.rows.map((row) => row.id)).toEqual([ids.sent]);
    expect(second?.pageInfo.isDone).toBe(true);

    const line = await t.query(getNotificationsRef, { ...FILTER, shopId: ids.shopId, channel: "line", asOf: NOW });
    expect(line?.rows.map((row) => row.id)).toEqual([ids.failed]);
    const failedOnly = await t.query(getNotificationsRef, { ...FILTER, status: "failed", asOf: NOW });
    expect(failedOnly?.rows.map((row) => row.id)).toEqual([ids.failed]);
    const wideRange = await t.query(getNotificationsRef, {
      ...FILTER,
      shopId: ids.shopId,
      from: "2026-08-25",
      to: "2026-09-09",
      asOf: NOW,
    });
    expect(wideRange?.rows.map((row) => row.id)).toEqual([ids.cancelled, ids.failed, ids.sent, ids.old]);
    expect(await t.query(getNotificationsRef, { ...FILTER, shopId: "invalid-id", asOf: NOW })).toBeNull();
  });

  it("種別は通知contextから分類し、管理者宛・組織宛の通知も検索できる", async () => {
    const ids = await t.run(async (ctx) => {
      const shopId = await seedShop(ctx, "管理者通知店舗");
      const userId = await seedUser(ctx, "analytics_notification_manager");
      await seedOrganizationMembership(ctx, { shopId, userId });
      const digest = await insertOutbox(ctx, shopId, {
        userId,
        notificationContext: "staffRegistration.sendOwnerDailyDigest",
      });
      await advance();
      const billing = await insertOutbox(ctx, shopId, {
        shopId: undefined,
        purpose: "billing",
        notificationContext: "organizationBilling.billingEmailChanged",
      });
      return { digest, billing };
    });
    const manager = await t.query(getNotificationsRef, { ...FILTER, category: "manager", asOf: NOW });
    expect(manager?.rows.map((row) => row.id)).toEqual([ids.billing, ids.digest]);
    expect(manager?.rows[0]).toMatchObject({ shop: null, purpose: "billing", recipient: { kind: "none" } });
    expect(manager?.rows[1].recipient).toEqual({ kind: "manager", name: "管理者", staffId: null });
    expect((await t.query(getNotificationsRef, { ...FILTER, category: "confirmation", asOf: NOW }))?.rows).toEqual([]);
  });

  it("通知の状態は7日以内の失敗、予定を過ぎた送信待ち、今月の送信数を返す", async () => {
    await t.run(async (ctx) => {
      const shopId = await seedShop(ctx, "状態店舗");
      await insertOutbox(ctx, shopId, { status: "failed", failedAt: NOW - DAY_MS });
      await insertOutbox(ctx, shopId, { status: "failed", failedAt: NOW - 8 * DAY_MS });
      await insertOutbox(ctx, shopId, { status: "pending", nextRunAt: NOW - 30 * MINUTE_MS });
      await insertOutbox(ctx, shopId, { status: "pending", nextRunAt: NOW - MINUTE_MS });
      await insertOutbox(ctx, shopId, { status: "processing", leaseExpiresAt: NOW - MINUTE_MS });
      await ctx.db.insert("notificationUsage", {
        shopId,
        month: "2026-09",
        emailCount: 12,
        lineCount: 5,
        updatedAt: NOW,
      });
      await ctx.db.insert("notificationUsage", {
        shopId,
        month: "2026-08",
        emailCount: 99,
        lineCount: 99,
        updatedAt: NOW,
      });
    });
    expect(await t.query(getNotificationSummaryRef, { asOf: NOW })).toEqual({
      kind: "notificationSummary",
      asOf: NOW,
      month: { month: "2026-09", email: 12, line: 5, shopCount: 1, isPartial: false },
      failedLast7Days: { count: 1, isPartial: false },
      delayed: { pending: 1, processing: 1, isPartial: false },
      lineQuota: null,
    });
  });
});

describe("analyticsDashboardの行動履歴", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW - DAY_MS);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("スタッフの提出・リンク・同意・通知を時刻順に並べ、tokenとメールアドレスを返さない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const shopId = await seedShop(ctx, "履歴店舗");
      const staffId = await seedStaff(ctx, { shopId, name: "履歴スタッフ", email: SECRET_EMAIL });
      const otherShopId = await seedShop(ctx, "別店舗");
      const otherStaffId = await seedStaff(ctx, { shopId: otherShopId, name: "別スタッフ" });
      const recruitmentId = await seedRecruitment(ctx, shopId);
      await advance();
      await ctx.db.insert("magicLinks", {
        token: "magic-secret",
        staffId,
        shopId,
        recruitmentId,
        accessKind: "submit",
        expiresAt: NOW + DAY_MS,
      });
      await advance();
      await ctx.db.insert("sessions", {
        sessionToken: "session-secret",
        staffId,
        shopId,
        recruitmentId,
        accessKind: "submit",
        expiresAt: NOW + DAY_MS,
      });
      await ctx.db.insert("shiftSubmissions", {
        recruitmentId,
        staffId,
        firstSubmittedAt: Date.now() + MINUTE_MS,
        submittedAt: Date.now() + 2 * MINUTE_MS,
      });
      await ctx.db.insert("legalConsentEvents", {
        subjectType: "staff",
        staffId,
        shopId,
        termsConsentVersion: "1",
        privacyConsentVersion: "1",
        termsDocumentVersion: "1",
        privacyDocumentVersion: "1",
        consentedAt: Date.now() + 3 * MINUTE_MS,
        method: "shift_submit",
        sourceRecruitmentId: recruitmentId,
      });
      await ctx.db.insert("magicLinks", {
        token: "other-secret",
        staffId: otherStaffId,
        shopId: otherShopId,
        recruitmentId,
        accessKind: "submit",
        expiresAt: NOW + DAY_MS,
      });
      return { shopId, staffId, recruitmentId };
    });
    const response = await t.query(getStaffTimelineRef, { shopId: ids.shopId, staffId: ids.staffId, asOf: NOW });
    expect(response?.events.map((event) => event.type)).toEqual([
      "legal_consented",
      "last_submitted",
      "first_submitted",
      "session_started",
      "submit_link_issued",
      "staff_created",
    ]);
    expect(response?.events[0]).toMatchObject({
      detail: "shift_submit",
      recruitment: { recruitmentId: ids.recruitmentId, periodStart: "2026-09-10", periodEnd: "2026-09-16" },
    });
    expect(response?.isTruncated).toBe(false);
    const serialized = JSON.stringify(response);
    for (const secret of [SECRET_EMAIL, "magic-secret", "session-secret", "other-secret"])
      expect(serialized).not.toContain(secret);
    const otherShop = await t.run(async (ctx) => await seedShop(ctx, "無関係店舗"));
    expect(await t.query(getStaffTimelineRef, { shopId: otherShop, staffId: ids.staffId, asOf: NOW })).toBeNull();
  });

  it("組織の操作履歴は操作者と対象を名前で返し、名称と課金以外の変更前後は返さない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const shopId = await seedShop(ctx, "監査店舗");
      const shop = await ctx.db.get(shopId);
      if (!shop) throw new Error("missing fixture shop");
      const userId = await seedUser(ctx, "analytics_audit_manager");
      await seedOrganizationMembership(ctx, { shopId, userId });
      const staffId = await seedStaff(ctx, { shopId, name: "追加されたスタッフ" });
      const base = { organizationId: shop.organizationId, actorUserId: userId };
      await ctx.db.insert("organizationAuditEvents", {
        ...base,
        action: "organization.staff_added",
        targetKind: "staff",
        targetId: staffId,
        occurredAt: NOW - 3 * MINUTE_MS,
      });
      await ctx.db.insert("organizationAuditEvents", {
        ...base,
        action: "organization.person_profile_updated",
        targetKind: "person",
        targetId: "not-an-id",
        fromState: "hidden-before",
        toState: "hidden-after",
        occurredAt: NOW - 2 * MINUTE_MS,
      });
      await ctx.db.insert("organizationAuditEvents", {
        organizationId: shop.organizationId,
        action: "organization.billing_state_changed",
        targetKind: "billing",
        targetId: shop.organizationId,
        fromState: "trial",
        toState: "initialPaymentPending",
        occurredAt: NOW - MINUTE_MS,
      });
      const otherShopId = await seedShop(ctx, "別組織店舗");
      const otherShop = await ctx.db.get(otherShopId);
      if (!otherShop) throw new Error("missing fixture shop");
      await ctx.db.insert("organizationAuditEvents", {
        organizationId: otherShop.organizationId,
        action: "organization.name_changed",
        occurredAt: NOW,
      });
      return { shopId, staffId, userId };
    });
    const response = await t.query(getOrganizationEventsRef, {
      shopId: ids.shopId,
      cursor: null,
      limit: 50,
      asOf: NOW,
    });
    expect(response?.organizationName).toBe("監査店舗事業者");
    expect(
      response?.rows.map(({ action, actorName, targetName, fromState, toState }) => ({
        action,
        actorName,
        targetName,
        fromState,
        toState,
      })),
    ).toEqual([
      {
        action: "organization.billing_state_changed",
        actorName: null,
        targetName: null,
        fromState: "trial",
        toState: "initialPaymentPending",
      },
      {
        action: "organization.person_profile_updated",
        actorName: "管理者",
        targetName: null,
        fromState: null,
        toState: null,
      },
      {
        action: "organization.staff_added",
        actorName: "管理者",
        targetName: "追加されたスタッフ",
        fromState: null,
        toState: null,
      },
    ]);
    expect(response?.rows[2]).toMatchObject({ actorUserId: ids.userId, targetKind: "staff", targetId: ids.staffId });
    expect(
      await t.query(getOrganizationEventsRef, { shopId: "missing", cursor: null, limit: 50, asOf: NOW }),
    ).toBeNull();
  });
});

describe("analyticsDashboardのマジックリンク検索", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("開いたときの判定をverifyTokenと一致させ、tokenとsession tokenを返さない", async () => {
    const t = convexTest(schema, modules);
    const cases = await t.run(async (ctx) => {
      const shopId = await seedShop(ctx, "リンク店舗");
      const staffId = await seedStaff(ctx, { shopId, name: "リンクスタッフ", email: SECRET_EMAIL });
      const excludedId = await seedStaff(ctx, { shopId, name: "対象外スタッフ", excludedFromShift: true });
      const open = await seedRecruitment(ctx, shopId);
      const confirmed = await seedRecruitment(ctx, shopId);
      await ctx.db.patch(confirmed, { status: "confirmed", confirmedAt: NOW - DAY_MS });
      const deleted = await seedRecruitment(ctx, shopId);
      await ctx.db.patch(deleted, { isDeleted: true });
      const insert = async (
        token: string,
        accessKind: "submit" | "view",
        recruitmentId: Id<"recruitments">,
        extra: Partial<Doc<"magicLinks">> = {},
      ) => {
        await ctx.db.insert("magicLinks", {
          token,
          staffId,
          shopId,
          recruitmentId,
          accessKind,
          expiresAt: NOW + DAY_MS,
          ...extra,
        });
        return { token, accessKind };
      };
      return {
        ok: await insert("oksubmit-0000-0000", "submit", open),
        revoked: await insert("revoked0-0000-0000", "submit", open, { revokedAt: NOW - MINUTE_MS }),
        deleted: await insert("deleted0-0000-0000", "submit", deleted),
        closed: await insert("closed00-0000-0000", "submit", confirmed),
        viewOk: await insert("viewok00-0000-0000", "view", confirmed),
        viewUsed: await insert("viewused-0000-0000", "view", confirmed, { usedAt: NOW - MINUTE_MS }),
        viewExpired: await insert("viewexp0-0000-0000", "view", confirmed, { expiresAt: NOW - MINUTE_MS }),
        excluded: await insert("excluded-0000-0000", "submit", open, { staffId: excludedId }),
      };
    });
    const expected = {
      ok: { result: "ok", reason: "ok" },
      revoked: { result: "invalid_link", reason: "revoked" },
      deleted: { result: "recruitment_deleted", reason: "recruitment_deleted" },
      closed: { result: "submission_closed", reason: "recruitment_status" },
      viewOk: { result: "ok", reason: "ok" },
      viewUsed: { result: "invalid_link", reason: "used" },
      viewExpired: { result: "invalid_link", reason: "expired" },
      excluded: { result: "invalid_link", reason: "staff_unavailable" },
    } as const;
    for (const [name, link] of Object.entries(cases) as [keyof typeof cases, (typeof cases)[keyof typeof cases]][]) {
      const lookup = await t.query(getMagicLinkLookupRef, { token: link.token, asOf: NOW });
      expect(lookup.link?.diagnosis, name).toEqual(expected[name]);
      expect(JSON.stringify(lookup), name).not.toContain(link.token);
      const actual = await t.mutation(api.staffAuth.mutations.verifyToken, {
        token: link.token,
        accessKind: link.accessKind,
      });
      if (expected[name].result === "ok") expect(actual.status, name).toBe("ok");
      else expect(actual, name).toMatchObject({ status: "expired", reason: expected[name].result });
    }

    const opened = await t.mutation(api.staffAuth.mutations.verifyToken, {
      token: cases.ok.token,
      accessKind: "submit",
    });
    const afterOpen = await t.query(getMagicLinkLookupRef, { token: cases.ok.token, asOf: NOW });
    expect(afterOpen.link).toMatchObject({
      accessKind: "submit",
      shopName: "リンク店舗",
      organizationName: "リンク店舗事業者",
      staff: { name: "リンクスタッフ", isDeleted: false, excludedFromShift: false },
      recruitment: { periodStart: "2026-09-10", status: "open", isDeleted: false },
      submitCutoffAt: new Date("2026-09-10T00:00:00+09:00").getTime(),
    });
    expect(afterOpen.link?.sessions.length).toBeGreaterThan(0);
    const serialized = JSON.stringify(afterOpen);
    for (const secret of [cases.ok.token, SECRET_EMAIL, opened.status === "ok" ? opened.sessionToken : "unused"])
      expect(serialized).not.toContain(secret);
    expect(await t.query(getMagicLinkLookupRef, { token: "missing0-0000-0000", asOf: NOW })).toEqual({
      kind: "magicLinkLookup",
      asOf: NOW,
      link: null,
    });
  });
});
