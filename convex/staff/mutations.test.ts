import type { TestConvex } from "convex-test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { toAuditRequestKey } from "../_lib/auditCorrelation";
import { todayJST } from "../_lib/dateFormat";
import { rateLimit } from "../_lib/rateLimits";
import { seedNotificationHistory } from "../_test/notificationHistory";
import { seedStaff } from "../_test/scenarioBuilders";
import {
  getTestOrganizationId,
  seedManagerShop,
  seedOrganizationManagerShop,
  seedOrganizationPersonLineLink,
  seedShop,
  seedUser,
} from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import {
  CURRENT_SHIFT_NOTIFICATION_LIMIT,
  NOTIFICATION_RESEND_COOLDOWN_MS,
  PERSON_NAME_MAX_LENGTH,
  SHOP_MEMBERSHIP_STATS_OPEN_RECRUITMENT_LIMIT,
  SHOP_MEMBERSHIP_STATS_RECALCULATION_WORK_LIMIT,
  STAFF_ADD_ENTRIES_MAX,
  STAFF_NOTIFICATION_RESEND_ACTOR_DAILY_LIMIT,
  STAFF_NOTIFICATION_RESEND_ORGANIZATION_DAILY_LIMIT,
  STAFF_NOTIFICATION_RESEND_SCOPE_TARGET_SHORT_LIMIT,
} from "../constants";
import { getLegalConsentVersions } from "../legal/documents";
import {
  SHIFT_CONFIRMATION_NOTIFICATION_KIND,
  SHIFT_RECRUITMENT_NOTIFICATION_KIND,
} from "../notificationOutbox/historyKinds";
import { ORGANIZATION_SHOP_STAFF_MEMBERSHIP_CHANGE_TARGET_LIMIT } from "../organization/shopMembershipChange";
import { ORGANIZATION_STAFF_ORDER_PEOPLE_LIMIT } from "../organization/staffOrder";
import { ORGANIZATION_PLAN_LIMITS } from "../organizationBilling/policy";

function dateFromToday(daysFromNow: number): string {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000);
  d.setUTCDate(d.getUTCDate() + daysFromNow);
  return d.toISOString().split("T")[0];
}

let staffAddRequestSequence = 0;

function nextStaffAddRequestId() {
  staffAddRequestSequence += 1;
  return `staff-add-test-${staffAddRequestSequence}`;
}

function addedStaffIds(result: { status: "added"; staffIds: Id<"staffs">[] }) {
  return result.staffIds;
}

async function seedMembershipChangeShop(ctx: MutationCtx, organizationId: Id<"organizations">, name: string) {
  return await ctx.db.insert("shops", {
    organizationId,
    name,
    submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
    regularClosedDays: [],
    isDeleted: false,
  });
}

async function seedMembershipChangePerson(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    email: string;
    name?: string;
    userId?: Id<"users">;
  },
) {
  const now = Date.now();
  return await ctx.db.insert("organizationPeople", {
    organizationId: args.organizationId,
    ...(args.userId ? { userId: args.userId } : {}),
    name: args.name ?? "所属変更対象",
    email: args.email,
    emailNormalized: args.email,
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
}

async function getMembershipChangeDetail(
  t: TestConvex<typeof schema>,
  args: { subject: string; shopId: Id<"shops">; personId: Id<"organizationPeople"> },
) {
  const detail = await t
    .withIdentity({ subject: args.subject })
    .query(api.organization.userDetailQueries.getUserDetail, {
      expectedOrganizationId: await getTestOrganizationId(t, args.shopId),
      shopId: args.shopId,
      personId: args.personId,
      now: Date.now(),
    });
  if (!detail) throw new Error("ユーザー詳細を取得できませんでした");
  return detail;
}

function readyRemovalPreview(detail: Awaited<ReturnType<typeof getMembershipChangeDetail>>, shopId: Id<"shops">) {
  const membership = detail.memberships.find((candidate) => candidate.shopId === shopId);
  if (membership?.removalPreview.kind !== "ready") {
    throw new Error("店舗所属の削除previewを取得できませんでした");
  }
  return {
    shopId,
    staffId: membership.staffId,
    assignmentCount: membership.removalPreview.assignmentCount,
    fingerprint: membership.removalPreview.fingerprint,
  };
}

async function getShopStaffMembershipChange(
  t: TestConvex<typeof schema>,
  args: { subject: string; shopId: Id<"shops"> },
) {
  const snapshot = await t
    .withIdentity({ subject: args.subject })
    .query(api.staff.queries.getOrganizationShopStaffMembershipChange, {
      expectedOrganizationId: await getTestOrganizationId(t, args.shopId),
      shopId: args.shopId,
    });
  if (!snapshot) throw new Error("店舗の所属スタッフsnapshotを取得できませんでした");
  return snapshot;
}

async function getShopStaffRemovalPreviews(
  t: TestConvex<typeof schema>,
  args: {
    subject: string;
    shopId: Id<"shops">;
    personIds: Id<"organizationPeople">[];
    expectedMembershipFingerprint: string;
  },
) {
  const preview = await t
    .withIdentity({ subject: args.subject })
    .query(api.staff.queries.previewOrganizationShopStaffMembershipRemovals, {
      expectedOrganizationId: await getTestOrganizationId(t, args.shopId),
      shopId: args.shopId,
      personIds: args.personIds,
      expectedMembershipFingerprint: args.expectedMembershipFingerprint,
      now: Date.now(),
    });
  if (preview?.kind !== "ready") throw new Error("店舗の所属スタッフ解除previewを取得できませんでした");
  return preview.removals;
}

describe("staff/mutations", () => {
  describe("addStaffs", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("未認証の場合エラーをthrow", async () => {
      const t = convexTest(schema, modules);
      const shopId = await t.run(async (ctx) => await seedShop(ctx, "テスト店舗"));
      await expect(
        t.mutation(api.staff.mutations.addStaffs, {
          expectedOrganizationId: await getTestOrganizationId(t, shopId),
          shopId,
          requestId: nextStaffAddRequestId(),
          entries: [{ name: "テスト", email: "test@example.com" }],
        }),
      ).rejects.toThrow();
    });

    it("スタッフを一括追加できる", async () => {
      const t = convexTest(schema, modules);

      const shopId = await t.run(async (ctx) => {
        const seeded = await seedManagerShop(ctx, {
          subject: "user_mgr",
          email: "mgr@example.com",
          shopName: "テスト店舗",
        });
        return seeded.shopId;
      });

      const ids = addedStaffIds(
        await t.withIdentity({ subject: "user_mgr" }).mutation(api.staff.mutations.addStaffs, {
          expectedOrganizationId: await getTestOrganizationId(t, shopId),
          shopId,
          requestId: nextStaffAddRequestId(),
          entries: [
            { name: "田中太郎", email: "tanaka@example.com" },
            { name: "佐藤花子", email: "sato@example.com" },
          ],
        }),
      );

      expect(ids).toHaveLength(2);

      const staffs = await t.run(async (ctx) =>
        ctx.db
          .query("staffs")
          .withIndex("by_shopId", (q) => q.eq("shopId", shopId))
          .collect(),
      );
      expect(staffs).toHaveLength(2);
      expect(staffs.every((s) => !s.isDeleted)).toBe(true);
    });

    it("事業者配下では人物とstaffをdual-writeし、有効な組織共通順の末尾へ追加する", async () => {
      const t = convexTest(schema, modules);
      const {
        shopId,
        organizationId,
        personId: managerPersonId,
      } = await t.run(
        async (ctx) =>
          await seedOrganizationManagerShop(ctx, {
            subject: "organization_manager",
            email: "organization-manager@example.com",
          }),
      );
      await t.run(async (ctx) => {
        await ctx.db.insert("organizationStaffOrderStates", {
          organizationId,
          revision: 1,
          activatedAt: Date.now(),
          updatedAt: Date.now(),
        });
        await ctx.db.insert("organizationStaffOrderEntries", {
          organizationId,
          organizationPersonId: managerPersonId,
          displayOrder: 0,
        });
      });

      const [staffId] = addedStaffIds(
        await t.withIdentity({ subject: "organization_manager" }).mutation(api.staff.mutations.addStaffs, {
          expectedOrganizationId: await getTestOrganizationId(t, shopId),
          shopId,
          requestId: nextStaffAddRequestId(),
          entries: [{ name: "事業者スタッフ", email: "  Staff@Example.com  " }],
        }),
      );

      const state = await t.run(async (ctx) => {
        const staff = await ctx.db.get(staffId);
        const person = staff?.organizationPersonId ? await ctx.db.get(staff.organizationPersonId) : null;
        const [organizationOrder, shopOrder] = await Promise.all([
          ctx.db
            .query("organizationStaffOrderEntries")
            .withIndex("by_organizationId_and_displayOrder", (q) => q.eq("organizationId", organizationId))
            .collect(),
          ctx.db
            .query("shopStaffOrderEntries")
            .withIndex("by_shopId_and_displayOrder", (q) => q.eq("shopId", shopId))
            .collect(),
        ]);
        return { staff, person, organizationOrder, shopOrder };
      });
      expect(state.staff).toMatchObject({
        shopId,
        organizationId,
        name: "事業者スタッフ",
        email: "staff@example.com",
        emailNormalized: "staff@example.com",
        isDeleted: false,
      });
      expect(state.staff?.organizationPersonId).toBe(state.person?._id);
      expect(state.person).toMatchObject({
        organizationId,
        name: "事業者スタッフ",
        emailNormalized: "staff@example.com",
        status: "active",
      });
      expect(state.organizationOrder.map(({ organizationPersonId }) => organizationPersonId)).toEqual([
        managerPersonId,
        state.person?._id,
      ]);
      expect(state.shopOrder).toEqual([
        expect.objectContaining({
          organizationId,
          shopId,
          staffId,
          organizationPersonId: state.person?._id,
          displayOrder: 1,
        }),
      ]);
    });

    it("order entryが安全上限を超えてもスタッフ追加を完了し、並び順だけをlegacyへ戻す", async () => {
      const t = convexTest(schema, modules);
      const subject = "staff_order_fail_safe_addition";
      const base = await t.run(async (ctx) => {
        const seeded = await seedOrganizationManagerShop(ctx, {
          subject,
          email: "staff-order-fail-safe-manager@example.com",
        });
        const now = Date.now();
        await ctx.db.insert("organizationStaffOrderStates", {
          organizationId: seeded.organizationId,
          revision: 1,
          activatedAt: now,
          updatedAt: now,
        });
        for (let displayOrder = 0; displayOrder <= ORGANIZATION_STAFF_ORDER_PEOPLE_LIMIT; displayOrder += 1) {
          await ctx.db.insert("organizationStaffOrderEntries", {
            organizationId: seeded.organizationId,
            organizationPersonId: seeded.personId,
            displayOrder,
          });
        }
        return seeded;
      });
      const actor = t.withIdentity({ subject });

      const [staffId] = addedStaffIds(
        await actor.mutation(api.staff.mutations.addStaffs, {
          expectedOrganizationId: await getTestOrganizationId(t, base.shopId),
          shopId: base.shopId,
          requestId: nextStaffAddRequestId(),
          entries: [{ name: "追加できるスタッフ", email: "staff-order-fail-safe-added@example.com" }],
        }),
      );

      const state = await t.run(async (ctx) => {
        const staff = await ctx.db.get(staffId);
        return {
          staff,
          person: staff?.organizationPersonId ? await ctx.db.get(staff.organizationPersonId) : null,
          orderStates: await ctx.db
            .query("organizationStaffOrderStates")
            .withIndex("by_organizationId", (q) => q.eq("organizationId", base.organizationId))
            .collect(),
        };
      });
      expect(state.staff).toMatchObject({
        organizationId: base.organizationId,
        shopId: base.shopId,
        name: "追加できるスタッフ",
        emailNormalized: "staff-order-fail-safe-added@example.com",
        isDeleted: false,
      });
      expect(state.person).toMatchObject({
        organizationId: base.organizationId,
        name: "追加できるスタッフ",
        emailNormalized: "staff-order-fail-safe-added@example.com",
        status: "active",
      });
      expect(state.orderStates).toEqual([]);
      await expect(
        actor.query(api.appOrganization.staffOrderQueries.getOrganizationStaffOrderScope, {
          organizationId: base.organizationId,
          shopFilter: "all",
        }),
      ).resolves.toEqual({ mode: "legacy" });
    });

    it("同じ事業者の人物は利用人数上限時も別店舗で再利用し、新しい人物を作らない", async () => {
      const t = convexTest(schema, modules);
      const seeded = await t.run(async (ctx) => {
        const organization = await seedOrganizationManagerShop(ctx, {
          subject: "reuse_manager",
          email: "reuse-manager@example.com",
          plan: "standard",
        });
        const secondShopId = await ctx.db.insert("shops", {
          organizationId: organization.organizationId,
          name: "2号店",
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
          regularClosedDays: [],
          isDeleted: false,
        });
        const now = Date.now();
        const existingPersonId = await ctx.db.insert("organizationPeople", {
          organizationId: organization.organizationId,
          name: "共通スタッフ",
          email: "shared@example.com",
          emailNormalized: "shared@example.com",
          status: "active",
          createdAt: now,
          updatedAt: now,
        });
        await ctx.db.insert("staffs", {
          excludedFromShift: false,
          shopId: organization.shopId,
          organizationId: organization.organizationId,
          organizationPersonId: existingPersonId,
          name: "共通スタッフ",
          email: "shared@example.com",
          emailNormalized: "shared@example.com",
          isDeleted: false,
        });
        // Proの15人上限まで埋める（管理者1人 + 共通スタッフ1人 + 13人）。
        for (let index = 0; index < 13; index += 1) {
          const email = `filler-${index}@example.com`;
          const personId = await ctx.db.insert("organizationPeople", {
            organizationId: organization.organizationId,
            name: `既存スタッフ${index}`,
            email,
            emailNormalized: email,
            status: "active",
            createdAt: now,
            updatedAt: now,
          });
          await ctx.db.insert("staffs", {
            excludedFromShift: false,
            shopId: organization.shopId,
            organizationId: organization.organizationId,
            organizationPersonId: personId,
            name: `既存スタッフ${index}`,
            email,
            emailNormalized: email,
            isDeleted: false,
          });
        }
        return { ...organization, secondShopId, existingPersonId };
      });

      const [staffId] = addedStaffIds(
        await t.withIdentity({ subject: "reuse_manager" }).mutation(api.staff.mutations.addStaffs, {
          expectedOrganizationId: await getTestOrganizationId(t, seeded.secondShopId),
          shopId: seeded.secondShopId,
          requestId: nextStaffAddRequestId(),
          entries: [{ name: "2号店の表示名", email: "Shared@Example.com" }],
        }),
      );

      const state = await t.run(async (ctx) => {
        const people = await ctx.db
          .query("organizationPeople")
          .withIndex("by_organizationId_and_emailNormalized", (q) => q.eq("organizationId", seeded.organizationId))
          .collect();
        return { people, staff: await ctx.db.get(staffId) };
      });
      expect(state.people).toHaveLength(15);
      expect(state.staff).toMatchObject({
        shopId: seeded.secondShopId,
        organizationId: seeded.organizationId,
        organizationPersonId: seeded.existingPersonId,
        name: "共通スタッフ",
      });
    });

    it("事業者の利用人数上限をbatch全体で検証し、一部の人物・スタッフ・通知を保存しない", async () => {
      const t = convexTest(schema, modules);
      const { shopId, organizationId } = await t.run(
        async (ctx) =>
          await seedOrganizationManagerShop(ctx, {
            subject: "capacity_manager",
            email: "capacity-manager@example.com",
            plan: "free",
          }),
      );

      await expect(
        t.withIdentity({ subject: "capacity_manager" }).mutation(api.staff.mutations.addStaffs, {
          expectedOrganizationId: await getTestOrganizationId(t, shopId),
          shopId,
          requestId: nextStaffAddRequestId(),
          entries: Array.from({ length: 5 }, (_, index) => ({
            name: `追加スタッフ${index}`,
            email: `additional-${index}@example.com`,
          })),
        }),
      ).rejects.toThrow("利用人数が現在のプラン上限を超えます。\n現在1名、上限5名です。");

      const state = await t.run(async (ctx) => {
        const people = await ctx.db
          .query("organizationPeople")
          .withIndex("by_organizationId_and_emailNormalized", (q) => q.eq("organizationId", organizationId))
          .collect();
        const staffs = await ctx.db
          .query("staffs")
          .withIndex("by_shopId", (q) => q.eq("shopId", shopId))
          .collect();
        const scheduled = await ctx.db.system.query("_scheduled_functions").collect();
        return { people, staffs, scheduled };
      });
      expect(state.people).toHaveLength(1);
      expect(state.staffs).toEqual([]);
      expect(state.scheduled).toEqual([]);
    });

    it("利用人数に未算入のremoved管理者人物をスタッフ化する場合も一人分の空きを要求する", async () => {
      const t = convexTest(schema, modules);
      const seeded = await t.run(async (ctx) => {
        const organization = await seedOrganizationManagerShop(ctx, {
          subject: "removed_staff_capacity_manager",
          plan: "free",
        });
        const now = Date.now();
        for (let index = 0; index < 4; index += 1) {
          const email = `removed-capacity-staff-${index}@example.com`;
          const personId = await ctx.db.insert("organizationPeople", {
            organizationId: organization.organizationId,
            name: `既存スタッフ${index}`,
            email,
            emailNormalized: email,
            status: "active",
            createdAt: now,
            updatedAt: now,
          });
          await ctx.db.insert("staffs", {
            excludedFromShift: false,
            shopId: organization.shopId,
            organizationId: organization.organizationId,
            organizationPersonId: personId,
            name: `既存スタッフ${index}`,
            email,
            emailNormalized: email,
            isDeleted: false,
          });
        }
        const targetUserId = await seedUser(ctx, "removed_staff_capacity_target", "removed-target@example.com");
        const targetPersonId = await ctx.db.insert("organizationPeople", {
          organizationId: organization.organizationId,
          userId: targetUserId,
          name: "閲覧のみ人物",
          email: "removed-target@example.com",
          emailNormalized: "removed-target@example.com",
          status: "active",
          createdAt: now,
          updatedAt: now,
        });
        await ctx.db.insert("organizationMembers", {
          organizationId: organization.organizationId,
          personId: targetPersonId,
          userId: targetUserId,
          status: "removed",
          createdAt: now,
          updatedAt: now,
        });
        return { ...organization, targetPersonId };
      });

      await expect(
        t.withIdentity({ subject: "removed_staff_capacity_manager" }).mutation(api.staff.mutations.addStaffs, {
          expectedOrganizationId: await getTestOrganizationId(t, seeded.shopId),
          shopId: seeded.shopId,
          requestId: nextStaffAddRequestId(),
          entries: [{ name: "入力名", email: "removed-target@example.com" }],
        }),
      ).rejects.toThrow("利用人数が現在のプラン上限を超えます");

      const targetStaffs = await t.run(async (ctx) =>
        ctx.db
          .query("staffs")
          .withIndex("by_organizationId_and_organizationPersonId", (q) =>
            q.eq("organizationId", seeded.organizationId).eq("organizationPersonId", seeded.targetPersonId),
          )
          .collect(),
      );
      expect(targetStaffs).toEqual([]);
    });

    it("BusinessからProへの変更予約中も適用日まではBusiness上限でスタッフを追加する", async () => {
      const t = convexTest(schema, modules);
      const seeded = await t.run(async (ctx) => {
        const organization = await seedOrganizationManagerShop(ctx, {
          subject: "scheduled_pro_staff_manager",
          plan: "pro",
        });
        const now = Date.now();
        for (let index = 0; index < 29; index += 1) {
          const email = `scheduled-pro-staff-${index}@example.com`;
          const personId = await ctx.db.insert("organizationPeople", {
            organizationId: organization.organizationId,
            name: `既存スタッフ${index}`,
            email,
            emailNormalized: email,
            status: "active",
            createdAt: now,
            updatedAt: now,
          });
          await ctx.db.insert("staffs", {
            excludedFromShift: false,
            shopId: organization.shopId,
            organizationId: organization.organizationId,
            organizationPersonId: personId,
            name: `既存スタッフ${index}`,
            email,
            emailNormalized: email,
            isDeleted: false,
          });
        }
        const billingState = await ctx.db
          .query("organizationBillingStates")
          .withIndex("by_organizationId", (q) => q.eq("organizationId", organization.organizationId))
          .unique();
        if (!billingState) throw new Error("billing state not found");
        await ctx.db.patch(billingState._id, {
          state: {
            kind: "scheduledChange",
            currentPlan: "pro",
            targetPlan: "standard",
            effectiveAt: now + 30 * 24 * 60 * 60 * 1000,
          },
        });
        return organization;
      });

      await expect(
        t.withIdentity({ subject: "scheduled_pro_staff_manager" }).mutation(api.staff.mutations.addStaffs, {
          expectedOrganizationId: await getTestOrganizationId(t, seeded.shopId),
          shopId: seeded.shopId,
          requestId: nextStaffAddRequestId(),
          entries: [{ name: "31人目", email: "scheduled-pro-over-limit@example.com" }],
        }),
      ).resolves.toMatchObject({ status: "added" });

      const state = await t.run(async (ctx) => ({
        people: await ctx.db
          .query("organizationPeople")
          .withIndex("by_organizationId_and_emailNormalized", (q) => q.eq("organizationId", seeded.organizationId))
          .collect(),
        staffs: await ctx.db
          .query("staffs")
          .withIndex("by_shopId", (q) => q.eq("shopId", seeded.shopId))
          .collect(),
      }));
      expect(state.people).toHaveLength(31);
      expect(state.staffs).toHaveLength(30);
      expect(state.people.map((person) => person.emailNormalized)).toContain("scheduled-pro-over-limit@example.com");
    });

    it("同一メールのpending管理者招待予約枠をstaff人物へ付け替えて上限を二重計上しない", async () => {
      const t = convexTest(schema, modules);
      const seeded = await t.run(async (ctx) => {
        const organization = await seedOrganizationManagerShop(ctx, {
          subject: "reserved_invitation_staff_manager",
          email: "reserved-invitation-owner@example.com",
          plan: "standard",
        });
        const now = Date.now();
        for (let index = 0; index < 13; index += 1) {
          const email = `reserved-invitation-existing-${index}@example.com`;
          const personId = await ctx.db.insert("organizationPeople", {
            organizationId: organization.organizationId,
            name: `既存人物${index}`,
            email,
            emailNormalized: email,
            status: "active",
            createdAt: now,
            updatedAt: now,
          });
          await ctx.db.insert("staffs", {
            excludedFromShift: false,
            shopId: organization.shopId,
            organizationId: organization.organizationId,
            organizationPersonId: personId,
            name: `既存人物${index}`,
            email,
            emailNormalized: email,
            isDeleted: false,
          });
        }
        const invitationId = await ctx.db.insert("organizationInvitations", {
          organizationId: organization.organizationId,
          invitedName: "予約済みスタッフ",
          email: "Reserved-Staff@Example.com",
          emailNormalized: "reserved-staff@example.com",
          tokenDigest: "reserved-seat-to-staff-person",
          status: "issued",
          inviterMemberId: organization.memberId,
          reservedSeat: true,
          version: 1,
          expiresAt: now + 86_400_000,
          createdAt: now - 1_000,
          updatedAt: now - 1_000,
        });
        return { ...organization, invitationId, invitationUpdatedAt: now - 1_000 };
      });
      const requestId = nextStaffAddRequestId();
      const entries = [{ name: "予約済みスタッフ", email: "reserved-staff@example.com" }];
      const asManager = t.withIdentity({ subject: "reserved_invitation_staff_manager" });
      const result = await asManager.mutation(api.staff.mutations.addStaffs, {
        expectedOrganizationId: await getTestOrganizationId(t, seeded.shopId),
        shopId: seeded.shopId,
        requestId,
        entries,
      });
      const staffIds = addedStaffIds(result);
      await expect(
        asManager.mutation(api.staff.mutations.addStaffs, {
          expectedOrganizationId: await getTestOrganizationId(t, seeded.shopId),
          shopId: seeded.shopId,
          requestId,
          entries,
        }),
      ).resolves.toEqual(result);

      const state = await t.run(async (ctx) => ({
        audits: await ctx.db.query("organizationAuditEvents").collect(),
        invitation: await ctx.db.get(seeded.invitationId),
        people: await ctx.db
          .query("organizationPeople")
          .withIndex("by_organizationId_and_emailNormalized", (q) => q.eq("organizationId", seeded.organizationId))
          .collect(),
        scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
        staff: await ctx.db.get(staffIds[0]),
        staffs: await ctx.db
          .query("staffs")
          .withIndex("by_shopId", (q) => q.eq("shopId", seeded.shopId))
          .collect(),
      }));
      expect(state.invitation).toMatchObject({ status: "issued", reservedSeat: false, version: 1 });
      expect(state.invitation?.updatedAt).toBeGreaterThan(seeded.invitationUpdatedAt);
      expect(state.people).toHaveLength(15);
      expect(state.staffs).toHaveLength(14);
      expect(state.staff).toMatchObject({
        organizationId: seeded.organizationId,
        name: "予約済みスタッフ",
        email: "reserved-staff@example.com",
        isDeleted: false,
      });
      expect(state.scheduled).toHaveLength(3);
      expect(state.audits.filter((audit) => audit.action === "organization.staff_added")).toHaveLength(1);
    });

    it("同一メールの有効なpending管理者招待が複数ある不整合では予約枠を変更しない", async () => {
      const t = convexTest(schema, modules);
      const seeded = await t.run(async (ctx) => {
        const organization = await seedOrganizationManagerShop(ctx, {
          subject: "ambiguous_reserved_invitation_manager",
          email: "ambiguous-reservation-owner@example.com",
          plan: "standard",
        });
        const now = Date.now();
        const invitationIds: Id<"organizationInvitations">[] = [];
        for (let index = 0; index < 3; index += 1) {
          invitationIds.push(
            await ctx.db.insert("organizationInvitations", {
              organizationId: organization.organizationId,
              invitedName: "重複予約対象",
              email: "duplicate-reservation@example.com",
              emailNormalized: "duplicate-reservation@example.com",
              tokenDigest: `duplicate-reservation-${index}`,
              status: "issued",
              inviterMemberId: organization.memberId,
              reservedSeat: true,
              version: 1,
              expiresAt: now + 86_400_000,
              createdAt: now,
              updatedAt: now,
            }),
          );
        }
        return { ...organization, invitationIds };
      });

      await expect(
        t.withIdentity({ subject: "ambiguous_reserved_invitation_manager" }).mutation(api.staff.mutations.addStaffs, {
          expectedOrganizationId: await getTestOrganizationId(t, seeded.shopId),
          shopId: seeded.shopId,
          requestId: nextStaffAddRequestId(),
          entries: [{ name: "追加対象", email: "duplicate-reservation@example.com" }],
        }),
      ).rejects.toThrow("このメールアドレスへの管理者招待を確認できません。\n組織設定で招待状況を確認してください。");

      const state = await t.run(async (ctx) => ({
        audits: await ctx.db.query("organizationAuditEvents").collect(),
        invitations: await Promise.all(seeded.invitationIds.map(async (id) => await ctx.db.get(id))),
        scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
        staffs: await ctx.db
          .query("staffs")
          .withIndex("by_shopId", (q) => q.eq("shopId", seeded.shopId))
          .collect(),
      }));
      expect(state.invitations.every((invitation) => invitation?.reservedSeat)).toBe(true);
      expect(state.staffs).toEqual([]);
      expect(state.audits).toEqual([]);
      expect(state.scheduled).toEqual([]);
    });

    it("削除済み人物を通常追加で再有効化し、旧権限・店舗所属・認証情報を復元せず冪等に追加する", async () => {
      const t = convexTest(schema, modules);
      const seeded = await t.run(async (ctx) => {
        const organization = await seedOrganizationManagerShop(ctx, {
          subject: "removed_manager",
          email: "removed-manager@example.com",
          plan: "standard",
        });
        const now = Date.now();
        const removedUserId = await ctx.db.insert("users", {
          authTokenIdentifier: "https://convex.test|removed_person",
          name: "旧管理者",
          email: "Removed@Example.com",
          emailNormalized: "removed@example.com",
          role: "manager",
          isDeleted: false,
        });
        const removedPersonId = await ctx.db.insert("organizationPeople", {
          organizationId: organization.organizationId,
          userId: removedUserId,
          name: "登録済み人物",
          email: "Removed@Example.com",
          emailNormalized: "removed@example.com",
          status: "removed",
          createdAt: now,
          updatedAt: now,
        });
        const removedMemberId = await ctx.db.insert("organizationMembers", {
          organizationId: organization.organizationId,
          personId: removedPersonId,
          userId: removedUserId,
          status: "removed",
          createdAt: now - 10_000,
          updatedAt: now - 5_000,
        });
        const otherShopId = await ctx.db.insert("shops", {
          organizationId: organization.organizationId,
          name: "旧所属店舗",
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
          regularClosedDays: [],
          isDeleted: false,
        });
        const oldTargetStaffId = await ctx.db.insert("staffs", {
          excludedFromShift: false,
          shopId: organization.shopId,
          organizationId: organization.organizationId,
          organizationPersonId: removedPersonId,
          userId: removedUserId,
          name: "旧店舗表示名",
          email: "removed@example.com",
          emailNormalized: "removed@example.com",
          isDeleted: true,
        });
        const oldOtherStaffId = await ctx.db.insert("staffs", {
          excludedFromShift: false,
          shopId: otherShopId,
          organizationId: organization.organizationId,
          organizationPersonId: removedPersonId,
          userId: removedUserId,
          name: "旧所属表示名",
          email: "removed@example.com",
          emailNormalized: "removed@example.com",
          isDeleted: true,
        });
        const recruitmentId = await ctx.db.insert("recruitments", {
          shopId: organization.shopId,
          periodStart: "2026-07-20",
          periodEnd: "2026-07-26",
          deadline: "2026-07-19",
          shopClosedDates: [],
          status: "open",
          isDeleted: false,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        });
        const revokedAt = now - 1_000;
        const sessionId = await ctx.db.insert("sessions", {
          accessKind: "submit",
          sessionToken: "removed-person-session",
          staffId: oldTargetStaffId,
          shopId: organization.shopId,
          recruitmentId,
          expiresAt: now + 86_400_000,
          revokedAt,
        });
        const magicLinkId = await ctx.db.insert("magicLinks", {
          accessKind: "submit",
          token: "removed-person-magic-link",
          staffId: oldTargetStaffId,
          shopId: organization.shopId,
          recruitmentId,
          expiresAt: now + 86_400_000,
          revokedAt,
        });
        const lineLinkTokenId = await ctx.db.insert("lineLinkTokens", {
          token: "removed-person-line-link",
          staffId: oldTargetStaffId,
          shopId: organization.shopId,
          organizationId: organization.organizationId,
          organizationPersonId: removedPersonId,
          lineLinkGenerationAtIssue: 0,
          expiresAt: now + 86_400_000,
          revokedAt,
        });
        const lineAccountId = await ctx.db.insert("staffLineAccounts", {
          staffId: oldTargetStaffId,
          shopId: organization.shopId,
          lineUserId: "removed-person-line-user",
          linkedAt: now - 20_000,
          following: false,
          isDeleted: true,
        });
        const invitationId = await ctx.db.insert("organizationInvitations", {
          organizationId: organization.organizationId,
          invitedName: "削除済み対象",
          email: "Removed@Example.com",
          emailNormalized: "removed@example.com",
          tokenDigest: "removed-person-invitation",
          status: "revoked",
          inviterMemberId: organization.memberId,
          reservedSeat: false,
          version: 2,
          revokedAt,
          expiresAt: now + 86_400_000,
          createdAt: now - 30_000,
          updatedAt: revokedAt,
        });
        return {
          ...organization,
          invitationId,
          lineAccountId,
          lineLinkTokenId,
          magicLinkId,
          oldOtherStaffId,
          oldTargetStaffId,
          removedMemberId,
          removedPersonId,
          revokedAt,
          sessionId,
        };
      });

      const entries = [{ name: "入力された別名", email: " removed@example.COM " }];
      const requestId = nextStaffAddRequestId();
      const asManager = t.withIdentity({ subject: "removed_manager" });
      const added = await asManager.mutation(api.staff.mutations.addStaffs, {
        expectedOrganizationId: await getTestOrganizationId(t, seeded.shopId),
        shopId: seeded.shopId,
        requestId,
        entries,
      });
      const addedIds = addedStaffIds(added);
      expect(addedIds).toHaveLength(1);
      await expect(
        asManager.mutation(api.staff.mutations.addStaffs, {
          expectedOrganizationId: await getTestOrganizationId(t, seeded.shopId),
          shopId: seeded.shopId,
          requestId,
          entries: [{ name: "異なる再送名", email: "removed@example.com" }],
        }),
      ).rejects.toThrow("以前のスタッフ追加結果を確認できません。\n画面を更新して、もう一度お試しください。");

      const state = await t.run(async (ctx) => ({
        audits: await ctx.db.query("organizationAuditEvents").collect(),
        invitation: await ctx.db.get(seeded.invitationId),
        lineAccount: await ctx.db.get(seeded.lineAccountId),
        lineLinkToken: await ctx.db.get(seeded.lineLinkTokenId),
        magicLink: await ctx.db.get(seeded.magicLinkId),
        member: await ctx.db.get(seeded.removedMemberId),
        newStaff: await ctx.db.get(addedIds[0]),
        oldOtherStaff: await ctx.db.get(seeded.oldOtherStaffId),
        oldTargetStaff: await ctx.db.get(seeded.oldTargetStaffId),
        person: await ctx.db.get(seeded.removedPersonId),
        scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
        session: await ctx.db.get(seeded.sessionId),
        staffs: await ctx.db
          .query("staffs")
          .withIndex("by_organizationId_and_organizationPersonId", (q) =>
            q.eq("organizationId", seeded.organizationId).eq("organizationPersonId", seeded.removedPersonId),
          )
          .collect(),
      }));
      expect(state.person).toMatchObject({ status: "active", name: "入力された別名", email: "removed@example.com" });
      expect(state.newStaff).toMatchObject({
        shopId: seeded.shopId,
        organizationId: seeded.organizationId,
        organizationPersonId: seeded.removedPersonId,
        name: "入力された別名",
        email: "removed@example.com",
        isDeleted: false,
      });
      expect(state.staffs).toHaveLength(3);
      expect(state.oldTargetStaff).toMatchObject({ name: "旧店舗表示名", isDeleted: true });
      expect(state.oldOtherStaff).toMatchObject({ name: "旧所属表示名", isDeleted: true });
      expect(state.member?.status).toBe("removed");
      expect(state.session?.revokedAt).toBe(seeded.revokedAt);
      expect(state.magicLink?.revokedAt).toBe(seeded.revokedAt);
      expect(state.lineLinkToken?.revokedAt).toBe(seeded.revokedAt);
      expect(state.lineAccount?.isDeleted).toBe(true);
      expect(state.invitation).toMatchObject({ status: "revoked", reservedSeat: false, version: 2 });
      expect(state.scheduled).toHaveLength(3);
      expect(state.audits.filter((audit) => audit.action === "organization.staff_added")).toHaveLength(1);
      expect(state.audits.filter((audit) => audit.action === "organization.person_reactivated")).toHaveLength(1);
    });

    it.each([
      ["アカウント削除受付済み", "requested"],
      ["アカウント削除済み", "deleted"],
    ] as const)("%sの旧人物を再利用せず、新しい人物として通常追加する", async (_label, userState) => {
      const t = convexTest(schema, modules);
      const seeded = await t.run(async (ctx) => {
        const organization = await seedOrganizationManagerShop(ctx, {
          subject: "requested_reactivation_manager",
          email: "requested-reactivation-manager@example.com",
          plan: "standard",
        });
        const removedUserId = await seedUser(ctx, "requested_reactivation_person", "requested-person@example.com");
        const now = Date.now();
        await ctx.db.patch(
          removedUserId,
          userState === "requested" ? { accountDeletionRequestedAt: now } : { isDeleted: true },
        );
        const removedPersonId = await ctx.db.insert("organizationPeople", {
          organizationId: organization.organizationId,
          userId: removedUserId,
          name: "削除受付済み人物",
          email: "requested-person@example.com",
          emailNormalized: "requested-person@example.com",
          status: "removed",
          createdAt: now,
          updatedAt: now,
        });
        return { ...organization, removedPersonId, removedUserId };
      });
      const actor = t.withIdentity({ subject: "requested_reactivation_manager" });
      const requestId = nextStaffAddRequestId();
      const entries = [{ name: "再追加入力", email: "requested-person@example.com" }];
      const added = await actor.mutation(api.staff.mutations.addStaffs, {
        expectedOrganizationId: await getTestOrganizationId(t, seeded.shopId),
        shopId: seeded.shopId,
        requestId,
        entries,
      });
      const staffIds = addedStaffIds(added);
      expect(staffIds).toHaveLength(1);

      const state = await t.run(async (ctx) => ({
        people: await ctx.db
          .query("organizationPeople")
          .withIndex("by_organizationId_and_emailNormalized", (q) =>
            q.eq("organizationId", seeded.organizationId).eq("emailNormalized", "requested-person@example.com"),
          )
          .collect(),
        oldPerson: await ctx.db.get(seeded.removedPersonId),
        newStaff: await ctx.db.get(staffIds[0]),
        user: await ctx.db.get(seeded.removedUserId),
        audits: await ctx.db.query("organizationAuditEvents").collect(),
        scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
      }));
      const activePerson = state.people.find((person) => person.status === "active");
      expect(state.people).toHaveLength(2);
      expect(state.oldPerson).toMatchObject({
        _id: seeded.removedPersonId,
        userId: seeded.removedUserId,
        status: "removed",
        name: "削除受付済み人物",
      });
      expect(activePerson).toMatchObject({
        name: "再追加入力",
        email: "requested-person@example.com",
        status: "active",
      });
      expect(activePerson?._id).not.toBe(seeded.removedPersonId);
      expect(activePerson?.userId).toBeUndefined();
      expect(state.newStaff).toMatchObject({
        organizationPersonId: activePerson?._id,
        name: "再追加入力",
        email: "requested-person@example.com",
        isDeleted: false,
      });
      expect(state.newStaff?.userId).toBeUndefined();
      expect(state.user).toMatchObject(
        userState === "requested"
          ? { isDeleted: false, accountDeletionRequestedAt: expect.any(Number) }
          : { isDeleted: true },
      );
      expect(state.audits.filter((audit) => audit.action === "organization.staff_added")).toEqual([
        expect.objectContaining({ targetId: staffIds[0], fromState: "new" }),
      ]);
      expect(state.audits.filter((audit) => audit.action === "organization.person_reactivated")).toEqual([]);
      expect(state.scheduled).toHaveLength(3);
    });

    it("削除済み人物に有効な管理者所属が残る不整合では権限を暗黙復元しない", async () => {
      const t = convexTest(schema, modules);
      const seeded = await t.run(async (ctx) => {
        const organization = await seedOrganizationManagerShop(ctx, {
          subject: "stale_manager_membership_owner",
          email: "stale-owner@example.com",
          plan: "standard",
        });
        const now = Date.now();
        const userId = await ctx.db.insert("users", {
          authTokenIdentifier: "https://convex.test|stale_manager_membership",
          name: "旧管理者",
          email: "stale-manager@example.com",
          emailNormalized: "stale-manager@example.com",
          role: "manager",
          isDeleted: false,
        });
        const personId = await ctx.db.insert("organizationPeople", {
          organizationId: organization.organizationId,
          userId,
          name: "旧管理者",
          email: "stale-manager@example.com",
          emailNormalized: "stale-manager@example.com",
          status: "removed",
          createdAt: now,
          updatedAt: now,
        });
        const memberId = await ctx.db.insert("organizationMembers", {
          organizationId: organization.organizationId,
          personId,
          userId,
          status: "active",
          createdAt: now,
          updatedAt: now,
        });
        return { ...organization, memberId, personId };
      });

      await expect(
        t.withIdentity({ subject: "stale_manager_membership_owner" }).mutation(api.staff.mutations.addStaffs, {
          expectedOrganizationId: await getTestOrganizationId(t, seeded.shopId),
          shopId: seeded.shopId,
          requestId: nextStaffAddRequestId(),
          entries: [{ name: "再追加", email: "stale-manager@example.com" }],
        }),
      ).rejects.toThrow("ユーザーの管理者権限を確認できません。\nユーザー画面で登録内容を確認してください。");

      const state = await t.run(async (ctx) => ({
        member: await ctx.db.get(seeded.memberId),
        person: await ctx.db.get(seeded.personId),
        staffs: await ctx.db
          .query("staffs")
          .withIndex("by_shopId", (q) => q.eq("shopId", seeded.shopId))
          .collect(),
      }));
      expect(state.person?.status).toBe("removed");
      expect(state.member?.status).toBe("active");
      expect(state.staffs).toEqual([]);
    });

    it("削除済み人物に有効なcanonical LINE連携が残る不整合では連携を暗黙復元しない", async () => {
      const t = convexTest(schema, modules);
      const seeded = await t.run(async (ctx) => {
        const organization = await seedOrganizationManagerShop(ctx, {
          subject: "stale_line_link_owner",
          email: "stale-line-owner@example.com",
          plan: "standard",
        });
        const now = Date.now();
        const personId = await ctx.db.insert("organizationPeople", {
          organizationId: organization.organizationId,
          name: "旧LINE連携人物",
          email: "stale-line-person@example.com",
          emailNormalized: "stale-line-person@example.com",
          status: "removed",
          createdAt: now,
          updatedAt: now,
        });
        const line = await seedOrganizationPersonLineLink(ctx, {
          organizationId: organization.organizationId,
          organizationPersonId: personId,
          lineUserId: "U_stale_removed_person",
        });
        return { ...organization, ...line, personId };
      });

      await expect(
        t.withIdentity({ subject: "stale_line_link_owner" }).mutation(api.staff.mutations.addStaffs, {
          expectedOrganizationId: await getTestOrganizationId(t, seeded.shopId),
          shopId: seeded.shopId,
          requestId: nextStaffAddRequestId(),
          entries: [{ name: "通常追加", email: "stale-line-person@example.com" }],
        }),
      ).rejects.toThrow("ユーザーのLINE連携状態を確認できません。\nユーザー画面で登録内容を確認してください。");

      const state = await t.run(async (ctx) => ({
        audits: await ctx.db.query("organizationAuditEvents").collect(),
        link: await ctx.db.get(seeded.organizationPersonLineLinkId),
        person: await ctx.db.get(seeded.personId),
        provider: await ctx.db.get(seeded.lineProviderUserId),
        scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
        staffs: await ctx.db
          .query("staffs")
          .withIndex("by_shopId", (q) => q.eq("shopId", seeded.shopId))
          .collect(),
      }));
      expect(state.person?.status).toBe("removed");
      expect(state.link?.isDeleted).toBe(false);
      expect(state.provider?.isDeleted).toBe(false);
      expect(state.staffs).toEqual([]);
      expect(state.audits).toEqual([]);
      expect(state.scheduled).toEqual([]);
    });

    it("削除済み人物の通常追加時に予約枠を含む最新の利用人数上限を検証する", async () => {
      const t = convexTest(schema, modules);
      const seeded = await t.run(async (ctx) => {
        const organization = await seedOrganizationManagerShop(ctx, {
          subject: "reactivation_capacity_manager",
          email: "reactivation-capacity-manager@example.com",
          plan: "free",
        });
        const now = Date.now();
        for (let index = 0; index < 3; index += 1) {
          const email = `capacity-existing-${index}@example.com`;
          const personId = await ctx.db.insert("organizationPeople", {
            organizationId: organization.organizationId,
            name: `既存人物${index}`,
            email,
            emailNormalized: email,
            status: "active",
            createdAt: now,
            updatedAt: now,
          });
          await ctx.db.insert("staffs", {
            excludedFromShift: false,
            shopId: organization.shopId,
            organizationId: organization.organizationId,
            organizationPersonId: personId,
            name: `既存人物${index}`,
            email,
            emailNormalized: email,
            isDeleted: false,
          });
        }
        const removedPersonId = await ctx.db.insert("organizationPeople", {
          organizationId: organization.organizationId,
          name: "再有効化候補",
          email: "capacity-reactivation@example.com",
          emailNormalized: "capacity-reactivation@example.com",
          status: "removed",
          createdAt: now,
          updatedAt: now,
        });
        await ctx.db.insert("organizationInvitations", {
          organizationId: organization.organizationId,
          invitedName: "予約対象",
          email: "reserved-seat@example.com",
          emailNormalized: "reserved-seat@example.com",
          tokenDigest: "reserved-seat-for-reactivation",
          status: "issued",
          inviterMemberId: organization.memberId,
          reservedSeat: true,
          version: 1,
          expiresAt: now + 86_400_000,
          createdAt: now,
          updatedAt: now,
        });
        return { ...organization, removedPersonId };
      });
      const entries = [{ name: "再有効化候補", email: "capacity-reactivation@example.com" }];
      const requestId = nextStaffAddRequestId();
      const asManager = t.withIdentity({ subject: "reactivation_capacity_manager" });
      await expect(
        asManager.mutation(api.staff.mutations.addStaffs, {
          expectedOrganizationId: await getTestOrganizationId(t, seeded.shopId),
          shopId: seeded.shopId,
          requestId,
          entries,
        }),
      ).rejects.toThrow("利用人数が現在のプラン上限を超えます");

      const state = await t.run(async (ctx) => ({
        audits: await ctx.db.query("organizationAuditEvents").collect(),
        person: await ctx.db.get(seeded.removedPersonId),
        scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
        staffs: await ctx.db
          .query("staffs")
          .withIndex("by_shopId", (q) => q.eq("shopId", seeded.shopId))
          .collect(),
      }));
      expect(state.person?.status).toBe("removed");
      expect(state.staffs).toHaveLength(3);
      expect(state.audits).toEqual([]);
      expect(state.scheduled).toEqual([]);
    });

    it("人物IDで同一店舗の既存スタッフを検出し、メール表示が違っても重複追加しない", async () => {
      const t = convexTest(schema, modules);
      const seeded = await t.run(async (ctx) => {
        const organization = await seedOrganizationManagerShop(ctx, {
          subject: "person_duplicate_manager",
          email: "person-duplicate-manager@example.com",
        });
        const now = Date.now();
        const personId = await ctx.db.insert("organizationPeople", {
          organizationId: organization.organizationId,
          name: "同一人物",
          email: "person@example.com",
          emailNormalized: "person@example.com",
          status: "active",
          createdAt: now,
          updatedAt: now,
        });
        await ctx.db.insert("staffs", {
          excludedFromShift: false,
          shopId: organization.shopId,
          organizationId: organization.organizationId,
          organizationPersonId: personId,
          name: "店舗表示名",
          email: "shop-alias@example.com",
          emailNormalized: "shop-alias@example.com",
          isDeleted: false,
        });
        return organization;
      });

      await expect(
        t.withIdentity({ subject: "person_duplicate_manager" }).mutation(api.staff.mutations.addStaffs, {
          expectedOrganizationId: await getTestOrganizationId(t, seeded.shopId),
          shopId: seeded.shopId,
          requestId: nextStaffAddRequestId(),
          entries: [{ name: "重複人物", email: "person@example.com" }],
        }),
      ).rejects.toThrow("このユーザーはすでに店舗へ登録されています。");

      const staffs = await t.run(async (ctx) =>
        ctx.db
          .query("staffs")
          .withIndex("by_shopId", (q) => q.eq("shopId", seeded.shopId))
          .collect(),
      );
      expect(staffs).toHaveLength(1);
    });

    it("追加スタッフ向けLINE案内に人物snapshotを付け、予約後のLINE連携では送信しない", async () => {
      const t = convexTest(schema, modules);

      const shopId = await t.run(async (ctx) => {
        const seeded = await seedManagerShop(ctx, {
          subject: "user_mgr",
          email: "mgr@example.com",
          shopName: "テスト店舗",
        });
        return seeded.shopId;
      });

      const [staffId] = addedStaffIds(
        await t.withIdentity({ subject: "user_mgr" }).mutation(api.staff.mutations.addStaffs, {
          expectedOrganizationId: await getTestOrganizationId(t, shopId),
          shopId,
          requestId: nextStaffAddRequestId(),
          entries: [{ name: "田中太郎", email: "tanaka@example.com" }],
        }),
      );

      const state = await t.run(async (ctx) => ({
        staff: await ctx.db.get(staffId),
        scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
      }));
      expect(
        state.scheduled.some(
          (job) => job.name === "legal/actions:sendStaffConsentEmail" && job.args[0]?.staffId === staffId,
        ),
      ).toBe(true);
      if (!state.staff?.organizationId || !state.staff.organizationPersonId) {
        throw new Error("追加スタッフのcanonical scopeがありません");
      }
      const { organizationId, organizationPersonId } = state.staff;
      const inviteJob = state.scheduled.find(
        (job) => job.name === "line/actions:sendInviteEmail" && job.args[0]?.staffId === staffId,
      );
      expect(inviteJob?.args[0]).toMatchObject({
        staffId,
        organizationPersonId,
        lineLinkGenerationAtSchedule: 0,
      });

      await t.run(async (ctx) => {
        await seedOrganizationPersonLineLink(ctx, {
          organizationId,
          organizationPersonId,
          lineUserId: "U_linked_after_staff_invite_schedule",
        });
      });
      await t.action(internal.line.actions.sendInviteEmail, {
        staffId,
        organizationPersonId,
        lineLinkGenerationAtSchedule: 0,
      });
      const afterAction = await t.run(async (ctx) => ({
        lineLinkTokens: await ctx.db.query("lineLinkTokens").collect(),
        outbox: await ctx.db.query("notificationOutbox").collect(),
      }));
      expect(afterAction).toEqual({ lineLinkTokens: [], outbox: [] });
    });

    it("空の name のエントリはスキップする", async () => {
      const t = convexTest(schema, modules);

      const shopId = await t.run(async (ctx) => {
        const seeded = await seedManagerShop(ctx, {
          subject: "user_mgr",
          email: "mgr@example.com",
          shopName: "テスト店舗",
        });
        return seeded.shopId;
      });

      const ids = addedStaffIds(
        await t.withIdentity({ subject: "user_mgr" }).mutation(api.staff.mutations.addStaffs, {
          expectedOrganizationId: await getTestOrganizationId(t, shopId),
          shopId,
          requestId: nextStaffAddRequestId(),
          entries: [
            { name: "田中太郎", email: "tanaka@example.com" },
            { name: "", email: "" },
            { name: "  ", email: "" },
          ],
        }),
      );

      expect(ids).toHaveLength(1);
    });

    it("一度に50件を超えるスタッフ追加は拒否する", async () => {
      const t = convexTest(schema, modules);
      const shopId = await t.run(async (ctx) => {
        const seeded = await seedManagerShop(ctx, {
          subject: "user_mgr",
          email: "mgr@example.com",
          shopName: "テスト店舗",
        });
        return seeded.shopId;
      });

      await expect(
        t.withIdentity({ subject: "user_mgr" }).mutation(api.staff.mutations.addStaffs, {
          expectedOrganizationId: await getTestOrganizationId(t, shopId),
          shopId,
          requestId: nextStaffAddRequestId(),
          entries: Array.from({ length: STAFF_ADD_ENTRIES_MAX + 1 }, (_, index) => ({
            name: `スタッフ${index + 1}`,
            email: `staff-${index + 1}@example.com`,
          })),
        }),
      ).rejects.toThrow("スタッフは一度に50件まで追加できます");
    });

    it("Businessの残り利用枠までスタッフを一括追加できる", async () => {
      const t = convexTest(schema, modules);
      const shopId = await t.run(async (ctx) => {
        const seeded = await seedManagerShop(ctx, {
          subject: "user_mgr",
          email: "mgr@example.com",
          shopName: "テスト店舗",
        });
        return seeded.shopId;
      });
      const remainingPeopleCapacity = ORGANIZATION_PLAN_LIMITS.pro.maxPeople - 1;
      const entries = Array.from({ length: remainingPeopleCapacity }, (_, index) => ({
        name: `スタッフ${index + 1}`,
        email: `staff-${index + 1}@example.com`,
      }));

      const ids = addedStaffIds(
        await t.withIdentity({ subject: "user_mgr" }).mutation(api.staff.mutations.addStaffs, {
          expectedOrganizationId: await getTestOrganizationId(t, shopId),
          shopId,
          requestId: nextStaffAddRequestId(),
          entries,
        }),
      );

      expect(ids).toHaveLength(remainingPeopleCapacity);
      const staffs = await t.run(async (ctx) =>
        ctx.db
          .query("staffs")
          .withIndex("by_shopId", (q) => q.eq("shopId", shopId))
          .collect(),
      );
      expect(staffs).toHaveLength(remainingPeopleCapacity);
    });

    it("過長名・制御文字入り名・不正メールはスタッフ追加で拒否する", async () => {
      const t = convexTest(schema, modules);
      const shopId = await t.run(async (ctx) => {
        const seeded = await seedManagerShop(ctx, {
          subject: "user_mgr",
          email: "mgr@example.com",
          shopName: "テスト店舗",
        });
        return seeded.shopId;
      });
      const asManager = t.withIdentity({ subject: "user_mgr" });

      await expect(
        asManager.mutation(api.staff.mutations.addStaffs, {
          expectedOrganizationId: await getTestOrganizationId(t, shopId),
          shopId,
          requestId: nextStaffAddRequestId(),
          entries: [{ name: "あ".repeat(PERSON_NAME_MAX_LENGTH + 1), email: "too-long@example.com" }],
        }),
      ).rejects.toThrow("名前は80文字以内で入力してください");
      await expect(
        asManager.mutation(api.staff.mutations.addStaffs, {
          expectedOrganizationId: await getTestOrganizationId(t, shopId),
          shopId,
          requestId: nextStaffAddRequestId(),
          entries: [{ name: "田中\n太郎", email: "control@example.com" }],
        }),
      ).rejects.toThrow("名前に使用できない文字が含まれています");
      await expect(
        asManager.mutation(api.staff.mutations.addStaffs, {
          expectedOrganizationId: await getTestOrganizationId(t, shopId),
          shopId,
          requestId: nextStaffAddRequestId(),
          entries: [{ name: "不正メール", email: "not-email" }],
        }),
      ).rejects.toThrow("メールアドレスの形式で入力してください");
    });

    it("既存メールアドレスの重複はエラーにしてスタッフを追加しない", async () => {
      const t = convexTest(schema, modules);

      const shopId = await t.run(async (ctx) => {
        const { shopId: id } = await seedManagerShop(ctx, {
          subject: "user_mgr",
          email: "mgr@example.com",
          shopName: "テスト店舗",
        });
        await seedStaff(ctx, {
          shopId: id,
          name: "既存スタッフ",
          email: "existing@example.com",
          isDeleted: false,
        });
        return id;
      });

      await expect(
        t.withIdentity({ subject: "user_mgr" }).mutation(api.staff.mutations.addStaffs, {
          expectedOrganizationId: await getTestOrganizationId(t, shopId),
          shopId,
          requestId: nextStaffAddRequestId(),
          entries: [
            { name: "新規スタッフ", email: "new@example.com" },
            { name: "重複スタッフ", email: "existing@example.com" },
          ],
        }),
      ).rejects.toThrow("このメールアドレスはすでに登録されています。");

      const allStaffs = await t.run(async (ctx) =>
        ctx.db
          .query("staffs")
          .withIndex("by_shopId", (q) => q.eq("shopId", shopId))
          .collect(),
      );
      expect(allStaffs).toHaveLength(1);
    });

    it("同じメールの再実行ではエラーにしてスタッフと通知予約を増やさない", async () => {
      const t = convexTest(schema, modules);

      const shopId = await t.run(async (ctx) => {
        const { shopId: id } = await seedManagerShop(ctx, {
          subject: "user_mgr",
          email: "mgr@example.com",
          shopName: "テスト店舗",
        });
        return id;
      });
      const asManager = t.withIdentity({ subject: "user_mgr" });

      const firstIds = addedStaffIds(
        await asManager.mutation(api.staff.mutations.addStaffs, {
          expectedOrganizationId: await getTestOrganizationId(t, shopId),
          shopId,
          requestId: nextStaffAddRequestId(),
          entries: [{ name: "田中太郎", email: "tanaka@example.com" }],
        }),
      );
      await expect(
        asManager.mutation(api.staff.mutations.addStaffs, {
          expectedOrganizationId: await getTestOrganizationId(t, shopId),
          shopId,
          requestId: nextStaffAddRequestId(),
          entries: [{ name: "田中太郎", email: "Tanaka@Example.com" }],
        }),
      ).rejects.toThrow("このメールアドレスはすでに登録されています。");

      expect(firstIds).toHaveLength(1);
      const state = await t.run(async (ctx) => {
        const staffs = await ctx.db
          .query("staffs")
          .withIndex("by_shopId", (q) => q.eq("shopId", shopId))
          .collect();
        const scheduled = await ctx.db.system.query("_scheduled_functions").collect();
        return { staffs, scheduled };
      });
      expect(state.staffs).toHaveLength(1);
      expect(state.scheduled.filter((job) => job.name === "legal/actions:sendStaffConsentEmail")).toHaveLength(1);
      expect(state.scheduled.filter((job) => job.name === "line/actions:sendInviteEmail")).toHaveLength(1);
      expect(
        state.scheduled.filter(
          (job) => job.name === "notification/actions:sendOpenRecruitmentNotificationEmailsForStaff",
        ),
      ).toHaveLength(1);
    });

    it("承認待ち申請と同じメールアドレスはエラーにする", async () => {
      const t = convexTest(schema, modules);

      const shopId = await t.run(async (ctx) => {
        const { shopId } = await seedManagerShop(ctx, {
          subject: "user_mgr",
          email: "mgr@example.com",
          shopName: "テスト店舗",
        });
        const versions = getLegalConsentVersions("staff");
        const now = Date.now();
        await ctx.db.insert("staffRegistrationRequests", {
          shopId,
          name: "承認待ちスタッフ",
          email: "pending@example.com",
          emailNormalized: "pending@example.com",
          status: "pending",
          ...versions,
          consentedAt: now,
          createdAt: now,
        });
        return shopId;
      });

      await expect(
        t.withIdentity({ subject: "user_mgr" }).mutation(api.staff.mutations.addStaffs, {
          expectedOrganizationId: await getTestOrganizationId(t, shopId),
          shopId,
          requestId: nextStaffAddRequestId(),
          entries: [{ name: "新規スタッフ", email: "Pending@Example.com" }],
        }),
      ).rejects.toThrow("このメールアドレスはスタッフ登録の承認待ちです。");
    });

    it("追加スタッフ向け通知データは提出期限前のopen募集だけを返す", async () => {
      const t = convexTest(schema, modules);

      const ids = await t.run(async (ctx) => {
        const { shopId } = await seedManagerShop(ctx, {
          subject: "user_mgr",
          email: "mgr@example.com",
          shopName: "テスト店舗",
        });
        const staffId = await seedStaff(ctx, {
          shopId,
          name: "追加スタッフ",
          email: "added@example.com",
          isDeleted: false,
        });
        const openRecruitmentId = await ctx.db.insert("recruitments", {
          shopId,
          periodStart: dateFromToday(7),
          periodEnd: dateFromToday(13),
          deadline: todayJST(),
          shopClosedDates: [],
          status: "open",
          isDeleted: false,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        });
        await ctx.db.insert("recruitments", {
          shopId,
          periodStart: dateFromToday(14),
          periodEnd: dateFromToday(20),
          deadline: dateFromToday(5),
          shopClosedDates: [],
          status: "confirmed",
          isDeleted: false,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        });
        await ctx.db.insert("recruitments", {
          shopId,
          periodStart: dateFromToday(-14),
          periodEnd: dateFromToday(-8),
          deadline: dateFromToday(-15),
          shopClosedDates: [],
          status: "open",
          isDeleted: false,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        });
        await ctx.db.insert("recruitments", {
          shopId,
          periodStart: dateFromToday(21),
          periodEnd: dateFromToday(27),
          deadline: dateFromToday(10),
          shopClosedDates: [],
          status: "open",
          isDeleted: true,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        });
        return { staffId, openRecruitmentId };
      });

      const data = await t.query(internal.notification.queries.getOpenRecruitmentNotificationDataForStaff, {
        staffId: ids.staffId,
      });

      expect(data?.recruitments.map((r) => r.recruitmentId)).toEqual([ids.openRecruitmentId]);
    });

    it("募集通知の手動再送は対象募集がない場合に予約せず理由を返す", async () => {
      const t = convexTest(schema, modules);

      const { shopId, staffId } = await t.run(async (ctx) => {
        const { shopId } = await seedManagerShop(ctx, {
          subject: "user_mgr",
          email: "mgr@example.com",
          shopName: "テスト店舗",
        });
        const staffId = await seedStaff(ctx, {
          shopId,
          name: "通知スタッフ",
          email: "notify@example.com",
          isDeleted: false,
        });
        await ctx.db.insert("recruitments", {
          shopId,
          periodStart: dateFromToday(7),
          periodEnd: dateFromToday(13),
          deadline: dateFromToday(-1),
          shopClosedDates: [],
          status: "open",
          isDeleted: false,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        });
        return { shopId, staffId };
      });

      const result = await t
        .withIdentity({ subject: "user_mgr" })
        .mutation(api.staff.mutations.sendOpenRecruitmentNotifications, {
          expectedOrganizationId: await getTestOrganizationId(t, shopId),
          shopId,
          staffId,
        });

      const scheduled = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
      expect(result).toEqual({ scheduled: false, reason: "noEligibleRecruitments" });
      expect(
        scheduled.some((job) => job.name === "notification/actions:sendOpenRecruitmentNotificationsForStaff"),
      ).toBe(false);
    });

    it("募集通知の手動再送は対象募集がある場合だけ予約する", async () => {
      const t = convexTest(schema, modules);

      const { shopId, staffId } = await t.run(async (ctx) => {
        const { shopId } = await seedManagerShop(ctx, {
          subject: "user_mgr",
          email: "mgr@example.com",
          shopName: "テスト店舗",
        });
        const staffId = await seedStaff(ctx, {
          shopId,
          name: "通知スタッフ",
          email: "notify@example.com",
          isDeleted: false,
        });
        await ctx.db.insert("recruitments", {
          shopId,
          periodStart: dateFromToday(7),
          periodEnd: dateFromToday(13),
          deadline: todayJST(),
          shopClosedDates: [],
          status: "open",
          isDeleted: false,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        });
        return { shopId, staffId };
      });

      const result = await t
        .withIdentity({ subject: "user_mgr" })
        .mutation(api.staff.mutations.sendOpenRecruitmentNotifications, {
          expectedOrganizationId: await getTestOrganizationId(t, shopId),
          shopId,
          staffId,
        });

      const scheduled = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
      expect(result).toEqual({ scheduled: true });
      expect(
        scheduled.some((job) => job.name === "notification/actions:sendOpenRecruitmentNotificationsForStaff"),
      ).toBe(true);
    });

    it.each([
      ["未認証", "unauthenticated", "Unauthenticated"],
      ["他店舗スタッフ", "otherShop", "Not found"],
      ["削除済みスタッフ", "deletedStaff", "Not found"],
    ] as const)("%sには募集通知を予約しない", async (_label, scenario, expectedError) => {
      const t = convexTest(schema, modules);
      const actorSubject = `open_recruitment_notification_${scenario}_manager`;
      const { managerShopId, staffId } = await t.run(async (ctx) => {
        const { shopId: managerShopId } = await seedManagerShop(ctx, {
          subject: actorSubject,
          email: `${actorSubject}@example.com`,
          shopName: "通知元店舗",
        });
        const staffShopId = scenario === "otherShop" ? await seedShop(ctx, "他店舗") : managerShopId;
        const staffId = await seedStaff(ctx, {
          shopId: staffShopId,
          name: "通知対象スタッフ",
          email: "open-recruitment-staff@example.com",
          isDeleted: scenario === "deletedStaff",
        });
        await ctx.db.insert("recruitments", {
          shopId: staffShopId,
          periodStart: dateFromToday(7),
          periodEnd: dateFromToday(13),
          deadline: todayJST(),
          shopClosedDates: [],
          status: "open",
          isDeleted: false,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        });
        return { managerShopId, staffId };
      });

      const request = {
        expectedOrganizationId: await getTestOrganizationId(t, managerShopId),
        shopId: managerShopId,
        staffId,
      };
      const mutation =
        scenario === "unauthenticated"
          ? t.mutation(api.staff.mutations.sendOpenRecruitmentNotifications, request)
          : t
              .withIdentity({ subject: actorSubject })
              .mutation(api.staff.mutations.sendOpenRecruitmentNotifications, request);
      await expect(mutation).rejects.toThrow(expectedError);

      const scheduled = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
      expect(
        scheduled.filter((job) => job.name === "notification/actions:sendOpenRecruitmentNotificationsForStaff"),
      ).toHaveLength(0);
    });
  });

  describe("addOrganizationPersonToShop", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("選択した同一人物を別店舗へ一度だけ追加し、人物と権限を複製しない", async () => {
      const t = convexTest(schema, modules);
      const seeded = await t.run(async (ctx) => {
        const base = await seedOrganizationManagerShop(ctx, {
          subject: "organization_person_add_manager",
          email: "owner@example.com",
          plan: "standard",
        });
        const targetShopId = await ctx.db.insert("shops", {
          organizationId: base.organizationId,
          name: "追加先店舗",
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
          regularClosedDays: [],
          isDeleted: false,
        });
        const now = Date.now();
        const targetPersonId = await ctx.db.insert("organizationPeople", {
          organizationId: base.organizationId,
          name: "共通スタッフ",
          email: "Shared-Person@Example.com",
          emailNormalized: "shared-person@example.com",
          status: "active",
          createdAt: now,
          updatedAt: now,
        });
        const sourceStaffId = await ctx.db.insert("staffs", {
          excludedFromShift: false,
          shopId: base.shopId,
          organizationId: base.organizationId,
          organizationPersonId: targetPersonId,
          name: "旧店舗表示名",
          email: "shared-person@example.com",
          emailNormalized: "shared-person@example.com",
          isDeleted: false,
        });
        await ctx.db.insert("staffLineAccounts", {
          staffId: sourceStaffId,
          shopId: base.shopId,
          lineUserId: "U_source_staff",
          linkedAt: now,
          following: true,
          isDeleted: false,
        });
        await seedOrganizationPersonLineLink(ctx, {
          organizationId: base.organizationId,
          organizationPersonId: targetPersonId,
          lineUserId: "U_source_staff",
          following: true,
        });
        return { ...base, sourceStaffId, targetPersonId, targetShopId };
      });
      const args = {
        expectedOrganizationId: await getTestOrganizationId(t, seeded.targetShopId),
        shopId: seeded.targetShopId,
        personId: seeded.targetPersonId,
        requestId: "organization-person-add",
      };
      const asManager = t.withIdentity({ subject: "organization_person_add_manager" });

      const result = await asManager.mutation(api.staff.mutations.addOrganizationPersonToShop, args);
      await expect(asManager.mutation(api.staff.mutations.addOrganizationPersonToShop, args)).resolves.toEqual(result);

      const state = await t.run(async (ctx) => ({
        audits: (await ctx.db.query("organizationAuditEvents").collect()).filter(
          (audit) => audit.organizationId === seeded.organizationId,
        ),
        lineAccounts: await ctx.db.query("staffLineAccounts").collect(),
        memberships: await ctx.db
          .query("organizationMembers")
          .withIndex("by_organizationId_and_personId", (q) =>
            q.eq("organizationId", seeded.organizationId).eq("personId", seeded.targetPersonId),
          )
          .collect(),
        people: await ctx.db
          .query("organizationPeople")
          .withIndex("by_organizationId_and_emailNormalized", (q) => q.eq("organizationId", seeded.organizationId))
          .collect(),
        scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
        sourceStaff: await ctx.db.get(seeded.sourceStaffId),
        targetStaff: await ctx.db.get(result.staffId),
        targetStaffs: await ctx.db
          .query("staffs")
          .withIndex("by_organizationId_and_organizationPersonId", (q) =>
            q.eq("organizationId", seeded.organizationId).eq("organizationPersonId", seeded.targetPersonId),
          )
          .collect(),
      }));
      expect(state.people).toHaveLength(2);
      expect(state.memberships).toEqual([]);
      expect(state.targetStaff).toMatchObject({
        _id: result.staffId,
        shopId: seeded.targetShopId,
        organizationId: seeded.organizationId,
        organizationPersonId: seeded.targetPersonId,
        name: "共通スタッフ",
        email: "shared-person@example.com",
        emailNormalized: "shared-person@example.com",
        isDeleted: false,
      });
      expect(state.sourceStaff).toMatchObject({
        _id: seeded.sourceStaffId,
        shopId: seeded.shopId,
        name: "旧店舗表示名",
      });
      expect(state.targetStaffs.map((staff) => staff.shopId).sort()).toEqual(
        [seeded.shopId, seeded.targetShopId].sort(),
      );
      expect(state.lineAccounts).toHaveLength(1);
      expect(state.lineAccounts[0]).toMatchObject({ staffId: seeded.sourceStaffId, shopId: seeded.shopId });
      expect(
        state.scheduled
          .map((job) => ({ name: job.name, args: job.args }))
          .sort((left, right) => left.name.localeCompare(right.name)),
      ).toEqual(
        [
          {
            name: "legal/actions:sendStaffConsentEmail",
            args: [{ staffId: result.staffId, organizationBillingVersionAtOrigin: 1 }],
          },
          {
            name: "notification/actions:sendOpenRecruitmentNotificationEmailsForStaff",
            args: [{ staffId: result.staffId, organizationBillingVersionAtOrigin: 1 }],
          },
        ].sort((left, right) => left.name.localeCompare(right.name)),
      );
      expect(state.audits).toHaveLength(1);
      expect(state.audits[0]).toMatchObject({
        action: "organization.staff_added",
        targetKind: "staff",
        targetId: result.staffId,
      });
    });

    it("同じ店舗の削除済み所属から再追加できる", async () => {
      const t = convexTest(schema, modules);
      const ids = await t.run(async (ctx) => {
        const base = await seedOrganizationManagerShop(ctx, {
          subject: "organization_person_same_shop_readd_manager",
          plan: "pro",
        });
        const personId = await seedMembershipChangePerson(ctx, {
          organizationId: base.organizationId,
          name: "同店舗再追加スタッフ",
          email: "organization-person-same-shop-readd@example.com",
        });
        const removedStaffId = await ctx.db.insert("staffs", {
          excludedFromShift: false,
          shopId: base.shopId,
          organizationId: base.organizationId,
          organizationPersonId: personId,
          name: "同店舗再追加スタッフ",
          email: "organization-person-same-shop-readd@example.com",
          emailNormalized: "organization-person-same-shop-readd@example.com",
          isDeleted: true,
        });
        return { ...base, personId, removedStaffId };
      });
      const result = await t
        .withIdentity({ subject: "organization_person_same_shop_readd_manager" })
        .mutation(api.staff.mutations.addOrganizationPersonToShop, {
          expectedOrganizationId: await getTestOrganizationId(t, ids.shopId),
          shopId: ids.shopId,
          personId: ids.personId,
          requestId: "organization-person-same-shop-readd",
        });

      const staffs = await t.run(async (ctx) =>
        (
          await ctx.db
            .query("staffs")
            .withIndex("by_organizationId_and_organizationPersonId", (q) =>
              q.eq("organizationId", ids.organizationId).eq("organizationPersonId", ids.personId),
            )
            .collect()
        )
          .map(({ _id, shopId, isDeleted }) => ({ _id, shopId, isDeleted }))
          .sort((left, right) => left._id.localeCompare(right._id)),
      );
      expect(staffs).toEqual(
        [
          { _id: ids.removedStaffId, shopId: ids.shopId, isDeleted: true },
          { _id: result.staffId, shopId: ids.shopId, isDeleted: false },
        ].sort((left, right) => left._id.localeCompare(right._id)),
      );
    });

    it("最後の所属を外してもretained canonical LINEをaddStaffsの再追加先で利用する", async () => {
      const t = convexTest(schema, modules);
      const seeded = await t.run(async (ctx) => {
        const base = await seedOrganizationManagerShop(ctx, {
          subject: "retained_readd_manager",
          plan: "standard",
        });
        const targetShopId = await seedMembershipChangeShop(ctx, base.organizationId, "retained再追加先");
        const personId = await seedMembershipChangePerson(ctx, {
          organizationId: base.organizationId,
          email: "retained-readd@example.com",
        });
        const sourceStaffId = await ctx.db.insert("staffs", {
          excludedFromShift: false,
          shopId: base.shopId,
          organizationId: base.organizationId,
          organizationPersonId: personId,
          name: "retained再追加スタッフ",
          email: "retained-readd@example.com",
          emailNormalized: "retained-readd@example.com",
          isDeleted: false,
        });
        const canonical = await seedOrganizationPersonLineLink(ctx, {
          organizationId: base.organizationId,
          organizationPersonId: personId,
          lineUserId: "U_retained_readd",
          following: false,
        });
        return { ...base, ...canonical, sourceStaffId, targetShopId, personId };
      });
      const actor = t.withIdentity({ subject: "retained_readd_manager" });

      await actor.mutation(api.organization.mutations.removePersonFromShop, {
        shopId: seeded.shopId,
        staffId: seeded.sourceStaffId,
        requestId: "retained-line-remove-last",
      });
      const added = await actor.mutation(api.staff.mutations.addStaffs, {
        expectedOrganizationId: await getTestOrganizationId(t, seeded.targetShopId),
        shopId: seeded.targetShopId,
        requestId: "retained-line-readd",
        entries: [{ name: "再追加表示名", email: "retained-readd@example.com" }],
      });
      const [staffId] = addedStaffIds(added);
      if (!staffId) throw new Error("再追加されたスタッフがありません");

      const state = await t.run(async (ctx) => ({
        link: await ctx.db.get(seeded.organizationPersonLineLinkId),
        provider: await ctx.db.get(seeded.lineProviderUserId),
        sourceStaff: await ctx.db.get(seeded.sourceStaffId),
        staff: await ctx.db.get(staffId),
        targetAccounts: await ctx.db
          .query("staffLineAccounts")
          .withIndex("by_staffId_and_isDeleted", (q) => q.eq("staffId", staffId).eq("isDeleted", false))
          .collect(),
        scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
        analytics: await ctx.db.query("analyticsSourceEvents").collect(),
      }));
      expect(state.sourceStaff?.isDeleted).toBe(true);
      expect(state.staff).toMatchObject({
        _id: staffId,
        organizationPersonId: seeded.personId,
        shopId: seeded.targetShopId,
        isDeleted: false,
      });
      expect(state.link).toMatchObject({
        organizationPersonId: seeded.personId,
        lineProviderUserId: seeded.lineProviderUserId,
        generation: seeded.generation,
        isDeleted: false,
      });
      expect(state.provider).toMatchObject({ lineUserId: "U_retained_readd", following: false, isDeleted: false });
      expect(state.targetAccounts).toEqual([]);
      expect(state.scheduled.some((job) => job.name === "line/actions:sendInviteEmail")).toBe(false);
      expect(state.analytics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            payload: expect.objectContaining({
              kind: "staffMembershipBatch",
              memberships: [expect.objectContaining({ staffId, lineLinked: true, lineFollowing: false })],
            }),
          }),
        ]),
      );
    });

    it("canonical LINEのgeneration不整合ではaddStaffsをrollbackし、LINE案内を予約しない", async () => {
      const t = convexTest(schema, modules);
      const seeded = await t.run(async (ctx) => {
        const base = await seedOrganizationManagerShop(ctx, {
          subject: "canonical_generation_mismatch_manager",
          plan: "standard",
        });
        const targetShopId = await seedMembershipChangeShop(ctx, base.organizationId, "generation不整合追加先");
        const personId = await seedMembershipChangePerson(ctx, {
          organizationId: base.organizationId,
          email: "canonical-generation-mismatch@example.com",
        });
        const sourceStaffId = await ctx.db.insert("staffs", {
          excludedFromShift: false,
          shopId: base.shopId,
          organizationId: base.organizationId,
          organizationPersonId: personId,
          name: "generation不整合スタッフ",
          email: "canonical-generation-mismatch@example.com",
          emailNormalized: "canonical-generation-mismatch@example.com",
          isDeleted: false,
        });
        await seedOrganizationPersonLineLink(ctx, {
          organizationId: base.organizationId,
          organizationPersonId: personId,
          lineUserId: "U_canonical_generation_mismatch",
          following: true,
        });
        await ctx.db.patch(personId, { lineLinkGeneration: 2, updatedAt: Date.now() });
        return { ...base, personId, sourceStaffId, targetShopId };
      });

      await expect(
        t.withIdentity({ subject: "canonical_generation_mismatch_manager" }).mutation(api.staff.mutations.addStaffs, {
          expectedOrganizationId: await getTestOrganizationId(t, seeded.targetShopId),
          shopId: seeded.targetShopId,
          requestId: "canonical-generation-mismatch-add",
          entries: [{ name: "追加されない表示名", email: "canonical-generation-mismatch@example.com" }],
        }),
      ).rejects.toThrow("スタッフのLINE連携状態を確認できません。");

      const state = await t.run(async (ctx) => ({
        sourceStaff: await ctx.db.get(seeded.sourceStaffId),
        targetStaffs: await ctx.db
          .query("staffs")
          .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", seeded.targetShopId).eq("isDeleted", false))
          .collect(),
        lineAccounts: await ctx.db.query("staffLineAccounts").collect(),
        audits: await ctx.db.query("organizationAuditEvents").collect(),
        analytics: await ctx.db.query("analyticsSourceEvents").collect(),
        scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
      }));
      expect(state.sourceStaff).toMatchObject({ _id: seeded.sourceStaffId, isDeleted: false });
      expect(state.targetStaffs).toEqual([]);
      expect(state.lineAccounts).toEqual([]);
      expect(state.audits).toEqual([]);
      expect(state.analytics).toEqual([]);
      expect(state.scheduled).toEqual([]);
    });

    it("別組織の人物IDではスタッフを追加しない", async () => {
      const t = convexTest(schema, modules);
      const seeded = await t.run(async (ctx) => {
        const owner = await seedOrganizationManagerShop(ctx, {
          subject: "organization_person_idor_owner",
          plan: "standard",
        });
        const foreign = await seedOrganizationManagerShop(ctx, {
          subject: "organization_person_idor_foreign",
          plan: "standard",
        });
        return { foreignPersonId: foreign.personId, owner };
      });

      await expect(
        t
          .withIdentity({ subject: "organization_person_idor_owner" })
          .mutation(api.staff.mutations.addOrganizationPersonToShop, {
            expectedOrganizationId: await getTestOrganizationId(t, seeded.owner.shopId),
            shopId: seeded.owner.shopId,
            personId: seeded.foreignPersonId,
            requestId: "organization-person-idor",
          }),
      ).rejects.toThrow("Not found");

      const state = await t.run(async (ctx) => ({
        audits: (await ctx.db.query("organizationAuditEvents").collect()).filter(
          (audit) => audit.organizationId === seeded.owner.organizationId,
        ),
        scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
        staffs: await ctx.db
          .query("staffs")
          .withIndex("by_shopId", (q) => q.eq("shopId", seeded.owner.shopId))
          .collect(),
      }));
      expect(state).toEqual({ audits: [], scheduled: [], staffs: [] });
    });

    it("選択人物のメール正規化が不整合なら別人物を作成しない", async () => {
      const t = convexTest(schema, modules);
      const seeded = await t.run(async (ctx) => {
        const base = await seedOrganizationManagerShop(ctx, {
          subject: "organization_person_invalid_email_manager",
          plan: "standard",
        });
        const now = Date.now();
        const targetPersonId = await ctx.db.insert("organizationPeople", {
          organizationId: base.organizationId,
          name: "不整合スタッフ",
          email: "invalid-person@example.com",
          emailNormalized: "different-person@example.com",
          status: "active",
          createdAt: now,
          updatedAt: now,
        });
        return { ...base, targetPersonId };
      });

      await expect(
        t
          .withIdentity({ subject: "organization_person_invalid_email_manager" })
          .mutation(api.staff.mutations.addOrganizationPersonToShop, {
            expectedOrganizationId: await getTestOrganizationId(t, seeded.shopId),
            shopId: seeded.shopId,
            personId: seeded.targetPersonId,
            requestId: "organization-person-invalid-email",
          }),
      ).rejects.toThrow("Not found");

      const state = await t.run(async (ctx) => ({
        audits: await ctx.db.query("organizationAuditEvents").collect(),
        people: await ctx.db
          .query("organizationPeople")
          .withIndex("by_organizationId_and_emailNormalized", (q) => q.eq("organizationId", seeded.organizationId))
          .collect(),
        scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
        staffs: await ctx.db
          .query("staffs")
          .withIndex("by_shopId", (q) => q.eq("shopId", seeded.shopId))
          .collect(),
      }));
      expect(state.people).toHaveLength(2);
      expect(state.audits).toEqual([]);
      expect(state.scheduled).toEqual([]);
      expect(state.staffs).toEqual([]);
    });
  });

  describe("changeOrganizationPersonShopMemberships", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-08-11T03:00:00+09:00"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it.each([
      ["参照切れ", "dangling"],
      ["削除済み", "deleted"],
      ["削除受付済み", "requested"],
    ] as const)("linked userが%sなら所属解除を副作用なしで拒否する", async (_label, state) => {
      const t = convexTest(schema, modules);
      const subject = `membership_change_linked_user_${state}`;
      const ids = await t.run(async (ctx) => {
        const base = await seedOrganizationManagerShop(ctx, { subject, plan: "standard" });
        const linkedUserId = await seedUser(
          ctx,
          `membership_change_target_${state}`,
          `membership-change-target-${state}@example.com`,
        );
        const personId = await seedMembershipChangePerson(ctx, {
          organizationId: base.organizationId,
          email: `membership-change-target-${state}@example.com`,
          userId: linkedUserId,
        });
        const staffId = await ctx.db.insert("staffs", {
          shopId: base.shopId,
          organizationId: base.organizationId,
          organizationPersonId: personId,
          userId: linkedUserId,
          name: "無効linked user所属",
          email: `membership-change-target-${state}@example.com`,
          emailNormalized: `membership-change-target-${state}@example.com`,
          excludedFromShift: false,
          isDeleted: false,
        });
        return { ...base, linkedUserId, personId, staffId };
      });
      const detail = await getMembershipChangeDetail(t, {
        subject,
        shopId: ids.shopId,
        personId: ids.personId,
      });
      await t.run(async (ctx) => {
        if (state === "dangling") await ctx.db.delete(ids.linkedUserId);
        else if (state === "deleted") await ctx.db.patch(ids.linkedUserId, { isDeleted: true });
        else await ctx.db.patch(ids.linkedUserId, { accountDeletionRequestedAt: Date.now() });
      });

      await expect(
        t.withIdentity({ subject }).mutation(api.staff.mutations.changeOrganizationPersonShopMemberships, {
          expectedOrganizationId: await getTestOrganizationId(t, ids.shopId),
          shopId: ids.shopId,
          personId: ids.personId,
          desiredShopIds: [],
          expectedMembershipFingerprint: detail.membershipFingerprint,
          removalPreviews: [readyRemovalPreview(detail, ids.shopId)],
          requestId: `membership-change-linked-user-${state}`,
        }),
      ).rejects.toThrow("Not found");

      const stateAfter = await t.run(async (ctx) => ({
        audits: await ctx.db.query("organizationAuditEvents").collect(),
        scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
        staff: await ctx.db.get(ids.staffId),
      }));
      expect(stateAfter).toEqual({ audits: [], scheduled: [], staff: expect.objectContaining({ isDeleted: false }) });
    });

    it("未削除店舗の追加と解除を一括確定し、別店舗所属・履歴を保持して回答数とcredentialを更新する", async () => {
      const t = convexTest(schema, modules);
      const ids = await t.run(async (ctx) => {
        const base = await seedOrganizationManagerShop(ctx, {
          subject: "membership_change_mixed_actor",
          email: "membership-change-owner@example.com",
          plan: "standard",
        });
        const addedShopId = await seedMembershipChangeShop(ctx, base.organizationId, "追加店舗");
        const retainedShopId = await seedMembershipChangeShop(ctx, base.organizationId, "継続所属店舗");
        const personId = await seedMembershipChangePerson(ctx, {
          organizationId: base.organizationId,
          email: "membership-change-target@example.com",
        });
        const otherPersonId = await seedMembershipChangePerson(ctx, {
          organizationId: base.organizationId,
          email: "membership-change-other-target@example.com",
        });
        const otherActorUserId = await seedUser(
          ctx,
          "membership_change_mixed_other_actor",
          "membership-change-other-actor@example.com",
        );
        const otherActorPersonId = await seedMembershipChangePerson(ctx, {
          organizationId: base.organizationId,
          email: "membership-change-other-actor@example.com",
          userId: otherActorUserId,
        });
        await ctx.db.insert("organizationMembers", {
          organizationId: base.organizationId,
          personId: otherActorPersonId,
          userId: otherActorUserId,
          status: "active",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        const sourceStaffId = await ctx.db.insert("staffs", {
          shopId: base.shopId,
          organizationId: base.organizationId,
          organizationPersonId: personId,
          name: "所属変更対象",
          email: "membership-change-target@example.com",
          emailNormalized: "membership-change-target@example.com",
          excludedFromShift: false,
          isDeleted: false,
        });
        const retainedStaffId = await ctx.db.insert("staffs", {
          shopId: retainedShopId,
          organizationId: base.organizationId,
          organizationPersonId: personId,
          name: "所属変更対象",
          email: "membership-change-target@example.com",
          emailNormalized: "membership-change-target@example.com",
          excludedFromShift: false,
          isDeleted: false,
        });
        const recruitmentId = await ctx.db.insert("recruitments", {
          shopId: base.shopId,
          periodStart: dateFromToday(7),
          periodEnd: dateFromToday(13),
          deadline: dateFromToday(3),
          shopClosedDates: [],
          status: "open",
          isDeleted: false,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        });
        const submissionId = await ctx.db.insert("shiftSubmissions", {
          firstSubmittedAt: Date.now(),
          recruitmentId,
          staffId: sourceStaffId,
          submittedAt: Date.now(),
        });
        const statsId = await ctx.db.insert("recruitmentStats", {
          recruitmentId,
          shopId: base.shopId,
          submittedCount: 1,
          activeStaffCountSnapshot: 1,
          updatedAt: Date.now(),
        });
        const positionId = await ctx.db.insert("positions", {
          isDefault: false,
          shopId: base.shopId,
          name: "通常",
          color: "#000000",
          sortOrder: 0,
          isDeleted: false,
        });
        const assignmentId = await ctx.db.insert("shiftAssignments", {
          recruitmentId,
          staffId: sourceStaffId,
          date: dateFromToday(8),
          startTime: "10:00",
          endTime: "18:00",
          positionId,
        });
        const sessionId = await ctx.db.insert("sessions", {
          accessKind: "submit",
          sessionToken: "membership-change-old-session",
          staffId: sourceStaffId,
          shopId: base.shopId,
          recruitmentId,
          expiresAt: Date.now() + 86_400_000,
        });
        const magicLinkId = await ctx.db.insert("magicLinks", {
          accessKind: "submit",
          token: "membership-change-old-magic",
          staffId: sourceStaffId,
          shopId: base.shopId,
          recruitmentId,
          expiresAt: Date.now() + 86_400_000,
        });
        const lineLinkTokenId = await ctx.db.insert("lineLinkTokens", {
          token: "membership-change-old-line-token",
          staffId: sourceStaffId,
          shopId: base.shopId,
          organizationId: base.organizationId,
          organizationPersonId: personId,
          lineLinkGenerationAtIssue: 0,
          expiresAt: Date.now() + 86_400_000,
        });
        const lineAccountId = await ctx.db.insert("staffLineAccounts", {
          staffId: sourceStaffId,
          shopId: base.shopId,
          lineUserId: "U_membership_change_old",
          linkedAt: Date.now(),
          following: true,
          isDeleted: false,
        });
        return {
          ...base,
          addedShopId,
          retainedShopId,
          retainedStaffId,
          assignmentId,
          lineAccountId,
          lineLinkTokenId,
          magicLinkId,
          otherPersonId,
          personId,
          sessionId,
          sourceStaffId,
          statsId,
          submissionId,
        };
      });
      const actor = t.withIdentity({ subject: "membership_change_mixed_actor" });
      const detail = await getMembershipChangeDetail(t, {
        subject: "membership_change_mixed_actor",
        shopId: ids.shopId,
        personId: ids.personId,
      });
      const otherDetail = await getMembershipChangeDetail(t, {
        subject: "membership_change_mixed_actor",
        shopId: ids.shopId,
        personId: ids.otherPersonId,
      });
      const request = {
        expectedOrganizationId: await getTestOrganizationId(t, ids.shopId),
        shopId: ids.shopId,
        personId: ids.personId,
        desiredShopIds: [ids.addedShopId, ids.retainedShopId],
        expectedMembershipFingerprint: detail.membershipFingerprint,
        removalPreviews: [readyRemovalPreview(detail, ids.shopId)],
        requestId: "membership-change-mixed-request",
      };

      const result = await actor.mutation(api.staff.mutations.changeOrganizationPersonShopMemberships, request);
      expect(result).toEqual({ changed: true, addedShopIds: [ids.addedShopId], removedShopIds: [ids.shopId] });
      await expect(
        actor.mutation(api.staff.mutations.changeOrganizationPersonShopMemberships, request),
      ).resolves.toEqual(result);
      await expect(
        actor.mutation(api.staff.mutations.changeOrganizationPersonShopMemberships, {
          ...request,
          removalPreviews: [{ ...request.removalPreviews[0], fingerprint: "0".repeat(64) }],
        }),
      ).rejects.toThrow("以前の店舗所属変更と内容が一致しません");
      await expect(
        actor.mutation(api.staff.mutations.changeOrganizationPersonShopMemberships, {
          expectedOrganizationId: await getTestOrganizationId(t, ids.shopId),
          shopId: ids.shopId,
          personId: ids.otherPersonId,
          desiredShopIds: [],
          expectedMembershipFingerprint: otherDetail.membershipFingerprint,
          removalPreviews: [],
          requestId: request.requestId,
        }),
      ).rejects.toThrow("以前の店舗所属変更と内容が一致しません");
      await expect(
        t
          .withIdentity({ subject: "membership_change_mixed_other_actor" })
          .mutation(api.staff.mutations.changeOrganizationPersonShopMemberships, request),
      ).rejects.toThrow("以前の店舗所属変更と内容が一致しません");

      const state = await t.run(async (ctx) => {
        const staffs = await ctx.db
          .query("staffs")
          .withIndex("by_organizationId_and_organizationPersonId", (q) =>
            q.eq("organizationId", ids.organizationId).eq("organizationPersonId", ids.personId),
          )
          .collect();
        return {
          addedStaff: staffs.find((staff) => staff.shopId === ids.addedShopId && !staff.isDeleted),
          retainedStaff: await ctx.db.get(ids.retainedStaffId),
          assignment: await ctx.db.get(ids.assignmentId),
          audits: (await ctx.db.query("organizationAuditEvents").collect()).filter(
            (audit) => audit.organizationId === ids.organizationId,
          ),
          lineAccount: await ctx.db.get(ids.lineAccountId),
          lineLinkToken: await ctx.db.get(ids.lineLinkTokenId),
          magicLink: await ctx.db.get(ids.magicLinkId),
          person: await ctx.db.get(ids.personId),
          scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
          session: await ctx.db.get(ids.sessionId),
          sourceStaff: await ctx.db.get(ids.sourceStaffId),
          stats: await ctx.db.get(ids.statsId),
          submission: await ctx.db.get(ids.submissionId),
        };
      });
      expect(state.sourceStaff?.isDeleted).toBe(true);
      expect(state.retainedStaff?.isDeleted).toBe(false);
      expect(state.addedStaff).toMatchObject({
        organizationPersonId: ids.personId,
        excludedFromShift: false,
        isDeleted: false,
      });
      expect(state.assignment).toBeNull();
      expect(state.submission).not.toBeNull();
      expect(state.stats).toMatchObject({ submittedCount: 0, activeStaffCountSnapshot: 0 });
      expect(state.session?.revokedAt).toBe(Date.now());
      expect(state.magicLink?.revokedAt).toBe(Date.now());
      expect(state.lineLinkToken?.revokedAt).toBe(Date.now());
      expect(state.lineAccount).toMatchObject({ isDeleted: true, following: false });
      expect(state.person?.status).toBe("active");
      expect(state.audits.map((audit) => audit.action).sort()).toEqual(
        [
          "organization.person_removed_from_shop",
          "organization.person_shop_memberships_changed",
          "organization.staff_added",
        ].sort(),
      );
      expect(state.scheduled.map((job) => job.name).sort()).toEqual(
        [
          "legal/actions:sendStaffConsentEmail",
          "line/actions:sendInviteEmail",
          "notification/actions:sendOpenRecruitmentNotificationEmailsForStaff",
          "notificationOutbox/mutations:deleteStaffNotificationHistoryBatch",
        ].sort(),
      );
    });

    it("差分なしもreceiptだけを一度保存し、同一intentを復旧して異なるintentを拒否する", async () => {
      const t = convexTest(schema, modules);
      const ids = await t.run(async (ctx) => {
        const base = await seedOrganizationManagerShop(ctx, {
          subject: "membership_change_noop_actor",
          plan: "standard",
        });
        const personId = await seedMembershipChangePerson(ctx, {
          organizationId: base.organizationId,
          email: "membership-change-noop@example.com",
        });
        const staffId = await ctx.db.insert("staffs", {
          excludedFromShift: false,
          shopId: base.shopId,
          organizationId: base.organizationId,
          organizationPersonId: personId,
          name: "差分なし",
          email: "membership-change-noop@example.com",
          emailNormalized: "membership-change-noop@example.com",
          isDeleted: false,
        });
        return { ...base, personId, staffId };
      });
      const detail = await getMembershipChangeDetail(t, {
        subject: "membership_change_noop_actor",
        shopId: ids.shopId,
        personId: ids.personId,
      });
      const actor = t.withIdentity({ subject: "membership_change_noop_actor" });
      const request = {
        expectedOrganizationId: await getTestOrganizationId(t, ids.shopId),
        shopId: ids.shopId,
        personId: ids.personId,
        desiredShopIds: [ids.shopId],
        expectedMembershipFingerprint: detail.membershipFingerprint,
        removalPreviews: [],
        requestId: "membership-change-noop-request",
      };

      const expected = { changed: false, addedShopIds: [], removedShopIds: [] };
      await expect(
        actor.mutation(api.staff.mutations.changeOrganizationPersonShopMemberships, request),
      ).resolves.toEqual(expected);
      await expect(
        actor.mutation(api.staff.mutations.changeOrganizationPersonShopMemberships, request),
      ).resolves.toEqual(expected);
      await expect(
        actor.mutation(api.staff.mutations.changeOrganizationPersonShopMemberships, {
          ...request,
          expectedMembershipFingerprint: "0".repeat(64),
        }),
      ).rejects.toThrow("以前の店舗所属変更と内容が一致しません");

      const state = await t.run(async (ctx) => ({
        audits: (await ctx.db.query("organizationAuditEvents").collect()).filter(
          (audit) => audit.action === "organization.person_shop_memberships_changed",
        ),
        scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
        staff: await ctx.db.get(ids.staffId),
      }));
      expect(state.audits).toHaveLength(1);
      expect(state.audits[0]).toMatchObject({
        targetId: ids.personId,
        fromState: expect.stringMatching(/^\{"version":1,"intentHash":"[0-9a-f]{64}"\}$/),
        toState: JSON.stringify({ version: 1, changed: false, addedShopIds: [], removedShopIds: [] }),
      });
      expect(state.staff?.isDeleted).toBe(false);
      expect(state.scheduled).toEqual([]);
    });

    it("membership snapshotが変わった場合は全変更を拒否する", async () => {
      const t = convexTest(schema, modules);
      const ids = await t.run(async (ctx) => {
        const base = await seedOrganizationManagerShop(ctx, {
          subject: "membership_change_stale_membership_actor",
          plan: "standard",
        });
        const secondShopId = await seedMembershipChangeShop(ctx, base.organizationId, "追加後店舗");
        const personId = await seedMembershipChangePerson(ctx, {
          organizationId: base.organizationId,
          email: "membership-change-stale-membership@example.com",
        });
        return { ...base, personId, secondShopId };
      });
      const detail = await getMembershipChangeDetail(t, {
        subject: "membership_change_stale_membership_actor",
        shopId: ids.shopId,
        personId: ids.personId,
      });
      const insertedAfterSnapshot = await t.run(
        async (ctx) =>
          await ctx.db.insert("staffs", {
            excludedFromShift: false,
            shopId: ids.secondShopId,
            organizationId: ids.organizationId,
            organizationPersonId: ids.personId,
            name: "競合追加",
            email: "membership-change-stale-membership@example.com",
            emailNormalized: "membership-change-stale-membership@example.com",
            isDeleted: false,
          }),
      );

      await expect(
        t
          .withIdentity({ subject: "membership_change_stale_membership_actor" })
          .mutation(api.staff.mutations.changeOrganizationPersonShopMemberships, {
            expectedOrganizationId: await getTestOrganizationId(t, ids.shopId),
            shopId: ids.shopId,
            personId: ids.personId,
            desiredShopIds: [],
            expectedMembershipFingerprint: detail.membershipFingerprint,
            removalPreviews: [],
            requestId: "membership-change-stale-membership-request",
          }),
      ).rejects.toThrow("店舗所属が変更されています");

      const state = await t.run(async (ctx) => ({
        audits: await ctx.db.query("organizationAuditEvents").collect(),
        scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
        staff: await ctx.db.get(insertedAfterSnapshot),
      }));
      expect(state.staff?.isDeleted).toBe(false);
      expect(state.audits).toEqual([]);
      expect(state.scheduled).toEqual([]);
    });

    it("削除previewが変わった場合はstaffと割当を一件も変更しない", async () => {
      const t = convexTest(schema, modules);
      const ids = await t.run(async (ctx) => {
        const base = await seedOrganizationManagerShop(ctx, {
          subject: "membership_change_stale_removal_actor",
          plan: "standard",
        });
        const personId = await seedMembershipChangePerson(ctx, {
          organizationId: base.organizationId,
          email: "membership-change-stale-removal@example.com",
        });
        const staffId = await ctx.db.insert("staffs", {
          excludedFromShift: false,
          shopId: base.shopId,
          organizationId: base.organizationId,
          organizationPersonId: personId,
          name: "削除競合",
          email: "membership-change-stale-removal@example.com",
          emailNormalized: "membership-change-stale-removal@example.com",
          isDeleted: false,
        });
        return { ...base, personId, staffId };
      });
      const detail = await getMembershipChangeDetail(t, {
        subject: "membership_change_stale_removal_actor",
        shopId: ids.shopId,
        personId: ids.personId,
      });
      const assignmentId = await t.run(async (ctx) => {
        const recruitmentId = await ctx.db.insert("recruitments", {
          shopId: ids.shopId,
          periodStart: dateFromToday(7),
          periodEnd: dateFromToday(13),
          deadline: dateFromToday(3),
          shopClosedDates: [],
          status: "confirmed",
          isDeleted: false,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        });
        const positionId = await ctx.db.insert("positions", {
          isDefault: false,
          shopId: ids.shopId,
          name: "通常",
          color: "#000000",
          sortOrder: 0,
          isDeleted: false,
        });
        return await ctx.db.insert("shiftAssignments", {
          recruitmentId,
          staffId: ids.staffId,
          date: dateFromToday(8),
          startTime: "10:00",
          endTime: "18:00",
          positionId,
        });
      });

      await expect(
        t
          .withIdentity({ subject: "membership_change_stale_removal_actor" })
          .mutation(api.staff.mutations.changeOrganizationPersonShopMemberships, {
            expectedOrganizationId: await getTestOrganizationId(t, ids.shopId),
            shopId: ids.shopId,
            personId: ids.personId,
            desiredShopIds: [],
            expectedMembershipFingerprint: detail.membershipFingerprint,
            removalPreviews: [readyRemovalPreview(detail, ids.shopId)],
            requestId: "membership-change-stale-removal-request",
          }),
      ).rejects.toThrow("今日以降のシフトの割り当てが変更されました");

      const state = await t.run(async (ctx) => ({
        assignment: await ctx.db.get(assignmentId),
        audits: await ctx.db.query("organizationAuditEvents").collect(),
        scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
        staff: await ctx.db.get(ids.staffId),
      }));
      expect(state.assignment).not.toBeNull();
      expect(state.staff?.isDeleted).toBe(false);
      expect(state.audits).toEqual([]);
      expect(state.scheduled).toEqual([]);
    });

    it("他組織・削除済み店舗・重複店舗・不正fingerprintを副作用なしで拒否する", async () => {
      const t = convexTest(schema, modules);
      const ids = await t.run(async (ctx) => {
        const owner = await seedOrganizationManagerShop(ctx, {
          subject: "membership_change_boundary_actor",
          plan: "standard",
        });
        const foreign = await seedOrganizationManagerShop(ctx, {
          subject: "membership_change_boundary_foreign",
          plan: "standard",
        });
        const deletedShopId = await seedMembershipChangeShop(ctx, owner.organizationId, "削除済み店舗");
        await ctx.db.patch(deletedShopId, { isDeleted: true });
        const personId = await seedMembershipChangePerson(ctx, {
          organizationId: owner.organizationId,
          email: "membership-change-boundary@example.com",
        });
        return { deletedShopId, foreign, owner, personId };
      });
      const detail = await getMembershipChangeDetail(t, {
        subject: "membership_change_boundary_actor",
        shopId: ids.owner.shopId,
        personId: ids.personId,
      });
      const actor = t.withIdentity({ subject: "membership_change_boundary_actor" });
      const baseRequest = {
        expectedOrganizationId: ids.owner.organizationId,
        shopId: ids.owner.shopId,
        personId: ids.personId,
        expectedMembershipFingerprint: detail.membershipFingerprint,
        removalPreviews: [],
      };

      await expect(
        actor.mutation(api.staff.mutations.changeOrganizationPersonShopMemberships, {
          ...baseRequest,
          desiredShopIds: [ids.foreign.shopId],
          requestId: "membership-change-foreign-shop",
        }),
      ).rejects.toThrow("Not found");
      await expect(
        actor.mutation(api.staff.mutations.changeOrganizationPersonShopMemberships, {
          ...baseRequest,
          desiredShopIds: [ids.deletedShopId],
          requestId: "membership-change-deleted-shop",
        }),
      ).rejects.toThrow("Not found");
      await expect(
        actor.mutation(api.staff.mutations.changeOrganizationPersonShopMemberships, {
          ...baseRequest,
          desiredShopIds: [ids.owner.shopId, ids.owner.shopId],
          requestId: "membership-change-duplicate-shop",
        }),
      ).rejects.toThrow("入力内容を確認してください");
      await expect(
        actor.mutation(api.staff.mutations.changeOrganizationPersonShopMemberships, {
          ...baseRequest,
          personId: ids.foreign.personId,
          desiredShopIds: [],
          requestId: "membership-change-foreign-person",
        }),
      ).rejects.toThrow("Not found");
      await expect(
        actor.mutation(api.staff.mutations.changeOrganizationPersonShopMemberships, {
          ...baseRequest,
          desiredShopIds: [],
          expectedMembershipFingerprint: "not-a-fingerprint",
          requestId: "membership-change-bad-fingerprint",
        }),
      ).rejects.toThrow("入力内容を確認してください");

      const state = await t.run(async (ctx) => ({
        audits: await ctx.db.query("organizationAuditEvents").collect(),
        scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
        targetStaffs: await ctx.db
          .query("staffs")
          .withIndex("by_organizationId_and_organizationPersonId", (q) =>
            q.eq("organizationId", ids.owner.organizationId).eq("organizationPersonId", ids.personId),
          )
          .collect(),
      }));
      expect(state).toEqual({ audits: [], scheduled: [], targetStaffs: [] });
    });

    it("複数店舗のopen募集stats再計算work上限を超える場合は追加を全面rollbackする", async () => {
      const t = convexTest(schema, modules);
      const ids = await t.run(async (ctx) => {
        const base = await seedOrganizationManagerShop(ctx, {
          subject: "membership_change_stats_limit_actor",
          plan: "pro",
        });
        const targetUserId = await seedUser(
          ctx,
          "membership_change_stats_limit_target",
          "membership-change-stats-limit@example.com",
        );
        const personId = await seedMembershipChangePerson(ctx, {
          organizationId: base.organizationId,
          email: "membership-change-stats-limit@example.com",
          userId: targetUserId,
        });
        await ctx.db.insert("organizationMembers", {
          organizationId: base.organizationId,
          personId,
          userId: targetUserId,
          status: "active",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        const targetShopIds: Id<"shops">[] = [];
        const activeStaffsPerShopBeforeAdd = 39;
        const existingStaffUserIds: Id<"users">[] = [];
        for (let staffIndex = 0; staffIndex < activeStaffsPerShopBeforeAdd; staffIndex += 1) {
          existingStaffUserIds.push(
            await seedUser(
              ctx,
              `membership_change_stats_limit_existing_${staffIndex}`,
              `stats-limit-${staffIndex}@example.com`,
            ),
          );
        }
        // 操作用のbase店舗と合わせてPro上限の5店舗以内に収め、stats work上限だけを検証する。
        const shopCount = 4;
        for (let shopIndex = 0; shopIndex < shopCount; shopIndex += 1) {
          const targetShopId = await seedMembershipChangeShop(ctx, base.organizationId, `集計上限店舗${shopIndex}`);
          targetShopIds.push(targetShopId);
          for (let staffIndex = 0; staffIndex < activeStaffsPerShopBeforeAdd; staffIndex += 1) {
            await seedStaff(ctx, {
              shopId: targetShopId,
              name: `既存スタッフ${shopIndex}-${staffIndex}`,
              email: `stats-limit-${staffIndex}@example.com`,
              userId: existingStaffUserIds[staffIndex],
              isDeleted: false,
            });
          }
          for (
            let recruitmentIndex = 0;
            recruitmentIndex < SHOP_MEMBERSHIP_STATS_OPEN_RECRUITMENT_LIMIT;
            recruitmentIndex += 1
          ) {
            await ctx.db.insert("recruitments", {
              shopId: targetShopId,
              periodStart: dateFromToday(7 + recruitmentIndex),
              periodEnd: dateFromToday(7 + recruitmentIndex),
              deadline: dateFromToday(3),
              shopClosedDates: [],
              status: "open",
              isDeleted: false,
              submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
            });
          }
        }
        const plannedWork =
          targetShopIds.length * SHOP_MEMBERSHIP_STATS_OPEN_RECRUITMENT_LIMIT * (activeStaffsPerShopBeforeAdd + 2);
        if (plannedWork <= SHOP_MEMBERSHIP_STATS_RECALCULATION_WORK_LIMIT) {
          throw new Error("stats再計算work上限を超えるfixtureではありません");
        }
        return { ...base, personId, targetShopIds };
      });
      const detail = await getMembershipChangeDetail(t, {
        subject: "membership_change_stats_limit_actor",
        shopId: ids.shopId,
        personId: ids.personId,
      });

      await expect(
        t
          .withIdentity({ subject: "membership_change_stats_limit_actor" })
          .mutation(api.staff.mutations.changeOrganizationPersonShopMemberships, {
            expectedOrganizationId: await getTestOrganizationId(t, ids.shopId),
            shopId: ids.shopId,
            personId: ids.personId,
            desiredShopIds: ids.targetShopIds,
            expectedMembershipFingerprint: detail.membershipFingerprint,
            removalPreviews: [],
            requestId: "membership-change-stats-limit-request",
          }),
      ).rejects.toThrow("募集中のシフト提出状況を安全に更新できません");

      const state = await t.run(async (ctx) => ({
        audits: await ctx.db.query("organizationAuditEvents").collect(),
        scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
        stats: await ctx.db.query("recruitmentStats").collect(),
        targetStaffs: await ctx.db
          .query("staffs")
          .withIndex("by_organizationId_and_organizationPersonId", (q) =>
            q.eq("organizationId", ids.organizationId).eq("organizationPersonId", ids.personId),
          )
          .collect(),
      }));
      expect(state.audits).toEqual([]);
      expect(state.scheduled).toEqual([]);
      expect(state.stats).toEqual([]);
      expect(state.targetStaffs).toEqual([]);
    });

    it("open募集がある未所属店舗へ追加した場合は現在のシフト対象人数へstatsを更新する", async () => {
      const t = convexTest(schema, modules);
      const ids = await t.run(async (ctx) => {
        const base = await seedOrganizationManagerShop(ctx, {
          subject: "membership_change_add_stats_actor",
          plan: "standard",
        });
        const targetShopId = await seedMembershipChangeShop(ctx, base.organizationId, "募集あり追加店舗");
        const personId = await seedMembershipChangePerson(ctx, {
          organizationId: base.organizationId,
          email: "membership-change-add-stats@example.com",
        });
        const recruitmentId = await ctx.db.insert("recruitments", {
          shopId: targetShopId,
          periodStart: dateFromToday(7),
          periodEnd: dateFromToday(13),
          deadline: dateFromToday(3),
          shopClosedDates: [],
          status: "open",
          isDeleted: false,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        });
        return { ...base, personId, recruitmentId, targetShopId };
      });
      const detail = await getMembershipChangeDetail(t, {
        subject: "membership_change_add_stats_actor",
        shopId: ids.shopId,
        personId: ids.personId,
      });

      await expect(
        t
          .withIdentity({ subject: "membership_change_add_stats_actor" })
          .mutation(api.staff.mutations.changeOrganizationPersonShopMemberships, {
            expectedOrganizationId: await getTestOrganizationId(t, ids.shopId),
            shopId: ids.shopId,
            personId: ids.personId,
            desiredShopIds: [ids.targetShopId],
            expectedMembershipFingerprint: detail.membershipFingerprint,
            removalPreviews: [],
            requestId: "membership-change-add-stats-request",
          }),
      ).resolves.toEqual({ changed: true, addedShopIds: [ids.targetShopId], removedShopIds: [] });

      await expect(
        t.run(
          async (ctx) =>
            await ctx.db
              .query("recruitmentStats")
              .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", ids.recruitmentId))
              .unique(),
        ),
      ).resolves.toMatchObject({
        recruitmentId: ids.recruitmentId,
        shopId: ids.targetShopId,
        submittedCount: 0,
        activeStaffCountSnapshot: 1,
      });
    });

    it("人物側desired setでactive管理者の全店舗所属を解除し、管理者roleと人物を維持する", async () => {
      const t = convexTest(schema, modules);
      const ids = await t.run(async (ctx) => {
        const base = await seedOrganizationManagerShop(ctx, {
          subject: "membership_change_readd_actor",
          plan: "standard",
        });
        const targetUserId = await seedUser(
          ctx,
          "membership_change_readd_target",
          "membership-change-readd@example.com",
        );
        const personId = await seedMembershipChangePerson(ctx, {
          organizationId: base.organizationId,
          email: "membership-change-readd@example.com",
          userId: targetUserId,
        });
        const memberId = await ctx.db.insert("organizationMembers", {
          organizationId: base.organizationId,
          personId,
          userId: targetUserId,
          status: "active",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        const oldStaffId = await ctx.db.insert("staffs", {
          shopId: base.shopId,
          organizationId: base.organizationId,
          organizationPersonId: personId,
          name: "再追加対象",
          email: "membership-change-readd@example.com",
          emailNormalized: "membership-change-readd@example.com",
          excludedFromShift: false,
          isDeleted: false,
        });
        const recruitmentId = await ctx.db.insert("recruitments", {
          shopId: base.shopId,
          periodStart: dateFromToday(7),
          periodEnd: dateFromToday(13),
          deadline: dateFromToday(3),
          shopClosedDates: [],
          status: "open",
          isDeleted: false,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        });
        const oldSubmissionId = await ctx.db.insert("shiftSubmissions", {
          firstSubmittedAt: Date.now(),
          recruitmentId,
          staffId: oldStaffId,
          submittedAt: Date.now(),
        });
        const statsId = await ctx.db.insert("recruitmentStats", {
          recruitmentId,
          shopId: base.shopId,
          submittedCount: 1,
          activeStaffCountSnapshot: 1,
          updatedAt: Date.now(),
        });
        const oldSessionId = await ctx.db.insert("sessions", {
          accessKind: "submit",
          sessionToken: "membership-change-readd-old-session",
          staffId: oldStaffId,
          shopId: base.shopId,
          recruitmentId,
          expiresAt: Date.now() + 86_400_000,
        });
        const oldMagicLinkId = await ctx.db.insert("magicLinks", {
          accessKind: "submit",
          token: "membership-change-readd-old-magic",
          staffId: oldStaffId,
          shopId: base.shopId,
          recruitmentId,
          expiresAt: Date.now() + 86_400_000,
        });
        return {
          ...base,
          memberId,
          oldMagicLinkId,
          oldSessionId,
          oldStaffId,
          oldSubmissionId,
          personId,
          recruitmentId,
          statsId,
        };
      });
      const actor = t.withIdentity({ subject: "membership_change_readd_actor" });
      const beforeRemoval = await getMembershipChangeDetail(t, {
        subject: "membership_change_readd_actor",
        shopId: ids.shopId,
        personId: ids.personId,
      });

      await expect(
        actor.mutation(api.staff.mutations.changeOrganizationPersonShopMemberships, {
          expectedOrganizationId: await getTestOrganizationId(t, ids.shopId),
          shopId: ids.shopId,
          personId: ids.personId,
          desiredShopIds: [],
          expectedMembershipFingerprint: beforeRemoval.membershipFingerprint,
          removalPreviews: [readyRemovalPreview(beforeRemoval, ids.shopId)],
          requestId: "membership-change-remove-before-readd",
        }),
      ).resolves.toEqual({ changed: true, addedShopIds: [], removedShopIds: [ids.shopId] });

      const state = await t.run(async (ctx) => ({
        member: await ctx.db.get(ids.memberId),
        person: await ctx.db.get(ids.personId),
        staff: await ctx.db.get(ids.oldStaffId),
        submission: await ctx.db.get(ids.oldSubmissionId),
        stats: await ctx.db.get(ids.statsId),
        session: await ctx.db.get(ids.oldSessionId),
        magicLink: await ctx.db.get(ids.oldMagicLinkId),
        audits: (await ctx.db.query("organizationAuditEvents").collect()).map((audit) => audit.action).sort(),
      }));
      expect(state.member).toMatchObject({ personId: ids.personId, status: "active" });
      expect(state.person).toMatchObject({ _id: ids.personId, status: "active" });
      expect(state.staff?.isDeleted).toBe(true);
      expect(state.submission).not.toBeNull();
      expect(state.stats).toMatchObject({ submittedCount: 0, activeStaffCountSnapshot: 0 });
      expect(state.session?.revokedAt).toBe(Date.now());
      expect(state.magicLink?.revokedAt).toBe(Date.now());
      expect(state.audits).toEqual(
        ["organization.person_removed_from_shop", "organization.person_shop_memberships_changed"].sort(),
      );

      await expect(
        actor.query(api.organization.userDetailQueries.getUserDetail, {
          expectedOrganizationId: await getTestOrganizationId(t, ids.shopId),
          shopId: ids.shopId,
          personId: ids.personId,
          now: Date.now(),
        }),
      ).resolves.toMatchObject({ managerRole: "active", memberships: [] });
    });
  });

  describe("changeOrganizationShopStaffMemberships", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-08-11T03:00:00+09:00"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it.each([
      ["参照切れ", "dangling"],
      ["削除済み", "deleted"],
      ["削除受付済み", "requested"],
    ] as const)("linked userが%sなら店舗側所属追加のinsert・scheduleを0件にする", async (_label, state) => {
      const t = convexTest(schema, modules);
      const subject = `shop_staff_membership_linked_user_${state}`;
      const ids = await t.run(async (ctx) => {
        const base = await seedOrganizationManagerShop(ctx, { subject, plan: "pro" });
        const linkedUserId = await seedUser(
          ctx,
          `shop_staff_membership_target_${state}`,
          `shop-staff-membership-target-${state}@example.com`,
        );
        const personId = await seedMembershipChangePerson(ctx, {
          organizationId: base.organizationId,
          email: `shop-staff-membership-target-${state}@example.com`,
          userId: linkedUserId,
        });
        return { ...base, linkedUserId, personId };
      });
      const snapshot = await getShopStaffMembershipChange(t, { subject, shopId: ids.shopId });
      await t.run(async (ctx) => {
        if (state === "dangling") await ctx.db.delete(ids.linkedUserId);
        else if (state === "deleted") await ctx.db.patch(ids.linkedUserId, { isDeleted: true });
        else await ctx.db.patch(ids.linkedUserId, { accountDeletionRequestedAt: Date.now() });
      });

      await expect(
        t.withIdentity({ subject }).mutation(api.staff.mutations.changeOrganizationShopStaffMemberships, {
          expectedOrganizationId: await getTestOrganizationId(t, ids.shopId),
          shopId: ids.shopId,
          desiredActivePersonIds: [ids.personId],
          expectedMembershipFingerprint: snapshot.membershipFingerprint,
          removalPreviews: [],
          requestId: `shop-staff-membership-linked-user-${state}`,
        }),
      ).rejects.toThrow("所属スタッフを確認できません");

      const stateAfter = await t.run(async (ctx) => ({
        audits: await ctx.db.query("organizationAuditEvents").collect(),
        scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
        staffs: await ctx.db
          .query("staffs")
          .withIndex("by_organizationId_and_organizationPersonId", (q) =>
            q.eq("organizationId", ids.organizationId).eq("organizationPersonId", ids.personId),
          )
          .collect(),
      }));
      expect(stateAfter).toEqual({ audits: [], scheduled: [], staffs: [] });
    });

    it("店舗側desired setで管理者所属を解除し、追加・cleanupと別店舗の管理者所属を同じtransactionで維持する", async () => {
      const t = convexTest(schema, modules);
      const ids = await t.run(async (ctx) => {
        const base = await seedOrganizationManagerShop(ctx, {
          subject: "shop_staff_membership_mixed_actor",
          email: "shop-staff-membership-owner@example.com",
          shopName: "所属変更店舗",
          plan: "pro",
        });
        const otherShopId = await seedMembershipChangeShop(ctx, base.organizationId, "保持対象の別店舗");
        const removedUserId = await seedUser(
          ctx,
          "shop_staff_membership_removed_manager",
          "shop-staff-membership-removed@example.com",
        );
        const removedPersonId = await seedMembershipChangePerson(ctx, {
          organizationId: base.organizationId,
          userId: removedUserId,
          name: "解除する管理者",
          email: "shop-staff-membership-removed@example.com",
        });
        const removedMemberId = await ctx.db.insert("organizationMembers", {
          organizationId: base.organizationId,
          personId: removedPersonId,
          userId: removedUserId,
          status: "active",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        const removedStaffId = await ctx.db.insert("staffs", {
          shopId: base.shopId,
          organizationId: base.organizationId,
          organizationPersonId: removedPersonId,
          userId: removedUserId,
          name: "解除する管理者",
          email: "shop-staff-membership-removed@example.com",
          emailNormalized: "shop-staff-membership-removed@example.com",
          excludedFromShift: false,
          isDeleted: false,
        });
        const otherShopStaffId = await ctx.db.insert("staffs", {
          shopId: otherShopId,
          organizationId: base.organizationId,
          organizationPersonId: removedPersonId,
          userId: removedUserId,
          name: "別店舗の管理者",
          email: "shop-staff-membership-removed@example.com",
          emailNormalized: "shop-staff-membership-removed@example.com",
          excludedFromShift: false,
          isDeleted: false,
        });
        const addedPersonId = await seedMembershipChangePerson(ctx, {
          organizationId: base.organizationId,
          name: "追加するスタッフ",
          email: "shop-staff-membership-added@example.com",
        });
        const recruitmentId = await ctx.db.insert("recruitments", {
          shopId: base.shopId,
          periodStart: dateFromToday(7),
          periodEnd: dateFromToday(13),
          deadline: dateFromToday(3),
          shopClosedDates: [],
          status: "open",
          isDeleted: false,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        });
        const submissionId = await ctx.db.insert("shiftSubmissions", {
          firstSubmittedAt: Date.now(),
          recruitmentId,
          staffId: removedStaffId,
          submittedAt: Date.now(),
        });
        const statsId = await ctx.db.insert("recruitmentStats", {
          recruitmentId,
          shopId: base.shopId,
          submittedCount: 1,
          activeStaffCountSnapshot: 1,
          updatedAt: Date.now(),
        });
        const positionId = await ctx.db.insert("positions", {
          isDefault: false,
          shopId: base.shopId,
          name: "通常",
          color: "#000000",
          sortOrder: 0,
          isDeleted: false,
        });
        const pastAssignmentId = await ctx.db.insert("shiftAssignments", {
          recruitmentId,
          staffId: removedStaffId,
          date: dateFromToday(-1),
          startTime: "09:00",
          endTime: "12:00",
          positionId,
        });
        const futureAssignmentId = await ctx.db.insert("shiftAssignments", {
          recruitmentId,
          staffId: removedStaffId,
          date: dateFromToday(8),
          startTime: "10:00",
          endTime: "18:00",
          positionId,
        });
        const sessionId = await ctx.db.insert("sessions", {
          accessKind: "submit",
          sessionToken: "shop-staff-membership-old-session",
          staffId: removedStaffId,
          shopId: base.shopId,
          recruitmentId,
          expiresAt: Date.now() + 86_400_000,
        });
        const magicLinkId = await ctx.db.insert("magicLinks", {
          accessKind: "submit",
          token: "shop-staff-membership-old-magic-link",
          staffId: removedStaffId,
          shopId: base.shopId,
          recruitmentId,
          expiresAt: Date.now() + 86_400_000,
        });
        const lineLinkTokenId = await ctx.db.insert("lineLinkTokens", {
          token: "shop-staff-membership-old-line-link",
          staffId: removedStaffId,
          shopId: base.shopId,
          organizationId: base.organizationId,
          organizationPersonId: removedPersonId,
          lineLinkGenerationAtIssue: 0,
          expiresAt: Date.now() + 86_400_000,
        });
        const lineAccountId = await ctx.db.insert("staffLineAccounts", {
          staffId: removedStaffId,
          shopId: base.shopId,
          lineUserId: "U_shop_staff_membership_removed",
          linkedAt: Date.now(),
          following: true,
          isDeleted: false,
        });
        const outboxId = await ctx.db.insert("notificationOutbox", {
          channel: "email",
          status: "pending",
          dedupeKey: "shop-staff-membership-before-removal",
          organizationId: base.organizationId,
          shopId: base.shopId,
          staffId: removedStaffId,
          purpose: "business",
          notificationContext: "test.shop-staff-membership-before-removal",
          deliverySuppressed: false,
          payload: {
            kind: "email",
            from: "noreply@example.com",
            to: "shop-staff-membership-removed@example.com",
            subject: "解除前の未送信通知",
            html: "本文",
            context: "shop-staff-membership-change-test",
          },
          attemptCount: 0,
          nextRunAt: Date.now(),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        return {
          ...base,
          addedPersonId,
          futureAssignmentId,
          lineAccountId,
          lineLinkTokenId,
          magicLinkId,
          otherShopId,
          otherShopStaffId,
          outboxId,
          pastAssignmentId,
          removedMemberId,
          removedPersonId,
          removedStaffId,
          removedUserId,
          sessionId,
          statsId,
          submissionId,
        };
      });
      const subject = "shop_staff_membership_mixed_actor";
      const actor = t.withIdentity({ subject });
      const snapshot = await getShopStaffMembershipChange(t, { subject, shopId: ids.shopId });
      const removalPreviews = await getShopStaffRemovalPreviews(t, {
        subject,
        shopId: ids.shopId,
        personIds: [ids.removedPersonId],
        expectedMembershipFingerprint: snapshot.membershipFingerprint,
      });
      const request = {
        expectedOrganizationId: await getTestOrganizationId(t, ids.shopId),
        shopId: ids.shopId,
        desiredActivePersonIds: [ids.addedPersonId],
        expectedMembershipFingerprint: snapshot.membershipFingerprint,
        removalPreviews,
        requestId: "shop-staff-membership-mixed-request",
      };

      await expect(
        actor.mutation(api.staff.mutations.changeOrganizationShopStaffMemberships, request),
      ).resolves.toEqual({
        changed: true,
        addedPersonIds: [ids.addedPersonId],
        removedPersonIds: [ids.removedPersonId],
      });

      const state = await t.run(async (ctx) => {
        const addedStaffs = await ctx.db
          .query("staffs")
          .withIndex("by_organizationId_and_organizationPersonId_and_isDeleted", (q) =>
            q
              .eq("organizationId", ids.organizationId)
              .eq("organizationPersonId", ids.addedPersonId)
              .eq("isDeleted", false),
          )
          .collect();
        return {
          addedStaffs,
          member: await ctx.db.get(ids.removedMemberId),
          person: await ctx.db.get(ids.removedPersonId),
          removedStaff: await ctx.db.get(ids.removedStaffId),
          otherShopStaff: await ctx.db.get(ids.otherShopStaffId),
          futureAssignment: await ctx.db.get(ids.futureAssignmentId),
          pastAssignment: await ctx.db.get(ids.pastAssignmentId),
          submission: await ctx.db.get(ids.submissionId),
          stats: await ctx.db.get(ids.statsId),
          session: await ctx.db.get(ids.sessionId),
          magicLink: await ctx.db.get(ids.magicLinkId),
          lineLinkToken: await ctx.db.get(ids.lineLinkTokenId),
          lineAccount: await ctx.db.get(ids.lineAccountId),
          outbox: await ctx.db.get(ids.outboxId),
          auditActions: (await ctx.db.query("organizationAuditEvents").collect()).map((audit) => audit.action).sort(),
        };
      });
      expect(state.addedStaffs).toEqual([
        expect.objectContaining({ organizationPersonId: ids.addedPersonId, shopId: ids.shopId, isDeleted: false }),
      ]);
      expect(state.member).toMatchObject({ personId: ids.removedPersonId, status: "active" });
      expect(state.person).toMatchObject({ _id: ids.removedPersonId, status: "active" });
      expect(state.removedStaff?.isDeleted).toBe(true);
      expect(state.otherShopStaff?.isDeleted).toBe(false);
      expect(state.futureAssignment).toBeNull();
      expect(state.pastAssignment).not.toBeNull();
      expect(state.submission).not.toBeNull();
      expect(state.stats).toMatchObject({ submittedCount: 0, activeStaffCountSnapshot: 1 });
      expect(state.session?.revokedAt).toBe(Date.now());
      expect(state.magicLink?.revokedAt).toBe(Date.now());
      expect(state.lineLinkToken?.revokedAt).toBe(Date.now());
      expect(state.lineAccount).toMatchObject({ isDeleted: true, following: false });
      expect(state.outbox?.status).toBe("cancelled");
      expect(state.auditActions).toEqual(
        [
          "organization.person_removed_from_shop",
          "organization.shop_staff_memberships_changed",
          "organization.staff_added",
        ].sort(),
      );
    });

    it("同じrequestとintentは同じ結果を復旧して副作用を増やさず、異なるintentを拒否する", async () => {
      const t = convexTest(schema, modules);
      const ids = await t.run(async (ctx) => {
        const base = await seedOrganizationManagerShop(ctx, {
          subject: "shop_staff_membership_replay_actor",
          plan: "pro",
        });
        const addedPersonId = await seedMembershipChangePerson(ctx, {
          organizationId: base.organizationId,
          name: "冪等追加対象",
          email: "shop-staff-membership-replay@example.com",
        });
        return { ...base, addedPersonId };
      });
      const subject = "shop_staff_membership_replay_actor";
      const actor = t.withIdentity({ subject });
      const snapshot = await getShopStaffMembershipChange(t, { subject, shopId: ids.shopId });
      const request = {
        expectedOrganizationId: await getTestOrganizationId(t, ids.shopId),
        shopId: ids.shopId,
        desiredActivePersonIds: [ids.addedPersonId],
        expectedMembershipFingerprint: snapshot.membershipFingerprint,
        removalPreviews: [],
        requestId: "shop-staff-membership-replay-request",
      };
      const expected = {
        changed: true,
        addedPersonIds: [ids.addedPersonId],
        removedPersonIds: [],
      };

      await expect(
        actor.mutation(api.staff.mutations.changeOrganizationShopStaffMemberships, request),
      ).resolves.toEqual(expected);
      const readEffects = async () =>
        await t.run(async (ctx) => ({
          analyticsIds: (await ctx.db.query("analyticsSourceEvents").collect()).map((event) => event._id).sort(),
          auditActions: (await ctx.db.query("organizationAuditEvents").collect()).map((audit) => audit.action).sort(),
          auditIds: (await ctx.db.query("organizationAuditEvents").collect()).map((audit) => audit._id).sort(),
          rateLimits: (await ctx.db.query("rateLimits").collect())
            .map(({ name, key, value, ts }) => ({ name, key, value, ts }))
            .sort((left, right) => `${left.name}:${left.key ?? ""}`.localeCompare(`${right.name}:${right.key ?? ""}`)),
          scheduledIds: (await ctx.db.system.query("_scheduled_functions").collect()).map((job) => job._id).sort(),
          scheduledNames: (await ctx.db.system.query("_scheduled_functions").collect()).map((job) => job.name).sort(),
          staffIds: (
            await ctx.db
              .query("staffs")
              .withIndex("by_shopId", (q) => q.eq("shopId", ids.shopId))
              .collect()
          )
            .map((staff) => staff._id)
            .sort(),
        }));
      const afterFirst = await readEffects();
      expect(afterFirst).toEqual({
        analyticsIds: [expect.any(String)],
        auditActions: ["organization.shop_staff_memberships_changed", "organization.staff_added"],
        auditIds: [expect.any(String), expect.any(String)].sort(),
        rateLimits: [
          {
            name: "organizationSettingsMutationShort",
            key: `${ids.userId}:${ids.shopId}`,
            value: 1,
            ts: Date.now(),
          },
        ],
        scheduledIds: [expect.any(String), expect.any(String), expect.any(String)].sort(),
        scheduledNames: [
          "legal/actions:sendStaffConsentEmail",
          "line/actions:sendInviteEmail",
          "notification/actions:sendOpenRecruitmentNotificationEmailsForStaff",
        ].sort(),
        staffIds: [expect.any(String)],
      });

      await expect(
        actor.mutation(api.staff.mutations.changeOrganizationShopStaffMemberships, request),
      ).resolves.toEqual(expected);
      await expect(
        actor.mutation(api.staff.mutations.changeOrganizationShopStaffMemberships, {
          ...request,
          desiredActivePersonIds: [],
        }),
      ).rejects.toThrow("以前の所属スタッフ変更と内容が一致しません");
      await expect(readEffects()).resolves.toEqual(afterFirst);
    });

    it("所属変更は連続2操作を許し、3操作目を副作用なしで拒否する", async () => {
      const t = convexTest(schema, modules);
      const ids = await t.run(async (ctx) => {
        const base = await seedOrganizationManagerShop(ctx, {
          subject: "shop_staff_membership_rate_limit_actor",
          plan: "pro",
        });
        const personId = await seedMembershipChangePerson(ctx, {
          organizationId: base.organizationId,
          name: "連続所属変更対象",
          email: "shop-staff-membership-rate-limit@example.com",
        });
        return { ...base, personId };
      });
      const subject = "shop_staff_membership_rate_limit_actor";
      const actor = t.withIdentity({ subject });
      const firstSnapshot = await getShopStaffMembershipChange(t, { subject, shopId: ids.shopId });

      await expect(
        actor.mutation(api.staff.mutations.changeOrganizationShopStaffMemberships, {
          expectedOrganizationId: await getTestOrganizationId(t, ids.shopId),
          shopId: ids.shopId,
          desiredActivePersonIds: [ids.personId],
          expectedMembershipFingerprint: firstSnapshot.membershipFingerprint,
          removalPreviews: [],
          requestId: "shop-staff-membership-rate-limit-add",
        }),
      ).resolves.toEqual({ changed: true, addedPersonIds: [ids.personId], removedPersonIds: [] });

      const secondSnapshot = await getShopStaffMembershipChange(t, { subject, shopId: ids.shopId });
      const removalPreviews = await getShopStaffRemovalPreviews(t, {
        subject,
        shopId: ids.shopId,
        personIds: [ids.personId],
        expectedMembershipFingerprint: secondSnapshot.membershipFingerprint,
      });
      await expect(
        actor.mutation(api.staff.mutations.changeOrganizationShopStaffMemberships, {
          expectedOrganizationId: await getTestOrganizationId(t, ids.shopId),
          shopId: ids.shopId,
          desiredActivePersonIds: [],
          expectedMembershipFingerprint: secondSnapshot.membershipFingerprint,
          removalPreviews,
          requestId: "shop-staff-membership-rate-limit-remove",
        }),
      ).resolves.toEqual({ changed: true, addedPersonIds: [], removedPersonIds: [ids.personId] });

      const readSideEffects = async () =>
        await t.run(async (ctx) => ({
          audits: await ctx.db.query("organizationAuditEvents").collect(),
          rateLimits: await ctx.db.query("rateLimits").collect(),
          scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
          staffs: await ctx.db
            .query("staffs")
            .withIndex("by_shopId", (q) => q.eq("shopId", ids.shopId))
            .collect(),
        }));
      const beforeRejection = await readSideEffects();
      expect(
        beforeRejection.audits.filter((audit) => audit.action === "organization.shop_staff_memberships_changed"),
      ).toHaveLength(2);
      expect(beforeRejection.rateLimits).toEqual([
        expect.objectContaining({
          name: "organizationSettingsMutationShort",
          key: `${ids.userId}:${ids.shopId}`,
          value: 0,
        }),
      ]);
      expect(beforeRejection.staffs).toEqual([expect.objectContaining({ isDeleted: true })]);

      const thirdSnapshot = await getShopStaffMembershipChange(t, { subject, shopId: ids.shopId });

      await expect(
        actor.mutation(api.staff.mutations.changeOrganizationShopStaffMemberships, {
          expectedOrganizationId: await getTestOrganizationId(t, ids.shopId),
          shopId: ids.shopId,
          desiredActivePersonIds: [ids.personId],
          expectedMembershipFingerprint: thirdSnapshot.membershipFingerprint,
          removalPreviews: [],
          requestId: "shop-staff-membership-rate-limit-third",
        }),
      ).rejects.toThrow("変更操作が続いています");
      await expect(readSideEffects()).resolves.toEqual(beforeRejection);
    });

    it("stale snapshot・stale preview・越境人物・変更不可人物・重複入力を副作用なしで拒否する", async () => {
      const t = convexTest(schema, modules);
      const ids = await t.run(async (ctx) => {
        const base = await seedOrganizationManagerShop(ctx, {
          subject: "shop_staff_membership_rejection_actor",
          plan: "pro",
        });
        const currentPersonId = await seedMembershipChangePerson(ctx, {
          organizationId: base.organizationId,
          name: "現在所属",
          email: "shop-staff-membership-current@example.com",
        });
        const currentStaffId = await ctx.db.insert("staffs", {
          excludedFromShift: false,
          shopId: base.shopId,
          organizationId: base.organizationId,
          organizationPersonId: currentPersonId,
          name: "現在所属",
          email: "shop-staff-membership-current@example.com",
          emailNormalized: "shop-staff-membership-current@example.com",
          isDeleted: false,
        });
        const pendingPersonId = await seedMembershipChangePerson(ctx, {
          organizationId: base.organizationId,
          name: "承認待ち人物",
          email: "shop-staff-membership-pending@example.com",
        });
        await ctx.db.insert("staffRegistrationRequests", {
          shopId: base.shopId,
          name: "承認待ち人物",
          email: "shop-staff-membership-pending@example.com",
          emailNormalized: "shop-staff-membership-pending@example.com",
          status: "pending",
          termsConsentVersion: "terms-v1",
          privacyConsentVersion: "privacy-v1",
          termsDocumentVersion: "terms-doc-v1",
          privacyDocumentVersion: "privacy-doc-v1",
          consentedAt: Date.now(),
          createdAt: Date.now(),
        });
        const foreign = await seedOrganizationManagerShop(ctx, {
          subject: "shop_staff_membership_rejection_foreign",
          plan: "pro",
        });
        const recruitmentId = await ctx.db.insert("recruitments", {
          shopId: base.shopId,
          periodStart: dateFromToday(7),
          periodEnd: dateFromToday(13),
          deadline: dateFromToday(3),
          shopClosedDates: [],
          status: "confirmed",
          confirmedAt: Date.now(),
          isDeleted: false,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        });
        const positionId = await ctx.db.insert("positions", {
          isDefault: false,
          shopId: base.shopId,
          name: "通常",
          color: "#000000",
          sortOrder: 0,
          isDeleted: false,
        });
        return {
          ...base,
          currentPersonId,
          currentStaffId,
          foreignPersonId: foreign.personId,
          pendingPersonId,
          positionId,
          recruitmentId,
        };
      });
      const subject = "shop_staff_membership_rejection_actor";
      const actor = t.withIdentity({ subject });
      const snapshot = await getShopStaffMembershipChange(t, { subject, shopId: ids.shopId });
      const removalPreviews = await getShopStaffRemovalPreviews(t, {
        subject,
        shopId: ids.shopId,
        personIds: [ids.currentPersonId],
        expectedMembershipFingerprint: snapshot.membershipFingerprint,
      });
      const baseRequest = {
        expectedOrganizationId: ids.organizationId,
        shopId: ids.shopId,
        expectedMembershipFingerprint: snapshot.membershipFingerprint,
        removalPreviews: [],
      };

      await expect(
        actor.mutation(api.staff.mutations.changeOrganizationShopStaffMemberships, {
          ...baseRequest,
          desiredActivePersonIds: [ids.currentPersonId, ids.currentPersonId],
          requestId: "shop-staff-membership-duplicate-person",
        }),
      ).rejects.toThrow("入力内容を確認してください");
      await expect(
        actor.mutation(api.staff.mutations.changeOrganizationShopStaffMemberships, {
          ...baseRequest,
          desiredActivePersonIds: [ids.currentPersonId, ids.foreignPersonId],
          requestId: "shop-staff-membership-foreign-person",
        }),
      ).rejects.toThrow("入力内容を確認してください");
      await expect(
        actor.mutation(api.staff.mutations.changeOrganizationShopStaffMemberships, {
          ...baseRequest,
          desiredActivePersonIds: [ids.currentPersonId, ids.pendingPersonId],
          requestId: "shop-staff-membership-pending-person",
        }),
      ).rejects.toThrow("スタッフ登録の承認待ちのため、所属を変更できません");

      const assignmentId = await t.run(
        async (ctx) =>
          await ctx.db.insert("shiftAssignments", {
            recruitmentId: ids.recruitmentId,
            staffId: ids.currentStaffId,
            date: dateFromToday(8),
            startTime: "10:00",
            endTime: "18:00",
            positionId: ids.positionId,
          }),
      );
      await expect(
        actor.mutation(api.staff.mutations.changeOrganizationShopStaffMemberships, {
          ...baseRequest,
          desiredActivePersonIds: [],
          removalPreviews,
          requestId: "shop-staff-membership-stale-preview",
        }),
      ).rejects.toThrow("今日以降のシフトの割り当てが変更されました");

      await t.run(async (ctx) => await ctx.db.patch(ids.pendingPersonId, { name: "競合更新後" }));
      await expect(
        actor.mutation(api.staff.mutations.changeOrganizationShopStaffMemberships, {
          ...baseRequest,
          desiredActivePersonIds: [ids.currentPersonId],
          requestId: "shop-staff-membership-stale-snapshot",
        }),
      ).rejects.toThrow("店舗所属が変更されています");

      const state = await t.run(async (ctx) => ({
        assignmentExists: (await ctx.db.get(assignmentId)) !== null,
        audits: await ctx.db.query("organizationAuditEvents").collect(),
        currentStaffIsDeleted: (await ctx.db.get(ids.currentStaffId))?.isDeleted ?? null,
        rateLimits: await ctx.db.query("rateLimits").collect(),
        scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
        targetShopStaffIds: (
          await ctx.db
            .query("staffs")
            .withIndex("by_shopId", (q) => q.eq("shopId", ids.shopId))
            .collect()
        ).map((staff) => staff._id),
      }));
      expect(state).toEqual({
        assignmentExists: true,
        audits: [],
        currentStaffIsDeleted: false,
        rateLimits: [],
        scheduled: [],
        targetShopStaffIds: [ids.currentStaffId],
      });
    });

    it("対象店舗の変更可能なスタッフを全員解除できる", async () => {
      const t = convexTest(schema, modules);
      const ids = await t.run(async (ctx) => {
        const base = await seedOrganizationManagerShop(ctx, {
          subject: "shop_staff_membership_remove_all_actor",
          plan: "pro",
        });
        const personIds: Id<"organizationPeople">[] = [];
        const staffIds: Id<"staffs">[] = [];
        for (const suffix of ["a", "b"] as const) {
          const personId = await seedMembershipChangePerson(ctx, {
            organizationId: base.organizationId,
            name: `全解除${suffix}`,
            email: `shop-staff-membership-remove-all-${suffix}@example.com`,
          });
          personIds.push(personId);
          staffIds.push(
            await ctx.db.insert("staffs", {
              excludedFromShift: false,
              shopId: base.shopId,
              organizationId: base.organizationId,
              organizationPersonId: personId,
              name: `全解除${suffix}`,
              email: `shop-staff-membership-remove-all-${suffix}@example.com`,
              emailNormalized: `shop-staff-membership-remove-all-${suffix}@example.com`,
              isDeleted: false,
            }),
          );
        }
        return { ...base, personIds, staffIds };
      });
      const subject = "shop_staff_membership_remove_all_actor";
      const snapshot = await getShopStaffMembershipChange(t, { subject, shopId: ids.shopId });
      const removalPreviews = await getShopStaffRemovalPreviews(t, {
        subject,
        shopId: ids.shopId,
        personIds: ids.personIds,
        expectedMembershipFingerprint: snapshot.membershipFingerprint,
      });
      const sortedPersonIds = [...ids.personIds].sort((left, right) => left.localeCompare(right));

      await expect(
        t.withIdentity({ subject }).mutation(api.staff.mutations.changeOrganizationShopStaffMemberships, {
          expectedOrganizationId: await getTestOrganizationId(t, ids.shopId),
          shopId: ids.shopId,
          desiredActivePersonIds: [],
          expectedMembershipFingerprint: snapshot.membershipFingerprint,
          removalPreviews,
          requestId: "shop-staff-membership-remove-all-request",
        }),
      ).resolves.toEqual({ changed: true, addedPersonIds: [], removedPersonIds: sortedPersonIds });

      const state = await t.run(async (ctx) => ({
        auditActions: (await ctx.db.query("organizationAuditEvents").collect()).map((audit) => audit.action).sort(),
        people: await Promise.all(
          ids.personIds.map(async (personId) => {
            const person = await ctx.db.get(personId);
            return person ? { personId: person._id, status: person.status } : null;
          }),
        ),
        scheduledCleanupArgs: (await ctx.db.system.query("_scheduled_functions").collect())
          .map((job) => job.args[0])
          .sort((left, right) => left.staffId.localeCompare(right.staffId)),
        staffs: await Promise.all(
          ids.staffIds.map(async (staffId) => {
            const staff = await ctx.db.get(staffId);
            return staff ? { staffId: staff._id, isDeleted: staff.isDeleted } : null;
          }),
        ),
      }));
      expect(state).toEqual({
        auditActions: [
          "organization.person_removed_from_shop",
          "organization.person_removed_from_shop",
          "organization.shop_staff_memberships_changed",
        ],
        people: ids.personIds.map((personId) => ({ personId, status: "active" })),
        scheduledCleanupArgs: ids.staffIds
          .map((staffId) => ({ shopId: ids.shopId, staffId }))
          .sort((left, right) => left.staffId.localeCompare(right.staffId)),
        staffs: ids.staffIds.map((staffId) => ({ staffId, isDeleted: true })),
      });
    });

    it("差分なしでもouter receiptだけを一度保存する", async () => {
      const t = convexTest(schema, modules);
      const ids = await t.run(
        async (ctx) =>
          await seedOrganizationManagerShop(ctx, {
            subject: "shop_staff_membership_noop_actor",
            plan: "pro",
          }),
      );
      const subject = "shop_staff_membership_noop_actor";
      const snapshot = await getShopStaffMembershipChange(t, { subject, shopId: ids.shopId });
      const requestId = "shop-staff-membership-noop-request";
      const actor = t.withIdentity({ subject });
      const request = {
        expectedOrganizationId: await getTestOrganizationId(t, ids.shopId),
        shopId: ids.shopId,
        desiredActivePersonIds: [],
        expectedMembershipFingerprint: snapshot.membershipFingerprint,
        removalPreviews: [],
        requestId,
      };
      const expected = { changed: false, addedPersonIds: [], removedPersonIds: [] };

      await expect(
        actor.mutation(api.staff.mutations.changeOrganizationShopStaffMemberships, request),
      ).resolves.toEqual(expected);
      await expect(
        actor.mutation(api.staff.mutations.changeOrganizationShopStaffMemberships, request),
      ).resolves.toEqual(expected);

      const requestKey = await toAuditRequestKey(requestId);
      const state = await t.run(async (ctx) => ({
        audits: (await ctx.db.query("organizationAuditEvents").collect()).map(
          ({
            organizationId,
            actorUserId,
            actorPersonId,
            action,
            targetKind,
            targetId,
            fromState,
            toState,
            correlationId,
            occurredAt,
          }) => ({
            organizationId,
            actorUserId,
            actorPersonId,
            action,
            targetKind,
            targetId,
            fromState,
            toState,
            correlationId,
            occurredAt,
          }),
        ),
        scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
        staffs: await ctx.db
          .query("staffs")
          .withIndex("by_shopId", (q) => q.eq("shopId", ids.shopId))
          .collect(),
      }));
      expect(state).toEqual({
        audits: [
          {
            organizationId: ids.organizationId,
            actorUserId: ids.userId,
            actorPersonId: ids.personId,
            action: "organization.shop_staff_memberships_changed",
            targetKind: "shop",
            targetId: ids.shopId,
            fromState: expect.stringMatching(/^\{"version":1,"intentHash":"[0-9a-f]{64}"\}$/),
            toState: JSON.stringify({
              version: 1,
              changed: false,
              addedPersonIds: [],
              removedPersonIds: [],
            }),
            correlationId: `${ids.organizationId}:shop-staff-memberships:${ids.shopId}:${requestKey}`,
            occurredAt: Date.now(),
          },
        ],
        scheduled: [],
        staffs: [],
      });
    });

    it("最上位プランの利用人数上限ちょうどまで一度に追加できる", async () => {
      const t = convexTest(schema, modules);
      const ids = await t.run(async (ctx) => {
        const base = await seedOrganizationManagerShop(ctx, {
          subject: "shop_staff_membership_target_boundary_actor",
          plan: "pro",
        });
        const personIds: Id<"organizationPeople">[] = [base.personId];
        for (let index = 1; index < ORGANIZATION_PLAN_LIMITS.pro.maxPeople; index += 1) {
          personIds.push(
            await seedMembershipChangePerson(ctx, {
              organizationId: base.organizationId,
              name: `一括変更境界${index}`,
              email: `shop-staff-membership-target-boundary-${index}@example.com`,
            }),
          );
        }
        return { ...base, personIds };
      });
      const subject = "shop_staff_membership_target_boundary_actor";
      const snapshot = await getShopStaffMembershipChange(t, { subject, shopId: ids.shopId });

      await expect(
        t.withIdentity({ subject }).mutation(api.staff.mutations.changeOrganizationShopStaffMemberships, {
          expectedOrganizationId: await getTestOrganizationId(t, ids.shopId),
          shopId: ids.shopId,
          desiredActivePersonIds: ids.personIds,
          expectedMembershipFingerprint: snapshot.membershipFingerprint,
          removalPreviews: [],
          requestId: "shop-staff-membership-target-boundary-request",
        }),
      ).resolves.toEqual({
        changed: true,
        addedPersonIds: [...ids.personIds].sort((left, right) => left.localeCompare(right)),
        removedPersonIds: [],
      });

      const staffs = await t.run(
        async (ctx) =>
          await ctx.db
            .query("staffs")
            .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", ids.shopId).eq("isDeleted", false))
            .collect(),
      );
      expect(staffs).toHaveLength(ORGANIZATION_PLAN_LIMITS.pro.maxPeople);
    });

    it("最上位プランの利用人数上限を1名超える一括変更は全追加を拒否する", async () => {
      const t = convexTest(schema, modules);
      const ids = await t.run(async (ctx) => {
        const base = await seedOrganizationManagerShop(ctx, {
          subject: "shop_staff_membership_target_limit_actor",
          plan: "pro",
        });
        const personIds: Id<"organizationPeople">[] = [base.personId];
        for (let index = 0; index < ORGANIZATION_PLAN_LIMITS.pro.maxPeople; index += 1) {
          personIds.push(
            await seedMembershipChangePerson(ctx, {
              organizationId: base.organizationId,
              name: `一括変更上限${index}`,
              email: `shop-staff-membership-target-limit-${index}@example.com`,
            }),
          );
        }
        return { ...base, personIds };
      });
      const subject = "shop_staff_membership_target_limit_actor";
      const snapshot = await getShopStaffMembershipChange(t, { subject, shopId: ids.shopId });

      await expect(
        t.withIdentity({ subject }).mutation(api.staff.mutations.changeOrganizationShopStaffMemberships, {
          expectedOrganizationId: await getTestOrganizationId(t, ids.shopId),
          shopId: ids.shopId,
          desiredActivePersonIds: ids.personIds,
          expectedMembershipFingerprint: snapshot.membershipFingerprint,
          removalPreviews: [],
          requestId: "shop-staff-membership-target-limit-request",
        }),
      ).rejects.toThrow(
        `一度に変更できるスタッフは${ORGANIZATION_SHOP_STAFF_MEMBERSHIP_CHANGE_TARGET_LIMIT}名までです`,
      );

      const state = await t.run(async (ctx) => ({
        audits: await ctx.db.query("organizationAuditEvents").collect(),
        rateLimits: await ctx.db.query("rateLimits").collect(),
        scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
        staffs: await ctx.db
          .query("staffs")
          .withIndex("by_shopId", (q) => q.eq("shopId", ids.shopId))
          .collect(),
      }));
      expect(state).toEqual({ audits: [], rateLimits: [], scheduled: [], staffs: [] });
    });
  });

  function setupShopWithStaff() {
    const t = convexTest(schema, modules);
    const data = t.run(async (ctx) => {
      const { shopId, userId, organizationId } = await seedManagerShop(ctx, {
        subject: "user_mgr",
        email: "mgr@example.com",
        shopName: "テスト店舗",
      });
      const now = Date.now();
      const organizationPersonId = await ctx.db.insert("organizationPeople", {
        organizationId,
        name: "田中太郎",
        email: "tanaka@example.com",
        emailNormalized: "tanaka@example.com",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      const staffId = await ctx.db.insert("staffs", {
        shopId,
        organizationId,
        organizationPersonId,
        name: "田中太郎",
        email: "tanaka@example.com",
        emailNormalized: "tanaka@example.com",
        excludedFromShift: false,
        isDeleted: false,
      });
      return { shopId, userId, staffId };
    });
    return { t, data };
  }

  describe("setShiftExclusion", () => {
    it("同じ時刻の対象外化と復帰を別の分析source eventとして記録する", async () => {
      const occurredAt = Date.parse("2026-08-02T00:00:00.000Z");
      vi.stubEnv("ANALYTICS_SOURCE_CAPTURE_START_AT", "");
      vi.useFakeTimers();
      vi.setSystemTime(occurredAt);

      try {
        const t = convexTest(schema, modules);
        const { personId, shopId, staffId } = await t.run(async (ctx) => {
          const seeded = await seedOrganizationManagerShop(ctx, {
            subject: "analytics_shift_target_manager",
            email: "analytics-shift-target@example.com",
            shopName: "分析対象店舗",
            plan: "standard",
          });
          const staffId = await ctx.db.insert("staffs", {
            organizationId: seeded.organizationId,
            organizationPersonId: seeded.personId,
            shopId: seeded.shopId,
            userId: seeded.userId,
            name: "分析対象スタッフ",
            email: "analytics-shift-target@example.com",
            emailNormalized: "analytics-shift-target@example.com",
            excludedFromShift: false,
            isDeleted: false,
          });
          return { personId: seeded.personId, shopId: seeded.shopId, staffId };
        });
        const asManager = t.withIdentity({ subject: "analytics_shift_target_manager" });

        await asManager.mutation(api.staff.mutations.setShiftExclusion, {
          expectedOrganizationId: await getTestOrganizationId(t, shopId),
          shopId,
          staffId,
          excluded: true,
        });
        await asManager.mutation(api.staff.mutations.setShiftExclusion, {
          expectedOrganizationId: await getTestOrganizationId(t, shopId),
          shopId,
          staffId,
          excluded: false,
        });

        const events = await t.run(async (ctx) =>
          ctx.db
            .query("analyticsSourceEvents")
            .withIndex("by_shopId_and_occurredAt", (q) => q.eq("shopId", shopId))
            .collect(),
        );
        expect(events).toHaveLength(2);
        expect(new Set(events.map((event) => event.eventKey)).size).toBe(2);
        expect(events.map((event) => event.payload)).toEqual([
          {
            kind: "staffMembership",
            staffId,
            organizationPersonId: personId,
            status: "active",
            isShiftTarget: false,
            validFrom: occurredAt,
          },
          {
            kind: "staffMembership",
            staffId,
            organizationPersonId: personId,
            status: "active",
            isShiftTarget: true,
            validFrom: occurredAt,
          },
        ]);
      } finally {
        vi.unstubAllEnvs();
        vi.useRealTimers();
      }
    });

    it("未認証の場合エラーをthrow", async () => {
      const { t, data } = setupShopWithStaff();
      const { shopId, staffId } = await data;
      await expect(
        t.mutation(api.staff.mutations.setShiftExclusion, {
          expectedOrganizationId: await getTestOrganizationId(t, shopId),
          shopId,
          staffId,
          excluded: true,
        }),
      ).rejects.toThrow();
    });

    it("シフト対象外フラグをトグルできる", async () => {
      const { t, data } = setupShopWithStaff();
      const { shopId, staffId } = await data;
      const asManager = t.withIdentity({ subject: "user_mgr" });

      await asManager.mutation(api.staff.mutations.setShiftExclusion, {
        expectedOrganizationId: await getTestOrganizationId(t, shopId),
        shopId,
        staffId,
        excluded: true,
      });
      expect(await t.run(async (ctx) => (await ctx.db.get(staffId))?.excludedFromShift)).toBe(true);

      await asManager.mutation(api.staff.mutations.setShiftExclusion, {
        expectedOrganizationId: await getTestOrganizationId(t, shopId),
        shopId,
        staffId,
        excluded: false,
      });
      expect(await t.run(async (ctx) => (await ctx.db.get(staffId))?.excludedFromShift)).toBe(false);
    });

    it("管理者自身もシフト対象外にできる（削除と異なる）", async () => {
      const t = convexTest(schema, modules);

      const { adminStaffId, shopId } = await t.run(async (ctx) => {
        const { userId, shopId } = await seedManagerShop(ctx, {
          subject: "user_mgr",
          email: "mgr@example.com",
          shopName: "テスト店舗",
        });
        const adminStaffId = await seedStaff(ctx, {
          shopId,
          name: "店舗共通アドレス",
          email: "mgr@example.com",
          userId,
          isDeleted: false,
        });
        return { adminStaffId, shopId };
      });

      await t.withIdentity({ subject: "user_mgr" }).mutation(api.staff.mutations.setShiftExclusion, {
        expectedOrganizationId: await getTestOrganizationId(t, shopId),
        shopId,
        staffId: adminStaffId,
        excluded: true,
      });

      expect(await t.run(async (ctx) => (await ctx.db.get(adminStaffId))?.excludedFromShift)).toBe(true);
    });

    it("他店舗のスタッフは変更できない（IDOR）", async () => {
      const { t, data } = setupShopWithStaff();
      const { shopId } = await data;

      const otherStaffId = await t.run(async (ctx) => {
        const otherShopId = await seedShop(ctx, "他店舗");
        return await seedStaff(ctx, {
          shopId: otherShopId,
          name: "他店スタッフ",
          email: "other@example.com",
          isDeleted: false,
        });
      });

      await expect(
        t.withIdentity({ subject: "user_mgr" }).mutation(api.staff.mutations.setShiftExclusion, {
          expectedOrganizationId: await getTestOrganizationId(t, shopId),
          shopId,
          staffId: otherStaffId,
          excluded: true,
        }),
      ).rejects.toThrow("Not found");
    });

    it("削除済みスタッフは変更せず、セッション・マジックリンクも失効させない", async () => {
      const { t, data } = setupShopWithStaff();
      const { shopId, staffId } = await data;
      const ids = await t.run(async (ctx) => {
        const recruitmentId = await ctx.db.insert("recruitments", {
          shopId,
          periodStart: "2026-04-01",
          periodEnd: "2026-04-07",
          deadline: "2026-03-28",
          shopClosedDates: [],
          status: "open",
          isDeleted: false,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        });
        const sessionId = await ctx.db.insert("sessions", {
          sessionToken: "deleted-staff-session-token",
          staffId,
          shopId,
          recruitmentId,
          accessKind: "submit",
          expiresAt: Date.now() + 24 * 60 * 60 * 1000,
        });
        const magicLinkId = await ctx.db.insert("magicLinks", {
          token: "deleted-staff-magic-token",
          staffId,
          shopId,
          recruitmentId,
          accessKind: "submit",
          expiresAt: Date.now() + 24 * 60 * 60 * 1000,
        });
        await ctx.db.patch(staffId, { isDeleted: true });
        return { magicLinkId, sessionId };
      });
      const readState = () =>
        t.run(async (ctx) => ({
          magicLink: await ctx.db.get(ids.magicLinkId),
          session: await ctx.db.get(ids.sessionId),
          staff: await ctx.db.get(staffId),
        }));
      const before = await readState();

      await expect(
        t.withIdentity({ subject: "user_mgr" }).mutation(api.staff.mutations.setShiftExclusion, {
          expectedOrganizationId: await getTestOrganizationId(t, shopId),
          shopId,
          staffId,
          excluded: true,
        }),
      ).rejects.toThrow("Not found");

      expect(await readState()).toEqual(before);
    });

    it("対象外にすると発行済みのセッション・マジックリンクを失効させる", async () => {
      const { t, data } = setupShopWithStaff();
      const { shopId, staffId } = await data;

      const { sessionId, magicLinkId } = await t.run(async (ctx) => {
        const recruitmentId = await ctx.db.insert("recruitments", {
          shopId,
          periodStart: "2026-04-01",
          periodEnd: "2026-04-07",
          deadline: "2026-03-28",
          shopClosedDates: [],
          status: "open",
          isDeleted: false,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        });
        const sessionId = await ctx.db.insert("sessions", {
          sessionToken: "session-token",
          staffId,
          shopId,
          recruitmentId,
          accessKind: "submit",
          expiresAt: Date.now() + 24 * 60 * 60 * 1000,
        });
        const magicLinkId = await ctx.db.insert("magicLinks", {
          token: "magic-token",
          staffId,
          shopId,
          recruitmentId,
          accessKind: "submit",
          expiresAt: Date.now() + 24 * 60 * 60 * 1000,
        });
        return { sessionId, magicLinkId };
      });

      await t.withIdentity({ subject: "user_mgr" }).mutation(api.staff.mutations.setShiftExclusion, {
        expectedOrganizationId: await getTestOrganizationId(t, shopId),
        shopId,
        staffId,
        excluded: true,
      });

      const { session, magicLink } = await t.run(async (ctx) => ({
        session: await ctx.db.get(sessionId),
        magicLink: await ctx.db.get(magicLinkId),
      }));
      expect(session?.revokedAt).toEqual(expect.any(Number));
      expect(magicLink?.revokedAt).toEqual(expect.any(Number));
    });
  });

  describe("sendCurrentShiftNotification", () => {
    type ShiftWindow = "past" | "current" | "future";

    async function setupCurrentShiftNotification(
      t: TestConvex<typeof schema>,
      options: {
        windows?: ShiftWindow[];
        staffDeleted?: boolean;
        excludedFromShift?: boolean;
        email?: string;
        otherShop?: boolean;
      } = {},
    ) {
      return await t.run(async (ctx) => {
        const { shopId: managerShopId } = await seedManagerShop(ctx, {
          subject: "current_shift_manager",
          email: "current-shift-manager@example.com",
          shopName: "通知元店舗",
        });
        const staffShopId = options.otherShop ? await seedShop(ctx, "他店舗") : managerShopId;
        const staffId = await seedStaff(ctx, {
          shopId: staffShopId,
          name: "通知対象スタッフ",
          email: options.email ?? "current-shift-staff@example.com",
          isDeleted: options.staffDeleted ?? false,
          ...(options.excludedFromShift ? { excludedFromShift: true } : {}),
        });
        const periods: Record<ShiftWindow, { periodStart: string; periodEnd: string }> = {
          past: { periodStart: dateFromToday(-4), periodEnd: dateFromToday(-1) },
          current: { periodStart: dateFromToday(-1), periodEnd: dateFromToday(1) },
          future: { periodStart: dateFromToday(1), periodEnd: dateFromToday(3) },
        };
        const recruitmentIds: Partial<Record<ShiftWindow, Id<"recruitments">>> = {};

        for (const window of options.windows ?? ["current"]) {
          const { periodStart, periodEnd } = periods[window];
          recruitmentIds[window] = await ctx.db.insert("recruitments", {
            shopId: staffShopId,
            periodStart,
            periodEnd,
            deadline: dateFromToday(-5),
            shopClosedDates: [],
            status: "confirmed",
            confirmedAt: Date.now(),
            isDeleted: false,
            submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
          });
        }

        return { shopId: managerShopId, staffId, recruitmentIds };
      });
    }

    async function getScheduledCurrentShiftNotifications(t: TestConvex<typeof schema>) {
      return await t.run(async (ctx) => {
        const jobs = await ctx.db.system.query("_scheduled_functions").collect();
        return jobs.filter((job) => job.name === "notification/actions:sendShiftConfirmationEmails");
      });
    }

    async function getCurrentShiftNotificationOperations(t: TestConvex<typeof schema>) {
      return await t.run(async (ctx) =>
        (await ctx.db.query("notificationFanoutOperations").collect()).filter((operation) =>
          operation.operationKey.startsWith("shift.confirmation.staff-resend:v1:"),
        ),
      );
    }

    async function seedConfirmedRecruitments(t: TestConvex<typeof schema>, shopId: Id<"shops">, count: number) {
      await t.run(async (ctx) => {
        for (let index = 0; index < count; index += 1) {
          await ctx.db.insert("recruitments", {
            shopId,
            periodStart: dateFromToday(index + 1),
            periodEnd: dateFromToday(index + 2),
            deadline: dateFromToday(-1),
            shopClosedDates: [],
            status: "confirmed",
            confirmedAt: Date.now(),
            isDeleted: false,
            submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
          });
        }
      });
    }

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-07-13T12:00:00+09:00"));
    });
    afterEach(() => vi.useRealTimers());

    it("未認証では通知を予約できない", async () => {
      const t = convexTest(schema, modules);
      const { shopId, staffId } = await setupCurrentShiftNotification(t);

      await expect(
        t.mutation(api.staff.mutations.sendCurrentShiftNotification, {
          expectedOrganizationId: await getTestOrganizationId(t, shopId),
          shopId,
          staffId,
        }),
      ).rejects.toThrowError();
      expect(await getScheduledCurrentShiftNotifications(t)).toHaveLength(0);
    });

    it.each([
      ["参照切れ", "dangling"],
      ["削除済み", "deleted"],
      ["削除受付済み", "requested"],
    ] as const)("linked userが%sなら新規fanoutを作らない", async (_label, state) => {
      const t = convexTest(schema, modules);
      const { shopId, staffId } = await setupCurrentShiftNotification(t);
      await t.run(async (ctx) => {
        const staff = await ctx.db.get(staffId);
        if (!staff?.organizationPersonId) throw new Error("canonical staff not found");
        const now = Date.now();
        const linkedUserId = await ctx.db.insert("users", {
          authTokenIdentifier: `https://convex.test|current_shift_linked_user_${state}`,
          name: "確定シフト通知対象",
          email: `current-shift-linked-user-${state}@example.com`,
          emailNormalized: `current-shift-linked-user-${state}@example.com`,
          role: "manager",
          isDeleted: false,
        });
        await Promise.all([
          ctx.db.patch(staff.organizationPersonId, { userId: linkedUserId, updatedAt: now }),
          ctx.db.patch(staffId, { userId: linkedUserId }),
        ]);
        if (state === "dangling") await ctx.db.delete(linkedUserId);
        else if (state === "deleted") await ctx.db.patch(linkedUserId, { isDeleted: true });
        else await ctx.db.patch(linkedUserId, { accountDeletionRequestedAt: now });
      });

      await expect(
        t
          .withIdentity({ subject: "current_shift_manager" })
          .mutation(api.staff.mutations.sendCurrentShiftNotification, {
            expectedOrganizationId: await getTestOrganizationId(t, shopId),
            shopId,
            staffId,
          }),
      ).resolves.toEqual({ scheduled: false, reason: "noCurrentShift" });
      await expect(
        t.mutation(internal.staff.mutations.prepareLegacyCurrentShiftConfirmationFanout, { staffId }),
      ).resolves.toEqual({ status: "skipped", reason: "noCurrentShift" });

      const stateAfter = await t.run(async (ctx) => ({
        fanoutOperations: await ctx.db.query("notificationFanoutOperations").collect(),
        outbox: await ctx.db.query("notificationOutbox").collect(),
        rateLimits: await ctx.db.query("rateLimits").collect(),
        scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
      }));
      expect(stateAfter).toEqual({ fanoutOperations: [], outbox: [], rateLimits: [], scheduled: [] });
    });

    it("現在と将来の確定シフトを募集ごとのdurable operationへ固定して予約する", async () => {
      const t = convexTest(schema, modules);
      const { shopId, staffId, recruitmentIds } = await setupCurrentShiftNotification(t, {
        windows: ["past", "current", "future"],
      });

      const result = await t
        .withIdentity({ subject: "current_shift_manager" })
        .mutation(api.staff.mutations.sendCurrentShiftNotification, {
          expectedOrganizationId: await getTestOrganizationId(t, shopId),
          shopId,
          staffId,
        });
      const jobs = await getScheduledCurrentShiftNotifications(t);
      const operations = await getCurrentShiftNotificationOperations(t);
      const operationByRecruitmentId = new Map(operations.map((operation) => [operation.recruitmentId, operation]));

      expect(result).toEqual({ scheduled: true });
      expect(operations).toHaveLength(2);
      for (const recruitmentId of [recruitmentIds.current, recruitmentIds.future]) {
        if (!recruitmentId) throw new Error("current/future recruitment was not created");
        const operation = operationByRecruitmentId.get(recruitmentId);
        expect(operation).toMatchObject({
          kind: "confirmation",
          purpose: "confirmation",
          recruitmentId,
          shopId,
          targetStaffIds: [staffId],
          cursor: 0,
          status: "pending",
          supersedesActiveOperations: false,
          confirmationOperationKeyAtOrigin: null,
          recruitmentDraftSavedAtAtOrigin: null,
          scheduledFunctionId: expect.any(String),
        });
        expect(operation?.operationKey).toMatch(
          new RegExp(`^shift\\.confirmation\\.staff-resend:v1:${recruitmentId}:${staffId}:[0-9a-f-]{36}$`),
        );
        expect(operation?.dedupeSuffix).toBe(`staff-resend:${operation?.operationKey.split(":").at(-1)}`);
      }
      expect(jobs).toHaveLength(2);
      expect(
        jobs
          .map((job) => ({
            recruitmentId: job.args[0]?.recruitmentId,
            isResend: job.args[0]?.isResend,
            fanoutOperationId: job.args[0]?.fanoutOperationId,
          }))
          .sort((left, right) => String(left.recruitmentId).localeCompare(String(right.recruitmentId))),
      ).toEqual(
        [recruitmentIds.current, recruitmentIds.future]
          .map((recruitmentId) => ({
            recruitmentId,
            isResend: false,
            fanoutOperationId: recruitmentId ? operationByRecruitmentId.get(recruitmentId)?._id : undefined,
          }))
          .sort((left, right) => String(left.recruitmentId).localeCompare(String(right.recruitmentId))),
      );
    });

    it("対象募集は40件を全件予約し、41件目が加わるとfail closedする", async () => {
      const t = convexTest(schema, modules);
      const { shopId, staffId } = await setupCurrentShiftNotification(t, { windows: [] });
      await seedConfirmedRecruitments(t, shopId, CURRENT_SHIFT_NOTIFICATION_LIMIT);

      const result = await t
        .withIdentity({ subject: "current_shift_manager" })
        .mutation(api.staff.mutations.sendCurrentShiftNotification, {
          expectedOrganizationId: await getTestOrganizationId(t, shopId),
          shopId,
          staffId,
        });
      const operations = await getCurrentShiftNotificationOperations(t);
      const jobs = await getScheduledCurrentShiftNotifications(t);

      expect(result).toEqual({ scheduled: true });
      expect(operations).toHaveLength(CURRENT_SHIFT_NOTIFICATION_LIMIT);
      expect(operations.every((operation) => operation.purpose === "confirmation")).toBe(true);
      expect(operations.every((operation) => operation.supersedesActiveOperations === false)).toBe(true);
      expect(operations.every((operation) => operation.confirmationOperationKeyAtOrigin === null)).toBe(true);
      expect(operations.every((operation) => operation.recruitmentDraftSavedAtAtOrigin === null)).toBe(true);
      expect(jobs).toHaveLength(CURRENT_SHIFT_NOTIFICATION_LIMIT);
      expect(jobs.every((job) => job.args[0]?.isResend === false)).toBe(true);
      expect(new Set(jobs.map((job) => job.args[0]?.fanoutOperationId))).toEqual(
        new Set(operations.map((operation) => operation._id)),
      );

      await seedConfirmedRecruitments(t, shopId, 1);
      await expect(
        t.mutation(internal.staff.mutations.prepareLegacyCurrentShiftConfirmationFanout, { staffId }),
      ).resolves.toEqual({ status: "skipped", reason: "tooManyCurrentShifts" });
      const beforeOverflow = await t.run(async (ctx) => ({
        operations: await ctx.db.query("notificationFanoutOperations").collect(),
        jobs: await ctx.db.system.query("_scheduled_functions").collect(),
        rateLimits: await ctx.db.query("rateLimits").collect(),
      }));
      await expect(
        t
          .withIdentity({ subject: "current_shift_manager" })
          .mutation(api.staff.mutations.sendCurrentShiftNotification, {
            expectedOrganizationId: await getTestOrganizationId(t, shopId),
            shopId,
            staffId,
          }),
      ).resolves.toEqual({ scheduled: false, reason: "tooManyCurrentShifts" });
      await expect(
        t.run(async (ctx) => ({
          operations: await ctx.db.query("notificationFanoutOperations").collect(),
          jobs: await ctx.db.system.query("_scheduled_functions").collect(),
          rateLimits: await ctx.db.query("rateLimits").collect(),
        })),
      ).resolves.toEqual(beforeOverflow);
    });

    it("未確定のシフト変更が1件でもあれば全件をfail closedし副作用を作らない", async () => {
      const t = convexTest(schema, modules);
      const { shopId, staffId, recruitmentIds } = await setupCurrentShiftNotification(t, {
        windows: ["current", "future"],
      });
      const futureRecruitmentId = recruitmentIds.future;
      if (!futureRecruitmentId) throw new Error("future recruitment was not created");
      await t.run(async (ctx) =>
        ctx.db.patch(futureRecruitmentId, {
          confirmedAt: Date.now(),
          draftSavedAt: Date.now() + 1,
        }),
      );

      await expect(
        t.mutation(internal.staff.mutations.prepareLegacyCurrentShiftConfirmationFanout, { staffId }),
      ).resolves.toEqual({ status: "skipped", reason: "unconfirmedChanges" });
      const result = await t
        .withIdentity({ subject: "current_shift_manager" })
        .mutation(api.staff.mutations.sendCurrentShiftNotification, {
          expectedOrganizationId: await getTestOrganizationId(t, shopId),
          shopId,
          staffId,
        });
      const state = await t.run(async (ctx) => ({
        operations: await ctx.db.query("notificationFanoutOperations").collect(),
        jobs: await ctx.db.system.query("_scheduled_functions").collect(),
        rateLimits: await ctx.db.query("rateLimits").collect(),
      }));

      expect(result).toEqual({ scheduled: false, reason: "unconfirmedChanges" });
      expect(state).toEqual({ operations: [], jobs: [], rateLimits: [] });
    });

    it("過去の確定シフトしかなければ通知を予約しない", async () => {
      const t = convexTest(schema, modules);
      const { shopId, staffId } = await setupCurrentShiftNotification(t, { windows: ["past"] });

      const result = await t
        .withIdentity({ subject: "current_shift_manager" })
        .mutation(api.staff.mutations.sendCurrentShiftNotification, {
          expectedOrganizationId: await getTestOrganizationId(t, shopId),
          shopId,
          staffId,
        });

      expect(result).toEqual({ scheduled: false, reason: "noCurrentShift" });
      expect(await getScheduledCurrentShiftNotifications(t)).toHaveLength(0);
    });

    it("他店舗のスタッフには通知を予約できない（IDOR）", async () => {
      const t = convexTest(schema, modules);
      const { shopId, staffId } = await setupCurrentShiftNotification(t, { otherShop: true });

      await expect(
        t
          .withIdentity({ subject: "current_shift_manager" })
          .mutation(api.staff.mutations.sendCurrentShiftNotification, {
            expectedOrganizationId: await getTestOrganizationId(t, shopId),
            shopId,
            staffId,
          }),
      ).rejects.toThrowError("Not found");
      expect(await getScheduledCurrentShiftNotifications(t)).toHaveLength(0);
    });

    it("削除済みスタッフには通知を予約できない", async () => {
      const t = convexTest(schema, modules);
      const { shopId, staffId } = await setupCurrentShiftNotification(t, { staffDeleted: true });

      await expect(
        t
          .withIdentity({ subject: "current_shift_manager" })
          .mutation(api.staff.mutations.sendCurrentShiftNotification, {
            expectedOrganizationId: await getTestOrganizationId(t, shopId),
            shopId,
            staffId,
          }),
      ).rejects.toThrowError("Not found");
      expect(await getScheduledCurrentShiftNotifications(t)).toHaveLength(0);
    });

    it("シフト対象外スタッフには通知を予約しない", async () => {
      const t = convexTest(schema, modules);
      const { shopId, staffId } = await setupCurrentShiftNotification(t, { excludedFromShift: true });

      const result = await t
        .withIdentity({ subject: "current_shift_manager" })
        .mutation(api.staff.mutations.sendCurrentShiftNotification, {
          expectedOrganizationId: await getTestOrganizationId(t, shopId),
          shopId,
          staffId,
        });

      expect(result).toEqual({ scheduled: false, reason: "noCurrentShift" });
      expect(await getScheduledCurrentShiftNotifications(t)).toHaveLength(0);
    });

    it("メール・LINE連携のないスタッフには通知を予約できない", async () => {
      const t = convexTest(schema, modules);
      const { shopId, staffId } = await setupCurrentShiftNotification(t, { email: "" });

      await expect(
        t
          .withIdentity({ subject: "current_shift_manager" })
          .mutation(api.staff.mutations.sendCurrentShiftNotification, {
            expectedOrganizationId: await getTestOrganizationId(t, shopId),
            shopId,
            staffId,
          }),
      ).rejects.toThrowError("メールアドレスの登録またはLINE連携が必要です。");
      expect(await getScheduledCurrentShiftNotifications(t)).toHaveLength(0);
    });

    it("短時間の再送はrate limitで拒否し通知予約を重複させない", async () => {
      const t = convexTest(schema, modules);
      const { shopId, staffId } = await setupCurrentShiftNotification(t);
      const asManager = t.withIdentity({ subject: "current_shift_manager" });

      const first = await asManager.mutation(api.staff.mutations.sendCurrentShiftNotification, {
        expectedOrganizationId: await getTestOrganizationId(t, shopId),
        shopId,
        staffId,
      });
      const second = await asManager.mutation(api.staff.mutations.sendCurrentShiftNotification, {
        expectedOrganizationId: await getTestOrganizationId(t, shopId),
        shopId,
        staffId,
      });

      expect(first).toEqual({ scheduled: true });
      expect(second).toEqual({ scheduled: false, reason: "rateLimited" });
      expect(await getScheduledCurrentShiftNotifications(t)).toHaveLength(1);
    });
  });

  describe.each([
    ["募集通知", "openRecruitments", "notification/actions:sendOpenRecruitmentNotificationsForStaff"],
    ["現在の確定シフト", "currentShift", "notification/actions:sendShiftConfirmationEmails"],
  ] as const)("%sの個別再送quota", (_label, kind, scheduledJobName) => {
    async function setupNotificationQuotaTest(t: TestConvex<typeof schema>) {
      return await t.run(async (ctx) => {
        const base = await seedOrganizationManagerShop(ctx, {
          subject: "staff_resend_manager_1",
          email: "staff-resend-manager-1@example.com",
          plan: "standard",
        });
        const now = Date.now();
        for (const managerNumber of [2, 3]) {
          const subject = `staff_resend_manager_${managerNumber}`;
          const email = `${subject}@example.com`;
          const userId = await seedUser(ctx, subject, email);
          const personId = await ctx.db.insert("organizationPeople", {
            organizationId: base.organizationId,
            userId,
            name: `管理者${managerNumber}`,
            email,
            emailNormalized: email,
            status: "active",
            createdAt: now,
            updatedAt: now,
          });
          await ctx.db.insert("organizationMembers", {
            organizationId: base.organizationId,
            personId,
            userId,
            status: "active",
            createdAt: now,
            updatedAt: now,
          });
        }
        const staffId = await seedStaff(ctx, {
          shopId: base.shopId,
          name: "個別通知対象",
          email: "staff-resend-target@example.com",
          isDeleted: false,
        });
        await ctx.db.insert("recruitments", {
          shopId: base.shopId,
          periodStart: dateFromToday(7),
          periodEnd: dateFromToday(13),
          deadline: todayJST(),
          shopClosedDates: [],
          status: "open",
          isDeleted: false,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        });
        await ctx.db.insert("recruitments", {
          shopId: base.shopId,
          periodStart: dateFromToday(-1),
          periodEnd: dateFromToday(1),
          deadline: dateFromToday(-5),
          shopClosedDates: [],
          status: "confirmed",
          confirmedAt: now,
          isDeleted: false,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        });
        return { shopId: base.shopId, staffId };
      });
    }

    async function getNotificationSideEffects(t: TestConvex<typeof schema>) {
      return await t.run(async (ctx) => {
        const rateLimitRows = (await ctx.db.query("rateLimits").collect())
          .map(({ name, key, value, ts }) => ({ name, key, value, ts }))
          .sort((a, b) => `${a.name}:${a.key ?? ""}`.localeCompare(`${b.name}:${b.key ?? ""}`));
        return {
          scheduledJobs: (await ctx.db.system.query("_scheduled_functions").collect()).filter(
            (job) => job.name === scheduledJobName,
          ).length,
          magicLinks: (await ctx.db.query("magicLinks").collect()).length,
          outbox: (await ctx.db.query("notificationOutbox").collect()).length,
          rateLimitRows,
        };
      });
    }

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-07-21T12:00:00+09:00"));
    });
    afterEach(() => {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    });

    it("有効な送信履歴から10分間は副作用とquota消費なしで拒否し、10分ちょうどで許可する", async () => {
      const t = convexTest(schema, modules);
      const ids = await setupNotificationQuotaTest(t);
      await t.run(
        async (ctx) =>
          await seedNotificationHistory(ctx, {
            shopId: ids.shopId,
            staffId: ids.staffId,
            notificationKind:
              kind === "openRecruitments" ? SHIFT_RECRUITMENT_NOTIFICATION_KIND : SHIFT_CONFIRMATION_NOTIFICATION_KIND,
            requestedAt: Date.now(),
          }),
      );
      const beforeRejection = await getNotificationSideEffects(t);

      await expect(sendNotification(t, ids)).resolves.toEqual({
        scheduled: false,
        reason: "recentlySent",
      });
      expect(await getNotificationSideEffects(t)).toEqual(beforeRejection);

      vi.advanceTimersByTime(NOTIFICATION_RESEND_COOLDOWN_MS);
      await expect(sendNotification(t, ids)).resolves.toEqual({ scheduled: true });
    });

    it.each(["failed", "cancelled"] as const)("%sの送信履歴は再送を止めない", async (sendStatus) => {
      const t = convexTest(schema, modules);
      const ids = await setupNotificationQuotaTest(t);
      await t.run(
        async (ctx) =>
          await seedNotificationHistory(ctx, {
            shopId: ids.shopId,
            staffId: ids.staffId,
            notificationKind:
              kind === "openRecruitments" ? SHIFT_RECRUITMENT_NOTIFICATION_KIND : SHIFT_CONFIRMATION_NOTIFICATION_KIND,
            requestedAt: Date.now(),
            sendStatus,
          }),
      );

      await expect(sendNotification(t, ids)).resolves.toEqual({ scheduled: true });
    });

    async function sendNotification(t: TestConvex<typeof schema>, ids: { shopId: Id<"shops">; staffId: Id<"staffs"> }) {
      const actor = t.withIdentity({ subject: "staff_resend_manager_1" });
      const args = {
        expectedOrganizationId: await getTestOrganizationId(t, ids.shopId),
        shopId: ids.shopId,
        staffId: ids.staffId,
      };
      return kind === "openRecruitments"
        ? await actor.mutation(api.staff.mutations.sendOpenRecruitmentNotifications, args)
        : await actor.mutation(api.staff.mutations.sendCurrentShiftNotification, args);
    }

    it("反復送信でもactor短期・日次と組織日次を迂回できず、拒否時の副作用は0になる", async () => {
      const t = convexTest(schema, modules);
      const ids = await setupNotificationQuotaTest(t);
      const providerCall = vi.fn();
      vi.stubGlobal("fetch", providerCall);

      const send = async (managerNumber: number) => {
        const actor = t.withIdentity({ subject: `staff_resend_manager_${managerNumber}` });
        const args = {
          expectedOrganizationId: await getTestOrganizationId(t, ids.shopId),
          shopId: ids.shopId,
          staffId: ids.staffId,
        };
        return kind === "openRecruitments"
          ? await actor.mutation(api.staff.mutations.sendOpenRecruitmentNotifications, args)
          : await actor.mutation(api.staff.mutations.sendCurrentShiftNotification, args);
      };
      const movePastShortLimit = () => vi.setSystemTime(new Date(Date.now() + 61_000));

      await expect(send(1)).resolves.toEqual({ scheduled: true });
      const afterFirst = await getNotificationSideEffects(t);
      await expect(send(1)).resolves.toEqual({ scheduled: false, reason: "rateLimited" });
      expect(await getNotificationSideEffects(t)).toEqual(afterFirst);

      for (let request = 1; request < STAFF_NOTIFICATION_RESEND_ACTOR_DAILY_LIMIT; request += 1) {
        movePastShortLimit();
        await expect(send(1)).resolves.toEqual({ scheduled: true });
      }
      movePastShortLimit();
      const beforeActorDailyRejection = await getNotificationSideEffects(t);
      await expect(send(1)).resolves.toEqual({ scheduled: false, reason: "rateLimited" });
      expect(await getNotificationSideEffects(t)).toEqual(beforeActorDailyRejection);

      // actor側の上限で拒否された操作は組織bucketを消費せず、別managerは通常どおり送れる。
      await expect(send(2)).resolves.toEqual({ scheduled: true });
      const remainingOrganizationBudget =
        STAFF_NOTIFICATION_RESEND_ORGANIZATION_DAILY_LIMIT - STAFF_NOTIFICATION_RESEND_ACTOR_DAILY_LIMIT - 1;
      for (let request = 0; request < remainingOrganizationBudget; request += 1) {
        movePastShortLimit();
        await expect(send(2)).resolves.toEqual({ scheduled: true });
      }

      movePastShortLimit();
      const beforeOrganizationDailyRejection = await getNotificationSideEffects(t);
      await expect(send(3)).resolves.toEqual({ scheduled: false, reason: "rateLimited" });
      expect(await getNotificationSideEffects(t)).toEqual(beforeOrganizationDailyRejection);
      expect(beforeOrganizationDailyRejection).toMatchObject({
        scheduledJobs: STAFF_NOTIFICATION_RESEND_ORGANIZATION_DAILY_LIMIT,
        magicLinks: 0,
        outbox: 0,
      });
      expect(providerCall).not.toHaveBeenCalled();
    });
  });

  describe.each([
    ["募集通知", "openRecruitments", "notification/actions:sendOpenRecruitmentNotificationsForStaff"],
    ["現在の確定シフト", "currentShift", "notification/actions:sendShiftConfirmationEmails"],
  ] as const)("%sの配送対象数quota", (_label, kind, scheduledJobName) => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-07-21T12:00:00+09:00"));
    });
    afterEach(() => vi.useRealTimers());

    it("別スタッフへ分散してもorganization単位の短期target budgetを迂回できない", async () => {
      const t = convexTest(schema, modules);
      const ids = await t.run(async (ctx) => {
        const base = await seedOrganizationManagerShop(ctx, {
          subject: `staff_target_quota_${kind}`,
          email: `staff-target-quota-${kind}@example.com`,
          plan: "standard",
        });
        const staffIds: Id<"staffs">[] = [];
        for (let index = 0; index < 2; index += 1) {
          staffIds.push(
            await seedStaff(ctx, {
              shopId: base.shopId,
              name: `target quotaスタッフ${index}`,
              email: `staff-target-quota-${kind}-${index}@example.com`,
              isDeleted: false,
            }),
          );
        }
        for (let index = 0; index < 2; index += 1) {
          await ctx.db.insert("recruitments", {
            shopId: base.shopId,
            periodStart: dateFromToday(7 + index * 7),
            periodEnd: dateFromToday(13 + index * 7),
            deadline: dateFromToday(3 + index * 7),
            shopClosedDates: [],
            status: kind === "openRecruitments" ? "open" : "confirmed",
            ...(kind === "currentShift" ? { confirmedAt: Date.now() } : {}),
            isDeleted: false,
            submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
          });
        }
        return { organizationId: base.organizationId, shopId: base.shopId, staffIds };
      });
      const actor = t.withIdentity({ subject: `staff_target_quota_${kind}` });
      const send = async (staffId: Id<"staffs">) => {
        const args = {
          expectedOrganizationId: await getTestOrganizationId(t, ids.shopId),
          shopId: ids.shopId,
          staffId,
        };
        return kind === "openRecruitments"
          ? await actor.mutation(api.staff.mutations.sendOpenRecruitmentNotifications, args)
          : await actor.mutation(api.staff.mutations.sendCurrentShiftNotification, args);
      };
      const getState = async () =>
        await t.run(async (ctx) => ({
          jobs: (await ctx.db.system.query("_scheduled_functions").collect()).filter(
            (job) => job.name === scheduledJobName,
          ),
          operations: await ctx.db.query("notificationFanoutOperations").collect(),
          rateLimits: (await ctx.db.query("rateLimits").collect())
            .map(({ name, key, value, ts }) => ({ name, key, value, ts }))
            .sort((left, right) => `${left.name}:${left.key ?? ""}`.localeCompare(`${right.name}:${right.key ?? ""}`)),
        }));

      const acceptedStaffId = ids.staffIds[0];
      if (!acceptedStaffId) throw new Error("target quota staff was not created");
      await expect(send(acceptedStaffId)).resolves.toEqual({ scheduled: true });
      await t.run(async (ctx) => {
        const consumed = await rateLimit(ctx, {
          name: "staffNotificationResendScopeTargetShort",
          key: `${ids.organizationId}:${kind}`,
          count: STAFF_NOTIFICATION_RESEND_SCOPE_TARGET_SHORT_LIMIT - 2,
        });
        if (!consumed.ok) throw new Error("target quota preconsume failed");
      });
      const beforeRejection = await getState();
      const rejectedStaffId = ids.staffIds[1];
      if (!rejectedStaffId) throw new Error("target quota rejection staff was not created");
      await expect(send(rejectedStaffId)).resolves.toEqual({
        scheduled: false,
        reason: "rateLimited",
      });

      expect(await getState()).toEqual(beforeRejection);
      expect(beforeRejection.jobs).toHaveLength(kind === "openRecruitments" ? 1 : 2);
      expect(beforeRejection.operations).toHaveLength(kind === "openRecruitments" ? 0 : 2);
    });
  });
});
