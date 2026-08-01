import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { seedOrganizationManagerShop, seedStaffLineAccount, seedUser } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { deletedLineUserId } from "../deletionCleanup/tombstone";

const submissionPattern = { kind: "time" as const, startTime: "09:00", endTime: "22:00" };

async function finishDeletionCleanupJob(t: TestConvex<typeof schema>, jobId: Id<"deletionCleanupJobs">) {
  for (let iteration = 0; iteration < 250; iteration += 1) {
    vi.advanceTimersByTime(0);
    await t.finishInProgressScheduledFunctions();
    const completed = await t.run(async (ctx) => (await ctx.db.get(jobId))?.status === "completed");
    if (completed) return;
  }
  throw new Error("deletion cleanup job did not complete");
}

async function seedDeletionScope(ctx: MutationCtx, subject: string) {
  const base = await seedOrganizationManagerShop(ctx, { subject, shopName: "削除対象店", plan: "free" });
  const staffUserId = await seedUser(ctx, `${subject}_staff`, `${subject}_staff@example.com`);
  const now = Date.now();
  const staffPersonId = await ctx.db.insert("organizationPeople", {
    organizationId: base.organizationId,
    userId: staffUserId,
    name: "削除対象スタッフ",
    email: `${subject}_staff@example.com`,
    emailNormalized: `${subject}_staff@example.com`,
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
  const staffId = await ctx.db.insert("staffs", {
    shopId: base.shopId,
    organizationId: base.organizationId,
    organizationPersonId: staffPersonId,
    userId: staffUserId,
    name: "削除対象スタッフ",
    email: `${subject}_staff@example.com`,
    emailNormalized: `${subject}_staff@example.com`,
    isDeleted: false,
  });
  const lineAccountId = await seedStaffLineAccount(ctx, {
    staffId,
    shopId: base.shopId,
    lineUserId: `line-${subject}`,
  });
  const recruitmentId = await ctx.db.insert("recruitments", {
    shopId: base.shopId,
    periodStart: "2026-08-01",
    periodEnd: "2026-08-07",
    deadline: "2026-07-31",
    shopClosedDates: [],
    status: "open",
    isDeleted: false,
    submissionPattern,
  });
  const sessionId = await ctx.db.insert("sessions", {
    sessionToken: `session-${subject}`,
    staffId,
    shopId: base.shopId,
    recruitmentId,
    expiresAt: now + 86_400_000,
  });
  const magicLinkId = await ctx.db.insert("magicLinks", {
    token: `magic-${subject}`,
    staffId,
    shopId: base.shopId,
    recruitmentId,
    expiresAt: now + 86_400_000,
  });
  const lineLinkTokenId = await ctx.db.insert("lineLinkTokens", {
    token: `line-link-${subject}`,
    staffId,
    shopId: base.shopId,
    expiresAt: now + 86_400_000,
  });
  const legalConsentTokenId = await ctx.db.insert("legalConsentTokens", {
    token: `legal-${subject}`,
    staffId,
    shopId: base.shopId,
    method: "staff_email_link",
    expiresAt: now + 86_400_000,
  });
  const registrationLinkId = await ctx.db.insert("shopRegistrationLinks", {
    token: `registration-${subject}`,
    shopId: base.shopId,
    createdAt: now,
  });
  const registrationRequestId = await ctx.db.insert("staffRegistrationRequests", {
    shopId: base.shopId,
    name: "履歴として残す申請者",
    email: "registration-history@example.com",
    emailNormalized: "registration-history@example.com",
    status: "pending",
    termsConsentVersion: "terms-v1",
    privacyConsentVersion: "privacy-v1",
    termsDocumentVersion: "terms-doc-v1",
    privacyDocumentVersion: "privacy-doc-v1",
    consentedAt: now,
    createdAt: now,
  });
  const invitationId = await ctx.db.insert("organizationInvitations", {
    organizationId: base.organizationId,
    email: "invited-history@example.com",
    emailNormalized: "invited-history@example.com",
    invitedName: "招待履歴",
    tokenDigest: `digest-${subject}`,
    status: "issued",
    inviterMemberId: base.memberId,
    reservedSeat: true,
    version: 1,
    expiresAt: now + 86_400_000,
    createdAt: now,
    updatedAt: now,
  });
  const organization = await ctx.db.get(base.organizationId);
  if (!organization) throw new Error("organization not found");
  return {
    ...base,
    organizationUpdatedAt: organization.updatedAt,
    staffUserId,
    staffPersonId,
    staffId,
    recruitmentId,
    lineAccountId,
    sessionId,
    magicLinkId,
    lineLinkTokenId,
    legalConsentTokenId,
    registrationLinkId,
    registrationRequestId,
    invitationId,
    sessionToken: `session-${subject}`,
    magicLinkToken: `magic-${subject}`,
    lineLinkToken: `line-link-${subject}`,
    legalConsentToken: `legal-${subject}`,
    registrationLinkToken: `registration-${subject}`,
  };
}

async function expectDeletionCapabilitiesUnavailable(
  t: TestConvex<typeof schema>,
  ids: Awaited<ReturnType<typeof seedDeletionScope>>,
) {
  await expect(
    t.query(api.shiftSubmission.queries.getSubmissionPageData, {
      sessionToken: ids.sessionToken,
      accessKind: "submit",
      recruitmentId: ids.recruitmentId,
    }),
  ).resolves.toEqual({ status: "unavailable", reason: "invalid_link" });
  await expect(
    t.mutation(api.staffAuth.mutations.verifyToken, {
      token: ids.magicLinkToken,
      accessKind: "submit",
    }),
  ).resolves.toEqual({
    status: "expired",
    reason: "invalid_link",
    recruitmentId: ids.recruitmentId,
  });
  await expect(
    t.action(api.line.actions.redeemLineToken, {
      state: ids.lineLinkToken,
      code: "must-not-be-exchanged",
    }),
  ).resolves.toEqual({ status: "expired" });
  await expect(
    t.query(api.legal.queries.getStaffConsentPageData, { token: ids.legalConsentToken }),
  ).resolves.toMatchObject({ status: "expired" });
  await expect(
    t.mutation(api.legal.mutations.acceptStaffLegalConsent, {
      token: ids.legalConsentToken,
      acceptedLegal: true,
    }),
  ).resolves.toEqual({ status: "expired" });
  await expect(
    t.query(api.staffRegistration.queries.getRegistrationPageData, {
      token: ids.registrationLinkToken,
    }),
  ).resolves.toMatchObject({ status: "expired" });
  await expect(
    t.mutation(internal.staffRegistration.mutations.submitRegistrationRequest, {
      token: ids.registrationLinkToken,
      name: "拒否確認",
      email: "must-not-register@example.com",
      acceptedLegal: true,
    }),
  ).rejects.toThrow("登録リンクの有効期限が切れています");
}

describe("organization deletion", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("Stripeの契約作成中または未終了のSubscriptionがあるグループは削除できない", async () => {
    const now = Date.parse("2026-07-20T00:00:00.000Z");
    vi.setSystemTime(now);
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, {
        subject: "delete_stripe_guard",
        plan: "free",
      });
      const organization = await ctx.db.get(seeded.organizationId);
      if (!organization) throw new Error("organization not found");
      const operationId = await ctx.db.insert("organizationStripeOperations", {
        organizationId: seeded.organizationId,
        kind: "createTrialSubscription",
        requestKey: "delete-stripe-guard",
        stripeIdempotencyKey: "test:delete-stripe-guard",
        livemode: false,
        providerGeneration: 1,
        stripePriceIdSnapshot: "price_pro_test",
        status: "processing",
        attemptCount: 1,
        leaseToken: "delete-stripe-guard-lease",
        leaseExpiresAt: now + 60_000,
        expiresAt: now + 90 * 24 * 60 * 60 * 1000,
        createdAt: now,
        updatedAt: now,
      });
      return { ...seeded, organizationUpdatedAt: organization.updatedAt, operationId };
    });
    const actor = t.withIdentity({ subject: "delete_stripe_guard" });

    await expect(actor.query(api.organization.queries.getSettings, { shopId: ids.shopId })).resolves.toMatchObject({
      canDeleteOrganization: false,
      deleteOrganizationDisabledReason: "グループを削除するには、先にStripeの契約終了を確認してください。",
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(ids.operationId, {
        status: "actionRequired",
        stripeObjectId: "sub_delete_stripe_guard",
        leaseToken: undefined,
        leaseExpiresAt: undefined,
        completedAt: now,
        updatedAt: now,
      });
    });
    await expect(actor.query(api.organization.queries.getSettings, { shopId: ids.shopId })).resolves.toMatchObject({
      canDeleteOrganization: false,
    });

    const subscriptionId = await t.run(async (ctx) =>
      ctx.db.insert("organizationStripeSubscriptions", {
        organizationId: ids.organizationId,
        stripeCustomerId: "cus_delete_stripe_guard",
        stripeSubscriptionId: "sub_delete_stripe_guard",
        stripePriceId: "price_pro_test",
        livemode: false,
        status: "canceled",
        providerGeneration: 1,
        cancelAtPeriodEnd: false,
        terminalAt: now,
        syncedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
    );
    await expect(actor.query(api.organization.queries.getSettings, { shopId: ids.shopId })).resolves.toMatchObject({
      canDeleteOrganization: true,
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(subscriptionId, { status: "active", terminalAt: undefined, updatedAt: now + 1 });
    });
    await expect(actor.query(api.organization.queries.getSettings, { shopId: ids.shopId })).resolves.toMatchObject({
      canDeleteOrganization: false,
      deleteOrganizationDisabledReason: "グループを削除するには、先にStripeの契約終了を確認してください。",
    });
    await expect(
      actor.mutation(api.organization.mutations.deleteOrganization, {
        shopId: ids.shopId,
        organizationId: ids.organizationId,
        confirmOrganizationId: ids.organizationId,
        expectedOrganizationUpdatedAt: ids.organizationUpdatedAt,
        requestId: "delete-stripe-guard-request",
      }),
    ).rejects.toThrow("グループを削除するには、先にStripeの契約終了を確認してください。");
    await expect(t.run((ctx) => ctx.db.get(ids.organizationId))).resolves.toMatchObject({ isDeleted: false });
  });

  it("無効Trial cleanupは成功かつ一意な終端Subscription証拠がそろうまで削除を拒否する", async () => {
    const now = Date.parse("2026-07-20T00:00:00.000Z");
    vi.setSystemTime(now);
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, {
        subject: "delete_invalid_trial_cleanup_guard",
        plan: "free",
      });
      const sourceOperationId = await ctx.db.insert("organizationStripeOperations", {
        organizationId: seeded.organizationId,
        kind: "createTrialSubscription",
        requestKey: "delete-invalid-trial-source",
        stripeIdempotencyKey: "test:delete-invalid-trial-source",
        livemode: false,
        providerGeneration: 1,
        stripePriceIdSnapshot: "price_pro_test",
        stripeObjectId: "sub_delete_invalid_trial",
        status: "actionRequired",
        attemptCount: 1,
        lastErrorCode: "trial_eligibility_race",
        completedAt: now,
        expiresAt: now + 90 * 24 * 60 * 60 * 1000,
        createdAt: now,
        updatedAt: now,
      });
      const cleanupOperationId = await ctx.db.insert("organizationStripeOperations", {
        organizationId: seeded.organizationId,
        kind: "cancelSubscription",
        requestKey: "delete-invalid-trial-cleanup",
        stripeIdempotencyKey: "test:delete-invalid-trial-cleanup",
        livemode: false,
        providerGeneration: 1,
        recoveryPurpose: "invalidTrialSubscriptionCancellation",
        sourceOperationId,
        stripePriceIdSnapshot: "price_pro_test",
        stripeObjectId: "sub_delete_invalid_trial",
        status: "processing",
        attemptCount: 1,
        leaseToken: "delete-invalid-trial-cleanup-lease",
        leaseExpiresAt: now + 60_000,
        expiresAt: now + 90 * 24 * 60 * 60 * 1000,
        createdAt: now,
        updatedAt: now,
      });
      return { ...seeded, cleanupOperationId };
    });
    const actor = t.withIdentity({ subject: "delete_invalid_trial_cleanup_guard" });
    const expectDeletionBlocked = async () => {
      await expect(actor.query(api.organization.queries.getSettings, { shopId: ids.shopId })).resolves.toMatchObject({
        canDeleteOrganization: false,
        deleteOrganizationDisabledReason: "グループを削除するには、先にStripeの契約終了を確認してください。",
      });
    };

    await expectDeletionBlocked();
    await t.run(async (ctx) => {
      await ctx.db.patch(ids.cleanupOperationId, {
        status: "failed",
        leaseToken: undefined,
        leaseExpiresAt: undefined,
        completedAt: now,
        updatedAt: now,
      });
    });
    await expectDeletionBlocked();
    await t.run(async (ctx) => {
      await ctx.db.patch(ids.cleanupOperationId, { status: "succeeded", updatedAt: now });
    });
    await expectDeletionBlocked();

    await t.run(async (ctx) => {
      await ctx.db.insert("organizationStripeSubscriptions", {
        organizationId: ids.organizationId,
        stripeCustomerId: "cus_delete_invalid_trial",
        stripeSubscriptionId: "sub_delete_invalid_trial",
        stripePriceId: "price_pro_test",
        livemode: false,
        status: "canceled",
        providerGeneration: 1,
        cancelAtPeriodEnd: false,
        terminalAt: now,
        syncedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.patch(ids.cleanupOperationId, { status: "failed", updatedAt: now });
    });
    await expectDeletionBlocked();
    await t.run(async (ctx) => {
      await ctx.db.patch(ids.cleanupOperationId, { status: "succeeded", updatedAt: now });
    });
    await expect(actor.query(api.organization.queries.getSettings, { shopId: ids.shopId })).resolves.toMatchObject({
      canDeleteOrganization: true,
    });
  });

  it("最新世代が終了済みでも旧世代に未終了Subscriptionがあれば削除を拒否する", async () => {
    const now = Date.parse("2026-07-20T00:00:00.000Z");
    vi.setSystemTime(now);
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, {
        subject: "delete_old_current_subscription_guard",
        plan: "free",
      });
      const common = {
        organizationId: seeded.organizationId,
        stripeCustomerId: "cus_delete_old_current",
        stripePriceId: "price_pro_test",
        livemode: false,
        cancelAtPeriodEnd: false,
        syncedAt: now,
        createdAt: now,
        updatedAt: now,
      };
      await ctx.db.insert("organizationStripeSubscriptions", {
        ...common,
        stripeSubscriptionId: "sub_delete_old_current_1",
        status: "active",
        providerGeneration: 1,
      });
      await ctx.db.insert("organizationStripeSubscriptions", {
        ...common,
        stripeSubscriptionId: "sub_delete_old_current_2",
        status: "canceled",
        providerGeneration: 2,
        terminalAt: now,
      });
      return seeded;
    });

    await expect(
      t.withIdentity({ subject: "delete_old_current_subscription_guard" }).query(api.organization.queries.getSettings, {
        shopId: ids.shopId,
      }),
    ).resolves.toMatchObject({
      canDeleteOrganization: false,
      deleteOrganizationDisabledReason: "グループを削除するには、先にStripeの契約終了を確認してください。",
    });
  });

  it("provider object ID不明のTrial作成要対応行があるグループは削除できない", async () => {
    const now = Date.parse("2026-07-20T00:00:00.000Z");
    vi.setSystemTime(now);
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, {
        subject: "delete_unknown_trial_creation_guard",
        plan: "free",
      });
      await ctx.db.insert("organizationStripeOperations", {
        organizationId: seeded.organizationId,
        kind: "createTrialSubscription",
        requestKey: "delete-unknown-trial-source",
        stripeIdempotencyKey: "test:delete-unknown-trial-source",
        livemode: false,
        providerGeneration: 1,
        stripePriceIdSnapshot: "price_pro_test",
        status: "actionRequired",
        attemptCount: 1,
        lastErrorCode: "trial_subscription_create_result_unknown",
        completedAt: now,
        expiresAt: now + 90 * 24 * 60 * 60 * 1000,
        createdAt: now,
        updatedAt: now,
      });
      return seeded;
    });

    await expect(
      t.withIdentity({ subject: "delete_unknown_trial_creation_guard" }).query(api.organization.queries.getSettings, {
        shopId: ids.shopId,
      }),
    ).resolves.toMatchObject({
      canDeleteOrganization: false,
      deleteOrganizationDisabledReason: "グループを削除するには、先にStripeの契約終了を確認してください。",
    });
  });

  it("削除済みグループではトライアルProを選択しない", async () => {
    const now = Date.parse("2026-07-20T00:00:00.000Z");
    vi.setSystemTime(now);
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, {
        subject: "deleted_trial_pro_selection",
        plan: "pro",
      });
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
        .unique();
      if (!billingState) throw new Error("billing state not found");
      await ctx.db.patch(billingState._id, {
        state: { kind: "trial", trialEndsAt: now + 30 * 24 * 60 * 60 * 1000 },
      });
      await ctx.db.patch(seeded.organizationId, { isDeleted: true, updatedAt: now + 1 });
      return seeded;
    });

    await expect(
      t.mutation(internal.organizationBilling.mutations.selectTrialPro, {
        organizationId: ids.organizationId,
        expectedVersion: 1,
        correlationId: "deleted-trial-pro-selected",
      }),
    ).resolves.toEqual({ changed: false });

    const state = await t.run(async (ctx) => ({
      billing: await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique(),
      audit: await ctx.db
        .query("organizationAuditEvents")
        .withIndex("by_correlationId", (q) => q.eq("correlationId", "deleted-trial-pro-selected"))
        .first(),
    }));
    expect(state.billing).toMatchObject({ state: { kind: "trial" }, version: 1 });
    expect(state.billing?.state).not.toHaveProperty("selectedPaidPlan");
    expect(state.audit).toBeNull();
  });

  it("組織を即時停止し、cleanupで業務識別情報を保持したままtokenを失効する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run((ctx) => seedDeletionScope(ctx, "delete_organization"));
    const fetchMock = vi.fn<typeof globalThis.fetch>(async () => {
      throw new Error("削除後にLINE APIを呼んではいけません");
    });
    vi.stubEnv("LINE_LOGIN_CHANNEL_ID", "test-line-channel");
    vi.stubEnv("LINE_LOGIN_CHANNEL_SECRET", "test-line-secret");
    vi.stubGlobal("fetch", fetchMock);
    const actor = t.withIdentity({
      subject: "delete_organization",
      name: "Clerkに残る氏名",
      email: "clerk-remains@example.com",
    });
    const args = {
      shopId: ids.shopId,
      organizationId: ids.organizationId,
      confirmOrganizationId: ids.organizationId,
      expectedOrganizationUpdatedAt: ids.organizationUpdatedAt,
      requestId: "delete-organization-request",
    };

    await expect(actor.mutation(api.organization.mutations.deleteOrganization, args)).resolves.toEqual({
      organizationId: ids.organizationId,
      changed: true,
      accepted: true,
    });
    await expect(actor.mutation(api.organization.mutations.deleteOrganization, args)).resolves.toEqual({
      organizationId: ids.organizationId,
      changed: false,
      accepted: true,
    });

    const accepted = await t.run(async (ctx) => ({
      organization: await ctx.db.get(ids.organizationId),
      actorUser: await ctx.db.get(ids.userId),
      jobs: await ctx.db.query("deletionCleanupJobs").collect(),
      audits: await ctx.db
        .query("organizationAuditEvents")
        .withIndex("by_organizationId_and_occurredAt", (q) => q.eq("organizationId", ids.organizationId))
        .filter((q) => q.eq(q.field("action"), "organization.deleted"))
        .collect(),
    }));
    expect(accepted.organization).toMatchObject({
      isDeleted: true,
      name: "削除対象店事業者",
      billingEmail: "delete_organization@example.com",
      billingEmailNormalized: "delete_organization@example.com",
    });
    expect(accepted.actorUser).toMatchObject({
      isDeleted: false,
      name: "管理者",
      email: "delete_organization@example.com",
    });
    expect(accepted.actorUser?.authTokenIdentifier).toContain("delete_organization");
    expect(accepted.jobs).toHaveLength(1);
    expect(accepted.audits).toHaveLength(1);

    await expectDeletionCapabilitiesUnavailable(t, ids);
    expect(fetchMock).not.toHaveBeenCalled();

    const cleanupJobId = accepted.jobs[0]?._id;
    if (!cleanupJobId) throw new Error("cleanup job not found");
    await finishDeletionCleanupJob(t, cleanupJobId);
    const completed = await t.run(async (ctx) => ({
      job: await ctx.db.query("deletionCleanupJobs").first(),
      organization: await ctx.db.get(ids.organizationId),
      shop: await ctx.db.get(ids.shopId),
      actorPerson: await ctx.db.get(ids.personId),
      actorMember: await ctx.db.get(ids.memberId),
      staffPerson: await ctx.db.get(ids.staffPersonId),
      staffUser: await ctx.db.get(ids.staffUserId),
      staff: await ctx.db.get(ids.staffId),
      line: await ctx.db.get(ids.lineAccountId),
      session: await ctx.db.get(ids.sessionId),
      magic: await ctx.db.get(ids.magicLinkId),
      lineToken: await ctx.db.get(ids.lineLinkTokenId),
      legalToken: await ctx.db.get(ids.legalConsentTokenId),
      registrationLink: await ctx.db.get(ids.registrationLinkId),
      registrationRequest: await ctx.db.get(ids.registrationRequestId),
      invitation: await ctx.db.get(ids.invitationId),
    }));
    expect(completed.job?.status).toBe("completed");
    expect(completed.shop).toMatchObject({ isDeleted: true, name: "削除対象店" });
    expect(completed.actorPerson).toMatchObject({
      status: "removed",
      name: "管理者",
      email: "delete_organization@example.com",
      emailNormalized: "delete_organization@example.com",
    });
    expect(completed.actorMember?.status).toBe("removed");
    expect(completed.staffPerson).toMatchObject({
      status: "removed",
      name: "削除対象スタッフ",
      email: "delete_organization_staff@example.com",
      emailNormalized: "delete_organization_staff@example.com",
    });
    expect(completed.staffUser).toMatchObject({
      isDeleted: false,
      name: "管理者",
      email: "delete_organization_staff@example.com",
    });
    expect(completed.staff).toMatchObject({
      isDeleted: true,
      name: "削除対象スタッフ",
      email: "delete_organization_staff@example.com",
      emailNormalized: "delete_organization_staff@example.com",
    });
    expect(completed.line).toMatchObject({
      isDeleted: true,
      following: false,
      lineUserId: deletedLineUserId(ids.lineAccountId),
    });
    expect(completed.session?.revokedAt).toEqual(expect.any(Number));
    expect(completed.magic?.revokedAt).toEqual(expect.any(Number));
    expect(completed.lineToken?.revokedAt).toEqual(expect.any(Number));
    expect(completed.legalToken?.revokedAt).toEqual(expect.any(Number));
    expect(completed.registrationLink?.revokedAt).toEqual(expect.any(Number));
    expect(completed.invitation).toMatchObject({ status: "revoked", reservedSeat: false });
    expect(completed.registrationRequest).toMatchObject({
      status: "pending",
      name: "履歴として残す申請者",
      email: "registration-history@example.com",
    });
    await expectDeletionCapabilitiesUnavailable(t, ids);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("別組織に有効所属を持つ共有userはglobal情報と別組織アクセスを維持する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const target = await seedDeletionScope(ctx, "shared_owner");
      const other = await seedOrganizationManagerShop(ctx, { subject: "temporary_other_owner", plan: "free" });
      await ctx.db.patch(other.personId, { userId: target.userId });
      await ctx.db.patch(other.memberId, { userId: target.userId });
      return { target, other };
    });

    await t.withIdentity({ subject: "shared_owner" }).mutation(api.organization.mutations.deleteOrganization, {
      shopId: ids.target.shopId,
      organizationId: ids.target.organizationId,
      confirmOrganizationId: ids.target.organizationId,
      expectedOrganizationUpdatedAt: ids.target.organizationUpdatedAt,
      requestId: "delete-shared-organization",
    });
    const cleanupJobId = await t.run(async (ctx) => (await ctx.db.query("deletionCleanupJobs").first())?._id);
    if (!cleanupJobId) throw new Error("cleanup job not found");
    await finishDeletionCleanupJob(t, cleanupJobId);

    const state = await t.run(async (ctx) => ({
      user: await ctx.db.get(ids.target.userId),
      targetPerson: await ctx.db.get(ids.target.personId),
      otherOrganization: await ctx.db.get(ids.other.organizationId),
      otherPerson: await ctx.db.get(ids.other.personId),
    }));
    expect(state.user).toMatchObject({ isDeleted: false, name: "管理者", email: "shared_owner@example.com" });
    expect(state.targetPerson).toMatchObject({
      status: "removed",
      name: "管理者",
      email: "shared_owner@example.com",
      emailNormalized: "shared_owner@example.com",
    });
    expect(state.otherOrganization?.isDeleted).toBe(false);
    expect(state.otherPerson).toMatchObject({ status: "active", userId: ids.target.userId });

    const shops = await t.withIdentity({ subject: "shared_owner" }).query(api.dashboard.queries.getMyShops, {});
    expect(shops.map((shop) => shop.shopId)).toEqual([ids.other.shopId]);
  });

  it.each(["staff", "legacyShopMember"] as const)(
    "別組織の%sだけに紐づく共有userの情報を変更しない",
    async (associationKind) => {
      const t = convexTest(schema, modules);
      const ids = await t.run(async (ctx) => {
        const target = await seedDeletionScope(ctx, `shared_${associationKind}`);
        const other = await seedOrganizationManagerShop(ctx, {
          subject: `temporary_${associationKind}_owner`,
          plan: "free",
        });
        if (associationKind === "staff") {
          const email = `shared_${associationKind}_staff@example.com`;
          await ctx.db.insert("staffs", {
            shopId: other.shopId,
            organizationId: other.organizationId,
            userId: target.staffUserId,
            name: "別組織だけの共有スタッフ",
            email,
            emailNormalized: email,
            isDeleted: false,
          });
        } else {
          await ctx.db.insert("shopMembers", {
            shopId: other.shopId,
            userId: target.staffUserId,
            role: "manager",
            isDeleted: false,
          });
        }
        return { target, other };
      });

      await t
        .withIdentity({ subject: `shared_${associationKind}` })
        .mutation(api.organization.mutations.deleteOrganization, {
          shopId: ids.target.shopId,
          organizationId: ids.target.organizationId,
          confirmOrganizationId: ids.target.organizationId,
          expectedOrganizationUpdatedAt: ids.target.organizationUpdatedAt,
          requestId: `delete-shared-${associationKind}`,
        });
      const cleanupJobId = await t.run(async (ctx) => (await ctx.db.query("deletionCleanupJobs").first())?._id);
      if (!cleanupJobId) throw new Error("cleanup job not found");
      await finishDeletionCleanupJob(t, cleanupJobId);

      const sharedUser = await t.run(async (ctx) => ctx.db.get(ids.target.staffUserId));
      expect(sharedUser).toMatchObject({
        isDeleted: false,
        name: "管理者",
        email: `shared_${associationKind}_staff@example.com`,
      });
      await expect(t.run(async (ctx) => ctx.db.get(ids.other.organizationId))).resolves.toMatchObject({
        isDeleted: false,
      });
    },
  );

  it("有料契約、stale画面、対象不一致を副作用なしで拒否する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, { subject: "delete_rejected", plan: "pro" });
      const other = await seedOrganizationManagerShop(ctx, { subject: "delete_other_target", plan: "free" });
      const organization = await ctx.db.get(base.organizationId);
      if (!organization) throw new Error("organization not found");
      return { ...base, updatedAt: organization.updatedAt, otherOrganizationId: other.organizationId };
    });
    const actor = t.withIdentity({ subject: "delete_rejected" });

    await expect(
      actor.mutation(api.organization.mutations.deleteOrganization, {
        shopId: ids.shopId,
        organizationId: ids.organizationId,
        confirmOrganizationId: ids.organizationId,
        expectedOrganizationUpdatedAt: ids.updatedAt,
        requestId: "paid-delete-rejected",
      }),
    ).rejects.toThrow("グループを削除するには、先に有料契約やプラン変更を終了してください。");

    await t.run(async (ctx) => {
      const billing = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique();
      if (!billing) throw new Error("billing state not found");
      await ctx.db.patch(billing._id, { state: { kind: "active", plan: "free" } });
    });
    await expect(
      actor.mutation(api.organization.mutations.deleteOrganization, {
        shopId: ids.shopId,
        organizationId: ids.organizationId,
        confirmOrganizationId: ids.organizationId,
        expectedOrganizationUpdatedAt: ids.updatedAt + 1,
        requestId: "stale-delete-rejected",
      }),
    ).rejects.toThrow("グループの状態が変わりました");
    await expect(
      actor.mutation(api.organization.mutations.deleteOrganization, {
        shopId: ids.shopId,
        organizationId: ids.organizationId,
        confirmOrganizationId: ids.otherOrganizationId,
        expectedOrganizationUpdatedAt: ids.updatedAt,
        requestId: "mismatch-delete-rejected",
      }),
    ).rejects.toThrow("Not found");
    await expect(t.run((ctx) => ctx.db.get(ids.organizationId))).resolves.toMatchObject({ isDeleted: false });
    await expect(t.run((ctx) => ctx.db.query("deletionCleanupJobs").collect())).resolves.toHaveLength(0);
  });

  it("未認証、閲覧専用、ほかの有効管理者がいる組織を副作用なしで拒否する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, { subject: "delete_with_managers", plan: "free" });
      const now = Date.now();
      const otherUserId = await seedUser(ctx, "delete_other_manager", "delete_other_manager@example.com");
      const otherPersonId = await ctx.db.insert("organizationPeople", {
        organizationId: base.organizationId,
        userId: otherUserId,
        name: "ほかの管理者",
        email: "delete_other_manager@example.com",
        emailNormalized: "delete_other_manager@example.com",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("organizationMembers", {
        organizationId: base.organizationId,
        personId: otherPersonId,
        userId: otherUserId,
        status: "readOnly",
        createdAt: now,
        updatedAt: now,
      });
      const organization = await ctx.db.get(base.organizationId);
      if (!organization) throw new Error("organization not found");
      return { ...base, organizationUpdatedAt: organization.updatedAt };
    });
    const args = {
      shopId: ids.shopId,
      organizationId: ids.organizationId,
      confirmOrganizationId: ids.organizationId,
      expectedOrganizationUpdatedAt: ids.organizationUpdatedAt,
      requestId: "delete-manager-rejected",
    };

    await expect(t.mutation(api.organization.mutations.deleteOrganization, args)).rejects.toThrow("Unauthenticated");
    await expect(
      t.withIdentity({ subject: "delete_other_manager" }).mutation(api.organization.mutations.deleteOrganization, args),
    ).rejects.toThrow("Not found");
    await expect(
      t.withIdentity({ subject: "delete_with_managers" }).mutation(api.organization.mutations.deleteOrganization, args),
    ).rejects.toThrow("グループを削除するには、先にほかの管理者の権限を外してください。");

    const state = await t.run(async (ctx) => ({
      organization: await ctx.db.get(ids.organizationId),
      jobs: await ctx.db.query("deletionCleanupJobs").collect(),
      audits: await ctx.db
        .query("organizationAuditEvents")
        .withIndex("by_organizationId_and_occurredAt", (q) => q.eq("organizationId", ids.organizationId))
        .filter((q) => q.eq(q.field("action"), "organization.deleted"))
        .collect(),
    }));
    expect(state.organization?.isDeleted).toBe(false);
    expect(state.jobs).toHaveLength(0);
    expect(state.audits).toHaveLength(0);
  });

  it("グループ削除はglobal userの所属scanに依存せず、異常なlegacy所属があってもuserを変更しない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, { subject: "delete_association_unknown", plan: "free" });
      // bounded scan上限を超える異常なlegacy所属を再現する。
      for (let index = 0; index < 21; index += 1) {
        await ctx.db.insert("shopMembers", {
          shopId: base.shopId,
          userId: base.userId,
          role: "manager",
          isDeleted: false,
        });
      }
      const organization = await ctx.db.get(base.organizationId);
      if (!organization) throw new Error("organization not found");
      return { ...base, organizationUpdatedAt: organization.updatedAt };
    });
    const actor = t.withIdentity({ subject: "delete_association_unknown" });

    await expect(actor.query(api.organization.queries.getSettings, { shopId: ids.shopId })).resolves.toMatchObject({
      canDeleteOrganization: true,
    });
    await expect(
      actor.mutation(api.organization.mutations.deleteOrganization, {
        shopId: ids.shopId,
        organizationId: ids.organizationId,
        confirmOrganizationId: ids.organizationId,
        expectedOrganizationUpdatedAt: ids.organizationUpdatedAt,
        requestId: "delete-association-unknown",
      }),
    ).resolves.toMatchObject({ changed: true, accepted: true });

    const state = await t.run(async (ctx) => ({
      organization: await ctx.db.get(ids.organizationId),
      user: await ctx.db.get(ids.userId),
      jobs: await ctx.db.query("deletionCleanupJobs").collect(),
    }));
    expect(state.organization).toMatchObject({
      isDeleted: true,
      name: "テスト店舗事業者",
      billingEmail: "delete_association_unknown@example.com",
      billingEmailNormalized: "delete_association_unknown@example.com",
    });
    expect(state.user).toMatchObject({
      isDeleted: false,
      name: "管理者",
      email: "delete_association_unknown@example.com",
    });
    expect(state.jobs).toHaveLength(1);
  });
});
