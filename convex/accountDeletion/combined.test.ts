import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { seedOrganizationManagerShop, seedUser } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { runAccountDeletionJob } from "./actions";
import { ACCOUNT_DELETION_ORGANIZATION_CLEANUP_POLL_MS, ACCOUNT_DELETION_SHARED_CLEANUP_POLL_MS } from "./constants";
import type { AccountDeletionProvider } from "./provider";

const ISSUER = "https://convex.test";
const NOW = Date.parse("2026-08-13T00:00:00.000Z");
const AS_OF_DATE = "2026-08-13";
const REQUEST_ID = "718cf80f-d4fb-4a5d-bf20-ad48044f31eb";

type AccountDeletionTest = ReturnType<typeof createAccountDeletionTest>;

function createAccountDeletionTest() {
  return convexTest(schema, modules);
}

describe("所属を含むアカウント削除", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.stubEnv("APP_URL", "https://shiftori.example");
    vi.stubEnv("CLERK_SECRET_KEY", "configured-secret");
    vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "configured-publishable");
    vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", ISSUER);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("所属なし、共有組織、単独管理者の削除範囲を最小DTOで分類する", async () => {
    const accountOnlyTest = createAccountDeletionTest();
    const accountOnly = await accountOnlyTest
      .withIdentity({ subject: "preview_account_only" })
      .query(api.accountDeletion.queries.getDeletionPreview, { asOfDate: AS_OF_DATE });
    expect(accountOnly).toMatchObject({
      status: "ready",
      action: "accountOnly",
      previewFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(Object.keys(accountOnly).sort()).toEqual(["action", "previewFingerprint", "status"]);

    const sharedTest = createAccountDeletionTest();
    await sharedTest.run(async (ctx) => {
      const target = await seedOrganizationManagerShop(ctx, {
        subject: "preview_shared",
        email: "preview-shared@example.com",
        shopName: "共同経営店",
        complimentary: true,
      });
      await addOtherManager(ctx, {
        organizationId: target.organizationId,
        subject: "preview_shared_successor",
        email: "preview-shared-successor@example.com",
      });
      await ctx.db.patch(target.organizationId, {
        billingEmail: "preview-shared-successor@example.com",
        billingEmailNormalized: "preview-shared-successor@example.com",
      });
    });
    const shared = await sharedTest
      .withIdentity({ subject: "preview_shared" })
      .query(api.accountDeletion.queries.getDeletionPreview, { asOfDate: AS_OF_DATE });
    expect(shared).toEqual({
      status: "ready",
      action: "leaveOrganization",
      previewFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      organization: { name: "共同経営店事業者", shopCount: 1 },
      futureAssignmentCount: 0,
    });

    const soleTest = createAccountDeletionTest();
    await soleTest.run((ctx) =>
      seedOrganizationManagerShop(ctx, {
        subject: "preview_sole",
        email: "preview-sole@example.com",
        shopName: "単独経営店",
        complimentary: true,
      }),
    );
    const sole = await soleTest
      .withIdentity({ subject: "preview_sole" })
      .query(api.accountDeletion.queries.getDeletionPreview, { asOfDate: AS_OF_DATE });
    expect(sole).toEqual({
      status: "ready",
      action: "deleteOrganization",
      previewFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      organization: { name: "単独経営店事業者", shopCount: 1 },
    });
  });

  it.each(["personOnly", "staffOnly"] as const)(
    "管理者権限を外した本人が%sで残る場合も、共有組織から退出してアカウントを削除できる",
    async (associationKind) => {
      const t = createAccountDeletionTest();
      const ids = await t.run((ctx) =>
        seedFormerManagerDepartureFixture(ctx, {
          subject: `former_manager_${associationKind}`,
          email: `former-manager-${associationKind.toLowerCase()}@example.com`,
          hasStaff: associationKind === "staffOnly",
        }),
      );
      const actor = t.withIdentity({ subject: `former_manager_${associationKind}` });
      const preview = await actor.query(api.accountDeletion.queries.getDeletionPreview, { asOfDate: AS_OF_DATE });
      expect(preview).toEqual({
        status: "ready",
        action: "leaveOrganization",
        previewFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
        organization: { name: "元管理者店舗事業者", shopCount: 1 },
        futureAssignmentCount: 0,
      });
      if (preview.status !== "ready") throw new Error("former-manager preview was not ready");

      await expect(
        t.mutation(internal.accountDeletion.mutations.accept, {
          ...acceptArgs(`former_manager_${associationKind}`),
          scope: "accountAndAssociations",
          previewFingerprint: preview.previewFingerprint,
        }),
      ).resolves.toEqual({ status: "accepted" });

      const state = await t.run(async (ctx) => ({
        user: await ctx.db.get(ids.userId),
        organization: await ctx.db.get(ids.organizationId),
        person: await ctx.db.get(ids.personId),
        member: await ctx.db.get(ids.memberId),
        staff: ids.staffId ? await ctx.db.get(ids.staffId) : null,
        successorMember: await ctx.db.get(ids.successorMemberId),
      }));
      expect(state.user).toMatchObject({ isDeleted: true, accountDeletionRequestedAt: NOW });
      expect(state.organization).toMatchObject({ isDeleted: false });
      expect(state.person).toMatchObject({ status: "removed" });
      expect(state.member).toMatchObject({ status: "removed" });
      if (associationKind === "staffOnly") expect(state.staff).toMatchObject({ isDeleted: true });
      else expect(state.staff).toBeNull();
      expect(state.successorMember).toMatchObject({ status: "active" });
    },
  );

  it("別組織のremoved所属履歴があっても、現在の組織に対応する元管理者所属を選ぶ", async () => {
    const t = createAccountDeletionTest();
    await t.run(async (ctx) => {
      const target = await seedFormerManagerDepartureFixture(ctx, {
        subject: "former_manager_with_history",
        email: "former-manager-with-history@example.com",
        hasStaff: false,
      });
      const historicalOrganization = await seedOrganizationManagerShop(ctx, {
        subject: "former_manager_history_owner",
        email: "former-manager-history-owner@example.com",
        shopName: "過去所属店舗",
        complimentary: true,
      });
      const historicalPersonId = await ctx.db.insert("organizationPeople", {
        organizationId: historicalOrganization.organizationId,
        userId: target.userId,
        name: "過去所属本人",
        email: "former-manager-with-history@example.com",
        emailNormalized: "former-manager-with-history@example.com",
        status: "removed",
        createdAt: NOW,
        updatedAt: NOW,
      });
      await ctx.db.insert("organizationMembers", {
        organizationId: historicalOrganization.organizationId,
        personId: historicalPersonId,
        userId: target.userId,
        status: "removed",
        createdAt: NOW,
        updatedAt: NOW,
      });
    });

    await expect(
      t
        .withIdentity({ subject: "former_manager_with_history" })
        .query(api.accountDeletion.queries.getDeletionPreview, { asOfDate: AS_OF_DATE }),
    ).resolves.toEqual({
      status: "ready",
      action: "leaveOrganization",
      previewFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      organization: { name: "元管理者店舗事業者", shopCount: 1 },
      futureAssignmentCount: 0,
    });
  });

  it("元管理者の所属が重複・不一致、または後任不在なら削除範囲を推測しない", async () => {
    const noSuccessor = createAccountDeletionTest();
    await noSuccessor.run(async (ctx) => {
      const target = await seedOrganizationManagerShop(ctx, {
        subject: "former_without_successor",
        email: "former-without-successor@example.com",
        shopName: "後任不在店舗",
        complimentary: true,
      });
      await ctx.db.patch(target.memberId, { status: "removed", updatedAt: NOW + 1 });
    });
    await expect(
      noSuccessor
        .withIdentity({ subject: "former_without_successor" })
        .query(api.accountDeletion.queries.getDeletionPreview, { asOfDate: AS_OF_DATE }),
    ).resolves.toEqual({ status: "blocked", reason: "inconsistentAssociation" });

    const duplicate = createAccountDeletionTest();
    await duplicate.run(async (ctx) => {
      const target = await seedFormerManagerDepartureFixture(ctx, {
        subject: "former_duplicate",
        email: "former-duplicate@example.com",
        hasStaff: false,
      });
      await ctx.db.insert("organizationMembers", {
        organizationId: target.organizationId,
        personId: target.personId,
        userId: target.userId,
        status: "removed",
        createdAt: NOW,
        updatedAt: NOW,
      });
    });
    await expect(
      duplicate
        .withIdentity({ subject: "former_duplicate" })
        .query(api.accountDeletion.queries.getDeletionPreview, { asOfDate: AS_OF_DATE }),
    ).resolves.toEqual({ status: "blocked", reason: "inconsistentAssociation" });

    const mismatch = createAccountDeletionTest();
    await mismatch.run(async (ctx) => {
      const target = await seedFormerManagerDepartureFixture(ctx, {
        subject: "former_mismatch",
        email: "former-mismatch@example.com",
        hasStaff: false,
      });
      await ctx.db.patch(target.memberId, { personId: target.successorPersonId, updatedAt: NOW + 2 });
    });
    await expect(
      mismatch
        .withIdentity({ subject: "former_mismatch" })
        .query(api.accountDeletion.queries.getDeletionPreview, { asOfDate: AS_OF_DATE }),
    ).resolves.toEqual({ status: "blocked", reason: "inconsistentAssociation" });
  });

  it("二つ以上の有効組織に所属する場合は削除範囲を推測せず拒否する", async () => {
    const t = createAccountDeletionTest();
    await t.run(async (ctx) => {
      const first = await seedOrganizationManagerShop(ctx, {
        subject: "preview_multiple",
        email: "preview-multiple@example.com",
        shopName: "複数所属A",
        complimentary: true,
      });
      const second = await seedOrganizationManagerShop(ctx, {
        subject: "preview_multiple_fixture",
        email: "preview-multiple-fixture@example.com",
        shopName: "複数所属B",
        complimentary: true,
      });
      await ctx.db.patch(second.personId, {
        userId: first.userId,
        name: "複数所属本人",
        email: "preview-multiple@example.com",
        emailNormalized: "preview-multiple@example.com",
      });
      await ctx.db.patch(second.memberId, { userId: first.userId });
    });

    await expect(
      t
        .withIdentity({ subject: "preview_multiple" })
        .query(api.accountDeletion.queries.getDeletionPreview, { asOfDate: AS_OF_DATE }),
    ).resolves.toEqual({ status: "blocked", reason: "multipleOrganizations" });
  });

  it("請求先メールと一致しても共有組織から退出でき、削除不可課金状態だけを拒否する", async () => {
    const billingEmailMatchTest = createAccountDeletionTest();
    await billingEmailMatchTest.run(async (ctx) => {
      const target = await seedOrganizationManagerShop(ctx, {
        subject: "preview_billing_contact",
        email: "preview-billing-contact@example.com",
        shopName: "請求連絡先店舗",
        complimentary: true,
      });
      await addOtherManager(ctx, {
        organizationId: target.organizationId,
        subject: "preview_billing_contact_successor",
        email: "preview-billing-contact-successor@example.com",
      });
    });
    await expect(
      billingEmailMatchTest
        .withIdentity({ subject: "preview_billing_contact" })
        .query(api.accountDeletion.queries.getDeletionPreview, { asOfDate: AS_OF_DATE }),
    ).resolves.toMatchObject({
      status: "ready",
      action: "leaveOrganization",
      organization: { name: "請求連絡先店舗事業者", shopCount: 1 },
      futureAssignmentCount: 0,
    });

    const paidSoleAdminTest = createAccountDeletionTest();
    await paidSoleAdminTest.run((ctx) =>
      seedOrganizationManagerShop(ctx, {
        subject: "preview_paid_sole_admin",
        email: "preview-paid-sole-admin@example.com",
        shopName: "有料単独店舗",
        plan: "pro",
      }),
    );
    await expect(
      paidSoleAdminTest
        .withIdentity({ subject: "preview_paid_sole_admin" })
        .query(api.accountDeletion.queries.getDeletionPreview, { asOfDate: AS_OF_DATE }),
    ).resolves.toEqual({ status: "blocked", reason: "organizationDeletionUnavailable" });
  });

  it("旧payloadでは所属を変更せず、最新previewと一致しない要求も副作用なく拒否する", async () => {
    const t = createAccountDeletionTest();
    const ids = await t.run((ctx) =>
      seedOrganizationManagerShop(ctx, {
        subject: "stale_preview",
        email: "stale-preview@example.com",
        shopName: "状態変更対象店",
        complimentary: true,
      }),
    );

    await expect(t.mutation(internal.accountDeletion.mutations.accept, acceptArgs("stale_preview"))).resolves.toEqual({
      status: "conflict",
    });
    const preview = await t
      .withIdentity({ subject: "stale_preview" })
      .query(api.accountDeletion.queries.getDeletionPreview, { asOfDate: AS_OF_DATE });
    if (preview.status !== "ready" || preview.action !== "deleteOrganization") {
      throw new Error("deleteOrganization preview was not ready");
    }
    await t.run(async (ctx) => {
      await ctx.db.patch(ids.organizationId, { name: "変更後の組織名", updatedAt: NOW + 1 });
    });

    await expect(
      t.mutation(internal.accountDeletion.mutations.accept, {
        ...acceptArgs("stale_preview"),
        scope: "accountAndAssociations",
        previewFingerprint: preview.previewFingerprint,
      }),
    ).resolves.toEqual({ status: "conflict" });

    const state = await t.run(async (ctx) => ({
      user: await ctx.db.get(ids.userId),
      organization: await ctx.db.get(ids.organizationId),
      person: await ctx.db.get(ids.personId),
      member: await ctx.db.get(ids.memberId),
      jobs: await ctx.db.query("accountDeletionJobs").collect(),
      cleanupJobs: await ctx.db.query("deletionCleanupJobs").collect(),
      audits: await ctx.db.query("organizationAuditEvents").collect(),
      scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
    }));
    expect(state.user).toMatchObject({ isDeleted: false });
    expect(state.user).not.toHaveProperty("accountDeletionRequestedAt");
    expect(state.organization).toMatchObject({ name: "変更後の組織名", isDeleted: false });
    expect(state.person).toMatchObject({ status: "active" });
    expect(state.member).toMatchObject({ status: "active" });
    expect(state.jobs).toEqual([]);
    expect(state.cleanupJobs).toEqual([]);
    expect(state.audits).toEqual([]);
    expect(state.scheduled).toEqual([]);
  });

  it("共有組織の本人staffが上限を超えた場合はpreviewとacceptを無変更で拒否する", async () => {
    const t = createAccountDeletionTest();
    const ids = await t.run(async (ctx) => {
      const fixture = await seedSharedDepartureFixture(ctx);
      for (let index = 0; index < 49; index += 1) {
        await ctx.db.insert("staffs", {
          organizationId: fixture.organizationId,
          organizationPersonId: fixture.personId,
          userId: fixture.userId,
          shopId: fixture.shopId,
          name: `削除済み所属${index}`,
          email: `removed-membership-${index}@example.com`,
          emailNormalized: `removed-membership-${index}@example.com`,
          isDeleted: true,
        });
      }
      return fixture;
    });
    const actor = t.withIdentity({ subject: "shared_departure" });
    const readyPreview = await actor.query(api.accountDeletion.queries.getDeletionPreview, {
      asOfDate: AS_OF_DATE,
    });
    if (readyPreview.status !== "ready" || readyPreview.action !== "leaveOrganization") {
      throw new Error("leaveOrganization preview was not ready at the record limit");
    }
    await t.run(async (ctx) => {
      await ctx.db.insert("staffs", {
        organizationId: ids.organizationId,
        organizationPersonId: ids.personId,
        userId: ids.userId,
        shopId: ids.shopId,
        name: "上限超過所属",
        email: "over-limit-membership@example.com",
        emailNormalized: "over-limit-membership@example.com",
        isDeleted: true,
      });
    });

    await expect(
      actor.query(api.accountDeletion.queries.getDeletionPreview, { asOfDate: AS_OF_DATE }),
    ).resolves.toEqual({ status: "blocked", reason: "tooManyAssociatedRecords" });
    await expect(
      t.mutation(internal.accountDeletion.mutations.accept, {
        ...acceptArgs("shared_departure"),
        scope: "accountAndAssociations",
        previewFingerprint: readyPreview.previewFingerprint,
      }),
    ).resolves.toEqual({ status: "conflict" });

    const state = await t.run(async (ctx) => ({
      user: await ctx.db.get(ids.userId),
      organization: await ctx.db.get(ids.organizationId),
      person: await ctx.db.get(ids.personId),
      member: await ctx.db.get(ids.memberId),
      accountJobs: await ctx.db.query("accountDeletionJobs").collect(),
      cleanupJobs: await ctx.db.query("deletionCleanupJobs").collect(),
      audits: await ctx.db.query("organizationAuditEvents").collect(),
    }));
    expect(state.user).toMatchObject({ isDeleted: false });
    expect(state.user).not.toHaveProperty("accountDeletionRequestedAt");
    expect(state.organization).toMatchObject({ isDeleted: false });
    expect(state.person).toMatchObject({ status: "active" });
    expect(state.member).toMatchObject({ status: "active" });
    expect(state.accountJobs).toEqual([]);
    expect(state.cleanupJobs).toEqual([]);
    expect(state.audits).toEqual([]);
  });

  it("本人の削除済みstaffが別組織店舗を参照する場合は範囲を推測せず拒否する", async () => {
    const t = createAccountDeletionTest();
    const ids = await t.run(async (ctx) => {
      const fixture = await seedSharedDepartureFixture(ctx);
      const foreign = await seedOrganizationManagerShop(ctx, {
        subject: "shared_departure_foreign_owner",
        email: "shared-departure-foreign-owner@example.com",
        shopName: "別組織店舗",
        complimentary: true,
      });
      const corruptedStaffId = await ctx.db.insert("staffs", {
        organizationId: fixture.organizationId,
        organizationPersonId: fixture.personId,
        userId: fixture.userId,
        shopId: foreign.shopId,
        name: "越境した削除済み所属",
        email: "corrupted-deleted-staff@example.com",
        emailNormalized: "corrupted-deleted-staff@example.com",
        isDeleted: true,
      });
      const foreignRecruitmentId = await seedRecruitment(ctx, foreign.shopId, AS_OF_DATE, "open");
      const foreignStatsId = await ctx.db.insert("recruitmentStats", {
        recruitmentId: foreignRecruitmentId,
        shopId: foreign.shopId,
        submittedCount: 7,
        activeStaffCountSnapshot: 9,
        updatedAt: NOW,
      });
      return { ...fixture, corruptedStaffId, foreignShopId: foreign.shopId, foreignStatsId };
    });

    await expect(
      t
        .withIdentity({ subject: "shared_departure" })
        .query(api.accountDeletion.queries.getDeletionPreview, { asOfDate: AS_OF_DATE }),
    ).resolves.toEqual({ status: "blocked", reason: "inconsistentAssociation" });

    const state = await t.run(async (ctx) => ({
      corruptedStaff: await ctx.db.get(ids.corruptedStaffId),
      foreignStats: await ctx.db.get(ids.foreignStatsId),
      jobs: await ctx.db.query("accountDeletionJobs").collect(),
      scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
      user: await ctx.db.get(ids.userId),
    }));
    expect(state.corruptedStaff).toMatchObject({ shopId: ids.foreignShopId, isDeleted: true });
    expect(state.foreignStats).toMatchObject({ submittedCount: 7, activeStaffCountSnapshot: 9 });
    expect(state.user).toMatchObject({ isDeleted: false });
    expect(state.jobs).toEqual([]);
    expect(state.scheduled).toEqual([]);
  });

  it.each(["staffAccess", "invitation", "notification", "invitationNotification"] as const)(
    "共有組織の本人関連%sが上限を超えた場合は専用reasonで拒否する",
    async (recordKind) => {
      const t = createAccountDeletionTest();
      await t.run(async (ctx) => {
        const fixture = await seedSharedDepartureFixture(ctx);
        if (recordKind === "staffAccess") {
          for (let index = 0; index < 198; index += 1) {
            await ctx.db.insert("sessions", {
              sessionToken: `shared-departure-overflow-${index}`,
              staffId: fixture.staffId,
              shopId: fixture.shopId,
              recruitmentId: fixture.currentRecruitmentId,
              expiresAt: NOW + 86_400_000,
            });
          }
          return;
        }
        if (recordKind === "invitation") {
          for (let index = 0; index < 51; index += 1) {
            await ctx.db.insert("organizationInvitations", {
              organizationId: fixture.organizationId,
              email: `invitee-${index}@example.com`,
              emailNormalized: `invitee-${index}@example.com`,
              tokenDigest: `shared-departure-overflow-${index}`,
              status: "issued",
              purpose: "managerAddition",
              inviterMemberId: fixture.memberId,
              reservedSeat: true,
              version: 1,
              expiresAt: NOW + 86_400_000,
              createdAt: NOW,
              updatedAt: NOW,
            });
          }
          return;
        }
        let organizationInvitationId: Id<"organizationInvitations"> | undefined;
        if (recordKind === "invitationNotification") {
          organizationInvitationId = await ctx.db.insert("organizationInvitations", {
            organizationId: fixture.organizationId,
            email: "invitation-notification@example.com",
            emailNormalized: "invitation-notification@example.com",
            tokenDigest: "shared-departure-invitation-notification-overflow",
            status: "issued",
            purpose: "managerAddition",
            inviterMemberId: fixture.memberId,
            reservedSeat: true,
            version: 1,
            expiresAt: NOW + 86_400_000,
            createdAt: NOW,
            updatedAt: NOW,
          });
        }
        for (let index = 0; index < 201; index += 1) {
          await ctx.db.insert("notificationOutbox", {
            channel: "email",
            status: organizationInvitationId ? "sent" : "pending",
            dedupeKey: `shared-departure-overflow-${index}`,
            shopId: fixture.shopId,
            organizationId: fixture.organizationId,
            staffId: fixture.staffId,
            organizationInvitationId,
            purpose: "business",
            payload: {
              kind: "email",
              from: "noreply@example.com",
              to: "shared-departure@example.com",
              subject: "所属終了前通知",
              html: "<p>所属終了前通知</p>",
              context: "test.accountDeletion.recordLimit",
            },
            attemptCount: 0,
            nextRunAt: NOW,
            ...(organizationInvitationId ? { sentAt: NOW, terminalAt: NOW } : {}),
            createdAt: NOW,
            updatedAt: NOW,
          });
        }
      });

      await expect(
        t
          .withIdentity({ subject: "shared_departure" })
          .query(api.accountDeletion.queries.getDeletionPreview, { asOfDate: AS_OF_DATE }),
      ).resolves.toEqual({ status: "blocked", reason: "tooManyAssociatedRecords" });
    },
  );

  it("legacy restrictedの最後のreadOnly所属は公開上の汎用reasonで拒否する", async () => {
    const t = createAccountDeletionTest();
    await t.run(async (ctx) => {
      const fixture = await seedSharedDepartureFixture(ctx);
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", fixture.organizationId))
        .unique();
      if (!billingState) throw new Error("billing state not found");
      await ctx.db.patch(billingState._id, {
        state: {
          kind: "restricted",
          reason: "freeConditionsNotMet",
          previousPlan: "pro",
          recoveryManagerPersonIds: [fixture.personId],
          previousActiveShopIds: [fixture.shopId],
          restrictedAt: NOW,
        },
        version: billingState.version + 1,
        updatedAt: NOW,
      });
    });

    await expect(
      t
        .withIdentity({ subject: "shared_departure" })
        .query(api.accountDeletion.queries.getDeletionPreview, { asOfDate: AS_OF_DATE }),
    ).resolves.toEqual({ status: "blocked", reason: "organizationDeletionUnavailable" });
  });

  it.each([
    { label: "current staff", hasStaffUserId: true, historicalDeletedShop: false },
    { label: "legacy staff without userId", hasStaffUserId: false, historicalDeletedShop: false },
    { label: "deleted shop history", hasStaffUserId: false, historicalDeletedShop: true },
  ])("共有組織では通知履歴の物理削除完了後だけClerk削除へ進む($label)", async (scenario) => {
    const t = createAccountDeletionTest();
    const ids = await t.run(async (ctx) => {
      const fixture = await seedSharedDepartureFixture(ctx);
      if (!scenario.hasStaffUserId) await ctx.db.patch(fixture.staffId, { userId: undefined });
      if (scenario.historicalDeletedShop) {
        await ctx.db.patch(fixture.staffId, { isDeleted: true });
        await ctx.db.patch(fixture.shopId, { isDeleted: true });
        await ctx.db.patch(fixture.legacyMemberId, { isDeleted: true });
      }
      return fixture;
    });
    const actor = t.withIdentity({ subject: "shared_departure" });
    const preview = await actor.query(api.accountDeletion.queries.getDeletionPreview, { asOfDate: AS_OF_DATE });
    expect(preview).toMatchObject({
      status: "ready",
      action: "leaveOrganization",
      futureAssignmentCount: 2,
    });
    if (preview.status !== "ready" || preview.action !== "leaveOrganization") {
      throw new Error("leaveOrganization preview was not ready");
    }

    await expect(
      t.mutation(internal.accountDeletion.mutations.accept, {
        ...acceptArgs("shared_departure"),
        scope: "accountAndAssociations",
        previewFingerprint: preview.previewFingerprint,
      }),
    ).resolves.toEqual({ status: "accepted" });

    const provider = fakeProvider();
    const accountJobId = await onlyAccountJobId(t);
    await runAccountDeletionJob(workerCtx(t), provider, accountJobId);

    const waiting = await t.run(async (ctx) => ({
      accountJob: await ctx.db.get(accountJobId),
      notificationHistory: await ctx.db.get(ids.notificationHistoryId),
    }));
    expect(waiting.accountJob).toMatchObject({
      status: "queued",
      phase: "waitForSharedCleanup",
      attemptCount: 0,
      sharedCleanup: {
        organizationId: ids.organizationId,
        targets: [{ shopId: ids.shopId, staffId: ids.staffId }],
      },
    });
    expect(waiting.notificationHistory).not.toBeNull();
    expect(provider.assertReady).not.toHaveBeenCalled();
    expect(provider.getUser).not.toHaveBeenCalled();
    expect(provider.deleteUser).not.toHaveBeenCalled();

    await t.mutation(internal.notificationOutbox.mutations.deleteStaffNotificationHistoryBatch, {
      shopId: ids.shopId,
      staffId: ids.staffId,
    });
    vi.advanceTimersByTime(ACCOUNT_DELETION_SHARED_CLEANUP_POLL_MS);
    await runAccountDeletionJob(workerCtx(t), provider, accountJobId);

    const state = await t.run(async (ctx) => ({
      user: await ctx.db.get(ids.userId),
      organization: await ctx.db.get(ids.organizationId),
      shop: await ctx.db.get(ids.shopId),
      targetPerson: await ctx.db.get(ids.personId),
      targetMember: await ctx.db.get(ids.memberId),
      targetStaff: await ctx.db.get(ids.staffId),
      targetLegacyMember: await ctx.db.get(ids.legacyMemberId),
      successorUser: await ctx.db.get(ids.successorUserId),
      successorPerson: await ctx.db.get(ids.successorPersonId),
      successorMember: await ctx.db.get(ids.successorMemberId),
      pastAssignment: await ctx.db.get(ids.pastAssignmentId),
      todayAssignment: await ctx.db.get(ids.todayAssignmentId),
      futureAssignment: await ctx.db.get(ids.futureAssignmentId),
      session: await ctx.db.get(ids.sessionId),
      magicLink: await ctx.db.get(ids.magicLinkId),
      lineAccount: await ctx.db.get(ids.lineAccountId),
      accountJob: await ctx.db.get(accountJobId),
      notificationHistory: await ctx.db.get(ids.notificationHistoryId),
      recruitmentStats: await ctx.db
        .query("recruitmentStats")
        .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", ids.currentRecruitmentId))
        .unique(),
      cleanupJobs: await ctx.db.query("deletionCleanupJobs").collect(),
    }));
    expect(state.user).toMatchObject({ isDeleted: true, accountDeletionRequestedAt: NOW });
    expect(state.organization).toMatchObject({ isDeleted: false, name: "共有組織店舗事業者" });
    expect(state.shop).toMatchObject({ isDeleted: scenario.historicalDeletedShop, name: "共有組織店舗" });
    expect(state.targetPerson).toMatchObject({ status: "removed", name: "管理者" });
    expect(state.targetMember).toMatchObject({ status: "removed" });
    expect(state.targetStaff).toMatchObject({ isDeleted: true, name: "退会する管理者" });
    expect(state.targetLegacyMember).toMatchObject({ isDeleted: true });
    expect(state.successorUser).toMatchObject({ isDeleted: false });
    expect(state.successorPerson).toMatchObject({ status: "active", name: "後任管理者" });
    expect(state.successorMember).toMatchObject({ status: "active" });
    expect(state.pastAssignment).not.toBeNull();
    expect(state.todayAssignment).toBeNull();
    expect(state.futureAssignment).toBeNull();
    expect(state.session).toMatchObject({ revokedAt: NOW });
    expect(state.magicLink).toMatchObject({ revokedAt: NOW });
    expect(state.lineAccount).toMatchObject({ isDeleted: true, following: false });
    expect(state.accountJob).toMatchObject({ status: "completed", phase: "complete" });
    expect(state.accountJob).not.toHaveProperty("sharedCleanup");
    expect(state.notificationHistory).toBeNull();
    expect(state.recruitmentStats).toMatchObject({
      shopId: ids.shopId,
      submittedCount: 0,
      activeStaffCountSnapshot: 0,
    });
    expect(state.cleanupJobs).toEqual([]);
    expect(provider.assertReady).toHaveBeenCalledTimes(1);
    expect(provider.getUser).toHaveBeenCalledTimes(1);
    expect(provider.deleteUser).toHaveBeenCalledTimes(1);
  });

  it("単独管理者ではlinked cleanup完了までproviderを呼ばず、完了後だけClerk削除へ進む", async () => {
    const t = createAccountDeletionTest();
    const ids = await t.run((ctx) =>
      seedOrganizationManagerShop(ctx, {
        subject: "sole_cleanup",
        email: "sole-cleanup@example.com",
        shopName: "一括削除店舗",
        complimentary: true,
      }),
    );
    const preview = await t
      .withIdentity({ subject: "sole_cleanup" })
      .query(api.accountDeletion.queries.getDeletionPreview, { asOfDate: AS_OF_DATE });
    if (preview.status !== "ready" || preview.action !== "deleteOrganization") {
      throw new Error("deleteOrganization preview was not ready");
    }
    const request = {
      ...acceptArgs("sole_cleanup"),
      scope: "accountAndAssociations" as const,
      previewFingerprint: preview.previewFingerprint,
    };

    await expect(t.mutation(internal.accountDeletion.mutations.accept, request)).resolves.toEqual({
      status: "accepted",
    });
    await expect(t.mutation(internal.accountDeletion.mutations.accept, request)).resolves.toEqual({
      status: "accepted",
    });
    const accountJobId = await onlyAccountJobId(t);
    const cleanupJobId = await onlyCleanupJobId(t);
    const provider = fakeProvider();

    await runAccountDeletionJob(workerCtx(t), provider, accountJobId);
    const waiting = await t.run(async (ctx) => ({
      accountJob: await ctx.db.get(accountJobId),
      cleanupJob: await ctx.db.get(cleanupJobId),
      organization: await ctx.db.get(ids.organizationId),
      accountJobs: await ctx.db.query("accountDeletionJobs").collect(),
      cleanupJobs: await ctx.db.query("deletionCleanupJobs").collect(),
    }));
    expect(waiting.organization).toMatchObject({ isDeleted: true });
    expect(waiting.accountJob).toMatchObject({
      status: "queued",
      phase: "waitForOrganizationCleanup",
      attemptCount: 0,
      organizationCleanup: { organizationId: ids.organizationId, jobId: cleanupJobId },
    });
    expect(waiting.cleanupJob?.status).not.toBe("completed");
    expect(waiting.accountJobs).toHaveLength(1);
    expect(waiting.cleanupJobs).toHaveLength(1);
    expect(provider.assertReady).not.toHaveBeenCalled();
    expect(provider.getUser).not.toHaveBeenCalled();
    expect(provider.deleteUser).not.toHaveBeenCalled();

    await finishDeletionCleanup(t, cleanupJobId);
    vi.advanceTimersByTime(ACCOUNT_DELETION_ORGANIZATION_CLEANUP_POLL_MS);
    await runAccountDeletionJob(workerCtx(t), provider, accountJobId);

    const completed = await t.run(async (ctx) => ({
      accountJob: await ctx.db.get(accountJobId),
      cleanupJob: await ctx.db.get(cleanupJobId),
      organization: await ctx.db.get(ids.organizationId),
      shop: await ctx.db.get(ids.shopId),
      person: await ctx.db.get(ids.personId),
      member: await ctx.db.get(ids.memberId),
    }));
    expect(completed.cleanupJob).toMatchObject({ status: "completed", completedAt: expect.any(Number) });
    expect(completed.accountJob).toMatchObject({ status: "completed", phase: "complete" });
    expect(completed.organization).toMatchObject({ isDeleted: true, name: "一括削除店舗事業者" });
    expect(completed.shop).toMatchObject({ isDeleted: true, name: "一括削除店舗" });
    expect(completed.person).toMatchObject({ status: "removed", name: "管理者" });
    expect(completed.member).toMatchObject({ status: "removed" });
    expect(provider.assertReady).toHaveBeenCalledTimes(1);
    expect(provider.getUser).toHaveBeenCalledTimes(1);
    expect(provider.deleteUser).toHaveBeenCalledTimes(1);
  });

  it("linked cleanupがactionRequiredならproviderを止め、運用retry後に完了へ収束する", async () => {
    const t = createAccountDeletionTest();
    await t.run((ctx) =>
      seedOrganizationManagerShop(ctx, {
        subject: "sole_cleanup_failure",
        email: "sole-cleanup-failure@example.com",
        shopName: "要対応店舗",
        complimentary: true,
      }),
    );
    const preview = await t
      .withIdentity({ subject: "sole_cleanup_failure" })
      .query(api.accountDeletion.queries.getDeletionPreview, { asOfDate: AS_OF_DATE });
    if (preview.status !== "ready" || preview.action !== "deleteOrganization") {
      throw new Error("deleteOrganization preview was not ready");
    }
    await t.mutation(internal.accountDeletion.mutations.accept, {
      ...acceptArgs("sole_cleanup_failure"),
      scope: "accountAndAssociations",
      previewFingerprint: preview.previewFingerprint,
    });
    const accountJobId = await onlyAccountJobId(t);
    const cleanupJobId = await onlyCleanupJobId(t);
    await t.run(async (ctx) => {
      const cleanup = await ctx.db.get(cleanupJobId);
      if (!cleanup) throw new Error("cleanup job not found");
      await ctx.db.patch(cleanupJobId, {
        status: "actionRequired",
        version: cleanup.version + 1,
        lastErrorCode: "cleanup_lease_expired",
      });
    });
    const provider = fakeProvider();

    await runAccountDeletionJob(workerCtx(t), provider, accountJobId);

    const stopped = await t.run((ctx) => ctx.db.get(accountJobId));
    expect(stopped).toMatchObject({
      status: "actionRequired",
      phase: "waitForOrganizationCleanup",
      attemptCount: 0,
      lastErrorCode: "organization_cleanup_action_required",
    });
    expect(provider.assertReady).not.toHaveBeenCalled();
    expect(provider.getUser).not.toHaveBeenCalled();
    expect(provider.deleteUser).not.toHaveBeenCalled();

    if (!stopped) throw new Error("account deletion job not found after cleanup failure");
    await expect(
      t.mutation(internal.accountDeletion.mutations.retryActionRequired, {
        jobId: accountJobId,
        expectedVersion: stopped.version,
      }),
    ).resolves.toEqual({ status: "scheduled", version: stopped.version + 1 });
    const retried = await t.run(async (ctx) => ({
      accountJob: await ctx.db.get(accountJobId),
      cleanupJob: await ctx.db.get(cleanupJobId),
    }));
    expect(retried.accountJob).toMatchObject({
      status: "retrying",
      phase: "waitForOrganizationCleanup",
      attemptCount: 0,
    });
    expect(retried.cleanupJob).toMatchObject({ status: "retrying" });

    await finishDeletionCleanup(t, cleanupJobId);
    await runAccountDeletionJob(workerCtx(t), provider, accountJobId);

    await expect(t.run((ctx) => ctx.db.get(accountJobId))).resolves.toMatchObject({
      status: "completed",
      phase: "complete",
    });
    expect(provider.assertReady).toHaveBeenCalledTimes(1);
    expect(provider.getUser).toHaveBeenCalledTimes(1);
    expect(provider.deleteUser).toHaveBeenCalledTimes(1);
  });

  it.each(["missingCompletedAt", "nonFiniteCompletedAt", "wrongPhase", "leaseResidue"] as const)(
    "linked cleanupのcompleted証跡が不完全(%s)ならproviderへ触れず停止する",
    async (invalidEvidence) => {
      const t = createAccountDeletionTest();
      await t.run((ctx) =>
        seedOrganizationManagerShop(ctx, {
          subject: "sole_cleanup_invalid_completion",
          email: "sole-cleanup-invalid-completion@example.com",
          shopName: "不正完了証跡店舗",
          complimentary: true,
        }),
      );
      const preview = await t
        .withIdentity({ subject: "sole_cleanup_invalid_completion" })
        .query(api.accountDeletion.queries.getDeletionPreview, { asOfDate: AS_OF_DATE });
      if (preview.status !== "ready" || preview.action !== "deleteOrganization") {
        throw new Error("deleteOrganization preview was not ready");
      }
      await t.mutation(internal.accountDeletion.mutations.accept, {
        ...acceptArgs("sole_cleanup_invalid_completion"),
        scope: "accountAndAssociations",
        previewFingerprint: preview.previewFingerprint,
      });
      const accountJobId = await onlyAccountJobId(t);
      const cleanupJobId = await onlyCleanupJobId(t);
      await t.run(async (ctx) => {
        const cleanup = await ctx.db.get(cleanupJobId);
        if (!cleanup) throw new Error("cleanup job not found");
        await ctx.db.patch(cleanupJobId, {
          status: "completed",
          phase: invalidEvidence === "wrongPhase" ? "organizationCore" : "organizationVerification",
          version: cleanup.version + 1,
          completedAt:
            invalidEvidence === "missingCompletedAt"
              ? undefined
              : invalidEvidence === "nonFiniteCompletedAt"
                ? Number.NaN
                : NOW,
          ...(invalidEvidence === "leaseResidue" ? { leaseId: "stale-cleanup-lease" } : {}),
        });
      });
      const provider = fakeProvider();

      await runAccountDeletionJob(workerCtx(t), provider, accountJobId);

      await expect(t.run((ctx) => ctx.db.get(accountJobId))).resolves.toMatchObject({
        status: "actionRequired",
        phase: "waitForOrganizationCleanup",
        lastErrorCode: "organization_cleanup_invalid",
      });
      expect(provider.assertReady).not.toHaveBeenCalled();
      expect(provider.getUser).not.toHaveBeenCalled();
      expect(provider.deleteUser).not.toHaveBeenCalled();
    },
  );
});

async function addOtherManager(
  ctx: MutationCtx,
  args: { organizationId: Id<"organizations">; subject: string; email: string },
) {
  const userId = await seedUser(ctx, args.subject, args.email);
  const personId = await ctx.db.insert("organizationPeople", {
    organizationId: args.organizationId,
    userId,
    name: "後任管理者",
    email: args.email,
    emailNormalized: args.email,
    status: "active",
    createdAt: NOW,
    updatedAt: NOW,
  });
  const memberId = await ctx.db.insert("organizationMembers", {
    organizationId: args.organizationId,
    personId,
    userId,
    status: "active",
    createdAt: NOW,
    updatedAt: NOW,
  });
  return { userId, personId, memberId };
}

async function seedFormerManagerDepartureFixture(
  ctx: MutationCtx,
  args: { subject: string; email: string; hasStaff: boolean },
) {
  const target = await seedOrganizationManagerShop(ctx, {
    subject: args.subject,
    email: args.email,
    shopName: "元管理者店舗",
    complimentary: true,
  });
  const successor = await addOtherManager(ctx, {
    organizationId: target.organizationId,
    subject: `${args.subject}_successor`,
    email: `${args.subject}-successor@example.com`,
  });
  await ctx.db.patch(target.organizationId, {
    billingEmail: `${args.subject}-successor@example.com`,
    billingEmailNormalized: `${args.subject}-successor@example.com`,
  });
  await ctx.db.patch(target.memberId, { status: "removed", updatedAt: NOW + 1 });
  const staffId = args.hasStaff
    ? await ctx.db.insert("staffs", {
        organizationId: target.organizationId,
        organizationPersonId: target.personId,
        userId: target.userId,
        shopId: target.shopId,
        name: "元管理者スタッフ",
        email: args.email,
        emailNormalized: args.email,
        isDeleted: false,
      })
    : null;
  return {
    ...target,
    staffId,
    successorPersonId: successor.personId,
    successorMemberId: successor.memberId,
  };
}

async function seedSharedDepartureFixture(ctx: MutationCtx) {
  const target = await seedOrganizationManagerShop(ctx, {
    subject: "shared_departure",
    email: "shared-departure@example.com",
    shopName: "共有組織店舗",
    complimentary: true,
  });
  const successor = await addOtherManager(ctx, {
    organizationId: target.organizationId,
    subject: "shared_departure_successor",
    email: "shared-departure-successor@example.com",
  });
  await ctx.db.patch(target.organizationId, {
    billingEmail: "shared-departure-successor@example.com",
    billingEmailNormalized: "shared-departure-successor@example.com",
  });
  const staffId = await ctx.db.insert("staffs", {
    organizationId: target.organizationId,
    organizationPersonId: target.personId,
    userId: target.userId,
    shopId: target.shopId,
    name: "退会する管理者",
    email: "shared-departure@example.com",
    emailNormalized: "shared-departure@example.com",
    isDeleted: false,
  });
  const legacyMemberId = await ctx.db.insert("shopMembers", {
    userId: target.userId,
    shopId: target.shopId,
    role: "manager",
    isDeleted: false,
  });
  const positionId = await ctx.db.insert("positions", {
    shopId: target.shopId,
    name: "通常",
    color: "#3b82f6",
    sortOrder: 0,
    isDefault: true,
    isDeleted: false,
  });
  const pastRecruitmentId = await seedRecruitment(ctx, target.shopId, "2026-08-11", "confirmed");
  const currentRecruitmentId = await seedRecruitment(ctx, target.shopId, AS_OF_DATE, "open");
  const futureRecruitmentId = await seedRecruitment(ctx, target.shopId, "2026-08-14", "confirmed");
  const pastAssignmentId = await ctx.db.insert("shiftAssignments", {
    recruitmentId: pastRecruitmentId,
    staffId,
    date: "2026-08-12",
    startTime: "09:00",
    endTime: "17:00",
    positionId,
  });
  const todayAssignmentId = await ctx.db.insert("shiftAssignments", {
    recruitmentId: currentRecruitmentId,
    staffId,
    date: AS_OF_DATE,
    startTime: "10:00",
    endTime: "18:00",
    positionId,
  });
  const futureAssignmentId = await ctx.db.insert("shiftAssignments", {
    recruitmentId: futureRecruitmentId,
    staffId,
    date: "2026-08-14",
    startTime: "11:00",
    endTime: "19:00",
    positionId,
  });
  const sessionId = await ctx.db.insert("sessions", {
    sessionToken: "shared-departure-session",
    staffId,
    shopId: target.shopId,
    recruitmentId: currentRecruitmentId,
    expiresAt: NOW + 86_400_000,
  });
  const magicLinkId = await ctx.db.insert("magicLinks", {
    token: "shared-departure-magic-link",
    staffId,
    shopId: target.shopId,
    recruitmentId: currentRecruitmentId,
    expiresAt: NOW + 86_400_000,
  });
  const lineAccountId = await ctx.db.insert("staffLineAccounts", {
    staffId,
    shopId: target.shopId,
    lineUserId: "shared-departure-line-user",
    linkedAt: NOW,
    following: true,
    isDeleted: false,
  });
  const outboxId = await ctx.db.insert("notificationOutbox", {
    channel: "email",
    status: "sent",
    dedupeKey: "email:account-deletion:shared-history",
    shopId: target.shopId,
    organizationId: target.organizationId,
    staffId,
    payload: {
      kind: "email",
      from: "シフトリ <noreply@example.com>",
      to: "shared-departure@example.com",
      subject: "削除待機の確認",
      html: "<p>削除待機の確認</p>",
      context: "test.accountDeletion.sharedCleanup",
    },
    attemptCount: 1,
    nextRunAt: NOW,
    sentAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
  });
  const notificationHistoryId = await ctx.db.insert("notificationHistory", {
    outboxId,
    shopId: target.shopId,
    staffId,
    channel: "email",
    notificationKind: "test.accountDeletion.sharedCleanup",
    displayTitle: "削除待機の確認",
    sendStatus: "sent",
    deliveryStatus: "unknown",
    requestedAt: NOW,
    sentAt: NOW,
    updatedAt: NOW,
  });
  return {
    ...target,
    staffId,
    legacyMemberId,
    successorUserId: successor.userId,
    successorPersonId: successor.personId,
    successorMemberId: successor.memberId,
    pastAssignmentId,
    todayAssignmentId,
    futureAssignmentId,
    currentRecruitmentId,
    sessionId,
    magicLinkId,
    lineAccountId,
    notificationHistoryId,
  };
}

async function seedRecruitment(ctx: MutationCtx, shopId: Id<"shops">, date: string, status: "open" | "confirmed") {
  return await ctx.db.insert("recruitments", {
    shopId,
    periodStart: date,
    periodEnd: date,
    deadline: date,
    shopClosedDates: [],
    status,
    ...(status === "confirmed" ? { confirmedAt: NOW } : {}),
    isDeleted: false,
    submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
  });
}

function acceptArgs(subject: string) {
  return {
    issuer: ISSUER,
    clerkUserId: subject,
    requestId: REQUEST_ID,
    rateLimitKey: "d".repeat(64),
  };
}

function fakeProvider() {
  return {
    assertReady: vi.fn(async () => undefined),
    getUser: vi.fn(async () => "found" as const),
    deleteUser: vi.fn(async () => "deleted" as const),
  } satisfies AccountDeletionProvider & {
    assertReady: ReturnType<typeof vi.fn>;
    getUser: ReturnType<typeof vi.fn>;
    deleteUser: ReturnType<typeof vi.fn>;
  };
}

function workerCtx(t: AccountDeletionTest) {
  return { runMutation: t.mutation.bind(t) } as unknown as Parameters<typeof runAccountDeletionJob>[0];
}

async function onlyAccountJobId(t: AccountDeletionTest) {
  const jobs = await t.run((ctx) => ctx.db.query("accountDeletionJobs").collect());
  expect(jobs).toHaveLength(1);
  if (!jobs[0]) throw new Error("account deletion job not found");
  return jobs[0]._id;
}

async function onlyCleanupJobId(t: AccountDeletionTest) {
  const jobs = await t.run((ctx) => ctx.db.query("deletionCleanupJobs").collect());
  expect(jobs).toHaveLength(1);
  if (!jobs[0]) throw new Error("deletion cleanup job not found");
  return jobs[0]._id;
}

async function finishDeletionCleanup(t: AccountDeletionTest, jobId: Id<"deletionCleanupJobs">) {
  for (let iteration = 0; iteration < 200; iteration += 1) {
    let job = await t.run((ctx) => ctx.db.get(jobId));
    if (!job) throw new Error("deletion cleanup job disappeared");
    if (job.status === "completed") return;
    if (job.status === "actionRequired") {
      throw new Error(`deletion cleanup stopped: ${job.lastErrorCode ?? "unknown"}`);
    }
    if (job.status === "queued" || job.status === "retrying") {
      await t.mutation(internal.deletionCleanup.mutations.kick, { jobId });
      job = await t.run((ctx) => ctx.db.get(jobId));
      if (!job) throw new Error("deletion cleanup job disappeared after claim");
    }
    if (job.status === "processing" && job.leaseId) {
      await t.mutation(internal.deletionCleanup.mutations.process, {
        jobId,
        leaseId: job.leaseId,
        expectedVersion: job.version,
      });
    }
  }
  throw new Error("deletion cleanup job did not complete");
}
