import type { WithoutSystemFields } from "convex/server";
import { describe, expect, it } from "vitest";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import {
  createMigrationHistoryTestWithMigrations,
  legacyStaffDocumentForMigrationHistory,
} from "../_test/migrations.test-helper";

const firstPage = { cursor: null, numItems: 100 };

function legacyDocument<T>(document: unknown): T {
  return document as T;
}

describe("Narrow readiness queries", () => {
  it("PIIやrow IDを返さず、全候補の旧shape残件を検出する", async () => {
    const t = createMigrationHistoryTestWithMigrations();
    const secretEmail = "narrow-secret@example.com";
    const secretAdminEmail = " Legacy-Admin@Example.COM ";
    const secretMismatchEmail = " Mismatch@Example.COM ";
    const secretMissingPersonUserEmail = "missing-person-user@example.com";
    const secretPersonUserMismatchEmail = "person-user-mismatch@example.com";
    const secretDanglingStaffUserEmail = "dangling-staff-user@example.com";
    const secretDeletedLinkedUserEmail = "deleted-linked-user@example.com";
    const secretDeletionRequestedLinkedUserEmail = "deletion-requested-linked-user@example.com";
    const secretToken = "narrow-secret-token";
    const secretViewToken = "narrow-secret-view-token";
    const secretSessionToken = "narrow-secret-session";
    const secretFanoutTargetKey = "narrow-secret-fanout-target";
    const ids = await t.run(async (ctx) => {
      const now = Date.now();
      const userId = await ctx.db.insert("users", {
        authTokenIdentifier: "https://convex.test|narrow_readiness",
        name: "確認管理者",
        email: secretEmail,
        emailNormalized: secretEmail,
        role: "manager",
        isDeleted: false,
      });
      const otherUserId = await ctx.db.insert("users", {
        authTokenIdentifier: "https://convex.test|narrow_readiness_other_identity",
        name: "別利用者",
        email: "other-identity@example.com",
        emailNormalized: "other-identity@example.com",
        role: "manager",
        isDeleted: false,
      });
      const danglingStaffUserId = await ctx.db.insert("users", {
        authTokenIdentifier: "https://convex.test|narrow_readiness_dangling_staff_user",
        name: "参照切れ利用者",
        email: secretDanglingStaffUserEmail,
        emailNormalized: secretDanglingStaffUserEmail,
        role: "manager",
        isDeleted: false,
      });
      const deletedLinkedUserId = await ctx.db.insert("users", {
        authTokenIdentifier: "https://convex.test|narrow_readiness_deleted_linked_user",
        name: "削除済みlinked user",
        email: secretDeletedLinkedUserEmail,
        emailNormalized: secretDeletedLinkedUserEmail,
        role: "manager",
        isDeleted: true,
      });
      const deletionRequestedLinkedUserId = await ctx.db.insert("users", {
        authTokenIdentifier: "https://convex.test|narrow_readiness_deletion_requested_linked_user",
        name: "削除受付済みlinked user",
        email: secretDeletionRequestedLinkedUserEmail,
        emailNormalized: secretDeletionRequestedLinkedUserEmail,
        role: "manager",
        isDeleted: false,
        accountDeletionRequestedAt: now,
      });
      await ctx.db.insert(
        "users",
        legacyDocument<WithoutSystemFields<Doc<"users">>>({
          authTokenIdentifier: "https://convex.test|narrow_readiness_admin",
          name: "旧admin",
          email: secretAdminEmail,
          role: "admin",
          isDeleted: false,
        }),
      );
      await ctx.db.insert("users", {
        authTokenIdentifier: "https://convex.test|narrow_readiness_mismatch",
        name: "正規化不一致管理者",
        email: secretMismatchEmail,
        emailNormalized: "wrong@example.com",
        role: "manager",
        isDeleted: false,
      });
      const organizationId = await ctx.db.insert("organizations", {
        createdByUserId: userId,
        name: "確認グループ",
        billingEmail: secretEmail,
        billingEmailNormalized: secretEmail,
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      });
      const legacyOrganizationId = await ctx.db.insert(
        "organizations",
        legacyDocument<WithoutSystemFields<Doc<"organizations">>>({
          name: "旧形式グループ",
          isDeleted: false,
          createdAt: now,
          updatedAt: now,
        }),
      );
      const personId = await ctx.db.insert("organizationPeople", {
        organizationId,
        userId,
        name: "確認管理者",
        email: secretEmail,
        emailNormalized: secretEmail,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      const removedPersonId = await ctx.db.insert("organizationPeople", {
        organizationId,
        name: "削除済み人物",
        email: "removed-person@example.com",
        emailNormalized: "removed-person@example.com",
        status: "removed",
        createdAt: now,
        updatedAt: now,
      });
      const missingUserPersonId = await ctx.db.insert("organizationPeople", {
        organizationId,
        name: "利用者紐付け欠損人物",
        email: secretMissingPersonUserEmail,
        emailNormalized: secretMissingPersonUserEmail,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      const mismatchedUserPersonId = await ctx.db.insert("organizationPeople", {
        organizationId,
        userId: otherUserId,
        name: "利用者紐付け不一致人物",
        email: secretPersonUserMismatchEmail,
        emailNormalized: secretPersonUserMismatchEmail,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      const danglingUserPersonId = await ctx.db.insert("organizationPeople", {
        organizationId,
        userId: danglingStaffUserId,
        name: "参照切れ利用者",
        email: secretDanglingStaffUserEmail,
        emailNormalized: secretDanglingStaffUserEmail,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      const deletedLinkedUserPersonId = await ctx.db.insert("organizationPeople", {
        organizationId,
        userId: deletedLinkedUserId,
        name: "削除済みlinked user",
        email: secretDeletedLinkedUserEmail,
        emailNormalized: secretDeletedLinkedUserEmail,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      const deletionRequestedLinkedUserPersonId = await ctx.db.insert("organizationPeople", {
        organizationId,
        userId: deletionRequestedLinkedUserId,
        name: "削除受付済みlinked user",
        email: secretDeletionRequestedLinkedUserEmail,
        emailNormalized: secretDeletionRequestedLinkedUserEmail,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("organizationPeople", {
        organizationId: legacyOrganizationId,
        name: "別グループ人物",
        email: "cross-organization-person@example.com",
        emailNormalized: "cross-organization-person@example.com",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      const danglingPersonId = await ctx.db.insert("organizationPeople", {
        organizationId,
        name: "削除してdanglingにする人物",
        email: "dangling-person@example.com",
        emailNormalized: "dangling-person@example.com",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.delete(danglingPersonId);
      await ctx.db.insert("organizationMembers", {
        organizationId,
        personId,
        userId,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      const shopId = await ctx.db.insert(
        "shops",
        legacyDocument<WithoutSystemFields<Doc<"shops">>>({
          organizationId,
          operatingStatus: "active",
          name: "確認店舗",
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
          regularClosedDays: [],
          isDeleted: false,
        }),
      );
      const legacyShopId = await ctx.db.insert(
        "shops",
        legacyDocument<WithoutSystemFields<Doc<"shops">>>({
          name: "旧形式店舗",
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
          regularClosedDays: [],
          isDeleted: false,
        }),
      );
      const legacyStaffId = await ctx.db.insert(
        "staffs",
        legacyStaffDocumentForMigrationHistory({
          shopId: legacyShopId,
          name: "旧形式スタッフ",
          email: secretEmail,
          isDeleted: false,
        }),
      );
      await ctx.db.insert("staffs", {
        shopId,
        organizationId,
        organizationPersonId: personId,
        name: "正規化不一致スタッフ",
        email: secretMismatchEmail,
        emailNormalized: "wrong-staff@example.com",
        excludedFromShift: false,
        isDeleted: false,
      });
      await ctx.db.insert("staffs", {
        shopId,
        organizationId,
        organizationPersonId: danglingUserPersonId,
        userId: danglingStaffUserId,
        name: "参照切れ利用者",
        email: secretDanglingStaffUserEmail,
        emailNormalized: secretDanglingStaffUserEmail,
        excludedFromShift: false,
        isDeleted: false,
      });
      await ctx.db.delete(danglingStaffUserId);
      await ctx.db.insert("staffs", {
        shopId,
        organizationId,
        organizationPersonId: deletedLinkedUserPersonId,
        userId: deletedLinkedUserId,
        name: "削除済みlinked user",
        email: secretDeletedLinkedUserEmail,
        emailNormalized: secretDeletedLinkedUserEmail,
        excludedFromShift: false,
        isDeleted: false,
      });
      await ctx.db.insert("staffs", {
        shopId,
        organizationId,
        organizationPersonId: deletionRequestedLinkedUserPersonId,
        userId: deletionRequestedLinkedUserId,
        name: "削除受付済みlinked user",
        email: secretDeletionRequestedLinkedUserEmail,
        emailNormalized: secretDeletionRequestedLinkedUserEmail,
        excludedFromShift: false,
        isDeleted: false,
      });
      await ctx.db.insert("staffs", {
        shopId,
        organizationId,
        organizationPersonId: missingUserPersonId,
        userId,
        name: "利用者紐付け欠損人物",
        email: secretMissingPersonUserEmail,
        emailNormalized: secretMissingPersonUserEmail,
        excludedFromShift: false,
        isDeleted: false,
      });
      await ctx.db.insert("staffs", {
        shopId,
        organizationId,
        organizationPersonId: mismatchedUserPersonId,
        userId,
        name: "利用者紐付け不一致人物",
        email: secretPersonUserMismatchEmail,
        emailNormalized: secretPersonUserMismatchEmail,
        excludedFromShift: false,
        isDeleted: false,
      });
      await ctx.db.insert("staffs", {
        shopId,
        organizationId,
        organizationPersonId: removedPersonId,
        name: "削除済み人物に紐づくスタッフ",
        email: "removed-person@example.com",
        emailNormalized: "removed-person@example.com",
        excludedFromShift: false,
        isDeleted: false,
      });
      await ctx.db.insert("shopMembers", {
        shopId,
        userId,
        role: "manager",
        isDeleted: false,
      });
      await ctx.db.insert("shopBillingStates", {
        shopId,
        planKey: "free",
        source: "system",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("shopBillingStates", {
        shopId: legacyShopId,
        planKey: "free",
        source: "system",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert(
        "notificationOutbox",
        legacyDocument<WithoutSystemFields<Doc<"notificationOutbox">>>({
          channel: "email",
          status: "pending",
          dedupeKey: "email:narrow-readiness",
          fanoutTargetKey: secretFanoutTargetKey,
          payload: {
            kind: "email",
            from: "sender@example.com",
            to: secretEmail,
            subject: "secret subject",
            html: "<p>secret</p>",
            context: "narrow.readiness",
          },
          attemptCount: 0,
          nextRunAt: now,
          cancelReason: "shop_inactive",
          createdAt: now,
          updatedAt: now,
        }),
      );
      const recruitmentId = await ctx.db.insert("recruitments", {
        shopId,
        periodStart: "2026-08-01",
        periodEnd: "2026-08-02",
        deadline: "2026-07-31",
        shopClosedDates: [],
        status: "confirmed",
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      await ctx.db.insert(
        "shiftSubmissions",
        legacyDocument<WithoutSystemFields<Doc<"shiftSubmissions">>>({
          recruitmentId,
          staffId: legacyStaffId,
          submittedAt: now,
        }),
      );
      await ctx.db.insert("shiftSubmissions", {
        recruitmentId,
        staffId: legacyStaffId,
        firstSubmittedAt: now + 1,
        submittedAt: now,
      });
      await ctx.db.insert(
        "positions",
        legacyDocument<WithoutSystemFields<Doc<"positions">>>({
          shopId,
          name: "既定A",
          color: "#111111",
          sortOrder: 0,
          isDefault: true,
          isDeleted: false,
        }),
      );
      await ctx.db.insert("positions", {
        shopId,
        name: "既定B",
        color: "#222222",
        sortOrder: 1,
        isDefault: true,
        isDeleted: false,
      });
      await ctx.db.insert(
        "positions",
        legacyDocument<WithoutSystemFields<Doc<"positions">>>({
          shopId,
          name: "未補完",
          color: "#333333",
          sortOrder: 2,
          isDeleted: false,
        }),
      );
      await ctx.db.insert("positions", {
        shopId,
        name: "削除済み既定",
        color: "#444444",
        sortOrder: 3,
        isDefault: true,
        isDeleted: true,
      });
      await ctx.db.insert(
        "magicLinks",
        legacyDocument<WithoutSystemFields<Doc<"magicLinks">>>({
          token: secretToken,
          staffId: legacyStaffId,
          shopId,
          recruitmentId,
          expiresAt: now + 60_000,
        }),
      );
      await ctx.db.insert("magicLinks", {
        token: secretViewToken,
        staffId: legacyStaffId,
        shopId,
        recruitmentId,
        accessKind: "view",
        expiresAt: now + 60_000,
      });
      await ctx.db.insert(
        "sessions",
        legacyDocument<WithoutSystemFields<Doc<"sessions">>>({
          sessionToken: secretSessionToken,
          staffId: legacyStaffId,
          shopId,
          recruitmentId,
          expiresAt: now + 60_000,
        }),
      );
      await ctx.db.insert(
        "notificationFanoutOperations",
        legacyDocument<WithoutSystemFields<Doc<"notificationFanoutOperations">>>({
          operationKey: "fanout:narrow-readiness",
          kind: "confirmation",
          purpose: "confirmation",
          recruitmentId,
          shopId,
          targetStaffIds: [],
          cursor: 0,
          status: "completed",
          dedupeSuffix: "confirm",
          createdAt: now,
          updatedAt: now,
        }),
      );
      await ctx.db.insert("notificationFanoutOperations", {
        operationKey: "fanout:narrow-readiness:incomplete-supplemental",
        kind: "confirmation",
        purpose: "confirmation_resend",
        recruitmentId,
        shopId,
        targetStaffIds: [],
        cursor: 0,
        status: "pending",
        dedupeSuffix: "confirm:resend",
        supersedesActiveOperations: false,
        createdAt: now,
        updatedAt: now,
      });
      const conflictId = await ctx.db.insert("organizationMigrationConflicts", {
        organizationId: legacyOrganizationId,
        sourceType: "shop",
        sourceId: legacyShopId,
        code: "narrow_readiness_test",
        createdAt: now,
      });
      const staffConflictId = await ctx.db.insert("organizationMigrationConflicts", {
        organizationId,
        sourceType: "staff",
        sourceId: legacyStaffId,
        code: "email_name_mismatch",
        createdAt: now,
      });
      return { conflictId, legacyShopId, legacyStaffId, staffConflictId };
    });

    const results = await Promise.all([
      t.query(internal.narrowReadiness.queries.verifyShops, { paginationOpts: firstPage }),
      t.query(internal.narrowReadiness.queries.verifyUsers, { paginationOpts: firstPage }),
      t.query(internal.narrowReadiness.queries.verifyStaffs, { paginationOpts: firstPage }),
      t.query(internal.narrowReadiness.queries.verifyOrganizations, { paginationOpts: firstPage }),
      t.query(internal.narrowReadiness.queries.verifyNotificationOutbox, { paginationOpts: firstPage }),
      t.query(internal.narrowReadiness.queries.verifyNotificationFanoutOperations, {
        paginationOpts: firstPage,
      }),
      t.query(internal.narrowReadiness.queries.verifyShiftSubmissions, { paginationOpts: firstPage }),
      t.query(internal.narrowReadiness.queries.verifyPositions, { paginationOpts: firstPage }),
      t.query(internal.narrowReadiness.queries.verifyPositionShops, { paginationOpts: firstPage }),
      t.query(internal.narrowReadiness.queries.verifyMagicLinks, { paginationOpts: firstPage }),
      t.query(internal.narrowReadiness.queries.verifySessions, { paginationOpts: firstPage }),
      t.query(internal.narrowReadiness.queries.verifyLegacyShopMembers, { paginationOpts: firstPage }),
      t.query(internal.narrowReadiness.queries.verifyLegacyShopBillingStates, { paginationOpts: firstPage }),
      t.query(internal.narrowReadiness.queries.verifyOrganizationMigrationConflicts, {
        paginationOpts: firstPage,
      }),
    ]);

    expect(results[0]).toMatchObject({
      anomalies: {
        missingOrganizationId: 1,
        archivedOperatingStatus: 0,
        unknownOperatingStatus: 0,
      },
      observations: { operatingStatusPresent: 1 },
    });
    expect(results[1].anomalies).toEqual({
      missingEmailNormalized: 1,
      invalidEmailNormalization: 1,
      legacyAdminRole: 1,
    });
    expect(results[2].anomalies).toMatchObject({
      missingOrganizationId: 1,
      missingOrganizationPersonId: 1,
      missingExcludedFromShift: 1,
      missingEmailNormalized: 1,
      invalidEmailNormalization: 1,
      activeStaffPersonEmailMismatch: 1,
      activeStaffLinkedRemovedPerson: 1,
      danglingStaffUser: 1,
      danglingPersonUser: 1,
      deletedLinkedUser: 1,
      deletionRequestedLinkedUser: 1,
      missingPersonUserForLinkedStaff: 1,
      personUserMismatch: 1,
    });
    expect(results[3].anomalies).toMatchObject({
      missingBillingEmail: 1,
      missingBillingEmailNormalized: 1,
      missingBillingState: 2,
      ambiguousBillingStates: 0,
    });
    expect(results[4].anomalies).toEqual({
      missingNotificationContext: 1,
      missingDeliverySuppressed: 1,
      missingPurpose: 1,
      missingOrganizationId: 1,
      missingScope: 1,
      danglingOrganizationId: 0,
      danglingShopId: 0,
      shopMissingOrganizationId: 0,
      shopDanglingOrganizationId: 0,
      shopOrganizationMismatch: 0,
      incompleteFanoutLink: 1,
      legacyShopInactiveCancelReason: 1,
    });
    expect(results[5].anomalies).toEqual({
      missingSupersedesActiveOperations: 1,
      incompleteSupplementalBaseline: 1,
    });
    expect(results[6].anomalies).toEqual({
      missingFirstSubmittedAt: 1,
      firstSubmittedAfterSubmittedAt: 1,
    });
    expect(results[7].anomalies).toEqual({
      missingIsDefault: 1,
      defaultSelectionMismatch: 1,
      deletedDefaultTrue: 1,
    });
    expect(results[8].anomalies).toEqual({ readerWindowOverflow: 0, multipleDefaultShops: 1 });
    expect(results[8].observations).toEqual({ shopsWithoutActivePositions: 1 });
    expect(results[9].anomalies).toEqual({
      missingAccessKind: 1,
      activeViewMissingNotificationOperationKey: 1,
    });
    expect(results[10].anomalies).toEqual({ missingAccessKind: 1 });
    expect(results[11].activeRows).toBe(1);
    expect(results[11].totalRows).toBe(1);
    expect(results[12].activeRows).toBe(2);
    expect(results[12].totalRows).toBe(2);
    expect(results[13].unresolvedRows).toBe(2);
    expect(results[13].unresolvedStaffRows).toBe(1);
    expect(results[13].unresolvedNotificationOutboxScopeRows).toBe(0);

    const serialized = JSON.stringify(results);
    expect(serialized).not.toContain(secretEmail);
    expect(serialized).not.toContain(secretAdminEmail);
    expect(serialized).not.toContain(secretMismatchEmail);
    expect(serialized).not.toContain(secretMissingPersonUserEmail);
    expect(serialized).not.toContain(secretPersonUserMismatchEmail);
    expect(serialized).not.toContain(secretDanglingStaffUserEmail);
    expect(serialized).not.toContain(secretDeletedLinkedUserEmail);
    expect(serialized).not.toContain(secretDeletionRequestedLinkedUserEmail);
    expect(serialized).not.toContain(secretToken);
    expect(serialized).not.toContain(secretViewToken);
    expect(serialized).not.toContain(secretSessionToken);
    expect(serialized).not.toContain(secretFanoutTargetKey);
    expect(serialized).not.toContain(ids.legacyShopId);
    expect(serialized).not.toContain(ids.legacyStaffId);
    expect(serialized).not.toContain(ids.conflictId);
    expect(serialized).not.toContain(ids.staffConflictId);
  });

  it("過大なpage sizeを拒否する", async () => {
    const t = createMigrationHistoryTestWithMigrations();
    await expect(
      t.query(internal.narrowReadiness.queries.verifyShops, {
        paginationOpts: { cursor: null, numItems: 101 },
      }),
    ).rejects.toThrow("numItems must be between 1 and 100");
  });
});
