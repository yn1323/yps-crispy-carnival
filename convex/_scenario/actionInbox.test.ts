import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import { getDeadlineCutoff } from "../_lib/dateFormat";
import { seedActionInboxSources } from "../_test/actionInboxFixtures";
import { readScheduledFunctions } from "../_test/scenarioBuilders";
import { modules, schema } from "../_test/setup.test-helper";

const NOW = Date.parse("2026-08-14T00:00:00Z");

describe("組織の対応一覧シナリオ", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.stubEnv("FEATURE_MANAGER_INVITATION", "true");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("4種の未対応状態を投影し、既存mutationで解決すると各項目だけが消える", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(
      async (ctx) =>
        await seedActionInboxSources(ctx, {
          subject: "action_inbox_scenario_manager",
          now: NOW,
        }),
    );
    const manager = t.withIdentity({ subject: "action_inbox_scenario_manager" });

    const initial = await manager.query(api.appOrganization.actionInboxQueries.getActionInbox, {
      organizationId: ids.organizationId,
      shopFilter: "all",
      refreshBucket: 0,
    });

    expect(initial).toEqual({
      items: [
        {
          id: `shift:${ids.recruitmentId}`,
          kind: "shift",
          scope: { kind: "shop", organizationId: ids.organizationId, shopId: ids.shopId },
          recruitmentId: ids.recruitmentId,
          shopName: "対応テスト店舗",
          periodStart: "2026-08-15",
          periodEnd: "2026-08-20",
          deadline: "2026-08-13",
          responseCount: 0,
          totalStaffCount: 1,
          totalStaffCountHasOverflow: false,
          occurredAt: getDeadlineCutoff("2026-08-13"),
        },
        {
          id: `staffRegistration:${ids.registrationRequestId}`,
          kind: "staffRegistration",
          scope: { kind: "shop", organizationId: ids.organizationId, shopId: ids.shopId },
          requestId: ids.registrationRequestId,
          shopName: "対応テスト店舗",
          applicantName: "登録申請スタッフ",
          createdAt: NOW - 2_000,
          canApprove: true,
          approveDisabledReason: null,
          canReject: true,
          occurredAt: NOW - 2_000,
        },
        {
          id: `notificationFailure:${ids.notificationFailureId}`,
          kind: "notificationFailure",
          scope: { kind: "shop", organizationId: ids.organizationId, shopId: ids.shopId },
          failureId: ids.notificationFailureId,
          shopName: "対応テスト店舗",
          staffName: "通知対象スタッフ",
          notificationKindLabel: "LINE連携案内",
          channel: "email",
          lastFailedAt: NOW - 1_000,
          canRetry: true,
          canResolve: true,
          occurredAt: NOW - 1_000,
        },
        {
          id: `managerInvitation:${ids.invitationId}`,
          kind: "managerInvitation",
          scope: { kind: "organization", organizationId: ids.organizationId },
          invitationId: ids.invitationId,
          inviteeName: "招待対象者",
          invitedEmail: "invitee@example.com",
          status: "sendFailed",
          expiresAt: NOW + 7 * 24 * 60 * 60 * 1_000,
          canResend: true,
          canRevoke: true,
          occurredAt: NOW + 7 * 24 * 60 * 60 * 1_000,
        },
      ],
      continuationByKind: {},
      hasMoreByKind: {},
      nextRefreshAt: getDeadlineCutoff("2026-08-20"),
    });

    await manager.mutation(api.staffRegistration.mutations.rejectRequest, {
      shopId: ids.shopId,
      requestId: ids.registrationRequestId,
    });
    const afterRegistration = await manager.query(api.appOrganization.actionInboxQueries.getActionInbox, {
      organizationId: ids.organizationId,
      shopFilter: "all",
      refreshBucket: 1,
    });
    expect(afterRegistration.items.map(({ kind }) => kind)).toEqual([
      "shift",
      "notificationFailure",
      "managerInvitation",
    ]);

    await manager.mutation(api.notificationOutbox.mutations.resolveFailure, {
      shopId: ids.shopId,
      failureId: ids.notificationFailureId,
    });
    const afterNotification = await manager.query(api.appOrganization.actionInboxQueries.getActionInbox, {
      organizationId: ids.organizationId,
      shopFilter: "all",
      refreshBucket: 2,
    });
    expect(afterNotification.items.map(({ kind }) => kind)).toEqual(["shift", "managerInvitation"]);

    await manager.mutation(api.organizationInvitation.mutations.revokeForOrganization, {
      organizationId: ids.organizationId,
      invitationId: ids.invitationId,
      requestId: "action-inbox-scenario-revoke",
    });
    const afterInvitation = await manager.query(api.appOrganization.actionInboxQueries.getActionInbox, {
      organizationId: ids.organizationId,
      shopFilter: "all",
      refreshBucket: 3,
    });
    expect(afterInvitation.items.map(({ kind }) => kind)).toEqual(["shift"]);

    const sideEffects = await t.run(async (ctx) => ({
      registration: await ctx.db.get(ids.registrationRequestId),
      notificationFailure: await ctx.db.get(ids.notificationFailureId),
      invitation: await ctx.db.get(ids.invitationId),
      notificationOutbox: await ctx.db.query("notificationOutbox").collect(),
      auditEvents: (
        await ctx.db
          .query("organizationAuditEvents")
          .withIndex("by_organizationId_and_occurredAt", (q) => q.eq("organizationId", ids.organizationId))
          .collect()
      ).map(({ action, targetKind, targetId, fromState, toState }) => ({
        action,
        targetKind,
        targetId,
        fromState,
        toState,
      })),
    }));
    expect(sideEffects.registration).toMatchObject({ status: "rejected" });
    expect(sideEffects.notificationFailure).toMatchObject({
      status: "resolved",
      resolutionKind: "dismissed",
    });
    expect(sideEffects.invitation).toMatchObject({ status: "revoked", reservedSeat: false });
    expect(sideEffects.notificationOutbox).toEqual([]);
    expect(sideEffects.auditEvents).toEqual([
      {
        action: "organization.manager_invitation_revoked",
        targetKind: "invitation",
        targetId: ids.invitationId,
        fromState: "issued",
        toState: "revoked",
      },
    ]);
    expect(await readScheduledFunctions(t)).toEqual([]);
  });
});
