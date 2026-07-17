import type { TestConvex } from "convex-test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { todayJST } from "../_lib/dateFormat";
import { seedManagerShop, seedOrganizationManagerShop, seedShop, seedUser } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { PERSON_NAME_MAX_LENGTH, STAFF_ADD_ENTRIES_MAX } from "../constants";
import { getLegalConsentVersions } from "../legal/documents";

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
          entries: Array.from({ length: 4 }, (_, index) => ({
            name: `追加スタッフ${index}`,
            email: `additional-${index}@example.com`,
          })),
        }),
      ).rejects.toThrow("利用人数が現在のプラン上限を超えます（現在 1名 / 上限 4名）");

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
        for (let index = 0; index < 3; index += 1) {
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

    it("BusinessからProへの変更予約中はPro上限を超えるスタッフ追加を保存しない", async () => {
      const t = convexTest(schema, modules);
      const seeded = await t.run(async (ctx) => {
        const organization = await seedOrganizationManagerShop(ctx, {
          subject: "scheduled_pro_staff_manager",
          plan: "business",
        });
        const now = Date.now();
        for (let index = 0; index < 14; index += 1) {
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
          entries: [{ name: "16人目", email: "scheduled-pro-over-limit@example.com" }],
        }),
      ).rejects.toThrow("Proプランへの変更予約を取り消してから追加してください");

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
      expect(state.people).toHaveLength(15);
      expect(state.staffs).toHaveLength(14);
      expect(state.people.map((person) => person.emailNormalized)).not.toContain(
        "scheduled-pro-over-limit@example.com",
      );
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
        for (let index = 0; index < 2; index += 1) {
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
      ).rejects.toThrow("管理者招待を一意に確認できません");

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
      ).rejects.toThrow("削除済み人物の管理者権限を確認できません");

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
        for (let index = 0; index < 2; index += 1) {
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
      expect(state.staffs).toHaveLength(2);
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
      ).rejects.toThrow("この人物はすでに店舗へ登録されています");

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

    it("上限ちょうど50件のスタッフを一括追加できる", async () => {
      const t = convexTest(schema, modules);
      const shopId = await t.run(async (ctx) => {
        const seeded = await seedManagerShop(ctx, {
          subject: "user_mgr",
          email: "mgr@example.com",
          shopName: "テスト店舗",
        });
        return seeded.shopId;
      });
      const entries = Array.from({ length: STAFF_ADD_ENTRIES_MAX }, (_, index) => ({
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

      expect(ids).toHaveLength(STAFF_ADD_ENTRIES_MAX);
      const staffs = await t.run(async (ctx) =>
        ctx.db
          .query("staffs")
          .withIndex("by_shopId", (q) => q.eq("shopId", shopId))
          .collect(),
      );
      expect(staffs).toHaveLength(STAFF_ADD_ENTRIES_MAX);
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
      ).rejects.toThrow("このメールアドレスはすでに登録されています");

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
      ).rejects.toThrow("このメールアドレスはすでに登録されています");

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
      ).rejects.toThrow("このメールアドレスはすでに登録されています");
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
      ).rejects.toThrow("このメールアドレスは承認待ちです");
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
  });

  function setupShopWithStaff() {
    const t = convexTest(schema, modules);
    const data = t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, {
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
      return { shopId, staffId };
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
        return { ...base, personId, staffIds };
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
      ).rejects.toThrow("グループ内の別の利用者");
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
      ).rejects.toThrow("このメールアドレスは既に使用されています");
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
  });

  describe("deleteStaff", () => {
    it("未認証の場合エラーをthrow", async () => {
      const { t, data } = setupShopWithStaff();
      const { shopId, staffId } = await data;
      await expect(t.mutation(api.staff.mutations.deleteStaff, { shopId, staffId })).rejects.toThrow();
    });

    it("スタッフを論理削除できる", async () => {
      const { t, data } = setupShopWithStaff();
      const { shopId, staffId } = await data;

      await t.withIdentity({ subject: "user_mgr" }).mutation(api.staff.mutations.deleteStaff, { shopId, staffId });

      const staff = await t.run(async (ctx) => ctx.db.get(staffId));
      expect(staff?.isDeleted).toBe(true);
    });

    it.each([
      false,
      true,
    ])("事業者に紐づくスタッフは将来割当=%sでも旧APIから削除しない", async (hasFutureAssignment) => {
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
      ).rejects.toThrow("グループ設定から店舗所属を解除してください");
      await expect(t.run(async (ctx) => (await ctx.db.get(ids.staffId))?.isDeleted)).resolves.toBe(false);
      await expect(t.run(async (ctx) => (await ctx.db.get(ids.personId))?.status)).resolves.toBe("active");
    });

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
      ).rejects.toThrow("自分のアカウントは削除できません");
    });
  });

  describe("setShiftExclusion", () => {
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
        return jobs.filter((job) => job.name === "notification/actions:sendCurrentShiftConfirmationForStaff");
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

    it("現在の確定シフトだけを対象に通知を1件予約する", async () => {
      const t = convexTest(schema, modules);
      const { shopId, staffId, recruitmentIds } = await setupCurrentShiftNotification(t, {
        windows: ["past", "current", "future"],
      });

      const notificationData = await t.query(internal.notification.queries.getCurrentConfirmationEmailDataForStaff, {
        staffId,
      });
      const result = await t
        .withIdentity({ subject: "current_shift_manager" })
        .mutation(api.staff.mutations.sendCurrentShiftNotification, { shopId, staffId });
      const jobs = await getScheduledCurrentShiftNotifications(t);

      expect(notificationData?.recruitments.map((recruitment) => recruitment.recruitmentId)).toEqual([
        recruitmentIds.current,
      ]);
      expect(result).toEqual({ scheduled: true });
      expect(jobs).toHaveLength(1);
      expect(jobs[0]).toMatchObject({ args: [{ staffId }] });
    });

    it("現在の確定シフトがなく過去・未来のシフトだけなら予約しない", async () => {
      const t = convexTest(schema, modules);
      const { shopId, staffId } = await setupCurrentShiftNotification(t, { windows: ["past", "future"] });

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
      ).rejects.toThrowError("メールアドレスまたはLINE連携が必要です");
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
});
