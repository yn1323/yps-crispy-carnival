import { describe, expect, it } from "vitest";
import { internal } from "../_generated/api";
import { createConvexTestWithMigrations, runMigrationToCompletion } from "../_test/migrations.test-helper";

const migration = internal.migrations.m050_staffs_canonical_links_backfill.migration;

describe("m050 staffs canonical links backfill", () => {
  it("同一組織の一意なactive人物へだけ結び、active staffのprofileだけをcanonical化する", async () => {
    const t = createConvexTestWithMigrations();
    const seeded = await t.run(async (ctx) => {
      const now = Date.now();
      const userId = await ctx.db.insert("users", {
        authTokenIdentifier: "https://convex.test|m050-safe-user",
        name: "旧スタッフ名",
        email: "canonical@example.com",
        emailNormalized: "canonical@example.com",
        role: "manager",
        isDeleted: false,
      });
      const organizationId = await ctx.db.insert("organizations", {
        name: "m050確認組織",
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      });
      const shopId = await ctx.db.insert("shops", {
        organizationId,
        name: "m050確認店舗",
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "18:00" },
        regularClosedDays: [],
        isDeleted: false,
      });
      const personId = await ctx.db.insert("organizationPeople", {
        organizationId,
        userId,
        name: "正本スタッフ名",
        email: "canonical@example.com",
        emailNormalized: "canonical@example.com",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      const staffId = await ctx.db.insert("staffs", {
        shopId,
        userId,
        name: "旧スタッフ名",
        email: " Canonical@Example.COM ",
        emailNormalized: "stale@example.com",
        excludedFromShift: false,
        isDeleted: false,
      });
      const conflictId = await ctx.db.insert("organizationMigrationConflicts", {
        organizationId,
        sourceType: "staff",
        sourceId: staffId,
        code: "email_name_mismatch",
        createdAt: now,
      });
      const missingEmailConflictId = await ctx.db.insert("organizationMigrationConflicts", {
        organizationId,
        sourceType: "staff",
        sourceId: staffId,
        code: "m050_missing_email_identity",
        createdAt: now,
      });
      return {
        conflictId,
        missingEmailConflictId,
        organizationId,
        personBefore: await ctx.db.get(personId),
        personId,
        staffId,
        userId,
      };
    });

    await runMigrationToCompletion(t, migration);

    const migrated = await t.run(async (ctx) => ({
      conflicts: await ctx.db
        .query("organizationMigrationConflicts")
        .withIndex("by_sourceType_and_sourceId_and_code", (q) =>
          q.eq("sourceType", "staff").eq("sourceId", seeded.staffId),
        )
        .collect(),
      lineLinks: await ctx.db.query("organizationPersonLineLinks").collect(),
      outbox: await ctx.db.query("notificationOutbox").collect(),
      people: await ctx.db
        .query("organizationPeople")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
        .collect(),
      person: await ctx.db.get(seeded.personId),
      staff: await ctx.db.get(seeded.staffId),
    }));

    expect(migrated.staff).toMatchObject({
      organizationId: seeded.organizationId,
      organizationPersonId: seeded.personId,
      userId: seeded.userId,
      name: "正本スタッフ名",
      email: "canonical@example.com",
      emailNormalized: "canonical@example.com",
      isDeleted: false,
    });
    expect(migrated.person).toEqual(seeded.personBefore);
    expect(migrated.people).toHaveLength(1);
    expect(migrated.conflicts).toHaveLength(2);
    expect(migrated.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ _id: seeded.conflictId, code: "email_name_mismatch" }),
        expect.objectContaining({
          _id: seeded.missingEmailConflictId,
          code: "m050_missing_email_identity",
        }),
      ]),
    );
    expect(migrated.conflicts.every((conflict) => typeof conflict.resolvedAt === "number")).toBe(true);
    expect(migrated.lineLinks).toEqual([]);
    expect(migrated.outbox).toEqual([]);

    await runMigrationToCompletion(t, migration, { cursor: null });
    const rerun = await t.run(async (ctx) => ({
      person: await ctx.db.get(seeded.personId),
      staff: await ctx.db.get(seeded.staffId),
    }));
    expect(rerun).toEqual({ person: migrated.person, staff: migrated.staff });
  });

  it("削除済みstaffは一意なactive人物へ結んでも保存済み表示profileを変更しない", async () => {
    const t = createConvexTestWithMigrations();
    const seeded = await t.run(async (ctx) => {
      const now = Date.now();
      const organizationId = await ctx.db.insert("organizations", {
        name: "m050履歴組織",
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      });
      const shopId = await ctx.db.insert("shops", {
        organizationId,
        name: "m050履歴店舗",
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "18:00" },
        regularClosedDays: [],
        isDeleted: false,
      });
      const personId = await ctx.db.insert("organizationPeople", {
        organizationId,
        name: "現在の人物名",
        email: "historical@example.com",
        emailNormalized: "historical@example.com",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      const staffId = await ctx.db.insert("staffs", {
        shopId,
        name: "履歴に残す旧氏名",
        email: " Historical@Example.COM ",
        emailNormalized: "stored-history@example.com",
        excludedFromShift: false,
        isDeleted: true,
      });
      return { organizationId, personId, staffId };
    });

    await runMigrationToCompletion(t, migration);
    const result = await t.run(async (ctx) => ({
      person: await ctx.db.get(seeded.personId),
      staff: await ctx.db.get(seeded.staffId),
    }));

    expect(result.staff).toMatchObject({
      organizationId: seeded.organizationId,
      organizationPersonId: seeded.personId,
      name: "履歴に残す旧氏名",
      email: " Historical@Example.COM ",
      emailNormalized: "stored-history@example.com",
      isDeleted: true,
    });
    expect(result.person).toMatchObject({ name: "現在の人物名", status: "active" });
  });

  it("空メールidentityは一意なactive人物が存在してもlinkせず専用conflictへ残す", async () => {
    const t = createConvexTestWithMigrations();
    const seeded = await t.run(async (ctx) => {
      const now = Date.now();
      const organizationId = await ctx.db.insert("organizations", {
        name: "m050空メール組織",
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      });
      const shopId = await ctx.db.insert("shops", {
        organizationId,
        name: "m050空メール店舗",
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "18:00" },
        regularClosedDays: [],
        isDeleted: false,
      });
      const personId = await ctx.db.insert("organizationPeople", {
        organizationId,
        name: "空メール人物",
        email: "",
        emailNormalized: "",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      const staffId = await ctx.db.insert("staffs", {
        shopId,
        name: "空メールstaff",
        email: "   ",
        emailNormalized: "stale@example.com",
        excludedFromShift: false,
        isDeleted: false,
      });
      return {
        personBefore: await ctx.db.get(personId),
        personId,
        staffBefore: await ctx.db.get(staffId),
        staffId,
      };
    });

    await runMigrationToCompletion(t, migration);
    const result = await t.run(async (ctx) => ({
      conflicts: await ctx.db
        .query("organizationMigrationConflicts")
        .withIndex("by_sourceType_and_sourceId_and_code", (q) =>
          q.eq("sourceType", "staff").eq("sourceId", seeded.staffId),
        )
        .collect(),
      person: await ctx.db.get(seeded.personId),
      staff: await ctx.db.get(seeded.staffId),
    }));

    expect(result.staff).toEqual(seeded.staffBefore);
    expect(result.person).toEqual(seeded.personBefore);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toMatchObject({ code: "m050_missing_email_identity" });
    expect(result.conflicts[0]?.resolvedAt).toBeUndefined();
  });

  it("同一userの重複人物と別人物membershipをどちらもidentity conflictへ残す", async () => {
    const t = createConvexTestWithMigrations();
    const seeded = await t.run(async (ctx) => {
      const now = Date.now();
      const organizationId = await ctx.db.insert("organizations", {
        name: "m050user曖昧組織",
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      });
      const shopId = await ctx.db.insert("shops", {
        organizationId,
        name: "m050user曖昧店舗",
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "18:00" },
        regularClosedDays: [],
        isDeleted: false,
      });
      const duplicateUserId = await ctx.db.insert("users", {
        authTokenIdentifier: "https://convex.test|m050-duplicate-person-user",
        name: "重複人物user",
        email: "duplicate-person-user@example.com",
        emailNormalized: "duplicate-person-user@example.com",
        role: "manager",
        isDeleted: false,
      });
      const membershipUserId = await ctx.db.insert("users", {
        authTokenIdentifier: "https://convex.test|m050-mismatched-member-user",
        name: "別membership user",
        email: "mismatched-member-user@example.com",
        emailNormalized: "mismatched-member-user@example.com",
        role: "manager",
        isDeleted: false,
      });
      const duplicateCandidateId = await ctx.db.insert("organizationPeople", {
        organizationId,
        userId: duplicateUserId,
        name: "重複candidate人物",
        email: "duplicate-candidate@example.com",
        emailNormalized: "duplicate-candidate@example.com",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      const duplicateOtherId = await ctx.db.insert("organizationPeople", {
        organizationId,
        userId: duplicateUserId,
        name: "同一user別人物",
        email: "duplicate-other@example.com",
        emailNormalized: "duplicate-other@example.com",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      const membershipCandidateId = await ctx.db.insert("organizationPeople", {
        organizationId,
        userId: membershipUserId,
        name: "membership candidate人物",
        email: "membership-candidate@example.com",
        emailNormalized: "membership-candidate@example.com",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      const membershipOtherId = await ctx.db.insert("organizationPeople", {
        organizationId,
        name: "membership別人物",
        email: "membership-other@example.com",
        emailNormalized: "membership-other@example.com",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      const memberId = await ctx.db.insert("organizationMembers", {
        organizationId,
        personId: membershipOtherId,
        userId: membershipUserId,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      const duplicateStaffId = await ctx.db.insert("staffs", {
        shopId,
        userId: duplicateUserId,
        name: "重複人物staff",
        email: "duplicate-candidate@example.com",
        emailNormalized: "duplicate-candidate@example.com",
        excludedFromShift: false,
        isDeleted: false,
      });
      const membershipStaffId = await ctx.db.insert("staffs", {
        shopId,
        userId: membershipUserId,
        name: "別membership staff",
        email: "membership-candidate@example.com",
        emailNormalized: "membership-candidate@example.com",
        excludedFromShift: false,
        isDeleted: false,
      });
      const personIds = [duplicateCandidateId, duplicateOtherId, membershipCandidateId, membershipOtherId];
      return {
        immutableBefore: {
          member: await ctx.db.get(memberId),
          people: await Promise.all(personIds.map(async (personId) => await ctx.db.get(personId))),
          staffs: await Promise.all(
            [duplicateStaffId, membershipStaffId].map(async (staffId) => await ctx.db.get(staffId)),
          ),
          users: await Promise.all([duplicateUserId, membershipUserId].map(async (userId) => await ctx.db.get(userId))),
        },
        memberId,
        personIds,
        staffIds: [duplicateStaffId, membershipStaffId],
        userIds: [duplicateUserId, membershipUserId],
      };
    });

    await runMigrationToCompletion(t, migration);
    const result = await t.run(async (ctx) => ({
      conflicts: await ctx.db.query("organizationMigrationConflicts").collect(),
      immutableAfter: {
        member: await ctx.db.get(seeded.memberId),
        people: await Promise.all(seeded.personIds.map(async (personId) => await ctx.db.get(personId))),
        staffs: await Promise.all(seeded.staffIds.map(async (staffId) => await ctx.db.get(staffId))),
        users: await Promise.all(seeded.userIds.map(async (userId) => await ctx.db.get(userId))),
      },
    }));

    expect(result.immutableAfter).toEqual(seeded.immutableBefore);
    expect(
      result.conflicts.filter((conflict) => conflict.resolvedAt === undefined).map((conflict) => conflict.code),
    ).toEqual(["m050_staff_user_identity_mismatch", "m050_staff_user_identity_mismatch"]);
  });

  it("removed人物・user欠損/不一致・同一店舗重複・他tenant候補を推測せずconflictへ残す", async () => {
    const t = createConvexTestWithMigrations();
    const seeded = await t.run(async (ctx) => {
      const now = Date.now();
      const organizationId = await ctx.db.insert("organizations", {
        name: "m050拒否組織",
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      });
      const otherOrganizationId = await ctx.db.insert("organizations", {
        name: "m050別組織",
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      });
      const shopId = await ctx.db.insert("shops", {
        organizationId,
        name: "m050拒否店舗",
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "18:00" },
        regularClosedDays: [],
        isDeleted: false,
      });
      const staffUserId = await ctx.db.insert("users", {
        authTokenIdentifier: "https://convex.test|m050-staff-user",
        name: "staff user",
        email: "staff-user@example.com",
        emailNormalized: "staff-user@example.com",
        role: "manager",
        isDeleted: false,
      });
      const personUserId = await ctx.db.insert("users", {
        authTokenIdentifier: "https://convex.test|m050-person-user",
        name: "person user",
        email: "person-user@example.com",
        emailNormalized: "person-user@example.com",
        role: "manager",
        isDeleted: false,
      });
      const removedPersonId = await ctx.db.insert("organizationPeople", {
        organizationId,
        name: "削除済み人物",
        email: "removed@example.com",
        emailNormalized: "removed@example.com",
        status: "removed",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("organizationPeople", {
        organizationId,
        userId: personUserId,
        name: "別user人物",
        email: "user-mismatch@example.com",
        emailNormalized: "user-mismatch@example.com",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      const missingUserPersonId = await ctx.db.insert("organizationPeople", {
        organizationId,
        name: "user欠損人物",
        email: "user-missing@example.com",
        emailNormalized: "user-missing@example.com",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      const duplicatePersonId = await ctx.db.insert("organizationPeople", {
        organizationId,
        name: "重複人物",
        email: "duplicate@example.com",
        emailNormalized: "duplicate@example.com",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("organizationPeople", {
        organizationId: otherOrganizationId,
        name: "別組織人物",
        email: "cross-tenant@example.com",
        emailNormalized: "cross-tenant@example.com",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("staffs", {
        shopId,
        organizationId,
        organizationPersonId: duplicatePersonId,
        name: "既存スタッフ",
        email: "duplicate@example.com",
        emailNormalized: "duplicate@example.com",
        excludedFromShift: false,
        isDeleted: false,
      });
      const insertLegacy = async (email: string, userId?: typeof staffUserId) =>
        await ctx.db.insert("staffs", {
          shopId,
          ...(userId ? { userId } : {}),
          name: email,
          email,
          emailNormalized: email,
          excludedFromShift: false,
          isDeleted: false,
        });
      const removedStaffId = await insertLegacy("removed@example.com");
      const userMismatchStaffId = await insertLegacy("user-mismatch@example.com", staffUserId);
      const userMissingStaffId = await insertLegacy("user-missing@example.com", staffUserId);
      const duplicateStaffId = await insertLegacy("duplicate@example.com");
      const crossTenantStaffId = await insertLegacy("cross-tenant@example.com");
      const partialStaffId = await ctx.db.insert("staffs", {
        shopId,
        organizationId,
        name: "partial@example.com",
        email: "partial@example.com",
        emailNormalized: "partial@example.com",
        excludedFromShift: false,
        isDeleted: false,
      });
      return {
        crossTenantStaffId,
        duplicateStaffId,
        missingUserPersonBefore: await ctx.db.get(missingUserPersonId),
        missingUserPersonId,
        partialStaffId,
        removedPersonId,
        removedStaffId,
        userMissingStaffId,
        userMismatchStaffId,
      };
    });

    await runMigrationToCompletion(t, migration);
    const result = await t.run(async (ctx) => ({
      conflicts: await ctx.db.query("organizationMigrationConflicts").collect(),
      missingUserPerson: await ctx.db.get(seeded.missingUserPersonId),
      people: await ctx.db.query("organizationPeople").collect(),
      staffs: await Promise.all(
        [
          seeded.removedStaffId,
          seeded.userMismatchStaffId,
          seeded.userMissingStaffId,
          seeded.duplicateStaffId,
          seeded.crossTenantStaffId,
          seeded.partialStaffId,
        ].map(async (staffId) => await ctx.db.get(staffId)),
      ),
    }));

    expect(result.staffs.map((staff) => staff?.organizationPersonId)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
    expect(result.staffs[5]?.organizationId).toBeDefined();
    expect(result.missingUserPerson).toEqual(seeded.missingUserPersonBefore);
    expect(
      result.conflicts
        .filter((conflict) => conflict.resolvedAt === undefined)
        .map((conflict) => conflict.code)
        .sort(),
    ).toEqual(
      [
        "m050_canonical_person_lifecycle_mismatch",
        "m050_staff_user_identity_mismatch",
        "m050_staff_user_identity_mismatch",
        "m050_same_shop_active_staff_duplicate",
        "m050_canonical_person_not_found",
      ].sort(),
    );
    expect(result.people).toHaveLength(5);
  });

  it("削除済みshopまたはorganizationからtenantを推測しない", async () => {
    const t = createConvexTestWithMigrations();
    const seeded = await t.run(async (ctx) => {
      const now = Date.now();
      const activeOrganizationId = await ctx.db.insert("organizations", {
        name: "m050有効組織",
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      });
      const deletedOrganizationId = await ctx.db.insert("organizations", {
        name: "m050削除組織",
        isDeleted: true,
        createdAt: now,
        updatedAt: now,
      });
      const deletedShopId = await ctx.db.insert("shops", {
        organizationId: activeOrganizationId,
        name: "m050削除店舗",
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "18:00" },
        regularClosedDays: [],
        isDeleted: true,
      });
      const deletedOrganizationShopId = await ctx.db.insert("shops", {
        organizationId: deletedOrganizationId,
        name: "m050削除組織店舗",
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "18:00" },
        regularClosedDays: [],
        isDeleted: false,
      });
      const deletedShopStaffId = await ctx.db.insert("staffs", {
        shopId: deletedShopId,
        name: "deleted-shop@example.com",
        email: "deleted-shop@example.com",
        isDeleted: false,
      });
      const deletedOrganizationStaffId = await ctx.db.insert("staffs", {
        shopId: deletedOrganizationShopId,
        name: "deleted-organization@example.com",
        email: "deleted-organization@example.com",
        isDeleted: false,
      });
      return { deletedOrganizationStaffId, deletedShopStaffId };
    });

    await runMigrationToCompletion(t, migration);
    const result = await t.run(async (ctx) => ({
      conflicts: await ctx.db.query("organizationMigrationConflicts").collect(),
      deletedOrganizationStaff: await ctx.db.get(seeded.deletedOrganizationStaffId),
      deletedShopStaff: await ctx.db.get(seeded.deletedShopStaffId),
    }));

    expect(result.deletedShopStaff?.organizationId).toBeUndefined();
    expect(result.deletedShopStaff?.organizationPersonId).toBeUndefined();
    expect(result.deletedOrganizationStaff?.organizationId).toBeUndefined();
    expect(result.deletedOrganizationStaff?.organizationPersonId).toBeUndefined();
    expect(result.conflicts.map((conflict) => conflict.code).sort()).toEqual(
      ["m050_organization_unavailable", "m050_shop_unavailable"].sort(),
    );
  });
});
