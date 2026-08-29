import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { seedOrganizationManagerShop, seedUser } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";

const NOW = Date.parse("2026-08-13T00:00:00Z");

async function seedPerson(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    shopId?: Id<"shops">;
    key: string;
    name: string;
    email?: string;
    memberStatus?: "active";
  },
) {
  const email = args.email ?? `${args.key}@example.com`;
  const userId = args.memberStatus ? await seedUser(ctx, args.key, email) : undefined;
  const personId = await ctx.db.insert("organizationPeople", {
    organizationId: args.organizationId,
    ...(userId ? { userId } : {}),
    name: args.name,
    email,
    emailNormalized: email.trim().toLowerCase(),
    status: "active",
    createdAt: NOW,
    updatedAt: NOW,
  });
  const memberId =
    args.memberStatus && userId
      ? await ctx.db.insert("organizationMembers", {
          organizationId: args.organizationId,
          personId,
          userId,
          status: args.memberStatus,
          createdAt: NOW,
          updatedAt: NOW,
        })
      : undefined;
  const staffId = args.shopId
    ? await ctx.db.insert("staffs", {
        organizationId: args.organizationId,
        organizationPersonId: personId,
        ...(userId ? { userId } : {}),
        shopId: args.shopId,
        name: args.name,
        email,
        emailNormalized: email.trim().toLowerCase(),
        excludedFromShift: false,
        isDeleted: false,
      })
    : undefined;
  return { personId, userId, memberId, staffId, email };
}

async function seedInvitation(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    inviterMemberId: Id<"organizationMembers">;
    email: string;
    status?: "issued" | "linked" | "revoked";
    expiresAt?: number;
    invitedName?: string;
    targetPersonId?: Id<"organizationPeople">;
  },
) {
  return await ctx.db.insert("organizationInvitations", {
    organizationId: args.organizationId,
    email: args.email,
    emailNormalized: args.email.trim().toLowerCase(),
    invitedName: args.invitedName ?? args.email.split("@", 1)[0],
    tokenDigest: `digest-${args.email}-${args.status ?? "issued"}`,
    status: args.status ?? "issued",
    inviterMemberId: args.inviterMemberId,
    ...(args.targetPersonId ? { targetPersonId: args.targetPersonId } : {}),
    reservedSeat: !args.targetPersonId,
    version: 1,
    expiresAt: args.expiresAt ?? NOW + 86_400_000,
    createdAt: NOW,
    updatedAt: NOW,
  });
}

describe("organization manager settings queries", () => {
  it("active.freeの管理者上限超過中は追加・再送を閉じ、権限解除と招待取消を許可する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "manager_query_usage_over_limit",
        plan: "free",
      });
      const removable = await seedPerson(ctx, {
        organizationId: base.organizationId,
        key: "manager_query_usage_over_limit_removable",
        name: "整理対象管理者",
        memberStatus: "active",
      });
      await seedPerson(ctx, {
        organizationId: base.organizationId,
        key: "manager_query_usage_over_limit_other",
        name: "別の管理者",
        memberStatus: "active",
      });
      const invitationId = await seedInvitation(ctx, {
        organizationId: base.organizationId,
        inviterMemberId: base.memberId,
        email: "manager-query-over-limit-pending@example.com",
      });
      return { ...base, removablePersonId: removable.personId, invitationId };
    });

    const result = await t
      .withIdentity({ subject: "manager_query_usage_over_limit" })
      .query(api.appOrganization.manageQueries.getManagerSettingsOverview, {
        organizationId: ids.organizationId,
        now: NOW,
      });

    expect(result).toMatchObject({
      kind: "ready",
      actions: {
        canInviteExistingStaff: false,
        existingStaffDisabledReason: expect.stringContaining("プラン上限を超過"),
        canInviteExternal: false,
      },
    });
    if (result.kind !== "ready") throw new Error("manager settings must be ready");
    expect(result.managers.find((manager) => manager.personId === ids.removablePersonId)).toMatchObject({
      canRemoveRole: true,
    });
    expect(result.invitations.find((invitation) => invitation.invitationId === ids.invitationId)).toMatchObject({
      canResend: false,
      canRevoke: true,
    });
  });

  it("未認証・別tenant組織はPIIを返さず拒否する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const actor = await seedOrganizationManagerShop(ctx, { subject: "manager_query_tenant_actor", plan: "standard" });
      const other = await seedOrganizationManagerShop(ctx, { subject: "manager_query_tenant_other", plan: "standard" });
      return { actor, other };
    });
    await expect(
      t.query(api.appOrganization.manageQueries.getManagerSettingsOverview, {
        organizationId: ids.actor.organizationId,
        now: NOW,
      }),
    ).rejects.toThrow("Not found");
    const actor = t.withIdentity({ subject: "manager_query_tenant_actor" });
    await expect(
      actor.query(api.appOrganization.manageQueries.getManagerSettingsOverview, {
        organizationId: ids.other.organizationId,
        now: NOW,
      }),
    ).rejects.toThrow("Not found");
    await expect(
      actor.query(api.appOrganization.manageQueries.getManagerCandidates, {
        organizationId: ids.other.organizationId,
        now: NOW,
      }),
    ).rejects.toThrow("Not found");
  });

  it("activeとprojectedを分離し、期限overlay・順序・sendFailedを投影する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, { subject: "manager_query_ready", plan: "pro" });
      const target = await seedPerson(ctx, {
        organizationId: base.organizationId,
        shopId: base.shopId,
        key: "manager_query_target",
        name: "招待対象",
        email: "target-manager@example.com",
      });
      const later = await seedInvitation(ctx, {
        organizationId: base.organizationId,
        inviterMemberId: base.memberId,
        email: "later@example.com",
        invitedName: "後の招待",
        status: "issued",
        expiresAt: NOW + 3_000,
      });
      const failed = await seedInvitation(ctx, {
        organizationId: base.organizationId,
        inviterMemberId: base.memberId,
        email: target.email,
        invitedName: "保存名より人物名を優先しない",
        targetPersonId: target.personId,
        status: "issued",
        expiresAt: NOW + 2_000,
      });
      await seedInvitation(ctx, {
        organizationId: base.organizationId,
        inviterMemberId: base.memberId,
        email: "expired@example.com",
        status: "issued",
        expiresAt: NOW,
      });
      await ctx.db.insert("notificationOutbox", {
        channel: "email",
        status: "failed",
        dedupeKey: "manager-query-send-failed",
        organizationId: base.organizationId,
        organizationInvitationId: failed,
        organizationInvitationVersion: 1,
        purpose: "business",
        payload: {
          kind: "organizationManagerInvitationEmail",
          from: "noreply@example.com",
          to: target.email,
          context: "manager-query-test",
        },
        attemptCount: 1,
        nextRunAt: NOW,
        failedAt: NOW,
        createdAt: NOW,
        updatedAt: NOW,
      });
      return { ...base, target, later, failed };
    });

    const result = await t
      .withIdentity({ subject: "manager_query_ready" })
      .query(api.appOrganization.manageQueries.getManagerSettingsOverview, {
        organizationId: ids.organizationId,
        now: NOW,
      });
    expect(result).toMatchObject({
      kind: "ready",
      usage: {
        activeManagers: 1,
        activeInvitationCount: 2,
        pendingAdditions: 2,
        projectedManagers: 3,
        maxManagers: 5,
      },
    });
    if (result.kind !== "ready") throw new Error("overview not ready");
    expect(
      result.managers.map(({ role, name, canRemoveRole, removeRoleDisabledReason }) => ({
        role,
        name,
        canRemoveRole,
        removeRoleDisabledReason,
      })),
    ).toEqual([
      {
        role: "active",
        name: "管理者",
        canRemoveRole: false,
        removeRoleDisabledReason: "少なくとも管理者が1名必要です。",
      },
    ]);
    expect(result.invitations.map((invitation) => invitation.invitationId)).toEqual([ids.failed, ids.later]);
    expect(result.invitations[0]).toMatchObject({
      name: "招待対象",
      status: "sendFailed",
      canResend: true,
      canRevoke: true,
    });
    expect(JSON.stringify(result)).not.toContain("tokenDigest");
  });

  it.each([
    ["email.failed", "failed"],
    ["email.bounced", "bounced"],
    ["email.suppressed", "suppressed"],
  ] as const)(
    "Resendのhard failure %sを管理者招待のsendFailedへ投影する",
    async (providerEventType, deliveryStatus) => {
      const t = convexTest(schema, modules);
      const ids = await t.run(async (ctx) => {
        const base = await seedOrganizationManagerShop(ctx, {
          subject: `manager_query_${deliveryStatus}`,
          plan: "pro",
        });
        const invitationId = await seedInvitation(ctx, {
          organizationId: base.organizationId,
          inviterMemberId: base.memberId,
          email: `${deliveryStatus}@example.com`,
          invitedName: "招待対象者",
        });
        await ctx.db.insert("notificationOutbox", {
          channel: "email",
          status: "sent",
          dedupeKey: `manager-query-provider-${deliveryStatus}`,
          organizationId: base.organizationId,
          organizationInvitationId: invitationId,
          organizationInvitationVersion: 1,
          purpose: "business",
          payload: {
            kind: "organizationManagerInvitationEmail",
            from: "noreply@example.com",
            to: `${deliveryStatus}@example.com`,
            context: "organizationInvitation.managerInvite",
          },
          attemptCount: 1,
          nextRunAt: NOW,
          sentAt: NOW,
          resendEmailId: `manager-query-provider-${deliveryStatus}`,
          resendLastEventType: providerEventType,
          resendLastEventAt: NOW + 1_000,
          resendDeliveryStatus: deliveryStatus,
          createdAt: NOW,
          updatedAt: NOW + 1_000,
        });
        return { ...base, invitationId };
      });

      const result = await t
        .withIdentity({ subject: `manager_query_${deliveryStatus}` })
        .query(api.appOrganization.manageQueries.getManagerSettingsOverview, {
          organizationId: ids.organizationId,
          now: NOW,
        });

      if (result.kind !== "ready") throw new Error("overview not ready");
      expect(result.invitations).toEqual([
        {
          invitationId: ids.invitationId,
          name: "招待対象者",
          invitedEmail: `${deliveryStatus}@example.com`,
          status: "sendFailed",
          expiresAt: NOW + 86_400_000,
          canResend: true,
          canRevoke: true,
        },
      ]);
    },
  );

  it.each([
    ["完全なdelayed pair + 期限あり", "pending", "email.delivery_delayed", "delivery_delayed", true],
    ["完全なdelayed pair + 期限なし", "sendFailed", "email.delivery_delayed", "delivery_delayed", false],
    ["delayed eventだけ", "sendFailed", "email.delivery_delayed", undefined, true],
    ["delayed statusだけ", "sendFailed", undefined, "delivery_delayed", true],
    ["delayed event + hard status", "sendFailed", "email.delivery_delayed", "failed", true],
    ["hard event + delayed status", "sendFailed", "email.failed", "delivery_delayed", true],
  ] as const)(
    "provider状態が%sのとき管理者招待を%sへ投影する",
    async (_providerState, expectedStatus, providerEventType, deliveryStatus, withDeadline) => {
      const t = convexTest(schema, modules);
      const caseKey = `${providerEventType ?? "none"}-${deliveryStatus ?? "none"}-${withDeadline}`;
      const ids = await t.run(async (ctx) => {
        const base = await seedOrganizationManagerShop(ctx, {
          subject: `manager_query_provider_pair_${caseKey}`,
          plan: "pro",
        });
        const invitationId = await seedInvitation(ctx, {
          organizationId: base.organizationId,
          inviterMemberId: base.memberId,
          email: `provider-pair-${caseKey}@example.com`,
          invitedName: "配送遅延中の招待対象者",
        });
        const outboxId = await ctx.db.insert("notificationOutbox", {
          channel: "email",
          status: "sent",
          dedupeKey: `manager-query-provider-pair-${caseKey}`,
          organizationId: base.organizationId,
          organizationInvitationId: invitationId,
          organizationInvitationVersion: 1,
          purpose: "business",
          payload: {
            kind: "organizationManagerInvitationEmail",
            from: "noreply@example.com",
            to: `provider-pair-${caseKey}@example.com`,
            context: "organizationInvitation.managerInvite",
          },
          attemptCount: 1,
          nextRunAt: NOW,
          sentAt: NOW,
          resendEmailId: `manager-query-provider-pair-${caseKey}`,
          ...(providerEventType ? { resendLastEventType: providerEventType } : {}),
          resendLastEventAt: NOW + 1_000,
          ...(deliveryStatus ? { resendDeliveryStatus: deliveryStatus } : {}),
          createdAt: NOW,
          updatedAt: NOW + 1_000,
        });
        if (withDeadline) {
          await ctx.db.insert("notificationResendDelayedFailureDeadlines", {
            outboxId,
            dueAt: NOW + 30 * 60_000,
            createdAt: NOW,
          });
        }
        return { ...base, invitationId };
      });

      const result = await t
        .withIdentity({ subject: `manager_query_provider_pair_${caseKey}` })
        .query(api.appOrganization.manageQueries.getManagerSettingsOverview, {
          organizationId: ids.organizationId,
          now: NOW,
        });

      if (result.kind !== "ready") throw new Error("overview not ready");
      expect(result.invitations).toEqual([
        expect.objectContaining({
          invitationId: ids.invitationId,
          name: "配送遅延中の招待対象者",
          status: expectedStatus,
          canResend: true,
          canRevoke: true,
        }),
      ]);
    },
  );

  it("外部招待後に同email人物が管理者になるとconflictへ閉じ、その人物名を表示する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "manager_query_external_conflict",
        plan: "pro",
      });
      const invitationId = await seedInvitation(ctx, {
        organizationId: base.organizationId,
        inviterMemberId: base.memberId,
        email: "late-manager@example.com",
        invitedName: "招待時の名前",
      });
      const person = await seedPerson(ctx, {
        organizationId: base.organizationId,
        key: "manager_query_late_member",
        name: "後から管理者になった人物",
        email: "late-manager@example.com",
        memberStatus: "active",
      });
      return { ...base, invitationId, person };
    });

    const result = await t
      .withIdentity({ subject: "manager_query_external_conflict" })
      .query(api.appOrganization.manageQueries.getManagerSettingsOverview, {
        organizationId: ids.organizationId,
        now: NOW,
      });
    expect(result).toMatchObject({
      kind: "ready",
      invitations: [
        {
          invitationId: ids.invitationId,
          name: "後から管理者になった人物",
          status: "conflict",
          canResend: false,
          canRevoke: true,
        },
      ],
    });
  });

  it("外部招待後に同emailの通常削除人物が現れても再利用可能な招待として表示する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "manager_query_external_removed",
        plan: "pro",
      });
      const invitationId = await seedInvitation(ctx, {
        organizationId: base.organizationId,
        inviterMemberId: base.memberId,
        email: "late-removed@example.com",
        invitedName: "招待時の名前",
      });
      const person = await seedPerson(ctx, {
        organizationId: base.organizationId,
        key: "manager_query_late_removed",
        name: "削除済みの人物",
        email: "late-removed@example.com",
      });
      await ctx.db.patch(person.personId, { status: "removed", updatedAt: NOW + 1 });
      return { ...base, invitationId };
    });

    const result = await t
      .withIdentity({ subject: "manager_query_external_removed" })
      .query(api.appOrganization.manageQueries.getManagerSettingsOverview, {
        organizationId: ids.organizationId,
        now: NOW,
      });
    expect(result).toMatchObject({
      kind: "ready",
      invitations: [
        {
          invitationId: ids.invitationId,
          name: "削除済みの人物",
          status: "pending",
          canResend: true,
          canRevoke: true,
        },
      ],
    });
  });

  it("削除済みstaff履歴だけで請求先メールと一致する管理者は通常条件で権限解除不可になる", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "manager_query_deleted_staff_billing",
        plan: "pro",
      });
      const target = await seedPerson(ctx, {
        organizationId: base.organizationId,
        shopId: base.shopId,
        key: "manager_query_deleted_staff_billing_target",
        name: "削除済み所属の管理者",
        memberStatus: "active",
      });
      if (!target.staffId) throw new Error("staff not found");
      await ctx.db.patch(target.staffId, { isDeleted: true });
      await ctx.db.patch(base.organizationId, {
        billingEmail: target.email,
        billingEmailNormalized: target.email.trim().toLowerCase(),
        updatedAt: NOW + 1,
      });
      return { ...base, target };
    });

    const result = await t
      .withIdentity({ subject: "manager_query_deleted_staff_billing" })
      .query(api.appOrganization.manageQueries.getManagerSettingsOverview, {
        organizationId: ids.organizationId,
        now: NOW,
      });
    expect(result).toMatchObject({
      kind: "ready",
      managers: expect.arrayContaining([
        {
          personId: ids.target.personId,
          name: "削除済み所属の管理者",
          contactEmail: ids.target.email,
          role: "active",
          isSelf: false,
          canRemoveRole: true,
        },
      ]),
    });
  });

  it("有効招待のabsolute bounded read超過は部分一覧を返さずintegrityErrorにする", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, { subject: "manager_query_overflow", plan: "pro" });
      for (let index = 0; index < 6; index += 1) {
        await seedInvitation(ctx, {
          organizationId: base.organizationId,
          inviterMemberId: base.memberId,
          email: `overflow-${index}@example.com`,
          status: "issued",
          expiresAt: NOW + index + 1,
        });
      }
      return base;
    });
    await expect(
      t
        .withIdentity({ subject: "manager_query_overflow" })
        .query(api.appOrganization.manageQueries.getManagerSettingsOverview, {
          organizationId: ids.organizationId,
          now: NOW,
        }),
    ).resolves.toMatchObject({ kind: "integrityError" });
  });

  it("active managerの上限超過中は全bounded行と権限解除を返し、追加候補だけを閉じる", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "manager_query_manager_overflow",
        plan: "pro",
      });
      for (let index = 0; index < 5; index += 1) {
        await seedPerson(ctx, {
          organizationId: base.organizationId,
          key: `manager_query_manager_overflow_${index}`,
          name: `超過管理者${index}`,
          memberStatus: "active",
        });
      }
      return base;
    });
    const actor = t.withIdentity({ subject: "manager_query_manager_overflow" });
    const overview = await actor.query(api.appOrganization.manageQueries.getManagerSettingsOverview, {
      organizationId: ids.organizationId,
      now: NOW,
    });
    expect(overview).toMatchObject({
      kind: "ready",
      usage: { activeManagers: 6 },
      actions: { canInviteExistingStaff: false, canInviteExternal: false },
    });
    if (overview.kind !== "ready") throw new Error("manager overview was not ready");
    expect(overview.managers).toHaveLength(6);
    expect(overview.managers.filter((manager) => !manager.isSelf).every((manager) => manager.canRemoveRole)).toBe(true);
    await expect(
      actor.query(api.appOrganization.manageQueries.getManagerCandidates, {
        organizationId: ids.organizationId,
        now: NOW,
      }),
    ).resolves.toMatchObject({ kind: "integrityError" });
  });

  it("candidateはstaff資格だけを列挙し、manager・pending・不正メールを理由付きで閉じる", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, { subject: "manager_candidates_owner", plan: "pro" });
      const selectable = await seedPerson(ctx, {
        organizationId: base.organizationId,
        shopId: base.shopId,
        key: "candidate_selectable",
        name: "A 選択可能",
      });
      const current = await seedPerson(ctx, {
        organizationId: base.organizationId,
        shopId: base.shopId,
        key: "candidate_current",
        name: "B 現管理者",
        memberStatus: "active",
      });
      const pending = await seedPerson(ctx, {
        organizationId: base.organizationId,
        shopId: base.shopId,
        key: "candidate_pending",
        name: "D 招待中",
      });
      const noEmail = await seedPerson(ctx, {
        organizationId: base.organizationId,
        shopId: base.shopId,
        key: "candidate_no_email",
        name: "E メールなし",
        email: "",
      });
      const noStaff = await seedPerson(ctx, {
        organizationId: base.organizationId,
        key: "candidate_no_staff",
        name: "F 非staff",
      });
      const invalidEmail = await seedPerson(ctx, {
        organizationId: base.organizationId,
        shopId: base.shopId,
        key: "candidate_invalid_email",
        name: "F 不正メール",
        email: "not-an-email",
      });
      await seedInvitation(ctx, {
        organizationId: base.organizationId,
        inviterMemberId: base.memberId,
        email: pending.email,
        targetPersonId: pending.personId,
      });
      return { ...base, selectable, current, pending, noEmail, invalidEmail, noStaff };
    });
    const result = await t
      .withIdentity({ subject: "manager_candidates_owner" })
      .query(api.appOrganization.manageQueries.getManagerCandidates, { organizationId: ids.organizationId, now: NOW });
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") throw new Error("candidates not ready");
    expect(result.candidates.map((candidate) => candidate.name)).toEqual([
      "A 選択可能",
      "B 現管理者",
      "D 招待中",
      "E メールなし",
      "F 不正メール",
    ]);
    expect(result.candidates).toEqual([
      expect.objectContaining({ personId: ids.selectable.personId, canSelect: true }),
      expect.objectContaining({
        personId: ids.current.personId,
        canSelect: false,
        disabledReason: "すでに管理者です。",
      }),
      expect.objectContaining({
        personId: ids.pending.personId,
        canSelect: false,
        disabledReason: "管理者招待の承認待ちです。",
      }),
      expect.objectContaining({
        personId: ids.noEmail.personId,
        canSelect: false,
        disabledReason: "メールアドレスが登録されていません。",
      }),
      expect.objectContaining({
        personId: ids.invalidEmail.personId,
        canSelect: false,
        disabledReason: "メールアドレスの形式を確認してください。",
      }),
    ]);
    expect(result.candidates.some((candidate) => candidate.personId === ids.noStaff.personId)).toBe(false);
  });
});
