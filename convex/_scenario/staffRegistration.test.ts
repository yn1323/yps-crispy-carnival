import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import { resetResendEmailQueueForTest } from "../_lib/resend";
import {
  hasScheduledJob,
  MANAGER_SUBJECT,
  readScheduledFunctions,
  SCENARIO_NOW,
  scenarioDate,
  seedStaff,
} from "../_test/scenarioBuilders";
import { createScenario } from "../_test/scenarioFixtures";
import { getTestOrganizationId, seedManagerShop, seedOrganizationPersonLineLink, seedUser } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";

describe("スタッフ参加QRシナリオ", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(SCENARIO_NOW);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("店舗QRから参加申請し、シフト担当者承認後にスタッフ一覧・法務同意・通知予約へ反映される", async () => {
    const t = convexTest(schema, modules);
    const scenario = createScenario(t);
    const asManager = scenario.manager(MANAGER_SUBJECT);

    const { shopId } = await t.run(async (ctx) => {
      const seeded = await seedManagerShop(ctx, {
        subject: MANAGER_SUBJECT,
        email: "qr-manager@example.com",
        shopName: "QR登録店舗",
      });
      await seedStaff(ctx, {
        shopId: seeded.shopId,
        userId: seeded.userId,
        name: "管理者",
        email: "qr-manager@example.com",
      });
      return seeded;
    });
    await asManager.createRecruitment({
      periodStart: scenarioDate(7),
      periodEnd: scenarioDate(13),
      deadline: scenarioDate(3),
    });

    const link = await t
      .withIdentity({ subject: MANAGER_SUBJECT })
      .mutation(api.staffRegistration.mutations.ensureShopRegistrationLink, {
        expectedOrganizationId: await getTestOrganizationId(t, shopId),
        shopId,
      });
    await t.mutation(internal.staffRegistration.mutations.submitRegistrationRequest, {
      token: link.token,
      name: "QR申請スタッフ",
      email: "qr-staff@example.com",
      acceptedLegal: true,
    });

    const ownerDigestTargetBeforeApproval = await t.query(
      internal.staffRegistration.notificationQueries.getOwnerDigestTargetForShop,
      {
        shopId,
      },
    );
    expect(ownerDigestTargetBeforeApproval?.recipients).toEqual([
      expect.objectContaining({ email: "qr-manager@example.com" }),
    ]);

    const pending = await t
      .withIdentity({ subject: MANAGER_SUBJECT })
      .query(api.staffRegistration.queries.getPendingRequests, {
        expectedOrganizationId: await getTestOrganizationId(t, shopId),
        shopId,
      });
    expect(pending).toMatchObject([{ name: "QR申請スタッフ", email: "qr-staff@example.com" }]);

    const { staffId } = await t
      .withIdentity({ subject: MANAGER_SUBJECT })
      .mutation(api.staffRegistration.mutations.approveRequest, {
        requestId: pending[0]._id,
        expectedOrganizationId: await getTestOrganizationId(t, shopId),
        shopId,
      });

    const staffPage = await asManager.getDashboardStaffs();
    expect(staffPage.page.find((staff) => staff._id === staffId)).toMatchObject({
      name: "QR申請スタッフ",
      email: "qr-staff@example.com",
    });

    const consentState = await t.run(async (ctx) =>
      ctx.db
        .query("legalConsentStates")
        .withIndex("by_staffId", (q) => q.eq("staffId", staffId))
        .first(),
    );
    expect(consentState).toMatchObject({ method: "staff_registration" });

    const scheduled = await readScheduledFunctions(t);
    expect(hasScheduledJob(scheduled, "legal/actions:sendStaffConsentEmail", { staffId })).toBe(false);
    expect(hasScheduledJob(scheduled, "line/actions:sendInviteEmail", { staffId })).toBe(true);
    expect(
      hasScheduledJob(scheduled, "notification/actions:sendOpenRecruitmentNotificationEmailsForStaff", { staffId }),
    ).toBe(true);

    await expect(
      t.query(internal.staffRegistration.notificationQueries.getOwnerDigestTargetForShop, {
        shopId,
      }),
    ).resolves.toBeNull();
  });

  it("匿名スタッフが届いた確認コードを入力して初めて申請になり、承認後のスタッフへコード確認時の同意が引き継がれる", async () => {
    const origin = "https://shiftori.app";
    vi.stubEnv("APP_URL", origin);
    vi.stubEnv("STAFF_REGISTRATION_ALLOWED_ORIGINS", "");
    vi.stubEnv("STAFF_REGISTRATION_TRUSTED_IP_HEADER", "");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "turnstile-secret");
    vi.stubEnv("DEBUG_MODE", "false");
    vi.stubEnv("DEBUG_NOTIFICATION_DELIVERY_MODE", "");
    vi.stubEnv("RESEND_API_KEY", "resend-token");
    resetResendEmailQueueForTest();
    const sentSubjects: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = input instanceof Request ? input.url : String(input);
        if (!url.includes("api.resend.com")) {
          return new Response(
            JSON.stringify({ success: true, action: "staff_registration", hostname: "shiftori.app" }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        sentSubjects.push((JSON.parse(String(init?.body)) as { subject: string }).subject);
        return new Response(JSON.stringify({ id: "email_verification_code" }), { status: 200 });
      }),
    );
    const t = convexTest(schema, modules);
    const asManager = t.withIdentity({ subject: MANAGER_SUBJECT });
    const { shopId } = await t.run(
      async (ctx) =>
        await seedManagerShop(ctx, {
          subject: MANAGER_SUBJECT,
          email: "code-manager@example.com",
          shopName: "確認コード店舗",
        }),
    );
    const expectedOrganizationId = await getTestOrganizationId(t, shopId);
    const link = await asManager.mutation(api.staffRegistration.mutations.ensureShopRegistrationLink, {
      expectedOrganizationId,
      shopId,
    });
    const postJson = async (path: string, body: unknown) =>
      await t.fetch(path, {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify(body),
      });

    // Act: 入力を送ると確認コードのメールが届くが、まだ申請にはならない。
    const started = await postJson("/staff-registration/verification/start", {
      token: link.token,
      name: "コード申請スタッフ",
      email: "code-staff@example.com",
      acceptedLegal: true,
      requestId: "00000000-0000-4000-8000-000000000001",
      turnstileToken: "turnstile-token",
    });
    const { verificationToken } = (await started.json()) as { verificationToken: string };

    expect(started.status).toBe(200);
    expect(sentSubjects).toHaveLength(1);
    await expect(
      asManager.query(api.staffRegistration.queries.getPendingRequests, { expectedOrganizationId, shopId }),
    ).resolves.toEqual([]);

    // Act: 届いたコードを入力すると申請になる。
    await vi.advanceTimersByTimeAsync(90_000);
    const confirmedAt = Date.now();
    const code = /確認コード (\d{6})$/.exec(sentSubjects[0] ?? "")?.[1];
    const confirmed = await postJson("/staff-registration/verification/confirm", {
      token: link.token,
      verificationToken,
      code,
    });

    expect(confirmed.status).toBe(200);
    const pending = await asManager.query(api.staffRegistration.queries.getPendingRequests, {
      expectedOrganizationId,
      shopId,
    });
    expect(pending.map((request) => ({ name: request.name, email: request.email }))).toEqual([
      { name: "コード申請スタッフ", email: "code-staff@example.com" },
    ]);

    // Act: 承認すると、コードを確認した時刻の同意がスタッフへ引き継がれる。
    const { staffId } = await asManager.mutation(api.staffRegistration.mutations.approveRequest, {
      requestId: pending[0]._id,
      expectedOrganizationId,
      shopId,
    });

    const state = await t.run(async (ctx) => ({
      requests: await ctx.db.query("staffRegistrationRequests").collect(),
      verifications: await ctx.db.query("staffRegistrationEmailVerifications").collect(),
      consents: await ctx.db
        .query("legalConsentStates")
        .withIndex("by_staffId", (q) => q.eq("staffId", staffId))
        .collect(),
    }));
    expect(
      state.requests.map(({ status, approvedStaffId, emailVerifiedAt, consentedAt }) => ({
        status,
        approvedStaffId,
        emailVerifiedAt,
        consentedAt,
      })),
    ).toEqual([
      { status: "approved", approvedStaffId: staffId, emailVerifiedAt: confirmedAt, consentedAt: confirmedAt },
    ]);
    expect(state.verifications).toEqual([]);
    expect(state.consents.map(({ method, consentedAt }) => ({ method, consentedAt }))).toEqual([
      { method: "staff_registration", consentedAt: confirmedAt },
    ]);
  });

  it("登録リンクを再発行しても既存の承認待ち申請を承認でき、旧linkだけを無効化する", async () => {
    const t = convexTest(schema, modules);
    const seeded = await t.run(
      async (ctx) =>
        await seedManagerShop(ctx, {
          subject: MANAGER_SUBJECT,
          email: "qr-rotation-manager@example.com",
          shopName: "QR再発行店舗",
        }),
    );
    const manager = t.withIdentity({ subject: MANAGER_SUBJECT });
    const original = await manager.mutation(api.staffRegistration.mutations.ensureShopRegistrationLink, {
      expectedOrganizationId: await getTestOrganizationId(t, seeded.shopId),
      shopId: seeded.shopId,
    });
    await t.mutation(internal.staffRegistration.mutations.submitRegistrationRequest, {
      token: original.token,
      name: "再発行前の申請者",
      email: "before-rotation@example.com",
      acceptedLegal: true,
    });

    const rotated = await manager.mutation(api.staffRegistration.mutations.rotateShopRegistrationLink, {
      expectedOrganizationId: await getTestOrganizationId(t, seeded.shopId),
      shopId: seeded.shopId,
      expectedLinkId: original.linkId,
    });
    const currentToken = await t.run(async (ctx) => (await ctx.db.get(rotated.linkId))?.token);
    if (!currentToken) throw new Error("rotated registration link not found");

    await expect(
      t.mutation(internal.staffRegistration.mutations.submitRegistrationRequest, {
        token: original.token,
        name: "旧リンクからの申請者",
        email: "old-link-after-rotation@example.com",
        acceptedLegal: true,
      }),
    ).rejects.toThrow("登録リンクの有効期限が切れています");
    await expect(
      t.mutation(internal.staffRegistration.mutations.submitRegistrationRequest, {
        token: currentToken,
        name: "再発行後の申請者",
        email: "after-rotation@example.com",
        acceptedLegal: true,
      }),
    ).resolves.toEqual({ status: "accepted" });

    const pending = await manager.query(api.staffRegistration.queries.getPendingRequests, {
      expectedOrganizationId: await getTestOrganizationId(t, seeded.shopId),
      shopId: seeded.shopId,
    });
    const beforeRotationRequest = pending.find((request) => request.email === "before-rotation@example.com");
    if (!beforeRotationRequest) throw new Error("pending request created before rotation not found");
    await expect(
      manager.mutation(api.staffRegistration.mutations.approveRequest, {
        expectedOrganizationId: await getTestOrganizationId(t, seeded.shopId),
        shopId: seeded.shopId,
        requestId: beforeRotationRequest._id,
      }),
    ).resolves.toMatchObject({ staffId: expect.any(String) });

    const requests = await t.run(async (ctx) =>
      (
        await Promise.all(
          (["pending", "approved"] as const).map(
            async (status) =>
              await ctx.db
                .query("staffRegistrationRequests")
                .withIndex("by_shopId_status", (q) => q.eq("shopId", seeded.shopId).eq("status", status))
                .collect(),
          ),
        )
      ).flat(),
    );
    expect(requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ email: "before-rotation@example.com", status: "approved" }),
        expect.objectContaining({ email: "after-rotation@example.com", status: "pending" }),
      ]),
    );
    expect(requests.some((request) => request.email === "old-link-after-rotation@example.com")).toBe(false);
  });

  it("組織から削除済みの人物も通常のQR承認で新しいstaffだけを作り、旧履歴・認証・LINE連携を戻さない", async () => {
    const t = convexTest(schema, modules);
    const seeded = await t.run(async (ctx) => {
      const manager = await seedManagerShop(ctx, {
        subject: MANAGER_SUBJECT,
        email: "removed-qr-manager@example.com",
        shopName: "再登録QR店舗",
      });
      const now = Date.now();
      const targetUserId = await seedUser(ctx, "removed_qr_person", "removed-qr-person@example.com");
      const personId = await ctx.db.insert("organizationPeople", {
        organizationId: manager.organizationId,
        userId: targetUserId,
        name: "削除前の氏名",
        email: "removed-qr-person@example.com",
        emailNormalized: "removed-qr-person@example.com",
        status: "active",
        createdAt: now - 20_000,
        updatedAt: now - 10_000,
      });
      const memberId = await ctx.db.insert("organizationMembers", {
        organizationId: manager.organizationId,
        personId,
        userId: targetUserId,
        status: "removed",
        createdAt: now - 20_000,
        updatedAt: now - 10_000,
      });
      const oldStaffId = await ctx.db.insert("staffs", {
        excludedFromShift: false,
        shopId: manager.shopId,
        organizationId: manager.organizationId,
        organizationPersonId: personId,
        userId: targetUserId,
        name: "削除前の店舗表示名",
        email: "removed-qr-person@example.com",
        emailNormalized: "removed-qr-person@example.com",
        isDeleted: true,
      });
      const recruitmentId = await ctx.db.insert("recruitments", {
        shopId: manager.shopId,
        periodStart: scenarioDate(-2),
        periodEnd: scenarioDate(-1),
        deadline: scenarioDate(-3),
        shopClosedDates: [],
        status: "confirmed",
        confirmedAt: now - 10_000,
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      const positionId = await ctx.db.insert("positions", {
        shopId: manager.shopId,
        name: "通常",
        color: "#3b82f6",
        sortOrder: 0,
        isDefault: true,
        isDeleted: false,
      });
      const oldAssignmentId = await ctx.db.insert("shiftAssignments", {
        recruitmentId,
        staffId: oldStaffId,
        date: scenarioDate(-1),
        startTime: "10:00",
        endTime: "18:00",
        positionId,
      });
      const revokedAt = now - 5_000;
      const sessionId = await ctx.db.insert("sessions", {
        accessKind: "submit",
        sessionToken: "removed-qr-session",
        staffId: oldStaffId,
        shopId: manager.shopId,
        recruitmentId,
        expiresAt: now + 86_400_000,
        revokedAt,
      });
      const magicLinkId = await ctx.db.insert("magicLinks", {
        accessKind: "submit",
        token: "removed-qr-magic-link",
        staffId: oldStaffId,
        shopId: manager.shopId,
        recruitmentId,
        expiresAt: now + 86_400_000,
        revokedAt,
      });
      const lineLinkTokenId = await ctx.db.insert("lineLinkTokens", {
        token: "removed-qr-line-link",
        staffId: oldStaffId,
        shopId: manager.shopId,
        organizationId: manager.organizationId,
        organizationPersonId: personId,
        lineLinkGenerationAtIssue: 0,
        expiresAt: now + 86_400_000,
        revokedAt,
      });
      const canonicalLine = await seedOrganizationPersonLineLink(ctx, {
        organizationId: manager.organizationId,
        organizationPersonId: personId,
        lineUserId: "U_removed_qr_person",
      });
      await ctx.db.patch(canonicalLine.organizationPersonLineLinkId, { isDeleted: true, unlinkedAt: revokedAt });
      await ctx.db.patch(canonicalLine.lineProviderUserId, { isDeleted: true });
      await ctx.db.patch(personId, { status: "removed", updatedAt: revokedAt });
      return {
        ...manager,
        canonicalLine,
        lineLinkTokenId,
        magicLinkId,
        memberId,
        oldAssignmentId,
        oldStaffId,
        personId,
        revokedAt,
        sessionId,
      };
    });

    const manager = t.withIdentity({ subject: MANAGER_SUBJECT });
    const link = await manager.mutation(api.staffRegistration.mutations.ensureShopRegistrationLink, {
      expectedOrganizationId: await getTestOrganizationId(t, seeded.shopId),
      shopId: seeded.shopId,
    });
    await t.mutation(internal.staffRegistration.mutations.submitRegistrationRequest, {
      token: link.token,
      name: "再登録後の氏名",
      email: "removed-qr-person@example.com",
      acceptedLegal: true,
    });

    const pending = await manager.query(api.staffRegistration.queries.getPendingRequests, {
      expectedOrganizationId: await getTestOrganizationId(t, seeded.shopId),
      shopId: seeded.shopId,
    });
    expect(pending).toMatchObject([
      {
        name: "再登録後の氏名",
        email: "removed-qr-person@example.com",
        canApprove: true,
        approveDisabledReason: null,
      },
    ]);

    const { staffId } = await manager.mutation(api.staffRegistration.mutations.approveRequest, {
      requestId: pending[0]._id,
      expectedOrganizationId: await getTestOrganizationId(t, seeded.shopId),
      shopId: seeded.shopId,
    });
    expect(staffId).not.toBe(seeded.oldStaffId);

    const state = await t.run(async (ctx) => ({
      audits: await ctx.db.query("organizationAuditEvents").collect(),
      canonicalLineLink: await ctx.db.get(seeded.canonicalLine.organizationPersonLineLinkId),
      consent: await ctx.db
        .query("legalConsentStates")
        .withIndex("by_staffId", (q) => q.eq("staffId", staffId))
        .first(),
      lineLinkToken: await ctx.db.get(seeded.lineLinkTokenId),
      lineProviderUser: await ctx.db.get(seeded.canonicalLine.lineProviderUserId),
      magicLink: await ctx.db.get(seeded.magicLinkId),
      member: await ctx.db.get(seeded.memberId),
      newAssignments: await ctx.db
        .query("shiftAssignments")
        .withIndex("by_staffId_and_date", (q) => q.eq("staffId", staffId))
        .collect(),
      newStaff: await ctx.db.get(staffId),
      oldAssignment: await ctx.db.get(seeded.oldAssignmentId),
      oldStaff: await ctx.db.get(seeded.oldStaffId),
      person: await ctx.db.get(seeded.personId),
      request: await ctx.db.get(pending[0]._id),
      scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
      session: await ctx.db.get(seeded.sessionId),
    }));
    expect(state.person).toMatchObject({ status: "active", name: "再登録後の氏名" });
    expect(state.newStaff).toMatchObject({
      shopId: seeded.shopId,
      organizationId: seeded.organizationId,
      organizationPersonId: seeded.personId,
      name: "再登録後の氏名",
      isDeleted: false,
    });
    expect(state.oldStaff?.isDeleted).toBe(true);
    expect(state.oldAssignment).not.toBeNull();
    expect(state.newAssignments).toEqual([]);
    expect(state.member?.status).toBe("removed");
    expect(state.session?.revokedAt).toBe(seeded.revokedAt);
    expect(state.magicLink?.revokedAt).toBe(seeded.revokedAt);
    expect(state.lineLinkToken?.revokedAt).toBe(seeded.revokedAt);
    expect(state.canonicalLineLink).toMatchObject({ isDeleted: true, unlinkedAt: seeded.revokedAt });
    expect(state.lineProviderUser?.isDeleted).toBe(true);
    expect(state.request).toMatchObject({ status: "approved", approvedStaffId: staffId });
    expect(state.consent).toMatchObject({ method: "staff_registration" });
    expect(hasScheduledJob(state.scheduled, "line/actions:sendInviteEmail", { staffId })).toBe(true);
    expect(
      hasScheduledJob(state.scheduled, "notification/actions:sendOpenRecruitmentNotificationEmailsForStaff", {
        staffId,
      }),
    ).toBe(true);
    expect(
      state.audits.filter((audit) => audit.action === "organization.staff_added" && audit.targetId === staffId),
    ).toHaveLength(1);
    expect(
      state.audits.filter(
        (audit) => audit.action === "organization.person_reactivated" && audit.targetId === seeded.personId,
      ),
    ).toHaveLength(1);
  });
});
