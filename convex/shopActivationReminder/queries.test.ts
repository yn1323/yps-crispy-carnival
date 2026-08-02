import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import type { Id } from "../_generated/dataModel";
import { seedLegacyShopMembership, seedOrganizationManagerShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { getReminderTargetRef } from "./refs";

function createTest() {
  return convexTest(schema, modules);
}

type TestConvexInstance = ReturnType<typeof createTest>;

async function seedShopWithManagerStaff(t: TestConvexInstance) {
  return await t.run(async (ctx) => {
    const { shopId, userId, organizationId, personId, memberId } = await seedOrganizationManagerShop(ctx, {
      subject: "manager",
      email: "manager@example.com",
      shopName: "通知店舗",
    });
    const managerStaffId = await ctx.db.insert("staffs", {
      shopId,
      organizationId,
      organizationPersonId: personId,
      name: "店長",
      email: "manager@example.com",
      emailNormalized: "manager@example.com",
      userId,
      isDeleted: false,
    });
    return { shopId, userId, memberId, managerStaffId };
  });
}

async function insertStaff(
  t: TestConvexInstance,
  args: {
    shopId: Id<"shops">;
    name: string;
    email: string;
    userId?: Id<"users">;
    excludedFromShift?: boolean;
    isDeleted?: boolean;
  },
) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("staffs", {
      shopId: args.shopId,
      name: args.name,
      email: args.email,
      emailNormalized: args.email.toLowerCase(),
      ...(args.userId ? { userId: args.userId } : {}),
      ...(args.excludedFromShift ? { excludedFromShift: true } : {}),
      isDeleted: args.isDeleted ?? false,
    });
  });
}

describe("shopActivationReminder/queries", () => {
  it("manager本人のstaffだけなら送信対象を返す", async () => {
    const t = createTest();
    const { shopId, userId } = await seedShopWithManagerStaff(t);

    const target = await t.query(getReminderTargetRef, { shopId });

    expect(target).toMatchObject({
      shopId,
      shopName: "通知店舗",
    });
    expect(target).not.toBeNull();
    if (!target) return;
    const dashboardUrl = new URL(target.dashboardUrl);
    expect(dashboardUrl.pathname).toBe("/dashboard");
    expect([...dashboardUrl.searchParams.entries()]).toEqual([["shop", String(shopId)]]);
    expect(target?.recipients).toHaveLength(1);
    expect(target?.recipients[0]).toMatchObject({
      userId,
      name: "管理者",
      email: "manager@example.com",
    });
  });

  it("manager userに紐づかないシフト対象staffが1人でもいれば対象外にする", async () => {
    const t = createTest();
    const { shopId } = await seedShopWithManagerStaff(t);
    await insertStaff(t, {
      shopId,
      name: "田中",
      email: "tanaka@example.com",
    });

    await expect(t.query(getReminderTargetRef, { shopId })).resolves.toBeNull();
  });

  it("シフト対象外staffは対象外判定に含めない", async () => {
    const t = createTest();
    const { shopId } = await seedShopWithManagerStaff(t);
    await insertStaff(t, {
      shopId,
      name: "店舗共通",
      email: "shared@example.com",
      excludedFromShift: true,
    });

    await expect(t.query(getReminderTargetRef, { shopId })).resolves.not.toBeNull();
  });

  it("削除済み店舗は対象外にする", async () => {
    const t = createTest();
    const { shopId } = await seedShopWithManagerStaff(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(shopId, { isDeleted: true });
    });

    await expect(t.query(getReminderTargetRef, { shopId })).resolves.toBeNull();
  });

  it("canonical管理者がreadOnlyならactiveな旧所属が残っていても対象外にする", async () => {
    const t = createTest();
    const { shopId, userId, memberId } = await seedShopWithManagerStaff(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(memberId, { status: "readOnly", updatedAt: Date.now() });
      await seedLegacyShopMembership(ctx, { shopId, userId });
    });

    await expect(t.query(getReminderTargetRef, { shopId })).resolves.toBeNull();
  });
});
