import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { addDays, jstDayRangeMs } from "../_lib/dateFormat";
import { seedStaff } from "../_test/scenarioBuilders";
import { seedOrganizationMembership, seedShop, seedUser } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { ANALYTICS_DEFINITION_VERSION, emptyAnalyticsResultCounts } from "../analytics/model";
import type { ShopsResponse } from "./dto";
import { SHOP_LIST_STAFF_SCAN_LIMIT } from "./queryHelpers";
import {
  getCycleRef,
  getFeatureRequestsRef,
  getOverviewRef,
  getShopRef,
  getShopsRef,
  getStaffRef,
  setFeatureRequestDeletedRef,
} from "./refs";

const AS_OF = jstDayRangeMs("2026-09-09").startMs + 12 * 60 * 60 * 1000;
const PAGE = { cursor: null, limit: 50, asOf: AS_OF };
async function seedRecruitment(
  ctx: MutationCtx,
  args: { shopId: Id<"shops">; periodStart?: string; periodEnd?: string },
) {
  return await ctx.db.insert("recruitments", {
    shopId: args.shopId,
    periodStart: args.periodStart ?? "2026-09-10",
    periodEnd: args.periodEnd ?? "2026-09-16",
    deadline: "2026-09-09",
    shopClosedDates: [],
    status: "open",
    isDeleted: false,
    submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
  });
}

async function daily(
  ctx: MutationCtx,
  date: string,
  options: { status?: "complete" | "failed"; partial?: boolean; submitted?: number; periodSubmitted?: number } = {},
) {
  const counts = emptyAnalyticsResultCounts();
  counts.day.submitted = options.submitted ?? 0;
  for (const key of ["days7", "days30", "days90"] as const) counts[key].submitted = options.periodSubmitted ?? 0;
  const day = jstDayRangeMs(date);
  return await ctx.db.insert("analyticsDailyResults", {
    date,
    status: options.status ?? "complete",
    definitionVersion: ANALYTICS_DEFINITION_VERSION,
    observationStartAt: day.startMs + (options.partial ? 1000 : 0),
    observationEndAt: day.endMs,
    isPartialDay: options.partial ?? false,
    inputStartDate: date,
    counts,
    stepVersion: 1,
    attemptCount: 1,
    retryAttempt: 0,
    retryable: false,
    startedAt: day.endMs,
    updatedAt: day.endMs + 1,
    ...(options.status === "failed" ? { errorCode: "page_failed" } : { completedAt: day.endMs + 1 }),
  });
}

describe("analyticsDashboardの日次結果", () => {
  it("集計前の現在店舗とスタッフは閲覧でき、未計測を0にしない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const shopId = await seedShop(ctx, "既存店舗");
      const staffId = await seedStaff(ctx, { shopId, name: "問い合わせ担当", email: "support@example.com" });
      return { shopId, staffId };
    });
    const overview = await t.query(getOverviewRef, { rangeDays: 7, asOf: AS_OF });
    expect(overview.startedAt).toBeNull();
    expect(overview.series).toHaveLength(7);
    expect(overview.series.every((row) => row.status === "pending" && row.counts === null)).toBe(true);
    const shops = await t.query(getShopsRef, { ...PAGE, search: "", date: null, metric: null });
    expect(shops.rows.map((row) => row.shopId)).toEqual([ids.shopId]);
    expect(shops.rows[0]).toMatchObject({ staffCount: 1, latestShift: null });
    const detail = await t.query(getShopRef, { ...PAGE, shopId: ids.shopId });
    expect(detail?.staff).toHaveLength(1);
    expect(detail?.staff[0].name).toBe("問い合わせ担当");
    expect(JSON.stringify(detail)).not.toContain("support@example.com");
    expect(detail?.staff[0]).not.toHaveProperty("email");
    const staff = await t.query(getStaffRef, { ...PAGE, ...ids });
    expect(staff?.staff.email).toBe("support@example.com");
    expect(Object.keys(staff?.staff ?? {}).sort()).toEqual(
      ["accountLinked", "email", "excludedFromShift", "isManager", "lineStatus", "name", "staffId"].sort(),
    );
  });

  it("開始前・初日部分計測を区別し、期間数は日別値の和でなく保存された重複排除値を返す", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("analyticsState", {
        key: "usage",
        definitionVersion: ANALYTICS_DEFINITION_VERSION,
        startedAt: jstDayRangeMs("2026-09-06").startMs + 1000,
        nextRecoveryDate: "2026-09-09",
      });
      for (const date of ["2026-09-06", "2026-09-07", "2026-09-08"])
        await daily(ctx, date, { submitted: 1, periodSubmitted: 1, partial: date === "2026-09-06" });
    });
    const overview = await t.query(getOverviewRef, { rangeDays: 7, asOf: AS_OF });
    expect(overview.range).toEqual({ from: "2026-09-02", to: "2026-09-08", days: 7 });
    expect(overview.series.map((row) => row.status)).toEqual([
      "before_start",
      "before_start",
      "before_start",
      "before_start",
      "partial",
      "complete",
      "complete",
    ]);
    expect(overview.period).toMatchObject({ status: "partial", observedDays: 3, counts: { submitted: 1 } });
    expect(overview.yesterday.counts?.submitted).toBe(1);
    expect(Object.keys(overview).sort()).toEqual(
      [
        "asOf",
        "definitionVersion",
        "kind",
        "nextAggregationAt",
        "period",
        "range",
        "series",
        "startedAt",
        "yesterday",
      ].sort(),
    );
  });

  it("一日の失敗で成功済み日別値を隠さず、期間値だけ未確定にする", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("analyticsState", {
        key: "usage",
        definitionVersion: ANALYTICS_DEFINITION_VERSION,
        startedAt: jstDayRangeMs("2026-09-06").startMs,
        nextRecoveryDate: "2026-09-09",
      });
      await daily(ctx, "2026-09-06", { submitted: 2 });
      await daily(ctx, "2026-09-07", { status: "failed", submitted: 999 });
      await daily(ctx, "2026-09-08", { submitted: 0, periodSubmitted: 3 });
    });
    const overview = await t.query(getOverviewRef, { rangeDays: 7, asOf: AS_OF });
    expect(overview.series.find((row) => row.date === "2026-09-06")?.counts?.submitted).toBe(2);
    expect(overview.series.find((row) => row.date === "2026-09-07")).toMatchObject({ status: "failed", counts: null });
    expect(overview.yesterday).toMatchObject({
      status: "complete",
      counts: { registered: 0, submitted: 0, confirmed: 0 },
    });
    expect(overview.period).toMatchObject({ status: "unavailable", counts: null });
  });

  it("日別内訳は同日の対象flagだけを返し、削除店舗を匿名表示で残す", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const active = await seedShop(ctx, "現在店舗");
      const deleted = await seedShop(ctx, "消去前店舗名");
      const other = await seedShop(ctx, "対象外店舗");
      for (const shopId of [active, deleted]) {
        await seedStaff(ctx, { shopId, name: "所属スタッフ" });
        await seedRecruitment(ctx, { shopId });
      }
      await ctx.db.patch(deleted, { isDeleted: true });
      await daily(ctx, "2026-09-08", { submitted: 2 });
      for (const shopId of [active, deleted])
        await ctx.db.insert("analyticsShopDays", {
          shopId,
          date: "2026-09-08",
          registered: false,
          submitted: true,
          confirmed: false,
        });
      await ctx.db.insert("analyticsShopDays", {
        shopId: other,
        date: "2026-09-08",
        registered: true,
        submitted: false,
        confirmed: false,
      });
      return { active, deleted };
    });
    const response = await t.query(getShopsRef, { ...PAGE, search: "", date: "2026-09-08", metric: "submitted" });
    expect(new Set(response.rows.map((row) => row.shopId))).toEqual(new Set([ids.active, ids.deleted]));
    expect(response.rows.find((row) => row.shopId === ids.deleted)).toEqual({
      shopId: ids.deleted,
      name: "削除済み店舗",
      organizationId: null,
      organizationName: null,
      registeredAt: null,
      isDeleted: true,
      staffCount: null,
      latestShift: null,
    });
    expect(response.rows.find((row) => row.shopId === ids.active)).toMatchObject({
      staffCount: 1,
      latestShift: { periodStart: "2026-09-10", periodEnd: "2026-09-16" },
    });
    expect(JSON.stringify(response)).not.toContain("消去前店舗名");
    const missing = await t.query(getShopsRef, { ...PAGE, search: "", date: "2026-09-07", metric: "submitted" });
    expect(missing).toMatchObject({ scopeStatus: "unavailable", rows: [] });
  });
});

describe("analyticsDashboardの問い合わせ境界", () => {
  it("店舗スタッフ数は管理者とシフト対象外を含み、削除状態とcanonical所属不整合を除く", async () => {
    const t = convexTest(schema, modules);
    const shopId = await t.run(async (ctx) => {
      const shopId = await seedShop(ctx, "集計店舗");
      const otherShopId = await seedShop(ctx, "別店舗");
      const otherShop = await ctx.db.get(otherShopId);
      if (!otherShop) throw new Error("missing fixture shop");
      const managerId = await seedUser(ctx, "analytics_count_manager");
      await seedOrganizationMembership(ctx, { shopId, userId: managerId });
      await seedStaff(ctx, { shopId, userId: managerId, name: "管理者" });
      await seedStaff(ctx, { shopId, name: "通常スタッフ" });
      await seedStaff(ctx, { shopId, name: "シフト対象外", excludedFromShift: true });
      await seedStaff(ctx, { shopId, name: "削除スタッフ", isDeleted: true });
      const removedPersonStaff = await ctx.db.get(await seedStaff(ctx, { shopId, name: "削除人物" }));
      if (!removedPersonStaff) throw new Error("missing fixture staff");
      await ctx.db.patch(removedPersonStaff.organizationPersonId, { status: "removed" });
      const mismatchedStaffId = await seedStaff(ctx, { shopId, name: "staff組織不一致" });
      await ctx.db.patch(mismatchedStaffId, { organizationId: otherShop.organizationId });
      const mismatchedPersonStaff = await ctx.db.get(await seedStaff(ctx, { shopId, name: "person組織不一致" }));
      if (!mismatchedPersonStaff) throw new Error("missing fixture staff");
      await ctx.db.patch(mismatchedPersonStaff.organizationPersonId, { organizationId: otherShop.organizationId });
      const deletedUserId = await seedUser(ctx, "analytics_count_deleted_user");
      await seedStaff(ctx, { shopId, userId: deletedUserId, name: "削除アカウント" });
      await ctx.db.patch(deletedUserId, { isDeleted: true });
      await seedStaff(ctx, { shopId: otherShopId, name: "別店舗スタッフ" });
      return shopId;
    });
    const response = await t.query(getShopsRef, { ...PAGE, search: "集計店舗", date: null, metric: null });
    expect(response.rows).toHaveLength(1);
    expect(response.rows[0]).toEqual({
      shopId,
      name: "集計店舗",
      organizationId: expect.any(String),
      organizationName: "集計店舗事業者",
      registeredAt: expect.any(Number),
      isDeleted: false,
      staffCount: 3,
      latestShift: null,
    });
  });

  it("直近シフトは作成順によらず開始日が最新の有効募集を返し、未来の未確定募集も含む", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const shopId = await seedShop(ctx, "対象店舗");
      await seedRecruitment(ctx, { shopId, periodStart: "2026-10-01", periodEnd: "2026-10-15" });
      await seedRecruitment(ctx, { shopId, periodStart: "2026-09-01", periodEnd: "2026-09-15" });
      const deletedId = await seedRecruitment(ctx, {
        shopId,
        periodStart: "2026-11-01",
        periodEnd: "2026-11-15",
      });
      await ctx.db.patch(deletedId, { isDeleted: true });
      const otherShopId = await seedShop(ctx, "別店舗");
      await seedRecruitment(ctx, { shopId: otherShopId, periodStart: "2026-12-01", periodEnd: "2026-12-15" });
    });
    const response = await t.query(getShopsRef, { ...PAGE, search: "対象店舗", date: null, metric: null });
    expect(response.rows).toHaveLength(1);
    expect(response.rows[0]).toMatchObject({
      staffCount: 0,
      latestShift: { periodStart: "2026-10-01", periodEnd: "2026-10-15" },
    });
  });

  it("スタッフ走査上限を超えた店舗は部分件数を返さず、上限以内なら正確な件数を返す", async () => {
    const t = convexTest(schema, modules);
    const overflowStaffId = await t.run(async (ctx) => {
      const shopId = await seedShop(ctx, "大人数店舗");
      for (let index = 0; index < SHOP_LIST_STAFF_SCAN_LIMIT; index += 1)
        await seedStaff(ctx, { shopId, name: `スタッフ${index}` });
      return await seedStaff(ctx, { shopId, name: "上限超過スタッフ" });
    });
    const args = { ...PAGE, search: "", date: null, metric: null };
    expect((await t.query(getShopsRef, args)).rows[0].staffCount).toBeNull();
    await t.run(async (ctx) => await ctx.db.patch(overflowStaffId, { isDeleted: true }));
    expect((await t.query(getShopsRef, args)).rows[0].staffCount).toBe(SHOP_LIST_STAFF_SCAN_LIMIT);
  });

  it("店舗一覧の関連データ取得をページ単位に制限し、全店舗をcursorで辿れる", async () => {
    const t = convexTest(schema, modules);
    const shopIds = await t.run(async (ctx) => {
      const shopIds = [];
      for (let index = 0; index < 21; index += 1) {
        const shopId = await seedShop(ctx, `ページ店舗${index}`);
        await seedStaff(ctx, { shopId, name: "スタッフ" });
        await seedRecruitment(ctx, { shopId });
        shopIds.push(shopId);
      }
      return shopIds;
    });
    let cursor: string | null = null;
    const found: string[] = [];
    do {
      const page: ShopsResponse = await t.query(getShopsRef, {
        ...PAGE,
        limit: 100,
        cursor,
        search: "",
        date: null,
        metric: null,
      });
      expect(page.pageInfo.pageSize).toBe(20);
      expect(page.rows.length).toBeLessThanOrEqual(20);
      for (const row of page.rows)
        expect(row).toMatchObject({
          staffCount: 1,
          latestShift: { periodStart: "2026-09-10", periodEnd: "2026-09-16" },
        });
      found.push(...page.rows.map((row) => row.shopId));
      cursor = page.pageInfo.continueCursor;
    } while (cursor !== null && found.length <= shopIds.length);
    expect(found).toHaveLength(shopIds.length);
    expect(new Set(found)).toEqual(new Set(shopIds));
    expect(cursor).toBeNull();
  });

  it("絞り込みに一致しないページでも続きを返し、一致店舗を欠落させない", async () => {
    const t = convexTest(schema, modules);
    const target = await t.run(async (ctx) => {
      const target = await seedShop(ctx, "探している店舗");
      for (let index = 0; index < 3; index += 1) await seedShop(ctx, `対象外${index}`);
      return target;
    });
    let cursor: string | null = null;
    const found: string[] = [];
    let pages = 0;
    do {
      const page: ShopsResponse = await t.query(getShopsRef, {
        ...PAGE,
        limit: 1,
        cursor,
        search: "探している",
        date: null,
        metric: null,
      });
      if (pages === 0) {
        expect(page.rows).toEqual([]);
        expect(page.pageInfo.isDone).toBe(false);
      }
      found.push(...page.rows.map((row) => row.shopId));
      cursor = page.pageInfo.continueCursor;
      pages += 1;
    } while (cursor !== null && pages < 10);
    expect(found).toEqual([target]);
    expect(cursor).toBeNull();
  });

  it("別店舗スタッフ・募集、削除人物、canonical所属不整合を同じ取得不能へ揃える", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const shopId = await seedShop(ctx);
      const otherShopId = await seedShop(ctx, "別店舗");
      const otherStaffId = await seedStaff(ctx, { shopId: otherShopId, name: "別店舗人物" });
      const staffId = await seedStaff(ctx, { shopId, name: "削除人物" });
      const staff = await ctx.db.get(staffId);
      if (!staff) throw new Error("fixture_missing");
      await ctx.db.patch(staff.organizationPersonId, { status: "removed" });
      const recruitmentId = await seedRecruitment(ctx, { shopId: otherShopId });
      return { shopId, otherStaffId, staffId, recruitmentId };
    });
    for (const staffId of [ids.otherStaffId, ids.staffId])
      expect(await t.query(getStaffRef, { ...PAGE, shopId: ids.shopId, staffId })).toBeNull();
    expect(
      await t.query(getCycleRef, { shopId: ids.shopId, recruitmentId: ids.recruitmentId, asOf: AS_OF }),
    ).toBeNull();
    const list = await t.query(getShopRef, { ...PAGE, shopId: ids.shopId });
    expect(list?.staff).toEqual([]);
  });

  it("直近20募集の提出記録だけを期間開始日の新しい順に返す", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const shopId = await seedShop(ctx);
      const staffId = await seedStaff(ctx, { shopId, name: "スタッフ" });
      const recruitmentIds = [];
      for (let index = 0; index < 22; index += 1) {
        const recruitmentId = await seedRecruitment(ctx, {
          shopId,
          periodStart: addDays("2026-08-01", index),
          periodEnd: addDays("2026-08-01", index),
        });
        recruitmentIds.push(recruitmentId);
        await ctx.db.insert("shiftSubmissions", {
          recruitmentId,
          staffId,
          firstSubmittedAt: AS_OF - 100,
          submittedAt: AS_OF,
        });
      }
      return { shopId, staffId, recruitmentIds };
    });
    const result = await t.query(getStaffRef, { ...PAGE, shopId: ids.shopId, staffId: ids.staffId });
    expect(result?.submissions.map((row) => row.recruitmentId)).toEqual([...ids.recruitmentIds].reverse().slice(0, 20));
    expect(result?.submissions.every((row) => row.submittedAt === AS_OF)).toBe(true);
  });

  it("通知の店舗・スタッフ境界とページ順を保ち、送信と到達を分けて秘密の本文を返さない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const shopId = await seedShop(ctx);
      const otherShopId = await seedShop(ctx, "別店舗");
      const staffId = await seedStaff(ctx, { shopId, name: "履歴スタッフ" });
      const otherStaffId = await seedStaff(ctx, { shopId: otherShopId, name: "別店舗スタッフ" });
      const histories = [];
      for (let index = 0; index < 3; index += 1) {
        const targetShopId = index === 2 ? otherShopId : shopId;
        const targetStaffId = index === 2 ? otherStaffId : staffId;
        const shop = await ctx.db.get(targetShopId);
        if (!shop) throw new Error("fixture_missing");
        const outboxId = await ctx.db.insert("notificationOutbox", {
          shopId: targetShopId,
          staffId: targetStaffId,
          organizationId: shop.organizationId,
          channel: "line",
          status: "sent",
          dedupeKey: `history-${index}`,
          purpose: "business",
          notificationContext: "test.history",
          deliverySuppressed: false,
          payload: { kind: "line", toUserId: "private-line-user", text: "private-token-secret" },
          attemptCount: 1,
          nextRunAt: AS_OF + index,
          createdAt: AS_OF + index,
          updatedAt: AS_OF + index,
        });
        histories.push(
          await ctx.db.insert("notificationHistory", {
            shopId: targetShopId,
            staffId: targetStaffId,
            outboxId,
            channel: "line",
            notificationKind: "recruitment",
            displayTitle: "private-title",
            sendStatus: "sent",
            deliveryStatus: "not_supported",
            requestedAt: AS_OF + index,
            sentAt: AS_OF + index,
            updatedAt: AS_OF + index,
          }),
        );
      }
      return { shopId, staffId, histories };
    });
    const first = await t.query(getStaffRef, { ...PAGE, shopId: ids.shopId, staffId: ids.staffId, limit: 1 });
    expect(first?.notifications.map((row) => row.id)).toEqual([ids.histories[1]]);
    expect(first?.notifications[0]).toMatchObject({
      sendStatus: "sent",
      deliveryStatus: "not_supported",
      deliveredAt: null,
    });
    expect(first?.pageInfo.isDone).toBe(false);
    const second = await t.query(getStaffRef, {
      ...PAGE,
      shopId: ids.shopId,
      staffId: ids.staffId,
      limit: 1,
      cursor: first?.pageInfo.continueCursor ?? null,
    });
    expect(second?.notifications.map((row) => row.id)).toEqual([ids.histories[0]]);
    expect(second?.pageInfo.isDone).toBe(true);
    expect(JSON.stringify([first, second])).not.toContain("private-");
    expect(Object.keys(first?.notifications[0] ?? {}).sort()).toEqual(
      [
        "id",
        "channel",
        "notificationKind",
        "sendStatus",
        "deliveryStatus",
        "requestedAt",
        "sentAt",
        "deliveredAt",
        "failedAt",
      ].sort(),
    );
  });

  it("募集の提出率は現在の有効な対象スタッフだけで計算し、締切時点の率を推定しない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const shopId = await seedShop(ctx);
      const recruitmentId = await seedRecruitment(ctx, { shopId });
      const staffId = await seedStaff(ctx, { shopId, name: "対象" });
      await seedStaff(ctx, { shopId, name: "未提出" });
      const resubmitting = await seedStaff(ctx, { shopId, name: "再提出待ち" });
      await ctx.db.insert("shiftSubmissions", {
        recruitmentId,
        staffId: resubmitting,
        firstSubmittedAt: AS_OF - 200,
        submittedAt: AS_OF - 100,
        needsResubmission: true,
      });
      const excluded = await seedStaff(ctx, { shopId, name: "対象外", excludedFromShift: true });
      for (const id of [staffId, excluded])
        await ctx.db.insert("shiftSubmissions", {
          recruitmentId,
          staffId: id,
          firstSubmittedAt: AS_OF - 100,
          submittedAt: AS_OF,
        });
      return { shopId, recruitmentId };
    });
    const result = await t.query(getCycleRef, { ...ids, asOf: AS_OF });
    expect(result?.currentSubmission).toEqual({ numerator: 1, denominator: 3, rate: 1 / 3 });
    expect(result?.deadlineSubmissionRate).toBeNull();
  });
});

describe("要望のチェック", () => {
  it("未設定・true・falseを受付順の全ページへ含め、同値再送と解除に対応する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const shopId = await seedShop(ctx);
      const ids = [];
      for (const isDeleted of [undefined, true, false])
        ids.push(
          await ctx.db.insert("featureRequests", {
            shopId,
            requestId: `request-${ids.length}`,
            comment: `本文${ids.length}`,
            ...(isDeleted === undefined ? {} : { isDeleted }),
          }),
        );
      await ctx.db.patch(shopId, { isDeleted: true });
      return ids;
    });
    const first = await t.query(getFeatureRequestsRef, { ...PAGE, limit: 2 });
    expect(first.rows.map((row) => row.id)).toEqual([ids[2], ids[1]]);
    expect(first.rows.map((row) => row.isDeleted)).toEqual([false, true]);
    const second = await t.query(getFeatureRequestsRef, { ...PAGE, limit: 2, cursor: first.pageInfo.continueCursor });
    expect(second.rows.map((row) => ({ id: row.id, isDeleted: row.isDeleted }))).toEqual([
      { id: ids[0], isDeleted: false },
    ]);
    for (const isDeleted of [true, true, false]) {
      expect(await t.mutation(setFeatureRequestDeletedRef, { id: ids[0], isDeleted })).toEqual({
        kind: "requestUpdated",
        id: ids[0],
        isDeleted,
      });
    }
    const all = await t.query(getFeatureRequestsRef, PAGE);
    expect(all.rows.map((row) => row.id)).toEqual([...ids].reverse());
    expect(all.rows.map((row) => row.comment)).toEqual(["本文2", "本文1", "本文0"]);
    expect(await t.mutation(setFeatureRequestDeletedRef, { id: "missing", isDeleted: true })).toBeNull();
  });
});
