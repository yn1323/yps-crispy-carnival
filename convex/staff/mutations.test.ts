import type { TestConvex } from "convex-test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { toAuditRequestKey } from "../_lib/auditCorrelation";
import { todayJST } from "../_lib/dateFormat";
import { rateLimit } from "../_lib/rateLimits";
import { seedManagerShop, seedOrganizationManagerShop, seedShop, seedUser } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import {
  CURRENT_SHIFT_NOTIFICATION_LIMIT,
  PERSON_NAME_MAX_LENGTH,
  SHOP_MEMBERSHIP_STATS_OPEN_RECRUITMENT_LIMIT,
  SHOP_MEMBERSHIP_STATS_RECALCULATION_WORK_LIMIT,
  STAFF_ADD_ENTRIES_MAX,
  STAFF_NOTIFICATION_RESEND_ACTOR_DAILY_LIMIT,
  STAFF_NOTIFICATION_RESEND_ORGANIZATION_DAILY_LIMIT,
  STAFF_NOTIFICATION_RESEND_SCOPE_TARGET_SHORT_LIMIT,
} from "../constants";
import { getLegalConsentVersions } from "../legal/documents";
import { ORGANIZATION_SHOP_STAFF_MEMBERSHIP_CHANGE_TARGET_LIMIT } from "../organization/shopMembershipChange";
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

function addedStaffIds(
  result:
    | { status: "added"; staffIds: Id<"staffs">[] }
    | {
        status: "requiresConfirmation";
        candidates: Array<{ personId: Id<"organizationPeople">; name: string; email: string }>;
      },
) {
  if (result.status !== "added") throw new Error("スタッフ追加が確認待ちになりました");
  return result.staffIds;
}

async function seedMembershipChangeShop(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  name: string,
  operatingStatus: "active" | "archived" | "planSuspended" = "active",
) {
  return await ctx.db.insert("shops", {
    organizationId,
    operatingStatus,
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
    .query(api.staff.queries.getOrganizationShopStaffMembershipChange, { shopId: args.shopId });
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
      shopId: args.shopId,
      personIds: args.personIds,
      expectedMembershipFingerprint: args.expectedMembershipFingerprint,
      now: Date.now(),
    });
  if (preview?.kind !== "ready") throw new Error("店舗の所属スタッフ解除previewを取得できませんでした");
  return preview.removals;
}

async function readManagerMembershipProtectedState(t: TestConvex<typeof schema>) {
  return await t.run(async (ctx) => ({
    people: await ctx.db.query("organizationPeople").collect(),
    members: await ctx.db.query("organizationMembers").collect(),
    staffs: await ctx.db.query("staffs").collect(),
    assignments: await ctx.db.query("shiftAssignments").collect(),
    submissions: await ctx.db.query("shiftSubmissions").collect(),
    stats: await ctx.db.query("recruitmentStats").collect(),
    audits: await ctx.db.query("organizationAuditEvents").collect(),
    outbox: await ctx.db.query("notificationOutbox").collect(),
    sessions: await ctx.db.query("sessions").collect(),
    magicLinks: await ctx.db.query("magicLinks").collect(),
    lineLinkTokens: await ctx.db.query("lineLinkTokens").collect(),
    lineAccounts: await ctx.db.query("staffLineAccounts").collect(),
    scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
  }));
}

describe("staff/mutations", () => {
  describe("addStaffs", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("未認証の場合エラーをthrow", async () => {
      const t = convexTest(schema, modules);
      const shopId = await t.run(async (ctx) => await seedShop(ctx, "テスト店舗"));
      await expect(
        t.mutation(api.staff.mutations.addStaffs, {
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

    it("事業者配下では人物を作成してstaffsへ事業者・人物IDをdual-writeする", async () => {
      const t = convexTest(schema, modules);
      const { shopId, organizationId } = await t.run(
        async (ctx) =>
          await seedOrganizationManagerShop(ctx, {
            subject: "organization_manager",
            email: "organization-manager@example.com",
          }),
      );

      const [staffId] = addedStaffIds(
        await t.withIdentity({ subject: "organization_manager" }).mutation(api.staff.mutations.addStaffs, {
          shopId,
          requestId: nextStaffAddRequestId(),
          entries: [{ name: "事業者スタッフ", email: "  Staff@Example.com  " }],
        }),
      );

      const state = await t.run(async (ctx) => {
        const staff = await ctx.db.get(staffId);
        const person = staff?.organizationPersonId ? await ctx.db.get(staff.organizationPersonId) : null;
        return { staff, person };
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
    });

    it("同じ事業者の人物は利用人数上限時も別店舗で再利用し、新しい人物を作らない", async () => {
      const t = convexTest(schema, modules);
      const seeded = await t.run(async (ctx) => {
        const organization = await seedOrganizationManagerShop(ctx, {
          subject: "reuse_manager",
          email: "reuse-manager@example.com",
          plan: "pro",
        });
        const secondShopId = await ctx.db.insert("shops", {
          organizationId: organization.organizationId,
          operatingStatus: "active",
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

    it("利用人数に未算入のreadOnly人物をスタッフ化する場合も一人分の空きを要求する", async () => {
      const t = convexTest(schema, modules);
      const seeded = await t.run(async (ctx) => {
        const organization = await seedOrganizationManagerShop(ctx, {
          subject: "readonly_staff_capacity_manager",
          plan: "free",
        });
        const now = Date.now();
        for (let index = 0; index < 4; index += 1) {
          const email = `readonly-capacity-staff-${index}@example.com`;
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
            shopId: organization.shopId,
            organizationId: organization.organizationId,
            organizationPersonId: personId,
            name: `既存スタッフ${index}`,
            email,
            emailNormalized: email,
            isDeleted: false,
          });
        }
        const targetUserId = await seedUser(ctx, "readonly_staff_capacity_target", "readonly-target@example.com");
        const targetPersonId = await ctx.db.insert("organizationPeople", {
          organizationId: organization.organizationId,
          userId: targetUserId,
          name: "閲覧のみ人物",
          email: "readonly-target@example.com",
          emailNormalized: "readonly-target@example.com",
          status: "active",
          createdAt: now,
          updatedAt: now,
        });
        await ctx.db.insert("organizationMembers", {
          organizationId: organization.organizationId,
          personId: targetPersonId,
          userId: targetUserId,
          status: "readOnly",
          createdAt: now,
          updatedAt: now,
        });
        return { ...organization, targetPersonId };
      });

      await expect(
        t.withIdentity({ subject: "readonly_staff_capacity_manager" }).mutation(api.staff.mutations.addStaffs, {
          shopId: seeded.shopId,
          requestId: nextStaffAddRequestId(),
          entries: [{ name: "入力名", email: "readonly-target@example.com" }],
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
          plan: "business",
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
            currentPlan: "business",
            targetPlan: "pro",
            effectiveAt: now + 30 * 24 * 60 * 60 * 1000,
          },
        });
        return organization;
      });

      await expect(
        t.withIdentity({ subject: "scheduled_pro_staff_manager" }).mutation(api.staff.mutations.addStaffs, {
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
          plan: "pro",
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
          email: "Reserved-Staff@Example.com",
          emailNormalized: "reserved-staff@example.com",
          tokenDigest: "reserved-seat-to-staff-person",
          status: "pending",
          purpose: "managerAddition",
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
        shopId: seeded.shopId,
        requestId,
        entries,
      });
      const staffIds = addedStaffIds(result);
      await expect(
        asManager.mutation(api.staff.mutations.addStaffs, {
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
      expect(state.invitation).toMatchObject({ status: "pending", reservedSeat: false, version: 1 });
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
          plan: "pro",
        });
        const now = Date.now();
        const invitationIds: Id<"organizationInvitations">[] = [];
        for (let index = 0; index < 3; index += 1) {
          invitationIds.push(
            await ctx.db.insert("organizationInvitations", {
              organizationId: organization.organizationId,
              email: "duplicate-reservation@example.com",
              emailNormalized: "duplicate-reservation@example.com",
              tokenDigest: `duplicate-reservation-${index}`,
              status: "pending",
              purpose: "managerAddition",
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

    it("削除済み人物は明示確認後だけ再有効化し、旧権限・店舗所属・認証情報を復元せず冪等に追加する", async () => {
      const t = convexTest(schema, modules);
      const seeded = await t.run(async (ctx) => {
        const organization = await seedOrganizationManagerShop(ctx, {
          subject: "removed_manager",
          email: "removed-manager@example.com",
          plan: "pro",
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
          operatingStatus: "active",
          name: "旧所属店舗",
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
          regularClosedDays: [],
          isDeleted: false,
        });
        const oldTargetStaffId = await ctx.db.insert("staffs", {
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
          sessionToken: "removed-person-session",
          staffId: oldTargetStaffId,
          shopId: organization.shopId,
          recruitmentId,
          expiresAt: now + 86_400_000,
          revokedAt,
        });
        const magicLinkId = await ctx.db.insert("magicLinks", {
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
          email: "Removed@Example.com",
          emailNormalized: "removed@example.com",
          tokenDigest: "removed-person-invitation",
          status: "revoked",
          inviterMemberId: organization.memberId,
          reservedSeat: false,
          version: 2,
          acceptedByPersonId: removedPersonId,
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
      const preview = await asManager.mutation(api.staff.mutations.addStaffs, {
        shopId: seeded.shopId,
        requestId,
        entries,
      });
      expect(preview).toEqual({
        status: "requiresConfirmation",
        candidates: [{ personId: seeded.removedPersonId, name: "登録済み人物", email: "Removed@Example.com" }],
      });

      const previewState = await t.run(async (ctx) => ({
        audits: await ctx.db.query("organizationAuditEvents").collect(),
        person: await ctx.db.get(seeded.removedPersonId),
        scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
        staffs: await ctx.db
          .query("staffs")
          .withIndex("by_organizationId_and_organizationPersonId", (q) =>
            q.eq("organizationId", seeded.organizationId).eq("organizationPersonId", seeded.removedPersonId),
          )
          .collect(),
      }));
      expect(previewState.person?.status).toBe("removed");
      expect(previewState.staffs.map((staff) => staff._id)).toEqual([seeded.oldTargetStaffId, seeded.oldOtherStaffId]);
      expect(previewState.audits).toEqual([]);
      expect(previewState.scheduled).toEqual([]);

      if (preview.status !== "requiresConfirmation") throw new Error("再追加確認候補がありません");
      const confirmationArgs = {
        shopId: seeded.shopId,
        requestId,
        entries,
        confirmReactivationPersonIds: preview.candidates.map((candidate) => candidate.personId),
      };
      const confirmed = await asManager.mutation(api.staff.mutations.addStaffs, confirmationArgs);
      const confirmedStaffIds = addedStaffIds(confirmed);
      expect(confirmedStaffIds).toHaveLength(1);
      await expect(asManager.mutation(api.staff.mutations.addStaffs, confirmationArgs)).resolves.toEqual(confirmed);

      const state = await t.run(async (ctx) => ({
        audits: await ctx.db.query("organizationAuditEvents").collect(),
        invitation: await ctx.db.get(seeded.invitationId),
        lineAccount: await ctx.db.get(seeded.lineAccountId),
        lineLinkToken: await ctx.db.get(seeded.lineLinkTokenId),
        magicLink: await ctx.db.get(seeded.magicLinkId),
        member: await ctx.db.get(seeded.removedMemberId),
        newStaff: await ctx.db.get(confirmedStaffIds[0]),
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
      expect(state.person).toMatchObject({ status: "active", name: "登録済み人物", email: "Removed@Example.com" });
      expect(state.newStaff).toMatchObject({
        shopId: seeded.shopId,
        organizationId: seeded.organizationId,
        organizationPersonId: seeded.removedPersonId,
        name: "登録済み人物",
        email: "removed@example.com",
        isDeleted: false,
      });
      expect(state.staffs).toHaveLength(3);
      expect(state.oldTargetStaff?.isDeleted).toBe(true);
      expect(state.oldOtherStaff?.isDeleted).toBe(true);
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

    it("アカウント削除受付済みuserを持つ削除済み人物は明示確認しても再有効化しない", async () => {
      const t = convexTest(schema, modules);
      const seeded = await t.run(async (ctx) => {
        const organization = await seedOrganizationManagerShop(ctx, {
          subject: "requested_reactivation_manager",
          email: "requested-reactivation-manager@example.com",
          plan: "pro",
        });
        const removedUserId = await seedUser(ctx, "requested_reactivation_person", "requested-person@example.com");
        await ctx.db.patch(removedUserId, { accountDeletionRequestedAt: Date.now() });
        const now = Date.now();
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
      const preview = await actor.mutation(api.staff.mutations.addStaffs, {
        shopId: seeded.shopId,
        requestId,
        entries,
      });
      if (preview.status !== "requiresConfirmation") throw new Error("再追加確認候補がありません");

      await expect(
        actor.mutation(api.staff.mutations.addStaffs, {
          shopId: seeded.shopId,
          requestId,
          entries,
          confirmReactivationPersonIds: preview.candidates.map((candidate) => candidate.personId),
        }),
      ).rejects.toThrow("このユーザーは再追加できません。");

      const state = await t.run(async (ctx) => ({
        person: await ctx.db.get(seeded.removedPersonId),
        user: await ctx.db.get(seeded.removedUserId),
        staffs: await ctx.db
          .query("staffs")
          .withIndex("by_organizationId_and_organizationPersonId", (q) =>
            q.eq("organizationId", seeded.organizationId).eq("organizationPersonId", seeded.removedPersonId),
          )
          .collect(),
        audits: await ctx.db.query("organizationAuditEvents").collect(),
        scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
      }));
      expect(state.person?.status).toBe("removed");
      expect(state.user).toMatchObject({
        isDeleted: false,
        accountDeletionRequestedAt: expect.any(Number),
      });
      expect(state.staffs).toEqual([]);
      expect(state.audits).toEqual([]);
      expect(state.scheduled).toEqual([]);
    });

    it("削除済み人物に有効な管理者所属が残る不整合では権限を暗黙復元しない", async () => {
      const t = convexTest(schema, modules);
      const seeded = await t.run(async (ctx) => {
        const organization = await seedOrganizationManagerShop(ctx, {
          subject: "stale_manager_membership_owner",
          email: "stale-owner@example.com",
          plan: "pro",
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
          shopId: seeded.shopId,
          requestId: nextStaffAddRequestId(),
          entries: [{ name: "再追加", email: "stale-manager@example.com" }],
        }),
      ).rejects.toThrow("削除済みユーザーの管理者権限を確認できません。\nユーザー画面で登録内容を確認してください。");

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

    it("再有効化確認は同一事業者の最新候補ID集合だけを受け付ける", async () => {
      const t = convexTest(schema, modules);
      const seeded = await t.run(async (ctx) => {
        const organization = await seedOrganizationManagerShop(ctx, {
          subject: "confirmation_manager",
          email: "confirmation-manager@example.com",
          plan: "pro",
        });
        const foreignOrganization = await seedOrganizationManagerShop(ctx, {
          subject: "foreign_manager",
          email: "foreign-manager@example.com",
          plan: "pro",
        });
        const now = Date.now();
        const removedPersonId = await ctx.db.insert("organizationPeople", {
          organizationId: organization.organizationId,
          name: "確認対象",
          email: "confirmation-target@example.com",
          emailNormalized: "confirmation-target@example.com",
          status: "removed",
          createdAt: now,
          updatedAt: now,
        });
        return { ...organization, foreignPersonId: foreignOrganization.personId, removedPersonId };
      });
      const asManager = t.withIdentity({ subject: "confirmation_manager" });
      const entries = [{ name: "再追加", email: "confirmation-target@example.com" }];
      const requestId = nextStaffAddRequestId();
      const preview = await asManager.mutation(api.staff.mutations.addStaffs, {
        shopId: seeded.shopId,
        requestId,
        entries,
      });
      expect(preview.status).toBe("requiresConfirmation");

      await expect(
        asManager.mutation(api.staff.mutations.addStaffs, {
          shopId: seeded.shopId,
          requestId,
          entries,
          confirmReactivationPersonIds: [seeded.foreignPersonId],
        }),
      ).rejects.toThrow("確認対象が変わりました");
      await expect(
        asManager.mutation(api.staff.mutations.addStaffs, {
          shopId: seeded.shopId,
          requestId,
          entries,
          confirmReactivationPersonIds: [seeded.removedPersonId, seeded.removedPersonId],
        }),
      ).rejects.toThrow("確認対象が重複しています");

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
      expect(state.staffs).toEqual([]);
      expect(state.audits).toEqual([]);
      expect(state.scheduled).toEqual([]);
    });

    it("再有効化確認時に予約枠を含む最新の利用人数上限を再検証する", async () => {
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
          email: "reserved-seat@example.com",
          emailNormalized: "reserved-seat@example.com",
          tokenDigest: "reserved-seat-for-reactivation",
          status: "pending",
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
      const preview = await asManager.mutation(api.staff.mutations.addStaffs, {
        shopId: seeded.shopId,
        requestId,
        entries,
      });
      if (preview.status !== "requiresConfirmation") throw new Error("再追加確認候補がありません");

      await expect(
        asManager.mutation(api.staff.mutations.addStaffs, {
          shopId: seeded.shopId,
          requestId,
          entries,
          confirmReactivationPersonIds: preview.candidates.map((candidate) => candidate.personId),
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

    it("追加スタッフ向けの同意依頼メールとLINE連携メールをスケジュールする", async () => {
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
          shopId,
          requestId: nextStaffAddRequestId(),
          entries: [{ name: "田中太郎", email: "tanaka@example.com" }],
        }),
      );

      const scheduled = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
      expect(
        scheduled.some((job) => job.name === "legal/actions:sendStaffConsentEmail" && job.args[0]?.staffId === staffId),
      ).toBe(true);
      expect(
        scheduled.some((job) => job.name === "line/actions:sendInviteEmail" && job.args[0]?.staffId === staffId),
      ).toBe(true);
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
      const remainingPeopleCapacity = ORGANIZATION_PLAN_LIMITS.business.maxPeople - 1;
      const entries = Array.from({ length: remainingPeopleCapacity }, (_, index) => ({
        name: `スタッフ${index + 1}`,
        email: `staff-${index + 1}@example.com`,
      }));

      const ids = addedStaffIds(
        await t.withIdentity({ subject: "user_mgr" }).mutation(api.staff.mutations.addStaffs, {
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
          shopId,
          requestId: nextStaffAddRequestId(),
          entries: [{ name: "あ".repeat(PERSON_NAME_MAX_LENGTH + 1), email: "too-long@example.com" }],
        }),
      ).rejects.toThrow("名前は80文字以内で入力してください");
      await expect(
        asManager.mutation(api.staff.mutations.addStaffs, {
          shopId,
          requestId: nextStaffAddRequestId(),
          entries: [{ name: "田中\n太郎", email: "control@example.com" }],
        }),
      ).rejects.toThrow("名前に使用できない文字が含まれています");
      await expect(
        asManager.mutation(api.staff.mutations.addStaffs, {
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
        await ctx.db.insert("staffs", {
          shopId: id,
          name: "既存スタッフ",
          email: "existing@example.com",
          isDeleted: false,
        });
        return id;
      });

      await expect(
        t.withIdentity({ subject: "user_mgr" }).mutation(api.staff.mutations.addStaffs, {
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
          shopId,
          requestId: nextStaffAddRequestId(),
          entries: [{ name: "田中太郎", email: "tanaka@example.com" }],
        }),
      );
      await expect(
        asManager.mutation(api.staff.mutations.addStaffs, {
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

    it("emailNormalizedがない既存スタッフもメール重複としてエラーにする", async () => {
      const t = convexTest(schema, modules);

      const shopId = await t.run(async (ctx) => {
        const { shopId } = await seedManagerShop(ctx, {
          subject: "user_mgr",
          email: "mgr@example.com",
          shopName: "テスト店舗",
        });
        await ctx.db.insert("staffs", {
          shopId,
          name: "既存スタッフ",
          email: "legacy@example.com",
          isDeleted: false,
        });
        return shopId;
      });

      await expect(
        t.withIdentity({ subject: "user_mgr" }).mutation(api.staff.mutations.addStaffs, {
          shopId,
          requestId: nextStaffAddRequestId(),
          entries: [{ name: "新規スタッフ", email: "legacy@example.com" }],
        }),
      ).rejects.toThrow("このメールアドレスはすでに登録されています。");
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
          shopId,
          requestId: nextStaffAddRequestId(),
          entries: [{ name: "新規スタッフ", email: "Pending@Example.com" }],
        }),
      ).rejects.toThrow("このメールアドレスはスタッフ登録の承認待ちです。");
    });

    it("追加スタッフ向け通知データは締切前のopen募集だけを返す", async () => {
      const t = convexTest(schema, modules);

      const ids = await t.run(async (ctx) => {
        const { shopId } = await seedManagerShop(ctx, {
          subject: "user_mgr",
          email: "mgr@example.com",
          shopName: "テスト店舗",
        });
        const staffId = await ctx.db.insert("staffs", {
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
        const staffId = await ctx.db.insert("staffs", {
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
        .mutation(api.staff.mutations.sendOpenRecruitmentNotifications, { shopId, staffId });

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
        const staffId = await ctx.db.insert("staffs", {
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
        .mutation(api.staff.mutations.sendOpenRecruitmentNotifications, { shopId, staffId });

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
        const staffId = await ctx.db.insert("staffs", {
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

      const request = { shopId: managerShopId, staffId };
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
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("選択した同一人物を別店舗へ一度だけ追加し、人物と権限を複製しない", async () => {
      const t = convexTest(schema, modules);
      const seeded = await t.run(async (ctx) => {
        const base = await seedOrganizationManagerShop(ctx, {
          subject: "organization_person_add_manager",
          email: "owner@example.com",
          plan: "pro",
        });
        const targetShopId = await ctx.db.insert("shops", {
          organizationId: base.organizationId,
          operatingStatus: "active",
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
        return { ...base, sourceStaffId, targetPersonId, targetShopId };
      });
      const args = {
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
            name: "line/actions:sendInviteEmail",
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

    it("別組織の人物IDではスタッフを追加しない", async () => {
      const t = convexTest(schema, modules);
      const seeded = await t.run(async (ctx) => {
        const owner = await seedOrganizationManagerShop(ctx, {
          subject: "organization_person_idor_owner",
          plan: "pro",
        });
        const foreign = await seedOrganizationManagerShop(ctx, {
          subject: "organization_person_idor_foreign",
          plan: "pro",
        });
        return { foreignPersonId: foreign.personId, owner };
      });

      await expect(
        t
          .withIdentity({ subject: "organization_person_idor_owner" })
          .mutation(api.staff.mutations.addOrganizationPersonToShop, {
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
          plan: "pro",
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

    afterEach(() => vi.useRealTimers());

    it("active店舗の追加と解除を一括確定し、inactive所属・履歴を保持して回答数とcredentialを更新する", async () => {
      const t = convexTest(schema, modules);
      const ids = await t.run(async (ctx) => {
        const base = await seedOrganizationManagerShop(ctx, {
          subject: "membership_change_mixed_actor",
          email: "membership-change-owner@example.com",
          plan: "pro",
        });
        const addedShopId = await seedMembershipChangeShop(ctx, base.organizationId, "追加店舗");
        const archivedShopId = await seedMembershipChangeShop(
          ctx,
          base.organizationId,
          "固定アーカイブ店舗",
          "archived",
        );
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
        const archivedStaffId = await ctx.db.insert("staffs", {
          shopId: archivedShopId,
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
          sessionToken: "membership-change-old-session",
          staffId: sourceStaffId,
          shopId: base.shopId,
          recruitmentId,
          expiresAt: Date.now() + 86_400_000,
        });
        const magicLinkId = await ctx.db.insert("magicLinks", {
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
          archivedShopId,
          archivedStaffId,
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
        shopId: ids.shopId,
        personId: ids.personId,
        desiredActiveShopIds: [ids.addedShopId],
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
          shopId: ids.shopId,
          personId: ids.otherPersonId,
          desiredActiveShopIds: [],
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
          archivedStaff: await ctx.db.get(ids.archivedStaffId),
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
      expect(state.archivedStaff?.isDeleted).toBe(false);
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
          plan: "pro",
        });
        const personId = await seedMembershipChangePerson(ctx, {
          organizationId: base.organizationId,
          email: "membership-change-noop@example.com",
        });
        const staffId = await ctx.db.insert("staffs", {
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
        shopId: ids.shopId,
        personId: ids.personId,
        desiredActiveShopIds: [ids.shopId],
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
          plan: "pro",
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
            shopId: ids.shopId,
            personId: ids.personId,
            desiredActiveShopIds: [],
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
          plan: "pro",
        });
        const personId = await seedMembershipChangePerson(ctx, {
          organizationId: base.organizationId,
          email: "membership-change-stale-removal@example.com",
        });
        const staffId = await ctx.db.insert("staffs", {
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
            shopId: ids.shopId,
            personId: ids.personId,
            desiredActiveShopIds: [],
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

    it("他組織・非稼働店舗・重複店舗・不正fingerprintを副作用なしで拒否する", async () => {
      const t = convexTest(schema, modules);
      const ids = await t.run(async (ctx) => {
        const owner = await seedOrganizationManagerShop(ctx, {
          subject: "membership_change_boundary_actor",
          plan: "pro",
        });
        const foreign = await seedOrganizationManagerShop(ctx, {
          subject: "membership_change_boundary_foreign",
          plan: "pro",
        });
        const inactiveShopId = await seedMembershipChangeShop(ctx, owner.organizationId, "停止店舗", "planSuspended");
        const personId = await seedMembershipChangePerson(ctx, {
          organizationId: owner.organizationId,
          email: "membership-change-boundary@example.com",
        });
        return { foreign, inactiveShopId, owner, personId };
      });
      const detail = await getMembershipChangeDetail(t, {
        subject: "membership_change_boundary_actor",
        shopId: ids.owner.shopId,
        personId: ids.personId,
      });
      const actor = t.withIdentity({ subject: "membership_change_boundary_actor" });
      const baseRequest = {
        shopId: ids.owner.shopId,
        personId: ids.personId,
        expectedMembershipFingerprint: detail.membershipFingerprint,
        removalPreviews: [],
      };

      await expect(
        actor.mutation(api.staff.mutations.changeOrganizationPersonShopMemberships, {
          ...baseRequest,
          desiredActiveShopIds: [ids.foreign.shopId],
          requestId: "membership-change-foreign-shop",
        }),
      ).rejects.toThrow("Not found");
      await expect(
        actor.mutation(api.staff.mutations.changeOrganizationPersonShopMemberships, {
          ...baseRequest,
          desiredActiveShopIds: [ids.inactiveShopId],
          requestId: "membership-change-inactive-shop",
        }),
      ).rejects.toThrow("稼働中の店舗だけ所属を変更できます");
      await expect(
        actor.mutation(api.staff.mutations.changeOrganizationPersonShopMemberships, {
          ...baseRequest,
          desiredActiveShopIds: [ids.owner.shopId, ids.owner.shopId],
          requestId: "membership-change-duplicate-shop",
        }),
      ).rejects.toThrow("入力内容を確認してください");
      await expect(
        actor.mutation(api.staff.mutations.changeOrganizationPersonShopMemberships, {
          ...baseRequest,
          personId: ids.foreign.personId,
          desiredActiveShopIds: [],
          requestId: "membership-change-foreign-person",
        }),
      ).rejects.toThrow("Not found");
      await expect(
        actor.mutation(api.staff.mutations.changeOrganizationPersonShopMemberships, {
          ...baseRequest,
          desiredActiveShopIds: [],
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
        const shopCount = 5;
        for (let shopIndex = 0; shopIndex < shopCount; shopIndex += 1) {
          const targetShopId = await seedMembershipChangeShop(ctx, base.organizationId, `集計上限店舗${shopIndex}`);
          targetShopIds.push(targetShopId);
          for (let staffIndex = 0; staffIndex < activeStaffsPerShopBeforeAdd; staffIndex += 1) {
            await ctx.db.insert("staffs", {
              shopId: targetShopId,
              name: `既存スタッフ${shopIndex}-${staffIndex}`,
              email: `stats-limit-${shopIndex}-${staffIndex}@example.com`,
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
            shopId: ids.shopId,
            personId: ids.personId,
            desiredActiveShopIds: ids.targetShopIds,
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
          plan: "pro",
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
            shopId: ids.shopId,
            personId: ids.personId,
            desiredActiveShopIds: [ids.targetShopId],
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

    it("人物側desired setでactive管理者の全店舗解除を副作用なしで拒否する", async () => {
      const t = convexTest(schema, modules);
      const ids = await t.run(async (ctx) => {
        const base = await seedOrganizationManagerShop(ctx, {
          subject: "membership_change_readd_actor",
          plan: "pro",
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
          sessionToken: "membership-change-readd-old-session",
          staffId: oldStaffId,
          shopId: base.shopId,
          recruitmentId,
          expiresAt: Date.now() + 86_400_000,
        });
        const oldMagicLinkId = await ctx.db.insert("magicLinks", {
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

      const before = await readManagerMembershipProtectedState(t);
      await expect(
        actor.mutation(api.staff.mutations.changeOrganizationPersonShopMemberships, {
          shopId: ids.shopId,
          personId: ids.personId,
          desiredActiveShopIds: [],
          expectedMembershipFingerprint: beforeRemoval.membershipFingerprint,
          removalPreviews: [readyRemovalPreview(beforeRemoval, ids.shopId)],
          requestId: "membership-change-remove-before-readd",
        }),
      ).rejects.toThrow("先に管理者権限を外してください。");
      expect(await readManagerMembershipProtectedState(t)).toEqual(before);
    });
  });

  describe("changeOrganizationShopStaffMemberships", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-08-11T03:00:00+09:00"));
    });

    afterEach(() => vi.useRealTimers());

    it("店舗側desired setで管理者解除を含むmixed変更を副作用なしで全体拒否する", async () => {
      const t = convexTest(schema, modules);
      const ids = await t.run(async (ctx) => {
        const base = await seedOrganizationManagerShop(ctx, {
          subject: "shop_staff_membership_mixed_actor",
          email: "shop-staff-membership-owner@example.com",
          shopName: "所属変更店舗",
          plan: "business",
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
          sessionToken: "shop-staff-membership-old-session",
          staffId: removedStaffId,
          shopId: base.shopId,
          recruitmentId,
          expiresAt: Date.now() + 86_400_000,
        });
        const magicLinkId = await ctx.db.insert("magicLinks", {
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
      const removalPreviews: [] = [];
      const request = {
        shopId: ids.shopId,
        desiredActivePersonIds: [ids.addedPersonId],
        expectedMembershipFingerprint: snapshot.membershipFingerprint,
        removalPreviews,
        requestId: "shop-staff-membership-mixed-request",
      };

      const before = await readManagerMembershipProtectedState(t);
      await expect(actor.mutation(api.staff.mutations.changeOrganizationShopStaffMemberships, request)).rejects.toThrow(
        "先に管理者権限を外してください。",
      );
      expect(await readManagerMembershipProtectedState(t)).toEqual(before);
    });

    it("同じrequestとintentは同じ結果を復旧して副作用を増やさず、異なるintentを拒否する", async () => {
      const t = convexTest(schema, modules);
      const ids = await t.run(async (ctx) => {
        const base = await seedOrganizationManagerShop(ctx, {
          subject: "shop_staff_membership_replay_actor",
          plan: "business",
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
          plan: "business",
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
          plan: "business",
        });
        const currentPersonId = await seedMembershipChangePerson(ctx, {
          organizationId: base.organizationId,
          name: "現在所属",
          email: "shop-staff-membership-current@example.com",
        });
        const currentStaffId = await ctx.db.insert("staffs", {
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
          plan: "business",
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
          plan: "business",
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
            plan: "business",
          }),
      );
      const subject = "shop_staff_membership_noop_actor";
      const snapshot = await getShopStaffMembershipChange(t, { subject, shopId: ids.shopId });
      const requestId = "shop-staff-membership-noop-request";
      const actor = t.withIdentity({ subject });
      const request = {
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

    it("一度に41名を変更しようとした場合は全追加を拒否する", async () => {
      const t = convexTest(schema, modules);
      const ids = await t.run(async (ctx) => {
        const base = await seedOrganizationManagerShop(ctx, {
          subject: "shop_staff_membership_target_limit_actor",
          plan: "business",
        });
        const personIds: Id<"organizationPeople">[] = [];
        for (let index = 0; index <= ORGANIZATION_SHOP_STAFF_MEMBERSHIP_CHANGE_TARGET_LIMIT; index += 1) {
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
      const { shopId, userId } = await seedManagerShop(ctx, {
        subject: "user_mgr",
        email: "mgr@example.com",
        shopName: "テスト店舗",
      });
      const staffId = await ctx.db.insert("staffs", {
        shopId,
        name: "田中太郎",
        email: "tanaka@example.com",
        isDeleted: false,
      });
      return { shopId, userId, staffId };
    });
    return { t, data };
  }

  describe("editStaff", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("未認証の場合エラーをthrow", async () => {
      const { t, data } = setupShopWithStaff();
      const { shopId, staffId } = await data;
      await expect(
        t.mutation(api.staff.mutations.editStaff, {
          shopId,
          staffId,
          name: "更新後",
          email: "updated@example.com",
        }),
      ).rejects.toThrow();
    });

    it("スタッフ情報を更新できる", async () => {
      const { t, data } = setupShopWithStaff();
      const { shopId, staffId } = await data;

      await t.withIdentity({ subject: "user_mgr" }).mutation(api.staff.mutations.editStaff, {
        shopId,
        staffId,
        name: "田中花子",
        email: "tanaka@example.com",
      });

      const staff = await t.run(async (ctx) => ctx.db.get(staffId));
      expect(staff?.name).toBe("田中花子");
      expect(staff?.email).toBe("tanaka@example.com");
    });

    it("事業者人物の変更は人物正本と同じ人物の全稼働店舗スタッフへ同期する", async () => {
      const t = convexTest(schema, modules);
      const ids = await t.run(async (ctx) => {
        const base = await seedOrganizationManagerShop(ctx, {
          subject: "canonical_staff_editor",
          email: "canonical-manager@example.com",
          plan: "pro",
        });
        const now = Date.now();
        const personId = await ctx.db.insert("organizationPeople", {
          organizationId: base.organizationId,
          name: "同期前",
          email: "before@example.com",
          emailNormalized: "before@example.com",
          status: "active",
          createdAt: now,
          updatedAt: now,
        });
        const otherShopId = await ctx.db.insert("shops", {
          organizationId: base.organizationId,
          operatingStatus: "active",
          name: "別店舗",
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
          regularClosedDays: [],
          isDeleted: false,
        });
        const staffIds = await Promise.all(
          [base.shopId, otherShopId].map(
            async (shopId) =>
              await ctx.db.insert("staffs", {
                shopId,
                organizationId: base.organizationId,
                organizationPersonId: personId,
                name: "同期前",
                email: "before@example.com",
                emailNormalized: "before@example.com",
                isDeleted: false,
              }),
          ),
        );
        return { ...base, actorPersonId: base.personId, personId, staffIds };
      });

      await t.withIdentity({ subject: "canonical_staff_editor" }).mutation(api.staff.mutations.editStaff, {
        shopId: ids.shopId,
        staffId: ids.staffIds[0],
        name: "同期後",
        email: "after@example.com",
      });

      const state = await t.run(async (ctx) => ({
        person: await ctx.db.get(ids.personId),
        staffs: await Promise.all(ids.staffIds.map(async (staffId) => await ctx.db.get(staffId))),
        audits: await ctx.db
          .query("organizationAuditEvents")
          .withIndex("by_organizationId_and_occurredAt", (q) => q.eq("organizationId", ids.organizationId))
          .collect(),
        scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
      }));
      expect(state.person).toMatchObject({
        name: "同期後",
        email: "after@example.com",
        emailNormalized: "after@example.com",
      });
      expect(state.staffs).toEqual([
        expect.objectContaining({ name: "同期後", emailNormalized: "after@example.com" }),
        expect.objectContaining({ name: "同期後", emailNormalized: "after@example.com" }),
      ]);
      expect(
        state.scheduled.filter(
          (job) => job.name === "notification/actions:sendOpenRecruitmentNotificationEmailsForStaffEmailChange",
        ),
      ).toHaveLength(2);
      expect(state.audits).toEqual([
        expect.objectContaining({
          action: "organization.person_profile_updated",
          actorUserId: ids.userId,
          actorPersonId: ids.actorPersonId,
          targetKind: "person",
          targetId: ids.personId,
        }),
      ]);
      expect(JSON.stringify(state.audits)).not.toContain("after@example.com");
    });

    it("対象店舗staffのorganizationが操作中組織と異なる場合は人物を更新しない", async () => {
      const t = convexTest(schema, modules);
      const ids = await t.run(async (ctx) => {
        const actor = await seedOrganizationManagerShop(ctx, {
          subject: "staff_cross_organization_actor",
          plan: "pro",
        });
        const other = await seedOrganizationManagerShop(ctx, {
          subject: "staff_cross_organization_target",
          plan: "pro",
        });
        const staffId = await ctx.db.insert("staffs", {
          shopId: actor.shopId,
          organizationId: other.organizationId,
          organizationPersonId: other.personId,
          name: "別グループ人物",
          email: "cross-organization-before@example.com",
          emailNormalized: "cross-organization-before@example.com",
          isDeleted: false,
        });
        return { actor, other, staffId };
      });

      await expect(
        t.withIdentity({ subject: "staff_cross_organization_actor" }).mutation(api.staff.mutations.editStaff, {
          shopId: ids.actor.shopId,
          staffId: ids.staffId,
          name: "不正更新",
          email: "cross-organization-after@example.com",
        }),
      ).rejects.toThrow("スタッフのユーザー情報を確認できません");

      const state = await t.run(async (ctx) => ({
        person: await ctx.db.get(ids.other.personId),
        staff: await ctx.db.get(ids.staffId),
        scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
      }));
      expect(state.person?.email).toBe("staff_cross_organization_target@example.com");
      expect(state.staff).toMatchObject({
        name: "別グループ人物",
        email: "cross-organization-before@example.com",
      });
      expect(state.scheduled).toEqual([]);
    });

    it("同じpersonを指すstaffの店舗が別組織なら全体をfail-closedにする", async () => {
      const t = convexTest(schema, modules);
      const ids = await t.run(async (ctx) => {
        const actor = await seedOrganizationManagerShop(ctx, {
          subject: "staff_cross_shop_actor",
          plan: "pro",
        });
        const other = await seedOrganizationManagerShop(ctx, {
          subject: "staff_cross_shop_other",
          plan: "pro",
        });
        const localStaffId = await ctx.db.insert("staffs", {
          shopId: actor.shopId,
          organizationId: actor.organizationId,
          organizationPersonId: actor.personId,
          userId: actor.userId,
          name: "更新前",
          email: "staff-cross-shop-before@example.com",
          emailNormalized: "staff-cross-shop-before@example.com",
          isDeleted: false,
        });
        const inconsistentStaffId = await ctx.db.insert("staffs", {
          shopId: other.shopId,
          organizationId: actor.organizationId,
          organizationPersonId: actor.personId,
          userId: actor.userId,
          name: "更新前",
          email: "staff-cross-shop-before@example.com",
          emailNormalized: "staff-cross-shop-before@example.com",
          isDeleted: false,
        });
        await ctx.db.patch(actor.personId, {
          name: "更新前",
          email: "staff-cross-shop-before@example.com",
          emailNormalized: "staff-cross-shop-before@example.com",
        });
        return { actor, localStaffId, inconsistentStaffId };
      });

      await expect(
        t.withIdentity({ subject: "staff_cross_shop_actor" }).mutation(api.staff.mutations.editStaff, {
          shopId: ids.actor.shopId,
          staffId: ids.localStaffId,
          name: "更新後",
          email: "staff-cross-shop-after@example.com",
        }),
      ).rejects.toThrow("スタッフの店舗所属を確認できません");

      const state = await t.run(async (ctx) => ({
        person: await ctx.db.get(ids.actor.personId),
        localStaff: await ctx.db.get(ids.localStaffId),
        inconsistentStaff: await ctx.db.get(ids.inconsistentStaffId),
        scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
      }));
      expect(state.person?.email).toBe("staff-cross-shop-before@example.com");
      expect(state.localStaff?.email).toBe("staff-cross-shop-before@example.com");
      expect(state.inconsistentStaff?.email).toBe("staff-cross-shop-before@example.com");
      expect(state.scheduled).toEqual([]);
    });

    it("事業者内の別人物が使うメールアドレスへの変更を拒否する", async () => {
      const t = convexTest(schema, modules);
      const ids = await t.run(async (ctx) => {
        const base = await seedOrganizationManagerShop(ctx, {
          subject: "canonical_duplicate_editor",
          email: "duplicate-manager@example.com",
          plan: "pro",
        });
        const now = Date.now();
        const firstPersonId = await ctx.db.insert("organizationPeople", {
          organizationId: base.organizationId,
          name: "変更対象",
          email: "first@example.com",
          emailNormalized: "first@example.com",
          status: "active",
          createdAt: now,
          updatedAt: now,
        });
        await ctx.db.insert("organizationPeople", {
          organizationId: base.organizationId,
          name: "別人物",
          email: "second@example.com",
          emailNormalized: "second@example.com",
          status: "active",
          createdAt: now,
          updatedAt: now,
        });
        const staffId = await ctx.db.insert("staffs", {
          shopId: base.shopId,
          organizationId: base.organizationId,
          organizationPersonId: firstPersonId,
          name: "変更対象",
          email: "first@example.com",
          emailNormalized: "first@example.com",
          isDeleted: false,
        });
        return { ...base, staffId };
      });

      await expect(
        t.withIdentity({ subject: "canonical_duplicate_editor" }).mutation(api.staff.mutations.editStaff, {
          shopId: ids.shopId,
          staffId: ids.staffId,
          name: "変更後",
          email: "second@example.com",
        }),
      ).rejects.toThrow("このメールアドレスは、組織内の別のユーザーが使用しています。");
    });

    it("メールアドレス変更時は募集中シフト通知の追送actionをスケジュールする", async () => {
      const { t, data } = setupShopWithStaff();
      const { shopId, staffId } = await data;

      await t.withIdentity({ subject: "user_mgr" }).mutation(api.staff.mutations.editStaff, {
        shopId,
        staffId,
        name: "田中太郎",
        email: "updated@example.com",
      });

      const scheduled = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
      expect(
        scheduled.some(
          (job) =>
            job.name === "notification/actions:sendOpenRecruitmentNotificationEmailsForStaffEmailChange" &&
            job.args[0]?.staffId === staffId &&
            job.args[0]?.expectedEmailNormalized === "updated@example.com" &&
            typeof job.args[0]?.emailChangedAt === "number",
        ),
      ).toBe(true);
    });

    it("名前だけの変更では募集中シフト通知の追送actionをスケジュールしない", async () => {
      const { t, data } = setupShopWithStaff();
      const { shopId, staffId } = await data;

      await t.withIdentity({ subject: "user_mgr" }).mutation(api.staff.mutations.editStaff, {
        shopId,
        staffId,
        name: "田中太郎 更新",
        email: "tanaka@example.com",
      });

      const scheduled = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
      expect(
        scheduled.some(
          (job) => job.name === "notification/actions:sendOpenRecruitmentNotificationEmailsForStaffEmailChange",
        ),
      ).toBe(false);
    });

    it("同一メールの大文字小文字・前後空白差分では募集中シフト通知の追送actionをスケジュールしない", async () => {
      const { t, data } = setupShopWithStaff();
      const { shopId, staffId } = await data;

      await t.withIdentity({ subject: "user_mgr" }).mutation(api.staff.mutations.editStaff, {
        shopId,
        staffId,
        name: "田中太郎",
        email: "  Tanaka@Example.com  ",
      });

      const scheduled = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
      expect(
        scheduled.some(
          (job) => job.name === "notification/actions:sendOpenRecruitmentNotificationEmailsForStaffEmailChange",
        ),
      ).toBe(false);
    });

    it("空メールへの変更は拒否する", async () => {
      const { t, data } = setupShopWithStaff();
      const { shopId, staffId } = await data;

      await expect(
        t.withIdentity({ subject: "user_mgr" }).mutation(api.staff.mutations.editStaff, {
          shopId,
          staffId,
          name: "田中太郎",
          email: "",
        }),
      ).rejects.toThrow("メールアドレスを入力してください");
    });

    it("過長名・制御文字入り名・不正メールはスタッフ編集で拒否する", async () => {
      const { t, data } = setupShopWithStaff();
      const { shopId, staffId } = await data;
      const asManager = t.withIdentity({ subject: "user_mgr" });

      await expect(
        asManager.mutation(api.staff.mutations.editStaff, {
          shopId,
          staffId,
          name: "あ".repeat(PERSON_NAME_MAX_LENGTH + 1),
          email: "tanaka@example.com",
        }),
      ).rejects.toThrow("名前は80文字以内で入力してください");
      await expect(
        asManager.mutation(api.staff.mutations.editStaff, {
          shopId,
          staffId,
          name: "田中\n太郎",
          email: "tanaka@example.com",
        }),
      ).rejects.toThrow("名前に使用できない文字が含まれています");
      await expect(
        asManager.mutation(api.staff.mutations.editStaff, {
          shopId,
          staffId,
          name: "田中太郎",
          email: "not-email",
        }),
      ).rejects.toThrow("メールアドレスの形式で入力してください");
    });

    it("他店舗のスタッフは編集できない（IDOR）", async () => {
      const { t, data } = setupShopWithStaff();
      const { shopId } = await data;

      const otherStaffId = await t.run(async (ctx) => {
        const otherShopId = await seedShop(ctx, "他店舗");
        return await ctx.db.insert("staffs", {
          shopId: otherShopId,
          name: "他店スタッフ",
          email: "other@example.com",
          isDeleted: false,
        });
      });

      await expect(
        t.withIdentity({ subject: "user_mgr" }).mutation(api.staff.mutations.editStaff, {
          shopId,
          staffId: otherStaffId,
          name: "不正更新",
          email: "hack@example.com",
        }),
      ).rejects.toThrow("Not found");
    });

    it("削除済みスタッフは編集できない", async () => {
      const { t, data } = setupShopWithStaff();
      const { shopId, staffId } = await data;

      await t.run(async (ctx) => {
        await ctx.db.patch(staffId, { isDeleted: true });
      });

      await expect(
        t.withIdentity({ subject: "user_mgr" }).mutation(api.staff.mutations.editStaff, {
          shopId,
          staffId,
          name: "更新後",
          email: "updated@example.com",
        }),
      ).rejects.toThrow("Not found");
    });

    it("メールアドレスが他スタッフと重複する場合エラー", async () => {
      const { t, data } = setupShopWithStaff();
      const { shopId, staffId } = await data;

      await t.run(async (ctx) => {
        await ctx.db.insert("staffs", {
          shopId,
          name: "佐藤花子",
          email: "sato@example.com",
          isDeleted: false,
        });
      });

      await expect(
        t.withIdentity({ subject: "user_mgr" }).mutation(api.staff.mutations.editStaff, {
          shopId,
          staffId,
          name: "田中太郎",
          email: "sato@example.com",
        }),
      ).rejects.toThrow("このメールアドレスはすでに使用されています。");
    });

    it("自分自身のメールアドレスはそのまま更新可能", async () => {
      const { t, data } = setupShopWithStaff();
      const { shopId, staffId } = await data;

      await t.withIdentity({ subject: "user_mgr" }).mutation(api.staff.mutations.editStaff, {
        shopId,
        staffId,
        name: "田中太郎（更新）",
        email: "tanaka@example.com",
      });

      const staff = await t.run(async (ctx) => ctx.db.get(staffId));
      expect(staff?.name).toBe("田中太郎（更新）");
      expect(staff?.email).toBe("tanaka@example.com");
    });

    it("legacy staffのシフト連絡先を変えてもusersのbootstrapメールへ逆同期しない", async () => {
      const { t, data } = setupShopWithStaff();
      const { shopId, userId, staffId } = await data;
      await t.run((ctx) => ctx.db.patch(staffId, { userId }));

      await t.withIdentity({ subject: "user_mgr" }).mutation(api.staff.mutations.editStaff, {
        shopId,
        staffId,
        name: "管理者 更新",
        email: "shift-contact-updated@example.com",
      });

      const state = await t.run(async (ctx) => ({ user: await ctx.db.get(userId), staff: await ctx.db.get(staffId) }));
      expect(state.user).toMatchObject({ name: "管理者 更新", email: "mgr@example.com" });
      expect(state.staff).toMatchObject({ name: "管理者 更新", email: "shift-contact-updated@example.com" });
    });
  });

  describe("deleteStaff", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("未認証の場合エラーをthrow", async () => {
      const { t, data } = setupShopWithStaff();
      const { shopId, staffId } = await data;
      await expect(t.mutation(api.staff.mutations.deleteStaff, { shopId, staffId })).rejects.toThrow();
    });

    it("氏名とメールアドレスを保持して論理削除し、通知履歴cleanupを一件だけ予約する", async () => {
      vi.useFakeTimers();
      const { t, data } = setupShopWithStaff();
      const { shopId, staffId } = await data;
      try {
        await t.withIdentity({ subject: "user_mgr" }).mutation(api.staff.mutations.deleteStaff, { shopId, staffId });

        const state = await t.run(async (ctx) => ({
          staff: await ctx.db.get(staffId),
          cleanupJobs: (await ctx.db.system.query("_scheduled_functions").collect()).filter(
            (job) => job.name === "notificationOutbox/mutations:deleteStaffNotificationHistoryBatch",
          ),
        }));
        expect(state.staff).toMatchObject({
          isDeleted: true,
          name: "田中太郎",
          email: "tanaka@example.com",
        });
        expect(state.cleanupJobs).toHaveLength(1);
        expect(state.cleanupJobs[0]?.args[0]).toEqual({ shopId, staffId });
      } finally {
        await t.finishAllScheduledFunctions(vi.runAllTimers);
        vi.useRealTimers();
      }
    });

    it.each([false, true])(
      "事業者に紐づくスタッフは将来割当=%sでも旧APIから削除しない",
      async (hasFutureAssignment) => {
        const t = convexTest(schema, modules);
        const ids = await t.run(async (ctx) => {
          const base = await seedOrganizationManagerShop(ctx, {
            subject: `organization_staff_delete_${hasFutureAssignment}`,
            plan: "pro",
          });
          const now = Date.now();
          const personId = await ctx.db.insert("organizationPeople", {
            organizationId: base.organizationId,
            name: "事業者スタッフ",
            email: `organization-staff-${hasFutureAssignment}@example.com`,
            emailNormalized: `organization-staff-${hasFutureAssignment}@example.com`,
            status: "active",
            createdAt: now,
            updatedAt: now,
          });
          const staffId = await ctx.db.insert("staffs", {
            shopId: base.shopId,
            organizationId: base.organizationId,
            organizationPersonId: personId,
            name: "事業者スタッフ",
            email: `organization-staff-${hasFutureAssignment}@example.com`,
            emailNormalized: `organization-staff-${hasFutureAssignment}@example.com`,
            isDeleted: false,
          });
          if (hasFutureAssignment) {
            const date = dateFromToday(1);
            const positionId = await ctx.db.insert("positions", {
              shopId: base.shopId,
              name: "通常",
              color: "#000000",
              sortOrder: 0,
              isDeleted: false,
            });
            const recruitmentId = await ctx.db.insert("recruitments", {
              shopId: base.shopId,
              periodStart: date,
              periodEnd: date,
              deadline: dateFromToday(0),
              shopClosedDates: [],
              status: "confirmed",
              confirmedAt: now,
              isDeleted: false,
              submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
            });
            await ctx.db.insert("shiftAssignments", {
              recruitmentId,
              staffId,
              date,
              startTime: "10:00",
              endTime: "18:00",
              positionId,
            });
          }
          return { ...base, personId, staffId };
        });

        await expect(
          t
            .withIdentity({ subject: `organization_staff_delete_${hasFutureAssignment}` })
            .mutation(api.staff.mutations.deleteStaff, { shopId: ids.shopId, staffId: ids.staffId }),
        ).rejects.toThrow("この店舗への所属は、組織設定のユーザー画面から解除してください。");
        await expect(t.run(async (ctx) => (await ctx.db.get(ids.staffId))?.isDeleted)).resolves.toBe(false);
        await expect(t.run(async (ctx) => (await ctx.db.get(ids.personId))?.status)).resolves.toBe("active");
      },
    );

    it("他店舗のスタッフは削除できない（IDOR）", async () => {
      const { t, data } = setupShopWithStaff();
      const { shopId } = await data;

      const otherStaffId = await t.run(async (ctx) => {
        const otherShopId = await seedShop(ctx, "他店舗");
        return await ctx.db.insert("staffs", {
          shopId: otherShopId,
          name: "他店スタッフ",
          email: "other@example.com",
          isDeleted: false,
        });
      });

      await expect(
        t
          .withIdentity({ subject: "user_mgr" })
          .mutation(api.staff.mutations.deleteStaff, { shopId, staffId: otherStaffId }),
      ).rejects.toThrow("Not found");
    });

    it("管理者自身は削除できない", async () => {
      const t = convexTest(schema, modules);

      const { adminStaffId, shopId } = await t.run(async (ctx) => {
        const { userId, shopId } = await seedManagerShop(ctx, {
          subject: "user_mgr",
          email: "mgr@example.com",
          shopName: "テスト店舗",
        });
        const adminStaffId = await ctx.db.insert("staffs", {
          shopId,
          name: "管理者",
          email: "mgr@example.com",
          userId,
          isDeleted: false,
        });
        return { adminStaffId, shopId };
      });

      await expect(
        t
          .withIdentity({ subject: "user_mgr" })
          .mutation(api.staff.mutations.deleteStaff, { shopId, staffId: adminStaffId }),
      ).rejects.toThrow("自分のアカウントは削除できません。");
    });
  });

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
            plan: "pro",
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

        await asManager.mutation(api.staff.mutations.setShiftExclusion, { shopId, staffId, excluded: true });
        await asManager.mutation(api.staff.mutations.setShiftExclusion, { shopId, staffId, excluded: false });

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
        t.mutation(api.staff.mutations.setShiftExclusion, { shopId, staffId, excluded: true }),
      ).rejects.toThrow();
    });

    it("シフト対象外フラグをトグルできる", async () => {
      const { t, data } = setupShopWithStaff();
      const { shopId, staffId } = await data;
      const asManager = t.withIdentity({ subject: "user_mgr" });

      await asManager.mutation(api.staff.mutations.setShiftExclusion, { shopId, staffId, excluded: true });
      expect(await t.run(async (ctx) => (await ctx.db.get(staffId))?.excludedFromShift)).toBe(true);

      await asManager.mutation(api.staff.mutations.setShiftExclusion, { shopId, staffId, excluded: false });
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
        const adminStaffId = await ctx.db.insert("staffs", {
          shopId,
          name: "店舗共通アドレス",
          email: "mgr@example.com",
          userId,
          isDeleted: false,
        });
        return { adminStaffId, shopId };
      });

      await t
        .withIdentity({ subject: "user_mgr" })
        .mutation(api.staff.mutations.setShiftExclusion, { shopId, staffId: adminStaffId, excluded: true });

      expect(await t.run(async (ctx) => (await ctx.db.get(adminStaffId))?.excludedFromShift)).toBe(true);
    });

    it("他店舗のスタッフは変更できない（IDOR）", async () => {
      const { t, data } = setupShopWithStaff();
      const { shopId } = await data;

      const otherStaffId = await t.run(async (ctx) => {
        const otherShopId = await seedShop(ctx, "他店舗");
        return await ctx.db.insert("staffs", {
          shopId: otherShopId,
          name: "他店スタッフ",
          email: "other@example.com",
          isDeleted: false,
        });
      });

      await expect(
        t
          .withIdentity({ subject: "user_mgr" })
          .mutation(api.staff.mutations.setShiftExclusion, { shopId, staffId: otherStaffId, excluded: true }),
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
        t
          .withIdentity({ subject: "user_mgr" })
          .mutation(api.staff.mutations.setShiftExclusion, { shopId, staffId, excluded: true }),
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

      await t
        .withIdentity({ subject: "user_mgr" })
        .mutation(api.staff.mutations.setShiftExclusion, { shopId, staffId, excluded: true });

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
        const staffId = await ctx.db.insert("staffs", {
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
        t.mutation(api.staff.mutations.sendCurrentShiftNotification, { shopId, staffId }),
      ).rejects.toThrowError();
      expect(await getScheduledCurrentShiftNotifications(t)).toHaveLength(0);
    });

    it("現在と将来の確定シフトを募集ごとのdurable operationへ固定して予約する", async () => {
      const t = convexTest(schema, modules);
      const { shopId, staffId, recruitmentIds } = await setupCurrentShiftNotification(t, {
        windows: ["past", "current", "future"],
      });

      const result = await t
        .withIdentity({ subject: "current_shift_manager" })
        .mutation(api.staff.mutations.sendCurrentShiftNotification, { shopId, staffId });
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
        .mutation(api.staff.mutations.sendCurrentShiftNotification, { shopId, staffId });
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
          .mutation(api.staff.mutations.sendCurrentShiftNotification, { shopId, staffId }),
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
        .mutation(api.staff.mutations.sendCurrentShiftNotification, { shopId, staffId });
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
        .mutation(api.staff.mutations.sendCurrentShiftNotification, { shopId, staffId });

      expect(result).toEqual({ scheduled: false, reason: "noCurrentShift" });
      expect(await getScheduledCurrentShiftNotifications(t)).toHaveLength(0);
    });

    it("他店舗のスタッフには通知を予約できない（IDOR）", async () => {
      const t = convexTest(schema, modules);
      const { shopId, staffId } = await setupCurrentShiftNotification(t, { otherShop: true });

      await expect(
        t
          .withIdentity({ subject: "current_shift_manager" })
          .mutation(api.staff.mutations.sendCurrentShiftNotification, { shopId, staffId }),
      ).rejects.toThrowError("Not found");
      expect(await getScheduledCurrentShiftNotifications(t)).toHaveLength(0);
    });

    it("削除済みスタッフには通知を予約できない", async () => {
      const t = convexTest(schema, modules);
      const { shopId, staffId } = await setupCurrentShiftNotification(t, { staffDeleted: true });

      await expect(
        t
          .withIdentity({ subject: "current_shift_manager" })
          .mutation(api.staff.mutations.sendCurrentShiftNotification, { shopId, staffId }),
      ).rejects.toThrowError("Not found");
      expect(await getScheduledCurrentShiftNotifications(t)).toHaveLength(0);
    });

    it("シフト対象外スタッフには通知を予約しない", async () => {
      const t = convexTest(schema, modules);
      const { shopId, staffId } = await setupCurrentShiftNotification(t, { excludedFromShift: true });

      const result = await t
        .withIdentity({ subject: "current_shift_manager" })
        .mutation(api.staff.mutations.sendCurrentShiftNotification, { shopId, staffId });

      expect(result).toEqual({ scheduled: false, reason: "noCurrentShift" });
      expect(await getScheduledCurrentShiftNotifications(t)).toHaveLength(0);
    });

    it("メール・LINE連携のないスタッフには通知を予約できない", async () => {
      const t = convexTest(schema, modules);
      const { shopId, staffId } = await setupCurrentShiftNotification(t, { email: "" });

      await expect(
        t
          .withIdentity({ subject: "current_shift_manager" })
          .mutation(api.staff.mutations.sendCurrentShiftNotification, { shopId, staffId }),
      ).rejects.toThrowError("メールアドレスの登録またはLINE連携が必要です。");
      expect(await getScheduledCurrentShiftNotifications(t)).toHaveLength(0);
    });

    it("短時間の再送はrate limitで拒否し通知予約を重複させない", async () => {
      const t = convexTest(schema, modules);
      const { shopId, staffId } = await setupCurrentShiftNotification(t);
      const asManager = t.withIdentity({ subject: "current_shift_manager" });

      const first = await asManager.mutation(api.staff.mutations.sendCurrentShiftNotification, { shopId, staffId });
      const second = await asManager.mutation(api.staff.mutations.sendCurrentShiftNotification, {
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
          plan: "pro",
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
        const staffId = await ctx.db.insert("staffs", {
          shopId: base.shopId,
          organizationId: base.organizationId,
          name: "個別通知対象",
          email: "staff-resend-target@example.com",
          emailNormalized: "staff-resend-target@example.com",
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

    it("fresh request IDでもactor短期・日次と組織日次を迂回できず、拒否時の副作用は0になる", async () => {
      const t = convexTest(schema, modules);
      const ids = await setupNotificationQuotaTest(t);
      const providerCall = vi.fn();
      vi.stubGlobal("fetch", providerCall);

      const send = async (managerNumber: number, requestSequence: number) => {
        const actor = t.withIdentity({ subject: `staff_resend_manager_${managerNumber}` });
        const args = {
          shopId: ids.shopId,
          staffId: ids.staffId,
          requestId: `staff-resend-${kind}-${managerNumber}-${requestSequence}`,
        };
        return kind === "openRecruitments"
          ? await actor.mutation(api.staff.mutations.sendOpenRecruitmentNotifications, args)
          : await actor.mutation(api.staff.mutations.sendCurrentShiftNotification, args);
      };
      const movePastShortLimit = () => vi.setSystemTime(new Date(Date.now() + 61_000));

      await expect(send(1, 0)).resolves.toEqual({ scheduled: true });
      const afterFirst = await getNotificationSideEffects(t);
      await expect(send(1, 1)).resolves.toEqual({ scheduled: false, reason: "rateLimited" });
      expect(await getNotificationSideEffects(t)).toEqual(afterFirst);

      for (let request = 1; request < STAFF_NOTIFICATION_RESEND_ACTOR_DAILY_LIMIT; request += 1) {
        movePastShortLimit();
        await expect(send(1, request + 1)).resolves.toEqual({ scheduled: true });
      }
      movePastShortLimit();
      const beforeActorDailyRejection = await getNotificationSideEffects(t);
      await expect(send(1, 100)).resolves.toEqual({ scheduled: false, reason: "rateLimited" });
      expect(await getNotificationSideEffects(t)).toEqual(beforeActorDailyRejection);

      // actor側の上限で拒否された操作は組織bucketを消費せず、別managerは通常どおり送れる。
      await expect(send(2, 0)).resolves.toEqual({ scheduled: true });
      const remainingOrganizationBudget =
        STAFF_NOTIFICATION_RESEND_ORGANIZATION_DAILY_LIMIT - STAFF_NOTIFICATION_RESEND_ACTOR_DAILY_LIMIT - 1;
      for (let request = 0; request < remainingOrganizationBudget; request += 1) {
        movePastShortLimit();
        await expect(send(2, request + 1)).resolves.toEqual({ scheduled: true });
      }

      movePastShortLimit();
      const beforeOrganizationDailyRejection = await getNotificationSideEffects(t);
      await expect(send(3, 0)).resolves.toEqual({ scheduled: false, reason: "rateLimited" });
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
          plan: "pro",
        });
        const staffIds: Id<"staffs">[] = [];
        for (let index = 0; index < 2; index += 1) {
          staffIds.push(
            await ctx.db.insert("staffs", {
              shopId: base.shopId,
              organizationId: base.organizationId,
              name: `target quotaスタッフ${index}`,
              email: `staff-target-quota-${kind}-${index}@example.com`,
              emailNormalized: `staff-target-quota-${kind}-${index}@example.com`,
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
      const send = async (staffId: Id<"staffs">, index: number) => {
        const args = {
          shopId: ids.shopId,
          staffId,
          requestId: `staff-target-quota-${kind}-${index}`,
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
      await expect(send(acceptedStaffId, 0)).resolves.toEqual({ scheduled: true });
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
      await expect(send(rejectedStaffId, 1)).resolves.toEqual({
        scheduled: false,
        reason: "rateLimited",
      });

      expect(await getState()).toEqual(beforeRejection);
      expect(beforeRejection.jobs).toHaveLength(kind === "openRecruitments" ? 1 : 2);
      expect(beforeRejection.operations).toHaveLength(kind === "openRecruitments" ? 0 : 2);
    });
  });
});
