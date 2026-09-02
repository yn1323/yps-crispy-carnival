import { describe, expect, it } from "vitest";
import { internal } from "../_generated/api";
import {
  createMigrationHistoryTestWithMigrations,
  legacyStaffDocumentForMigrationHistory,
  runMigrationToCompletion,
} from "../_test/migrations.test-helper";

const migrationArgs = { batchSize: 100, cursor: null, dryRun: false };

describe("organization Narrow preparation migrations", () => {
  it("m009〜m011完了後に再流入した旧shapeを再処理し、再実行でも重複を作らない", async () => {
    const t = createMigrationHistoryTestWithMigrations();

    await runMigrationToCompletion(t, internal.migrations.m009_shops_to_organizations.migration);
    await runMigrationToCompletion(t, internal.migrations.m010_shop_members_to_organization_members.migration);
    await runMigrationToCompletion(t, internal.migrations.m011_staffs_to_organization_people.migration);

    const seeded = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        authTokenIdentifier: "https://convex.test|late_legacy_manager",
        name: "後発管理者",
        email: "late-manager@example.com",
        emailNormalized: "late-manager@example.com",
        role: "manager",
        isDeleted: false,
      });
      const shopId = await ctx.db.insert("shops", {
        name: "後発旧形式店舗",
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        regularClosedDays: [],
        isDeleted: false,
      });
      await ctx.db.insert("shopMembers", {
        userId,
        shopId,
        role: "manager",
        isDeleted: false,
      });
      const managerStaffId = await ctx.db.insert(
        "staffs",
        legacyStaffDocumentForMigrationHistory({
          userId,
          shopId,
          name: "後発管理者",
          email: "late-manager@example.com",
          emailNormalized: "late-manager@example.com",
          isDeleted: false,
        }),
      );
      const staffId = await ctx.db.insert(
        "staffs",
        legacyStaffDocumentForMigrationHistory({
          shopId,
          name: "後発スタッフ",
          email: "late-staff@example.com",
          emailNormalized: "late-staff@example.com",
          isDeleted: false,
        }),
      );
      return { managerStaffId, shopId, staffId, userId };
    });

    const runRepair = async (reset = false) => {
      const args = { ...migrationArgs, ...(reset ? { reset: true } : {}) };
      await t.mutation(internal.migrations.m025_shops_narrow_prep.migration, args);
      await t.mutation(internal.migrations.m026_shop_members_narrow_prep.migration, args);
      await t.mutation(internal.migrations.m027_staffs_narrow_prep.migration, args);
      await t.mutation(internal.migrations.m029_shop_members_narrow_prep.migration, args);
    };
    await runRepair();

    const snapshot = async () =>
      await t.run(async (ctx) => {
        const shop = await ctx.db.get(seeded.shopId);
        const organizationId = shop?.organizationId;
        const people = organizationId
          ? await ctx.db
              .query("organizationPeople")
              .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
              .collect()
          : [];
        const members = organizationId
          ? await ctx.db
              .query("organizationMembers")
              .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
              .collect()
          : [];
        const billingStates = organizationId
          ? await ctx.db
              .query("organizationBillingStates")
              .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
              .collect()
          : [];
        const unresolvedConflicts = (
          await ctx.db
            .query("organizationMigrationConflicts")
            .filter((q) => q.eq(q.field("resolvedAt"), undefined))
            .collect()
        ).length;
        return {
          shop,
          managerStaff: await ctx.db.get(seeded.managerStaffId),
          staff: await ctx.db.get(seeded.staffId),
          peopleIds: people.map((person) => person._id).sort(),
          memberIds: members.map((member) => member._id).sort(),
          billingStates: billingStates.map((billing) => billing.state),
          billingAudits: organizationId
            ? await ctx.db
                .query("organizationAuditEvents")
                .withIndex("by_correlationId", (q) =>
                  q.eq("correlationId", `${organizationId}:migration:m025:complimentary-business`),
                )
                .collect()
            : [],
          activeLegacyMembershipCount: (
            await ctx.db
              .query("shopMembers")
              .withIndex("by_userId_and_isDeleted", (q) => q.eq("userId", seeded.userId).eq("isDeleted", false))
              .collect()
          ).length,
          unresolvedConflicts,
        };
      });

    const first = await snapshot();
    expect(first.shop).toMatchObject({ operatingStatus: "active" });
    expect(first.shop?.organizationId).toBeDefined();
    expect(first.peopleIds).toHaveLength(2);
    expect(first.memberIds).toHaveLength(1);
    expect(first.billingStates).toEqual([{ kind: "complimentary", plan: "business" }]);
    expect(first.billingAudits).toHaveLength(1);
    expect(first.activeLegacyMembershipCount).toBe(0);
    expect(first.managerStaff).toMatchObject({
      organizationId: first.shop?.organizationId,
    });
    expect(first.managerStaff?.organizationPersonId).toBeDefined();
    expect(first.managerStaff?.excludedFromShift).toBe(false);
    expect(first.staff).toMatchObject({
      organizationId: first.shop?.organizationId,
    });
    expect(first.staff?.organizationPersonId).toBeDefined();
    expect(first.staff?.excludedFromShift).toBe(false);
    expect(first.unresolvedConflicts).toBe(0);

    await runRepair(true);
    expect(await snapshot()).toEqual(first);
  });

  it("m025/m026は同じsourceにある他migration所有のconflictを解消しない", async () => {
    const t = createMigrationHistoryTestWithMigrations();
    const ids = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        authTokenIdentifier: "https://convex.test|narrow_conflict_owner",
        name: "競合確認管理者",
        email: "narrow-conflict@example.com",
        emailNormalized: "narrow-conflict@example.com",
        role: "manager",
        isDeleted: false,
      });
      const shopId = await ctx.db.insert("shops", {
        name: "競合所有確認店舗",
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "18:00" },
        regularClosedDays: [],
        isDeleted: false,
      });
      const shopMemberId = await ctx.db.insert("shopMembers", {
        userId,
        shopId,
        role: "manager",
        isDeleted: false,
      });
      const shopConflictId = await ctx.db.insert("organizationMigrationConflicts", {
        sourceType: "shop",
        sourceId: shopId,
        code: "complimentary_business_missing_source_shop",
        createdAt: Date.now(),
      });
      const memberConflictId = await ctx.db.insert("organizationMigrationConflicts", {
        sourceType: "shopMember",
        sourceId: shopMemberId,
        code: "removed_member_legacy_membership_missing_organization_shop",
        createdAt: Date.now(),
      });
      return { memberConflictId, shopConflictId };
    });

    await t.mutation(internal.migrations.m025_shops_narrow_prep.migration, migrationArgs);
    await t.mutation(internal.migrations.m026_shop_members_narrow_prep.migration, migrationArgs);

    const result = await t.run(async (ctx) => ({
      shopConflict: await ctx.db.get(ids.shopConflictId),
      memberConflict: await ctx.db.get(ids.memberConflictId),
    }));
    expect(result.shopConflict?.resolvedAt).toBeUndefined();
    expect(result.memberConflict?.resolvedAt).toBeUndefined();
  });

  it("m025は一意な既存課金状態とStripe対応を後発legacy初期値で上書きしない", async () => {
    const t = createMigrationHistoryTestWithMigrations();
    const ids = await t.run(async (ctx) => {
      const now = Date.now();
      const shopId = await ctx.db.insert("shops", {
        name: "既存課金保全店舗",
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "18:00" },
        regularClosedDays: [],
        isDeleted: false,
      });
      const organizationId = await ctx.db.insert("organizations", {
        migrationSourceShopId: shopId,
        name: "既存課金保全グループ",
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.patch(shopId, { organizationId, operatingStatus: "active" });
      const billingStateId = await ctx.db.insert("organizationBillingStates", {
        organizationId,
        state: { kind: "active", plan: "pro" },
        version: 7,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("organizationStripeCustomers", {
        organizationId,
        stripeCustomerId: "cus_narrow_preserve",
        livemode: false,
        createdAt: now,
        updatedAt: now,
      });
      return { billingStateId, shopId };
    });

    await t.mutation(internal.migrations.m025_shops_narrow_prep.migration, migrationArgs);

    const result = await t.run(async (ctx) => ({
      billingState: await ctx.db.get(ids.billingStateId),
      conflicts: await ctx.db
        .query("organizationMigrationConflicts")
        .withIndex("by_sourceType_and_sourceId_and_code", (q) => q.eq("sourceType", "shop").eq("sourceId", ids.shopId))
        .collect(),
    }));
    expect(result.billingState).toMatchObject({ state: { kind: "active", plan: "pro" }, version: 7 });
    expect(result.conflicts).toEqual([]);
  });

  it("m027は有効なperson linkをメール重複で外さず、organizationIdとexcludedFromShiftを補完する", async () => {
    const t = createMigrationHistoryTestWithMigrations();
    const ids = await t.run(async (ctx) => {
      const now = Date.now();
      const organizationId = await ctx.db.insert("organizations", {
        name: "staff link保全グループ",
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      });
      const shopId = await ctx.db.insert("shops", {
        organizationId,
        operatingStatus: "active",
        name: "staff link保全店舗",
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "18:00" },
        regularClosedDays: [],
        isDeleted: false,
      });
      const personId = await ctx.db.insert("organizationPeople", {
        organizationId,
        name: "正規人物",
        email: "duplicate@example.com",
        emailNormalized: "duplicate@example.com",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("organizationPeople", {
        organizationId,
        name: "重複候補",
        email: "duplicate@example.com",
        emailNormalized: "duplicate@example.com",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      const staffId = await ctx.db.insert(
        "staffs",
        legacyStaffDocumentForMigrationHistory({
          shopId,
          organizationPersonId: personId,
          name: "正規人物",
          email: "duplicate@example.com",
          emailNormalized: "duplicate@example.com",
          isDeleted: false,
        }),
      );
      return { organizationId, personId, staffId };
    });

    await t.mutation(internal.migrations.m027_staffs_narrow_prep.migration, migrationArgs);

    const result = await t.run(async (ctx) => ({
      staff: await ctx.db.get(ids.staffId),
      conflicts: await ctx.db
        .query("organizationMigrationConflicts")
        .withIndex("by_sourceType_and_sourceId_and_code", (q) =>
          q.eq("sourceType", "staff").eq("sourceId", ids.staffId),
        )
        .collect(),
    }));
    expect(result.staff).toMatchObject({
      organizationId: ids.organizationId,
      organizationPersonId: ids.personId,
      excludedFromShift: false,
    });
    expect(result.conflicts).toEqual([]);
  });

  it("m027はlinked personのuserId欠損を本人情報の一致確認後に補完し、再実行しても重複しない", async () => {
    const t = createMigrationHistoryTestWithMigrations();
    const ids = await t.run(async (ctx) => {
      const now = Date.now();
      const userId = await ctx.db.insert("users", {
        authTokenIdentifier: "https://convex.test|narrow_linked_person_user_backfill",
        name: "本人確認スタッフ",
        email: "linked-person-user-backfill@example.com",
        emailNormalized: "linked-person-user-backfill@example.com",
        role: "manager",
        isDeleted: false,
      });
      const organizationId = await ctx.db.insert("organizations", {
        name: "本人確認グループ",
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      });
      const shopId = await ctx.db.insert("shops", {
        organizationId,
        operatingStatus: "active",
        name: "本人確認店舗",
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "18:00" },
        regularClosedDays: [],
        isDeleted: false,
      });
      const personId = await ctx.db.insert("organizationPeople", {
        organizationId,
        name: "本人確認スタッフ",
        email: "linked-person-user-backfill@example.com",
        emailNormalized: "linked-person-user-backfill@example.com",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      const staffId = await ctx.db.insert("staffs", {
        shopId,
        organizationId,
        organizationPersonId: personId,
        userId,
        name: "本人確認スタッフ",
        email: "linked-person-user-backfill@example.com",
        emailNormalized: "linked-person-user-backfill@example.com",
        isDeleted: false,
      });
      return { personId, staffId, userId };
    });

    const snapshot = async () =>
      await t.run(async (ctx) => ({
        person: await ctx.db.get(ids.personId),
        staff: await ctx.db.get(ids.staffId),
        conflicts: await ctx.db
          .query("organizationMigrationConflicts")
          .withIndex("by_sourceType_and_sourceId_and_code", (q) =>
            q.eq("sourceType", "staff").eq("sourceId", ids.staffId),
          )
          .collect(),
      }));

    await t.mutation(internal.migrations.m027_staffs_narrow_prep.migration, migrationArgs);
    const first = await snapshot();
    expect(first.person?.userId).toBe(ids.userId);
    expect(first.staff).toMatchObject({ organizationPersonId: ids.personId, excludedFromShift: false });
    expect(first.conflicts).toEqual([]);

    await t.mutation(internal.migrations.m027_staffs_narrow_prep.migration, { ...migrationArgs, reset: true });
    expect(await snapshot()).toEqual(first);
  });

  it("m027はlinked personの異なるuserIdを上書きせず、conflictを再実行で重複させない", async () => {
    const t = createMigrationHistoryTestWithMigrations();
    const ids = await t.run(async (ctx) => {
      const now = Date.now();
      const staffUserId = await ctx.db.insert("users", {
        authTokenIdentifier: "https://convex.test|narrow_staff_user_mismatch",
        name: "スタッフ側人物",
        email: "staff-user-mismatch@example.com",
        emailNormalized: "staff-user-mismatch@example.com",
        role: "manager",
        isDeleted: false,
      });
      const personUserId = await ctx.db.insert("users", {
        authTokenIdentifier: "https://convex.test|narrow_person_user_mismatch",
        name: "人物側利用者",
        email: "person-user-mismatch@example.com",
        emailNormalized: "person-user-mismatch@example.com",
        role: "manager",
        isDeleted: false,
      });
      const organizationId = await ctx.db.insert("organizations", {
        name: "本人不一致グループ",
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      });
      const shopId = await ctx.db.insert("shops", {
        organizationId,
        operatingStatus: "active",
        name: "本人不一致店舗",
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "18:00" },
        regularClosedDays: [],
        isDeleted: false,
      });
      const personId = await ctx.db.insert("organizationPeople", {
        organizationId,
        userId: personUserId,
        name: "スタッフ側人物",
        email: "staff-user-mismatch@example.com",
        emailNormalized: "staff-user-mismatch@example.com",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      const staffId = await ctx.db.insert("staffs", {
        shopId,
        organizationId,
        organizationPersonId: personId,
        userId: staffUserId,
        name: "スタッフ側人物",
        email: "staff-user-mismatch@example.com",
        emailNormalized: "staff-user-mismatch@example.com",
        isDeleted: false,
      });
      return { personId, personUserId, staffId };
    });

    const snapshot = async () =>
      await t.run(async (ctx) => ({
        person: await ctx.db.get(ids.personId),
        staff: await ctx.db.get(ids.staffId),
        conflicts: await ctx.db
          .query("organizationMigrationConflicts")
          .withIndex("by_sourceType_and_sourceId_and_code", (q) =>
            q.eq("sourceType", "staff").eq("sourceId", ids.staffId),
          )
          .collect(),
      }));

    await t.mutation(internal.migrations.m027_staffs_narrow_prep.migration, migrationArgs);
    const first = await snapshot();
    expect(first.person?.userId).toBe(ids.personUserId);
    expect(first.staff).toMatchObject({ organizationPersonId: ids.personId, excludedFromShift: false });
    expect(first.conflicts.map((conflict) => conflict.code)).toEqual(["linked_person_user_mismatch"]);

    await t.mutation(internal.migrations.m027_staffs_narrow_prep.migration, { ...migrationArgs, reset: true });
    expect(await snapshot()).toEqual(first);
  });

  it("m027はstaffとpersonで一致するdangling userIdを成功扱いせず、conflictを再実行で重複させない", async () => {
    const t = createMigrationHistoryTestWithMigrations();
    const ids = await t.run(async (ctx) => {
      const now = Date.now();
      const deletedUserId = await ctx.db.insert("users", {
        authTokenIdentifier: "https://convex.test|narrow_dangling_staff_user",
        name: "削除済み利用者",
        email: "dangling-staff-user@example.com",
        emailNormalized: "dangling-staff-user@example.com",
        role: "manager",
        isDeleted: false,
      });
      const organizationId = await ctx.db.insert("organizations", {
        name: "参照切れ利用者グループ",
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      });
      const shopId = await ctx.db.insert("shops", {
        organizationId,
        operatingStatus: "active",
        name: "参照切れ利用者店舗",
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "18:00" },
        regularClosedDays: [],
        isDeleted: false,
      });
      const personId = await ctx.db.insert("organizationPeople", {
        organizationId,
        userId: deletedUserId,
        name: "削除済み利用者",
        email: "dangling-staff-user@example.com",
        emailNormalized: "dangling-staff-user@example.com",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      const staffId = await ctx.db.insert("staffs", {
        shopId,
        organizationId,
        organizationPersonId: personId,
        userId: deletedUserId,
        name: "削除済み利用者",
        email: "dangling-staff-user@example.com",
        emailNormalized: "dangling-staff-user@example.com",
        isDeleted: false,
      });
      await ctx.db.delete(deletedUserId);
      return { deletedUserId, personId, staffId };
    });

    const snapshot = async () =>
      await t.run(async (ctx) => ({
        person: await ctx.db.get(ids.personId),
        staff: await ctx.db.get(ids.staffId),
        conflicts: await ctx.db
          .query("organizationMigrationConflicts")
          .withIndex("by_sourceType_and_sourceId_and_code", (q) =>
            q.eq("sourceType", "staff").eq("sourceId", ids.staffId),
          )
          .collect(),
      }));

    await t.mutation(internal.migrations.m027_staffs_narrow_prep.migration, migrationArgs);
    const first = await snapshot();
    expect(first.person?.userId).toBe(ids.deletedUserId);
    expect(first.staff).toMatchObject({ organizationPersonId: ids.personId, excludedFromShift: false });
    expect(first.conflicts.map((conflict) => conflict.code)).toEqual(["missing_user"]);

    await t.mutation(internal.migrations.m027_staffs_narrow_prep.migration, { ...migrationArgs, reset: true });
    expect(await snapshot()).toEqual(first);
  });

  it("m027はactive旧staffだけを根拠にremoved人物を再有効化しない", async () => {
    const t = createMigrationHistoryTestWithMigrations();
    const ids = await t.run(async (ctx) => {
      const now = Date.now();
      const userId = await ctx.db.insert("users", {
        authTokenIdentifier: "https://convex.test|narrow_removed_person",
        name: "削除済み人物",
        email: "removed-person@example.com",
        emailNormalized: "removed-person@example.com",
        role: "manager",
        isDeleted: false,
      });
      const organizationId = await ctx.db.insert("organizations", {
        name: "再有効化防止グループ",
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      });
      const shopId = await ctx.db.insert("shops", {
        organizationId,
        operatingStatus: "active",
        name: "再有効化防止店舗",
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "18:00" },
        regularClosedDays: [],
        isDeleted: false,
      });
      const personId = await ctx.db.insert("organizationPeople", {
        organizationId,
        userId,
        name: "削除済み人物",
        email: "removed-person@example.com",
        emailNormalized: "removed-person@example.com",
        status: "removed",
        createdAt: now,
        updatedAt: now,
      });
      const staffId = await ctx.db.insert(
        "staffs",
        legacyStaffDocumentForMigrationHistory({
          shopId,
          userId,
          name: "削除済み人物",
          email: "removed-person@example.com",
          emailNormalized: "removed-person@example.com",
          isDeleted: false,
        }),
      );
      return { personId, staffId };
    });

    await t.mutation(internal.migrations.m027_staffs_narrow_prep.migration, migrationArgs);

    const result = await t.run(async (ctx) => ({
      person: await ctx.db.get(ids.personId),
      staff: await ctx.db.get(ids.staffId),
      conflicts: await ctx.db
        .query("organizationMigrationConflicts")
        .withIndex("by_sourceType_and_sourceId_and_code", (q) =>
          q.eq("sourceType", "staff").eq("sourceId", ids.staffId),
        )
        .collect(),
    }));
    expect(result.person?.status).toBe("removed");
    expect(result.staff).toMatchObject({ excludedFromShift: false });
    expect(result.staff?.organizationId).toBeUndefined();
    expect(result.staff?.organizationPersonId).toBeUndefined();
    expect(result.conflicts.map((conflict) => conflict.code)).toEqual(["active_staff_matches_removed_person"]);
  });

  it("m026/m027はstaleなemailNormalizedではなくraw emailから人物を解決する", async () => {
    const t = createMigrationHistoryTestWithMigrations();
    const ids = await t.run(async (ctx) => {
      const now = Date.now();
      const organizationId = await ctx.db.insert("organizations", {
        name: "派生値保全グループ",
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      });
      const shopId = await ctx.db.insert("shops", {
        organizationId,
        operatingStatus: "active",
        name: "派生値保全店舗",
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "18:00" },
        regularClosedDays: [],
        isDeleted: false,
      });
      const staleTargetPersonId = await ctx.db.insert("organizationPeople", {
        organizationId,
        name: "同名人物",
        email: "stale-target@example.com",
        emailNormalized: "stale-target@example.com",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      const userId = await ctx.db.insert("users", {
        authTokenIdentifier: "https://convex.test|narrow_stale_normalized",
        name: "同名人物",
        email: "canonical-user@example.com",
        emailNormalized: "stale-target@example.com",
        role: "manager",
        isDeleted: false,
      });
      const shopMemberId = await ctx.db.insert("shopMembers", {
        shopId,
        userId,
        role: "manager",
        isDeleted: false,
      });
      const staffId = await ctx.db.insert(
        "staffs",
        legacyStaffDocumentForMigrationHistory({
          shopId,
          name: "同名人物",
          email: "canonical-staff@example.com",
          emailNormalized: "stale-target@example.com",
          isDeleted: false,
        }),
      );
      return { organizationId, shopMemberId, staffId, staleTargetPersonId, userId };
    });

    await t.mutation(internal.migrations.m026_shop_members_narrow_prep.migration, migrationArgs);
    await t.mutation(internal.migrations.m027_staffs_narrow_prep.migration, migrationArgs);

    const result = await t.run(async (ctx) => {
      const staff = await ctx.db.get(ids.staffId);
      const members = await ctx.db
        .query("organizationMembers")
        .withIndex("by_userId_and_organizationId", (q) =>
          q.eq("userId", ids.userId).eq("organizationId", ids.organizationId),
        )
        .collect();
      return {
        staff,
        staffPerson: staff?.organizationPersonId ? await ctx.db.get(staff.organizationPersonId) : null,
        managerPerson: members[0] ? await ctx.db.get(members[0].personId) : null,
      };
    });
    expect(result.managerPerson).toMatchObject({ emailNormalized: "canonical-user@example.com" });
    expect(result.managerPerson?._id).not.toBe(ids.staleTargetPersonId);
    expect(result.staffPerson).toMatchObject({ emailNormalized: "canonical-staff@example.com" });
    expect(result.staffPerson?._id).not.toBe(ids.staleTargetPersonId);
  });
});
