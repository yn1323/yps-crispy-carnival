import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { seedOrganizationManagerShop, seedUser } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { ORGANIZATION_PERSON_REMOVAL_ASSIGNMENT_LIMIT } from "../constants";

type TestMutationCtx = Parameters<typeof seedOrganizationManagerShop>[0];

async function insertOrganizationPerson(
  ctx: TestMutationCtx,
  args: {
    organizationId: Id<"organizations">;
    name: string;
    email: string;
    status?: "active" | "removed";
    userId?: Id<"users">;
  },
) {
  const now = Date.now();
  return await ctx.db.insert("organizationPeople", {
    organizationId: args.organizationId,
    ...(args.userId ? { userId: args.userId } : {}),
    name: args.name,
    email: args.email,
    emailNormalized: args.email.trim().toLowerCase(),
    status: args.status ?? "active",
    createdAt: now,
    updatedAt: now,
  });
}

async function insertCanonicalStaff(
  ctx: TestMutationCtx,
  args: {
    organizationId: Id<"organizations">;
    personId: Id<"organizationPeople">;
    shopId: Id<"shops">;
    name: string;
    email: string;
  },
) {
  return await ctx.db.insert("staffs", {
    organizationId: args.organizationId,
    organizationPersonId: args.personId,
    shopId: args.shopId,
    name: args.name,
    email: args.email,
    emailNormalized: args.email.trim().toLowerCase(),
    isDeleted: false,
  });
}

describe("staff/queries", () => {
  describe("listOrganizationPeopleAvailableForShop", () => {
    it("未認証では候補を返さない", async () => {
      const t = convexTest(schema, modules);
      const { shopId } = await t.run(
        async (ctx) => await seedOrganizationManagerShop(ctx, { subject: "candidate_manager" }),
      );

      await expect(t.query(api.staff.queries.listOrganizationPeopleAvailableForShop, { shopId })).resolves.toEqual([]);
    });

    it("同じ組織の有効人物から対象店舗に未所属の人物だけを返す", async () => {
      const t = convexTest(schema, modules);
      const seeded = await t.run(async (ctx) => {
        const base = await seedOrganizationManagerShop(ctx, {
          subject: "candidate_manager",
          email: "manager@example.com",
          shopName: "本店",
          plan: "pro",
        });
        const otherShopId = await ctx.db.insert("shops", {
          organizationId: base.organizationId,
          operatingStatus: "active",
          name: "2号店",
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
          regularClosedDays: [],
          isDeleted: false,
        });
        const now = Date.now();
        const otherShopPersonId = await ctx.db.insert("organizationPeople", {
          organizationId: base.organizationId,
          name: "他店舗スタッフ",
          email: "Other@Example.com",
          emailNormalized: "other@example.com",
          status: "active",
          createdAt: now,
          updatedAt: now,
        });
        await ctx.db.insert("staffs", {
          shopId: otherShopId,
          organizationId: base.organizationId,
          organizationPersonId: otherShopPersonId,
          name: "他店舗表示名",
          email: "other@example.com",
          emailNormalized: "other@example.com",
          isDeleted: false,
        });
        const deletedShopId = await ctx.db.insert("shops", {
          organizationId: base.organizationId,
          operatingStatus: "active",
          name: "削除済み店舗",
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
          regularClosedDays: [],
          isDeleted: true,
        });
        await ctx.db.insert("staffs", {
          shopId: deletedShopId,
          organizationId: base.organizationId,
          organizationPersonId: otherShopPersonId,
          name: "削除待ち表示名",
          email: "other@example.com",
          emailNormalized: "other@example.com",
          isDeleted: false,
        });
        const currentPersonId = await ctx.db.insert("organizationPeople", {
          organizationId: base.organizationId,
          name: "本店スタッフ",
          email: "current@example.com",
          emailNormalized: "current@example.com",
          status: "active",
          createdAt: now,
          updatedAt: now,
        });
        await ctx.db.insert("staffs", {
          shopId: base.shopId,
          organizationId: base.organizationId,
          organizationPersonId: currentPersonId,
          name: "本店スタッフ",
          email: "current@example.com",
          emailNormalized: "current@example.com",
          isDeleted: false,
        });
        await ctx.db.insert("organizationPeople", {
          organizationId: base.organizationId,
          name: "削除済み人物",
          email: "removed@example.com",
          emailNormalized: "removed@example.com",
          status: "removed",
          createdAt: now,
          updatedAt: now,
        });
        await ctx.db.insert("organizationPeople", {
          organizationId: base.organizationId,
          name: "参加申請待ち",
          email: "pending@example.com",
          emailNormalized: "pending@example.com",
          status: "active",
          createdAt: now,
          updatedAt: now,
        });
        await ctx.db.insert("staffRegistrationRequests", {
          shopId: base.shopId,
          name: "参加申請待ち",
          email: "pending@example.com",
          emailNormalized: "pending@example.com",
          status: "pending",
          termsConsentVersion: "terms-v1",
          privacyConsentVersion: "privacy-v1",
          termsDocumentVersion: "terms-doc-v1",
          privacyDocumentVersion: "privacy-doc-v1",
          consentedAt: now,
          createdAt: now,
        });
        await seedOrganizationManagerShop(ctx, {
          subject: "foreign_candidate_manager",
          email: "foreign@example.com",
          shopName: "別グループ店舗",
        });
        return { ...base, otherShopPersonId };
      });

      const result = await t
        .withIdentity({ subject: "candidate_manager" })
        .query(api.staff.queries.listOrganizationPeopleAvailableForShop, { shopId: seeded.shopId });

      expect(result).toEqual([
        {
          personId: seeded.personId,
          name: "管理者",
          email: "manager@example.com",
          shopNames: [],
          isManager: true,
        },
        {
          personId: seeded.otherShopPersonId,
          name: "他店舗スタッフ",
          email: "Other@Example.com",
          shopNames: ["2号店"],
          isManager: false,
        },
      ]);
    });

    it("別active店舗所属と所属0件の人物をどちらも追加候補に含める", async () => {
      const t = convexTest(schema, modules);
      const ids = await t.run(async (ctx) => {
        const base = await seedOrganizationManagerShop(ctx, {
          subject: "candidate_shop_feature_closed_manager",
          email: "candidate-shop-feature-closed-manager@example.com",
          plan: "business",
        });
        const otherShopId = await ctx.db.insert("shops", {
          organizationId: base.organizationId,
          operatingStatus: "active",
          name: "既存所属店舗",
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
          regularClosedDays: [],
          isDeleted: false,
        });
        const otherShopPersonId = await insertOrganizationPerson(ctx, {
          organizationId: base.organizationId,
          name: "別店舗所属候補",
          email: "candidate-other-shop@example.com",
        });
        await insertCanonicalStaff(ctx, {
          organizationId: base.organizationId,
          personId: otherShopPersonId,
          shopId: otherShopId,
          name: "別店舗所属候補",
          email: "candidate-other-shop@example.com",
        });
        const firstShopPersonId = await insertOrganizationPerson(ctx, {
          organizationId: base.organizationId,
          name: "初回追加候補",
          email: "candidate-first-shop@example.com",
        });
        return { ...base, firstShopPersonId, otherShopPersonId };
      });

      await expect(
        t
          .withIdentity({ subject: "candidate_shop_feature_closed_manager" })
          .query(api.staff.queries.listOrganizationPeopleAvailableForShop, { shopId: ids.shopId }),
      ).resolves.toEqual([
        {
          personId: ids.personId,
          name: "管理者",
          email: "candidate-shop-feature-closed-manager@example.com",
          shopNames: [],
          isManager: true,
        },
        {
          personId: ids.firstShopPersonId,
          name: "初回追加候補",
          email: "candidate-first-shop@example.com",
          shopNames: [],
          isManager: false,
        },
        {
          personId: ids.otherShopPersonId,
          name: "別店舗所属候補",
          email: "candidate-other-shop@example.com",
          shopNames: ["既存所属店舗"],
          isManager: false,
        },
      ]);
    });

    it("対象店舗に人物ID未移行の同一メールスタッフがいる場合も候補から除外する", async () => {
      const t = convexTest(schema, modules);
      const seeded = await t.run(async (ctx) => {
        const base = await seedOrganizationManagerShop(ctx, {
          subject: "legacy_candidate_manager",
          plan: "pro",
        });
        const now = Date.now();
        const personId = await ctx.db.insert("organizationPeople", {
          organizationId: base.organizationId,
          name: "移行前スタッフ",
          email: "Legacy@Example.com",
          emailNormalized: "legacy@example.com",
          status: "active",
          createdAt: now,
          updatedAt: now,
        });
        await ctx.db.insert("staffs", {
          shopId: base.shopId,
          name: "移行前スタッフ",
          email: "legacy@example.com",
          isDeleted: false,
        });
        return { ...base, legacyPersonId: personId };
      });

      const result = await t
        .withIdentity({ subject: "legacy_candidate_manager" })
        .query(api.staff.queries.listOrganizationPeopleAvailableForShop, { shopId: seeded.shopId });

      expect(result).toEqual([
        {
          personId: seeded.personId,
          name: "管理者",
          email: "legacy_candidate_manager@example.com",
          shopNames: [],
          isManager: true,
        },
      ]);
    });

    it("閲覧専用の管理者には追加候補を返さない", async () => {
      const t = convexTest(schema, modules);
      const seeded = await t.run(async (ctx) => {
        const base = await seedOrganizationManagerShop(ctx, {
          subject: "readonly_candidate_manager",
          plan: "pro",
        });
        await ctx.db.patch(base.memberId, { status: "readOnly" });
        const now = Date.now();
        await ctx.db.insert("organizationPeople", {
          organizationId: base.organizationId,
          name: "追加候補",
          email: "readonly-candidate@example.com",
          emailNormalized: "readonly-candidate@example.com",
          status: "active",
          createdAt: now,
          updatedAt: now,
        });
        return base;
      });

      await expect(
        t
          .withIdentity({ subject: "readonly_candidate_manager" })
          .query(api.staff.queries.listOrganizationPeopleAvailableForShop, { shopId: seeded.shopId }),
      ).resolves.toEqual([]);
    });

    it("人物のメール正規化が不整合な場合は不完全な候補一覧を返さない", async () => {
      const t = convexTest(schema, modules);
      const seeded = await t.run(async (ctx) => {
        const base = await seedOrganizationManagerShop(ctx, {
          subject: "invalid_candidate_manager",
          plan: "pro",
        });
        const now = Date.now();
        await ctx.db.insert("organizationPeople", {
          organizationId: base.organizationId,
          name: "不整合候補",
          email: "invalid-candidate@example.com",
          emailNormalized: "different@example.com",
          status: "active",
          createdAt: now,
          updatedAt: now,
        });
        return base;
      });

      await expect(
        t
          .withIdentity({ subject: "invalid_candidate_manager" })
          .query(api.staff.queries.listOrganizationPeopleAvailableForShop, { shopId: seeded.shopId }),
      ).resolves.toBeNull();
    });

    it("候補上限を超える場合は一部だけを返さない", async () => {
      const t = convexTest(schema, modules);
      const seeded = await t.run(async (ctx) => {
        const base = await seedOrganizationManagerShop(ctx, {
          subject: "many_candidate_manager",
          plan: "business",
        });
        const now = Date.now();
        for (let index = 0; index < 100; index += 1) {
          const email = `candidate-${index}@example.com`;
          await ctx.db.insert("organizationPeople", {
            organizationId: base.organizationId,
            name: `候補${index}`,
            email,
            emailNormalized: email,
            status: "active",
            createdAt: now,
            updatedAt: now,
          });
        }
        return base;
      });

      await expect(
        t
          .withIdentity({ subject: "many_candidate_manager" })
          .query(api.staff.queries.listOrganizationPeopleAvailableForShop, { shopId: seeded.shopId }),
      ).resolves.toBeNull();
    });
  });

  describe("getOrganizationShopStaffMembershipChange", () => {
    it("人物・現在所属・他店舗・変更不可の旧rowと承認待ちを安定したDTOで返す", async () => {
      const t = convexTest(schema, modules);
      const seeded = await t.run(async (ctx) => {
        const base = await seedOrganizationManagerShop(ctx, {
          subject: "shop_staff_membership_manager",
          email: "manager@example.com",
          shopName: "本店",
          plan: "business",
        });
        const otherShopId = await ctx.db.insert("shops", {
          organizationId: base.organizationId,
          operatingStatus: "active",
          name: "2号店",
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
          regularClosedDays: [],
          isDeleted: false,
        });
        const currentPersonId = await insertOrganizationPerson(ctx, {
          organizationId: base.organizationId,
          name: "A現在所属",
          email: "current@example.com",
        });
        const currentStaffId = await insertCanonicalStaff(ctx, {
          organizationId: base.organizationId,
          personId: currentPersonId,
          shopId: base.shopId,
          name: "店舗側表示名",
          email: "current@example.com",
        });
        const legacyPersonId = await insertOrganizationPerson(ctx, {
          organizationId: base.organizationId,
          name: "B移行待ち",
          email: "Legacy@Example.com",
        });
        const otherPersonId = await insertOrganizationPerson(ctx, {
          organizationId: base.organizationId,
          name: "C他店舗所属",
          email: "other@example.com",
        });
        await insertCanonicalStaff(ctx, {
          organizationId: base.organizationId,
          personId: otherPersonId,
          shopId: otherShopId,
          name: "2号店表示名",
          email: "other@example.com",
        });
        const pendingPersonId = await insertOrganizationPerson(ctx, {
          organizationId: base.organizationId,
          name: "D承認待ち",
          email: "pending@example.com",
        });
        await insertOrganizationPerson(ctx, {
          organizationId: base.organizationId,
          name: "削除済み人物",
          email: "removed@example.com",
          status: "removed",
        });
        const now = Date.now();
        await ctx.db.insert("staffRegistrationRequests", {
          shopId: base.shopId,
          name: "D承認待ち",
          email: "pending@example.com",
          emailNormalized: "pending@example.com",
          status: "pending",
          termsConsentVersion: "terms-v1",
          privacyConsentVersion: "privacy-v1",
          termsDocumentVersion: "terms-doc-v1",
          privacyDocumentVersion: "privacy-doc-v1",
          consentedAt: now,
          createdAt: now,
        });
        const legacyStaffId = await ctx.db.insert("staffs", {
          shopId: base.shopId,
          name: "移行待ちスタッフ",
          email: "legacy@example.com",
          isDeleted: false,
        });
        const preservedStaffId = await ctx.db.insert("staffs", {
          shopId: base.shopId,
          name: "旧スタッフ",
          email: "orphan@example.com",
          isDeleted: false,
        });
        return {
          ...base,
          currentPersonId,
          currentStaffId,
          legacyPersonId,
          otherPersonId,
          pendingPersonId,
          legacyStaffId,
          preservedStaffId,
        };
      });

      const result = await t
        .withIdentity({ subject: "shop_staff_membership_manager" })
        .query(api.staff.queries.getOrganizationShopStaffMembershipChange, { shopId: seeded.shopId });

      expect(result).toEqual({
        membershipFingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
        canWrite: true,
        writeDisabledReason: null,
        people: [
          {
            personId: seeded.currentPersonId,
            name: "A現在所属",
            email: "current@example.com",
            isManager: false,
            isActiveManager: false,
            otherShopNames: [],
            isSelected: true,
            staffId: seeded.currentStaffId,
            canChange: true,
            changeDisabledReason: null,
          },
          {
            personId: seeded.personId,
            name: "管理者",
            email: "manager@example.com",
            isManager: true,
            isActiveManager: true,
            otherShopNames: [],
            isSelected: false,
            staffId: null,
            canChange: true,
            changeDisabledReason: null,
          },
          {
            personId: seeded.legacyPersonId,
            name: "B移行待ち",
            email: "Legacy@Example.com",
            isManager: false,
            isActiveManager: false,
            otherShopNames: [],
            isSelected: false,
            staffId: null,
            canChange: false,
            changeDisabledReason: "移行中のスタッフと同じメールアドレスのため、所属を変更できません。",
          },
          {
            personId: seeded.otherPersonId,
            name: "C他店舗所属",
            email: "other@example.com",
            isManager: false,
            isActiveManager: false,
            otherShopNames: ["2号店"],
            isSelected: false,
            staffId: null,
            canChange: true,
            changeDisabledReason: null,
          },
          {
            personId: seeded.pendingPersonId,
            name: "D承認待ち",
            email: "pending@example.com",
            isManager: false,
            isActiveManager: false,
            otherShopNames: [],
            isSelected: false,
            staffId: null,
            canChange: false,
            changeDisabledReason: "スタッフ登録の承認待ちのため、所属を変更できません。",
          },
        ],
        preservedStaffs: [
          {
            staffId: seeded.legacyStaffId,
            name: "移行待ちスタッフ",
            email: "legacy@example.com",
            changeDisabledReason: "移行中のスタッフは、この画面では所属を変更できません。",
          },
          {
            staffId: seeded.preservedStaffId,
            name: "旧スタッフ",
            email: "orphan@example.com",
            changeDisabledReason: "移行中のスタッフは、この画面では所属を変更できません。",
          },
        ],
      });
    });

    it("別人物のcanonical staffとメールが衝突する候補を変更不可にする", async () => {
      const t = convexTest(schema, modules);
      const seeded = await t.run(async (ctx) => {
        const base = await seedOrganizationManagerShop(ctx, {
          subject: "shop_staff_email_conflict_manager",
          plan: "business",
        });
        const ownerPersonId = await insertOrganizationPerson(ctx, {
          organizationId: base.organizationId,
          name: "既存スタッフ人物",
          email: "owner-person@example.com",
        });
        await insertCanonicalStaff(ctx, {
          organizationId: base.organizationId,
          personId: ownerPersonId,
          shopId: base.shopId,
          name: "既存スタッフ",
          email: "conflicting-staff@example.com",
        });
        const candidatePersonId = await insertOrganizationPerson(ctx, {
          organizationId: base.organizationId,
          name: "衝突する候補",
          email: "conflicting-staff@example.com",
        });
        return { ...base, candidatePersonId };
      });

      const result = await t
        .withIdentity({ subject: "shop_staff_email_conflict_manager" })
        .query(api.staff.queries.getOrganizationShopStaffMembershipChange, { shopId: seeded.shopId });

      expect(result?.people.find((person) => person.personId === seeded.candidatePersonId)).toMatchObject({
        isSelected: false,
        canChange: false,
        changeDisabledReason: "同じメールアドレスのスタッフがこの店舗に所属しているため、変更できません。",
      });
    });

    it("readOnly管理者は管理者表示を維持しつつactive通知対象から外し、現在の店舗所属を変更可能にする", async () => {
      const t = convexTest(schema, modules);
      const seeded = await t.run(async (ctx) => {
        const base = await seedOrganizationManagerShop(ctx, {
          subject: "shop_staff_readonly_target_manager",
          plan: "business",
        });
        const userId = await seedUser(ctx, "shop_staff_readonly_target", "readonly-target@example.com");
        const personId = await insertOrganizationPerson(ctx, {
          organizationId: base.organizationId,
          name: "閲覧専用管理者",
          email: "readonly-target@example.com",
          userId,
        });
        await ctx.db.insert("organizationMembers", {
          organizationId: base.organizationId,
          personId,
          userId,
          status: "readOnly",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        const staffId = await insertCanonicalStaff(ctx, {
          organizationId: base.organizationId,
          personId,
          shopId: base.shopId,
          name: "閲覧専用管理者",
          email: "readonly-target@example.com",
        });
        return { ...base, personId, staffId };
      });

      const result = await t
        .withIdentity({ subject: "shop_staff_readonly_target_manager" })
        .query(api.staff.queries.getOrganizationShopStaffMembershipChange, { shopId: seeded.shopId });

      expect(result?.people.find((person) => person.personId === seeded.personId)).toEqual({
        personId: seeded.personId,
        name: "閲覧専用管理者",
        email: "readonly-target@example.com",
        isManager: true,
        isActiveManager: false,
        otherShopNames: [],
        isSelected: true,
        staffId: seeded.staffId,
        canChange: true,
        changeDisabledReason: null,
      });
    });

    it("未認証・別組織のroute shopではsnapshotを返さない", async () => {
      const t = convexTest(schema, modules);
      const seeded = await t.run(async (ctx) => {
        const base = await seedOrganizationManagerShop(ctx, {
          subject: "snapshot_scope_manager",
          plan: "business",
        });
        const foreign = await seedOrganizationManagerShop(ctx, {
          subject: "snapshot_foreign_manager",
          plan: "business",
        });
        return { ...base, foreignShopId: foreign.shopId };
      });

      await expect(
        t.query(api.staff.queries.getOrganizationShopStaffMembershipChange, { shopId: seeded.shopId }),
      ).resolves.toBeNull();
      await expect(
        t
          .withIdentity({ subject: "snapshot_scope_manager" })
          .query(api.staff.queries.getOrganizationShopStaffMembershipChange, { shopId: seeded.foreignShopId }),
      ).resolves.toBeNull();
    });

    it("閲覧専用actorにはsnapshotを返しつつ書き込み不可を明示する", async () => {
      const t = convexTest(schema, modules);
      const seeded = await t.run(async (ctx) => {
        const base = await seedOrganizationManagerShop(ctx, {
          subject: "snapshot_readonly_manager",
          plan: "business",
        });
        await ctx.db.patch(base.memberId, { status: "readOnly" });
        return base;
      });

      const result = await t
        .withIdentity({ subject: "snapshot_readonly_manager" })
        .query(api.staff.queries.getOrganizationShopStaffMembershipChange, { shopId: seeded.shopId });

      expect(result).toMatchObject({
        canWrite: false,
        writeDisabledReason: "閲覧のみの管理者は、スタッフの所属を変更できません。",
      });
    });

    it("片欠け・別組織人物・削除人物・canonical重複では部分snapshotを返さない", async () => {
      const t = convexTest(schema, modules);
      const seeded = await t.run(async (ctx) => {
        const base = await seedOrganizationManagerShop(ctx, {
          subject: "snapshot_corrupt_manager",
          plan: "business",
        });
        const foreign = await seedOrganizationManagerShop(ctx, {
          subject: "snapshot_corrupt_foreign",
          plan: "business",
        });
        const removedPersonId = await insertOrganizationPerson(ctx, {
          organizationId: base.organizationId,
          name: "削除済み",
          email: "snapshot-removed@example.com",
          status: "removed",
        });
        const duplicatePersonId = await insertOrganizationPerson(ctx, {
          organizationId: base.organizationId,
          name: "重複人物",
          email: "snapshot-duplicate@example.com",
        });
        return { ...base, foreignPersonId: foreign.personId, removedPersonId, duplicatePersonId };
      });
      const actor = t.withIdentity({ subject: "snapshot_corrupt_manager" });
      const query = async () =>
        await actor.query(api.staff.queries.getOrganizationShopStaffMembershipChange, { shopId: seeded.shopId });

      const partialId = await t.run(
        async (ctx) =>
          await ctx.db.insert("staffs", {
            organizationId: seeded.organizationId,
            shopId: seeded.shopId,
            name: "片欠け",
            email: "partial@example.com",
            isDeleted: false,
          }),
      );
      await expect(query()).resolves.toBeNull();
      await t.run(async (ctx) => await ctx.db.delete(partialId));

      const foreignId = await t.run(
        async (ctx) =>
          await ctx.db.insert("staffs", {
            organizationId: seeded.organizationId,
            organizationPersonId: seeded.foreignPersonId,
            shopId: seeded.shopId,
            name: "別組織人物",
            email: "foreign-person@example.com",
            isDeleted: false,
          }),
      );
      await expect(query()).resolves.toBeNull();
      await t.run(async (ctx) => await ctx.db.delete(foreignId));

      const removedId = await t.run(
        async (ctx) =>
          await ctx.db.insert("staffs", {
            organizationId: seeded.organizationId,
            organizationPersonId: seeded.removedPersonId,
            shopId: seeded.shopId,
            name: "削除済み人物staff",
            email: "snapshot-removed@example.com",
            isDeleted: false,
          }),
      );
      await expect(query()).resolves.toBeNull();
      await t.run(async (ctx) => await ctx.db.delete(removedId));

      await t.run(async (ctx) => {
        await insertCanonicalStaff(ctx, {
          organizationId: seeded.organizationId,
          personId: seeded.duplicatePersonId,
          shopId: seeded.shopId,
          name: "重複1",
          email: "snapshot-duplicate@example.com",
        });
        await insertCanonicalStaff(ctx, {
          organizationId: seeded.organizationId,
          personId: seeded.duplicatePersonId,
          shopId: seeded.shopId,
          name: "重複2",
          email: "snapshot-duplicate@example.com",
        });
      });
      await expect(query()).resolves.toBeNull();
    });
  });

  describe("previewOrganizationShopStaffMembershipRemovals", () => {
    it("解除対象だけの未来割当件数とfingerprintをまとめて返す", async () => {
      const t = convexTest(schema, modules);
      const now = Date.parse("2098-12-31T15:00:00.000Z");
      const seeded = await t.run(async (ctx) => {
        const base = await seedOrganizationManagerShop(ctx, {
          subject: "removal_preview_manager",
          plan: "business",
        });
        const firstPersonId = await insertOrganizationPerson(ctx, {
          organizationId: base.organizationId,
          name: "解除A",
          email: "remove-a@example.com",
        });
        const secondPersonId = await insertOrganizationPerson(ctx, {
          organizationId: base.organizationId,
          name: "解除B",
          email: "remove-b@example.com",
        });
        const firstStaffId = await insertCanonicalStaff(ctx, {
          organizationId: base.organizationId,
          personId: firstPersonId,
          shopId: base.shopId,
          name: "解除A",
          email: "remove-a@example.com",
        });
        const secondStaffId = await insertCanonicalStaff(ctx, {
          organizationId: base.organizationId,
          personId: secondPersonId,
          shopId: base.shopId,
          name: "解除B",
          email: "remove-b@example.com",
        });
        const positionId = await ctx.db.insert("positions", {
          shopId: base.shopId,
          name: "通常",
          color: "#000000",
          sortOrder: 0,
          isDeleted: false,
        });
        const recruitmentId = await ctx.db.insert("recruitments", {
          shopId: base.shopId,
          periodStart: "2098-12-31",
          periodEnd: "2099-01-31",
          deadline: "2098-12-30",
          shopClosedDates: [],
          status: "confirmed",
          confirmedAt: now,
          isDeleted: false,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        });
        for (const assignment of [
          { staffId: firstStaffId, date: "2098-12-31" },
          { staffId: firstStaffId, date: "2099-01-01" },
          { staffId: secondStaffId, date: "2099-01-02" },
          { staffId: secondStaffId, date: "2099-01-03" },
        ]) {
          await ctx.db.insert("shiftAssignments", {
            recruitmentId,
            ...assignment,
            startTime: "10:00",
            endTime: "18:00",
            positionId,
          });
        }
        return { ...base, firstPersonId, firstStaffId, secondPersonId, secondStaffId };
      });
      const actor = t.withIdentity({ subject: "removal_preview_manager" });
      const snapshot = await actor.query(api.staff.queries.getOrganizationShopStaffMembershipChange, {
        shopId: seeded.shopId,
      });
      if (!snapshot) throw new Error("snapshot not found");

      const preview = await actor.query(api.staff.queries.previewOrganizationShopStaffMembershipRemovals, {
        shopId: seeded.shopId,
        personIds: [seeded.secondPersonId, seeded.firstPersonId],
        expectedMembershipFingerprint: snapshot.membershipFingerprint,
        now,
      });

      expect(preview).toMatchObject({ kind: "ready", totalAssignmentCount: 3 });
      if (preview?.kind !== "ready") throw new Error("ready preview not found");
      expect(preview.removals.map(({ personId }) => personId)).toEqual(
        [seeded.firstPersonId, seeded.secondPersonId].sort((left, right) => left.localeCompare(right)),
      );
      expect(preview.removals).toEqual(
        expect.arrayContaining([
          {
            personId: seeded.firstPersonId,
            staffId: seeded.firstStaffId,
            assignmentCount: 1,
            fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
          },
          {
            personId: seeded.secondPersonId,
            staffId: seeded.secondStaffId,
            assignmentCount: 2,
            fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
          },
        ]),
      );
    });

    it("対象重複を拒否し、snapshot更新はstaleとして返す", async () => {
      const t = convexTest(schema, modules);
      const seeded = await t.run(async (ctx) => {
        const base = await seedOrganizationManagerShop(ctx, {
          subject: "removal_preview_stale_manager",
          plan: "business",
        });
        const personId = await insertOrganizationPerson(ctx, {
          organizationId: base.organizationId,
          name: "解除対象",
          email: "stale-remove@example.com",
        });
        await insertCanonicalStaff(ctx, {
          organizationId: base.organizationId,
          personId,
          shopId: base.shopId,
          name: "解除対象",
          email: "stale-remove@example.com",
        });
        return { ...base, targetPersonId: personId };
      });
      const actor = t.withIdentity({ subject: "removal_preview_stale_manager" });
      const snapshot = await actor.query(api.staff.queries.getOrganizationShopStaffMembershipChange, {
        shopId: seeded.shopId,
      });
      if (!snapshot) throw new Error("snapshot not found");

      await expect(
        actor.query(api.staff.queries.previewOrganizationShopStaffMembershipRemovals, {
          shopId: seeded.shopId,
          personIds: [seeded.targetPersonId, seeded.targetPersonId],
          expectedMembershipFingerprint: snapshot.membershipFingerprint,
          now: Date.now(),
        }),
      ).rejects.toThrow("入力内容を確認してください");

      await t.run(async (ctx) => await ctx.db.patch(seeded.targetPersonId, { name: "更新後" }));
      await expect(
        actor.query(api.staff.queries.previewOrganizationShopStaffMembershipRemovals, {
          shopId: seeded.shopId,
          personIds: [seeded.targetPersonId],
          expectedMembershipFingerprint: snapshot.membershipFingerprint,
          now: Date.now(),
        }),
      ).resolves.toEqual({ kind: "stale" });
    });

    it("未来割当が解除対象全体で上限を超える場合は部分previewを返さない", async () => {
      const t = convexTest(schema, modules);
      const now = Date.parse("2098-12-31T15:00:00.000Z");
      const seeded = await t.run(async (ctx) => {
        const base = await seedOrganizationManagerShop(ctx, {
          subject: "removal_preview_limit_manager",
          plan: "business",
        });
        const personIds: Id<"organizationPeople">[] = [];
        const staffIds: Id<"staffs">[] = [];
        for (const suffix of ["a", "b"] as const) {
          const personId = await insertOrganizationPerson(ctx, {
            organizationId: base.organizationId,
            name: `上限解除${suffix}`,
            email: `limit-remove-${suffix}@example.com`,
          });
          personIds.push(personId);
          staffIds.push(
            await insertCanonicalStaff(ctx, {
              organizationId: base.organizationId,
              personId,
              shopId: base.shopId,
              name: `上限解除${suffix}`,
              email: `limit-remove-${suffix}@example.com`,
            }),
          );
        }
        const positionId = await ctx.db.insert("positions", {
          shopId: base.shopId,
          name: "通常",
          color: "#000000",
          sortOrder: 0,
          isDeleted: false,
        });
        const recruitmentId = await ctx.db.insert("recruitments", {
          shopId: base.shopId,
          periodStart: "2099-01-01",
          periodEnd: "2099-01-31",
          deadline: "2098-12-30",
          shopClosedDates: [],
          status: "confirmed",
          confirmedAt: now,
          isDeleted: false,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        });
        for (let index = 0; index <= ORGANIZATION_PERSON_REMOVAL_ASSIGNMENT_LIMIT; index += 1) {
          await ctx.db.insert("shiftAssignments", {
            recruitmentId,
            staffId: staffIds[index % staffIds.length],
            date: "2099-01-01",
            startTime: "10:00",
            endTime: "18:00",
            positionId,
          });
        }
        return { ...base, personIds };
      });
      const actor = t.withIdentity({ subject: "removal_preview_limit_manager" });
      const snapshot = await actor.query(api.staff.queries.getOrganizationShopStaffMembershipChange, {
        shopId: seeded.shopId,
      });
      if (!snapshot) throw new Error("snapshot not found");

      const preview = await actor.query(api.staff.queries.previewOrganizationShopStaffMembershipRemovals, {
        shopId: seeded.shopId,
        personIds: seeded.personIds,
        expectedMembershipFingerprint: snapshot.membershipFingerprint,
        now,
      });

      expect(preview).toEqual({
        kind: "tooMany",
        assignmentCountAtLeast: ORGANIZATION_PERSON_REMOVAL_ASSIGNMENT_LIMIT + 1,
        limit: ORGANIZATION_PERSON_REMOVAL_ASSIGNMENT_LIMIT,
      });
      expect(preview).not.toHaveProperty("removals");
    });
  });
});
