import { describe, expect, it } from "vitest";
import { internal } from "../_generated/api";
import { createMigrationHistoryTestWithMigrations } from "../_test/migrations.test-helper";

const firstPage = { cursor: null, numItems: 100 };

describe("Narrow readiness queries", () => {
  it("PIIやrow IDを返さず、全候補の旧shape残件を検出する", async () => {
    const t = createMigrationHistoryTestWithMigrations();
    const secretEmail = "narrow-secret@example.com";
    const secretAdminEmail = " Legacy-Admin@Example.COM ";
    const secretMismatchEmail = " Mismatch@Example.COM ";
    const secretMissingPersonUserEmail = "missing-person-user@example.com";
    const secretPersonUserMismatchEmail = "person-user-mismatch@example.com";
    const secretDanglingStaffUserEmail = "dangling-staff-user@example.com";
    const secretToken = "narrow-secret-token";
    const secretViewToken = "narrow-secret-view-token";
    const secretSessionToken = "narrow-secret-session";
    const secretFanoutTargetKey = "narrow-secret-fanout-target";
    const secretStripeIdempotencyKey = "narrow-secret-stripe-idempotency";
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
      await ctx.db.insert("users", {
        authTokenIdentifier: "https://convex.test|narrow_readiness_admin",
        name: "旧admin",
        email: secretAdminEmail,
        role: "admin",
        isDeleted: false,
      });
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
      const legacyOrganizationId = await ctx.db.insert("organizations", {
        name: "旧形式グループ",
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      });
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
      const crossOrganizationPersonId = await ctx.db.insert("organizationPeople", {
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
      const memberId = await ctx.db.insert("organizationMembers", {
        organizationId,
        personId,
        userId,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      const shopId = await ctx.db.insert("shops", {
        organizationId,
        operatingStatus: "active",
        name: "確認店舗",
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        regularClosedDays: [],
        isDeleted: false,
      });
      const legacyShopId = await ctx.db.insert("shops", {
        name: "旧形式店舗",
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        regularClosedDays: [],
        isDeleted: false,
      });
      const legacyStaffId = await ctx.db.insert("staffs", {
        shopId: legacyShopId,
        name: "旧形式スタッフ",
        email: secretEmail,
        isDeleted: false,
      });
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
      await ctx.db.insert("organizationInvitations", {
        organizationId,
        email: secretEmail,
        emailNormalized: secretEmail,
        tokenDigest: "secret-token-digest",
        status: "accepted",
        inviterMemberId: memberId,
        reservedSeat: false,
        version: 1,
        expiresAt: now + 60_000,
        targetPersonId: crossOrganizationPersonId,
        acceptedAt: now,
        acceptedByPersonId: crossOrganizationPersonId,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("organizationInvitations", {
        organizationId,
        email: "linked-missing-evidence@example.com",
        emailNormalized: "linked-missing-evidence@example.com",
        invitedName: "連携証跡欠損",
        tokenDigest: "linked-missing-evidence-digest",
        status: "linked",
        purpose: "managerAddition",
        inviterMemberId: memberId,
        reservedSeat: false,
        version: 1,
        expiresAt: now + 60_000,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("organizationInvitations", {
        organizationId,
        email: "non-linked-evidence@example.com",
        emailNormalized: "non-linked-evidence@example.com",
        invitedName: "非連携状態の証跡",
        tokenDigest: "non-linked-evidence-digest",
        status: "issued",
        purpose: "managerAddition",
        inviterMemberId: memberId,
        reservedSeat: false,
        version: 1,
        expiresAt: now + 60_000,
        targetPersonId: danglingPersonId,
        linkedAt: now,
        linkedByPersonId: danglingPersonId,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("organizationInvitations", {
        organizationId,
        email: "cross-linked-evidence@example.com",
        emailNormalized: "cross-linked-evidence@example.com",
        invitedName: "別グループ連携者",
        tokenDigest: "cross-linked-evidence-digest",
        status: "linked",
        purpose: "managerAddition",
        inviterMemberId: memberId,
        reservedSeat: false,
        version: 1,
        expiresAt: now + 60_000,
        linkedAt: now,
        linkedByPersonId: crossOrganizationPersonId,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("notificationOutbox", {
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
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("organizationStripeOperations", {
        organizationId,
        kind: "immediateProCheckout",
        requestKey: "legacy-immediate-pro-checkout",
        stripeIdempotencyKey: secretStripeIdempotencyKey,
        livemode: false,
        status: "succeeded",
        attemptCount: 1,
        expiresAt: now + 60_000,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("organizationStripeOperations", {
        organizationId,
        kind: "trialSetupCheckout",
        requestKey: "trial-setup-missing-target-plan",
        stripeIdempotencyKey: "narrow-secret-trial-setup-idempotency",
        livemode: false,
        status: "queued",
        attemptCount: 0,
        expiresAt: now + 60_000,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("organizationStripeSubscriptions", {
        organizationId,
        stripeCustomerId: "cus_narrow",
        stripeSubscriptionId: "sub_narrow",
        stripePriceId: "price_narrow",
        livemode: false,
        status: "active",
        providerGeneration: 1,
        cancelAtPeriodEnd: false,
        syncedAt: now,
        createdAt: now,
        updatedAt: now,
      });
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
      await ctx.db.insert("shiftSubmissions", {
        recruitmentId,
        staffId: legacyStaffId,
        submittedAt: now,
      });
      await ctx.db.insert("shiftSubmissions", {
        recruitmentId,
        staffId: legacyStaffId,
        firstSubmittedAt: now + 1,
        submittedAt: now,
      });
      await ctx.db.insert("positions", {
        shopId,
        name: "既定A",
        color: "#111111",
        sortOrder: 0,
        isDefault: true,
        isDeleted: false,
      });
      await ctx.db.insert("positions", {
        shopId,
        name: "既定B",
        color: "#222222",
        sortOrder: 1,
        isDefault: true,
        isDeleted: false,
      });
      await ctx.db.insert("positions", {
        shopId,
        name: "未補完",
        color: "#333333",
        sortOrder: 2,
        isDeleted: false,
      });
      await ctx.db.insert("positions", {
        shopId,
        name: "削除済み既定",
        color: "#444444",
        sortOrder: 3,
        isDefault: true,
        isDeleted: true,
      });
      await ctx.db.insert("magicLinks", {
        token: secretToken,
        staffId: legacyStaffId,
        shopId,
        recruitmentId,
        expiresAt: now + 60_000,
      });
      await ctx.db.insert("magicLinks", {
        token: secretViewToken,
        staffId: legacyStaffId,
        shopId,
        recruitmentId,
        accessKind: "view",
        expiresAt: now + 60_000,
      });
      await ctx.db.insert("sessions", {
        sessionToken: secretSessionToken,
        staffId: legacyStaffId,
        shopId,
        recruitmentId,
        expiresAt: now + 60_000,
      });
      await ctx.db.insert("notificationFanoutOperations", {
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
      });
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
      return { conflictId, legacyShopId };
    });

    const results = await Promise.all([
      t.query(internal.narrowReadiness.queries.verifyShops, { paginationOpts: firstPage }),
      t.query(internal.narrowReadiness.queries.verifyUsers, { paginationOpts: firstPage }),
      t.query(internal.narrowReadiness.queries.verifyStaffs, { paginationOpts: firstPage }),
      t.query(internal.narrowReadiness.queries.verifyOrganizations, { paginationOpts: firstPage }),
      t.query(internal.narrowReadiness.queries.verifyOrganizationInvitations, { paginationOpts: firstPage }),
      t.query(internal.narrowReadiness.queries.verifyNotificationOutbox, { paginationOpts: firstPage }),
      t.query(internal.narrowReadiness.queries.verifyStripeSubscriptions, { paginationOpts: firstPage }),
      t.query(internal.narrowReadiness.queries.verifyStripeOperations, { paginationOpts: firstPage }),
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

    expect(results[0].anomalies).toMatchObject({ missingOrganizationId: 1, missingOperatingStatus: 1 });
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
      legacyStatus: 1,
      missingInvitedName: 1,
      missingPurpose: 1,
      legacyAcceptedFields: 1,
      linkedMissingLinkedAt: 1,
      linkedMissingLinkedByPersonId: 1,
      nonLinkedLinkEvidence: 1,
      danglingTargetPerson: 1,
      targetPersonOrganizationMismatch: 1,
      danglingLinkedByPerson: 1,
      linkedByPersonOrganizationMismatch: 1,
      danglingAcceptedByPerson: 0,
      acceptedByPersonOrganizationMismatch: 1,
    });
    expect(results[5].anomalies).toEqual({
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
    });
    expect(results[6].anomalies.missingPlan).toBe(1);
    expect(results[7].anomalies).toEqual({
      legacyImmediateProCheckout: 1,
      trialSetupCheckoutMissingTargetPlan: 1,
    });
    expect(results[8].anomalies).toEqual({
      missingSupersedesActiveOperations: 1,
      incompleteSupplementalBaseline: 1,
    });
    expect(results[9].anomalies).toEqual({
      missingFirstSubmittedAt: 1,
      firstSubmittedAfterSubmittedAt: 1,
    });
    expect(results[10].anomalies).toEqual({
      missingIsDefault: 1,
      defaultSelectionMismatch: 1,
      deletedDefaultTrue: 1,
    });
    expect(results[11].anomalies).toEqual({ readerWindowOverflow: 0, multipleDefaultShops: 1 });
    expect(results[11].observations).toEqual({ shopsWithoutActivePositions: 1 });
    expect(results[12].anomalies).toEqual({
      missingAccessKind: 1,
      activeViewMissingNotificationOperationKey: 1,
    });
    expect(results[13].anomalies).toEqual({ missingAccessKind: 1 });
    expect(results[14].activeRows).toBe(1);
    expect(results[14].totalRows).toBe(1);
    expect(results[15].activeRows).toBe(2);
    expect(results[15].totalRows).toBe(2);
    expect(results[16].unresolvedRows).toBe(1);
    expect(results[16].unresolvedNotificationOutboxScopeRows).toBe(0);

    const serialized = JSON.stringify(results);
    expect(serialized).not.toContain(secretEmail);
    expect(serialized).not.toContain(secretAdminEmail);
    expect(serialized).not.toContain(secretMismatchEmail);
    expect(serialized).not.toContain(secretMissingPersonUserEmail);
    expect(serialized).not.toContain(secretPersonUserMismatchEmail);
    expect(serialized).not.toContain(secretDanglingStaffUserEmail);
    expect(serialized).not.toContain(secretToken);
    expect(serialized).not.toContain(secretViewToken);
    expect(serialized).not.toContain(secretSessionToken);
    expect(serialized).not.toContain(secretFanoutTargetKey);
    expect(serialized).not.toContain(secretStripeIdempotencyKey);
    expect(serialized).not.toContain(ids.legacyShopId);
    expect(serialized).not.toContain(ids.conflictId);
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
