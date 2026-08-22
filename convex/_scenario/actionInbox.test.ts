import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import { getDeadlineCutoff } from "../_lib/dateFormat";
import { seedActionInboxSources } from "../_test/actionInboxFixtures";
import { readScheduledFunctions } from "../_test/scenarioBuilders";
import { seedOrganizationManagerShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { RESEND_DELAYED_FAILURE_GRACE_MS } from "../constants";

const NOW = Date.parse("2026-08-14T00:00:00Z");

describe("組織の対応一覧シナリオ", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
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

  it("管理者招待のResend遅延は猶予中に表示せず期限切れ後だけsendFailedとして表示する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "action_inbox_manager_provider_delayed",
        plan: "business",
      });
      const invitationId = await ctx.db.insert("organizationInvitations", {
        organizationId: base.organizationId,
        email: "provider-delayed@example.com",
        emailNormalized: "provider-delayed@example.com",
        invitedName: "配信遅延の招待対象者",
        tokenDigest: "action-inbox-manager-provider-delayed",
        status: "issued",
        purpose: "managerAddition",
        inviterMemberId: base.memberId,
        reservedSeat: true,
        version: 1,
        expiresAt: NOW + 7 * 24 * 60 * 60 * 1_000,
        createdAt: NOW - 3_000,
        updatedAt: NOW - 3_000,
      });
      const outboxId = await ctx.db.insert("notificationOutbox", {
        channel: "email",
        status: "sent",
        dedupeKey: "organization-manager-invitation:provider-delayed:1",
        organizationId: base.organizationId,
        organizationInvitationId: invitationId,
        organizationInvitationVersion: 1,
        purpose: "business",
        payload: {
          kind: "organizationManagerInvitationEmail",
          from: "noreply@example.com",
          to: "provider-delayed@example.com",
          context: "organizationInvitation.managerInvite",
        },
        attemptCount: 1,
        nextRunAt: NOW,
        sentAt: NOW,
        resendEmailId: "email_manager_provider_delayed",
        createdAt: NOW,
        updatedAt: NOW,
      });
      return { ...base, invitationId, outboxId };
    });
    const manager = t.withIdentity({ subject: "action_inbox_manager_provider_delayed" });
    const firstDelayedAt = NOW + 1_000;

    await expect(
      t.mutation(internal.notificationOutbox.mutations.recordResendProviderIssue, {
        providerEventId: "svix_manager_provider_delayed",
        providerEventType: "email.delivery_delayed",
        providerEmailId: "email_manager_provider_delayed",
        outboxIdTag: ids.outboxId,
        occurredAt: firstDelayedAt,
        errorMessage: "email_delivery_delayed",
      }),
    ).resolves.toEqual({ recorded: true, inboxed: false, reason: "delayedGrace" });

    const duringGrace = await manager.query(api.appOrganization.actionInboxQueries.getActionInbox, {
      organizationId: ids.organizationId,
      shopFilter: "all",
      refreshBucket: 0,
    });
    expect(duringGrace).toEqual({
      items: [],
      continuationByKind: {},
      hasMoreByKind: {},
    });

    vi.setSystemTime(firstDelayedAt + RESEND_DELAYED_FAILURE_GRACE_MS + 60_000);
    await t.mutation(internal.notificationOutbox.mutations.recoverOverdueResendDelayedFailures, {});

    const afterGrace = await manager.query(api.appOrganization.actionInboxQueries.getActionInbox, {
      organizationId: ids.organizationId,
      shopFilter: "all",
      refreshBucket: 1,
    });
    expect(afterGrace).toEqual({
      items: [
        {
          id: `managerInvitation:${ids.invitationId}`,
          kind: "managerInvitation",
          scope: { kind: "organization", organizationId: ids.organizationId },
          invitationId: ids.invitationId,
          inviteeName: "配信遅延の招待対象者",
          invitedEmail: "provider-delayed@example.com",
          status: "sendFailed",
          expiresAt: NOW + 7 * 24 * 60 * 60 * 1_000,
          canResend: true,
          canRevoke: true,
          occurredAt: NOW + 7 * 24 * 60 * 60 * 1_000,
        },
      ],
      continuationByKind: {},
      hasMoreByKind: {},
    });

    await expect(
      t.mutation(internal.notificationOutbox.mutations.recordResendProviderDeliveryUpdate, {
        providerEventId: "svix_manager_provider_delayed_then_delivered",
        providerEventType: "email.delivered",
        providerEmailId: "email_manager_provider_delayed",
        outboxIdTag: ids.outboxId,
        occurredAt: Date.now() + 1_000,
      }),
    ).resolves.toEqual({ recorded: true, historyUpdated: false });

    const afterDelivery = await manager.query(api.appOrganization.actionInboxQueries.getActionInbox, {
      organizationId: ids.organizationId,
      shopFilter: "all",
      refreshBucket: 2,
    });
    expect(afterDelivery).toEqual({
      items: [],
      continuationByKind: {},
      hasMoreByKind: {},
    });
  });

  it("管理者招待のResend失敗を表示し、より新しい配信成功で解消する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "action_inbox_manager_provider_failure",
        plan: "business",
      });
      const invitationId = await ctx.db.insert("organizationInvitations", {
        organizationId: base.organizationId,
        email: "provider-failure@example.com",
        emailNormalized: "provider-failure@example.com",
        invitedName: "配信失敗の招待対象者",
        tokenDigest: "action-inbox-manager-provider-failure",
        status: "issued",
        purpose: "managerAddition",
        inviterMemberId: base.memberId,
        reservedSeat: true,
        version: 1,
        expiresAt: NOW + 7 * 24 * 60 * 60 * 1_000,
        createdAt: NOW - 3_000,
        updatedAt: NOW - 3_000,
      });
      const outboxId = await ctx.db.insert("notificationOutbox", {
        channel: "email",
        status: "sent",
        dedupeKey: "organization-manager-invitation:provider-failure:1",
        organizationId: base.organizationId,
        organizationInvitationId: invitationId,
        organizationInvitationVersion: 1,
        purpose: "business",
        payload: {
          kind: "organizationManagerInvitationEmail",
          from: "noreply@example.com",
          to: "provider-failure@example.com",
          context: "organizationInvitation.managerInvite",
        },
        attemptCount: 1,
        nextRunAt: NOW,
        sentAt: NOW,
        resendEmailId: "email_manager_provider_failure",
        createdAt: NOW,
        updatedAt: NOW,
      });
      return { ...base, invitationId, outboxId };
    });
    const manager = t.withIdentity({ subject: "action_inbox_manager_provider_failure" });

    await expect(
      t.mutation(internal.notificationOutbox.mutations.recordResendProviderIssue, {
        providerEventId: "svix_manager_provider_failure",
        providerEventType: "email.bounced",
        providerEmailId: "email_manager_provider_failure",
        outboxIdTag: ids.outboxId,
        occurredAt: NOW + 1_000,
        errorMessage: "email_delivery_bounced",
      }),
    ).resolves.toEqual({ recorded: true, inboxed: false, reason: "suppressed" });

    const afterFailure = await manager.query(api.appOrganization.actionInboxQueries.getActionInbox, {
      organizationId: ids.organizationId,
      shopFilter: "all",
      refreshBucket: 0,
    });
    expect(afterFailure).toEqual({
      items: [
        {
          id: `managerInvitation:${ids.invitationId}`,
          kind: "managerInvitation",
          scope: { kind: "organization", organizationId: ids.organizationId },
          invitationId: ids.invitationId,
          inviteeName: "配信失敗の招待対象者",
          invitedEmail: "provider-failure@example.com",
          status: "sendFailed",
          expiresAt: NOW + 7 * 24 * 60 * 60 * 1_000,
          canResend: true,
          canRevoke: true,
          occurredAt: NOW + 7 * 24 * 60 * 60 * 1_000,
        },
      ],
      continuationByKind: {},
      hasMoreByKind: {},
    });

    await expect(
      t.mutation(internal.notificationOutbox.mutations.recordResendProviderDeliveryUpdate, {
        providerEventId: "svix_manager_provider_delivered",
        providerEventType: "email.delivered",
        providerEmailId: "email_manager_provider_failure",
        outboxIdTag: ids.outboxId,
        occurredAt: NOW + 2_000,
      }),
    ).resolves.toEqual({ recorded: true, historyUpdated: false });

    const afterDelivery = await manager.query(api.appOrganization.actionInboxQueries.getActionInbox, {
      organizationId: ids.organizationId,
      shopFilter: "all",
      refreshBucket: 1,
    });
    expect(afterDelivery).toEqual({
      items: [],
      continuationByKind: {},
      hasMoreByKind: {},
    });
  });
});
