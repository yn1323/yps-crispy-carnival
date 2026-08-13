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
    memberStatus?: "active" | "readOnly";
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
    status?: "issued" | "pending" | "linked" | "revoked";
    expiresAt?: number;
    invitedName?: string;
    targetPersonId?: Id<"organizationPeople">;
    purpose?: "managerAddition" | "freeManagerExchange";
  },
) {
  return await ctx.db.insert("organizationInvitations", {
    organizationId: args.organizationId,
    email: args.email,
    emailNormalized: args.email.trim().toLowerCase(),
    ...(args.invitedName ? { invitedName: args.invitedName } : {}),
    tokenDigest: `digest-${args.email}-${args.status ?? "issued"}`,
    status: args.status ?? "issued",
    purpose: args.purpose ?? "managerAddition",
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
  it("未認証・別tenant shopはPIIを返さずintegrityErrorへ閉じる", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const actor = await seedOrganizationManagerShop(ctx, { subject: "manager_query_tenant_actor", plan: "pro" });
      const other = await seedOrganizationManagerShop(ctx, { subject: "manager_query_tenant_other", plan: "pro" });
      return { actor, other };
    });
    await expect(
      t.query(api.organization.queries.getManagerSettingsOverview, { shopId: ids.actor.shopId, now: NOW }),
    ).resolves.toMatchObject({ kind: "integrityError" });
    const actor = t.withIdentity({ subject: "manager_query_tenant_actor" });
    await expect(
      actor.query(api.organization.queries.getManagerSettingsOverview, { shopId: ids.other.shopId, now: NOW }),
    ).resolves.toMatchObject({ kind: "integrityError" });
    await expect(
      actor.query(api.organization.queries.getManagerCandidates, { shopId: ids.other.shopId, now: NOW }),
    ).resolves.toMatchObject({ kind: "integrityError" });
  });

  it("activeとprojectedを分離し、legacy pending・期限overlay・順序・sendFailedを投影する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, { subject: "manager_query_ready", plan: "business" });
      const readOnly = await seedPerson(ctx, {
        organizationId: base.organizationId,
        key: "manager_query_readonly",
        name: "閲覧管理者",
        email: "readonly-manager@example.com",
        memberStatus: "readOnly",
      });
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
        status: "pending",
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
        status: "pending",
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
      return { ...base, readOnly, target, later, failed };
    });

    const result = await t
      .withIdentity({ subject: "manager_query_ready" })
      .query(api.organization.queries.getManagerSettingsOverview, { shopId: ids.shopId, now: NOW });
    expect(result).toMatchObject({
      kind: "ready",
      mode: "managerAddition",
      usage: {
        activeManagers: 1,
        activeInvitationCount: 2,
        pendingAdditions: 2,
        pendingExchanges: 0,
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
        removeRoleDisabledReason: "最後の有効管理者の管理者権限は外せません。",
      },
      {
        role: "readOnly",
        name: "閲覧管理者",
        canRemoveRole: false,
        removeRoleDisabledReason: "契約状態を復旧してから変更できます。",
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
    expect(JSON.stringify(result)).not.toContain(String(ids.readOnly.userId));
  });

  it("旧Free管理者交代が残る間は通常追加の新規招待と再送を止める", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "manager_query_legacy_exchange_blocks_addition",
        plan: "free",
      });
      const additionId = await seedInvitation(ctx, {
        organizationId: base.organizationId,
        inviterMemberId: base.memberId,
        email: "existing-addition@example.com",
      });
      const exchangeId = await seedInvitation(ctx, {
        organizationId: base.organizationId,
        inviterMemberId: base.memberId,
        email: "legacy-exchange@example.com",
        purpose: "freeManagerExchange",
      });
      return { ...base, additionId, exchangeId };
    });

    const result = await t
      .withIdentity({ subject: "manager_query_legacy_exchange_blocks_addition" })
      .query(api.organization.queries.getManagerSettingsOverview, { shopId: ids.shopId, now: NOW });

    expect(result).toMatchObject({
      kind: "ready",
      mode: "managerAddition",
      usage: { pendingAdditions: 1, pendingExchanges: 1 },
      actions: { canInviteExistingStaff: false, canInviteExternal: false },
    });
    if (result.kind !== "ready") throw new Error("overview not ready");
    expect(result.invitations.find((invitation) => invitation.invitationId === ids.additionId)).toMatchObject({
      purpose: "managerAddition",
      canResend: false,
      canRevoke: true,
    });
    expect(result.invitations.find((invitation) => invitation.invitationId === ids.exchangeId)).toMatchObject({
      purpose: "freeManagerExchange",
      canResend: false,
      canRevoke: true,
    });
  });

  it("外部招待後に同email人物が管理者になるとconflictへ閉じ、その人物名を表示する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "manager_query_external_conflict",
        plan: "business",
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
        memberStatus: "readOnly",
      });
      return { ...base, invitationId, person };
    });

    const result = await t
      .withIdentity({ subject: "manager_query_external_conflict" })
      .query(api.organization.queries.getManagerSettingsOverview, { shopId: ids.shopId, now: NOW });
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

  it("外部招待後に同emailの不適格人物が現れた場合は再送不可のconflictへ閉じる", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "manager_query_external_removed",
        plan: "business",
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
      .query(api.organization.queries.getManagerSettingsOverview, { shopId: ids.shopId, now: NOW });
    expect(result).toMatchObject({
      kind: "ready",
      invitations: [
        {
          invitationId: ids.invitationId,
          status: "conflict",
          canResend: false,
          canRevoke: true,
        },
      ],
    });
  });

  it("削除済みstaff履歴だけの請求先管理者は権限解除不可として表示する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "manager_query_deleted_staff_billing",
        plan: "business",
      });
      const target = await seedPerson(ctx, {
        organizationId: base.organizationId,
        shopId: base.shopId,
        key: "manager_query_deleted_staff_billing_target",
        name: "削除済み所属の請求先管理者",
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
      .query(api.organization.queries.getManagerSettingsOverview, { shopId: ids.shopId, now: NOW });
    expect(result).toMatchObject({
      kind: "ready",
      managers: expect.arrayContaining([
        {
          personId: ids.target.personId,
          name: "削除済み所属の請求先管理者",
          contactEmail: ids.target.email,
          role: "active",
          isSelf: false,
          canRemoveRole: false,
          removeRoleDisabledReason: "管理者権限を外すには、先に請求先メールアドレスを変更してください。",
        },
      ]),
    });
  });

  it("有効招待のabsolute bounded read超過は部分一覧を返さずintegrityErrorにする", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, { subject: "manager_query_overflow", plan: "business" });
      for (let index = 0; index < 6; index += 1) {
        await seedInvitation(ctx, {
          organizationId: base.organizationId,
          inviterMemberId: base.memberId,
          email: `overflow-${index}@example.com`,
          status: index % 2 === 0 ? "issued" : "pending",
          expiresAt: NOW + index + 1,
        });
      }
      return base;
    });
    await expect(
      t
        .withIdentity({ subject: "manager_query_overflow" })
        .query(api.organization.queries.getManagerSettingsOverview, { shopId: ids.shopId, now: NOW }),
    ).resolves.toMatchObject({ kind: "integrityError" });
  });

  it("active managerのabsolute bounded read超過は部分一覧を返さずintegrityErrorにする", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "manager_query_manager_overflow",
        plan: "business",
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
    await expect(
      actor.query(api.organization.queries.getManagerSettingsOverview, { shopId: ids.shopId, now: NOW }),
    ).resolves.toMatchObject({ kind: "integrityError" });
    await expect(
      actor.query(api.organization.queries.getManagerCandidates, { shopId: ids.shopId, now: NOW }),
    ).resolves.toMatchObject({ kind: "integrityError" });
  });

  it("有料上限内のactive管理者と保持中readOnly管理者の合計が5名を超えてもreadyで全件表示する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "manager_query_paid_readonly_retained",
        plan: "business",
      });
      for (let index = 0; index < 4; index += 1) {
        await seedPerson(ctx, {
          organizationId: base.organizationId,
          key: `manager_query_paid_active_${index}`,
          name: `有効管理者${index}`,
          memberStatus: "active",
        });
      }
      for (let index = 0; index < 2; index += 1) {
        await seedPerson(ctx, {
          organizationId: base.organizationId,
          key: `manager_query_paid_readonly_${index}`,
          name: `保持中管理者${index}`,
          memberStatus: "readOnly",
        });
      }
      return base;
    });

    const actor = t.withIdentity({ subject: "manager_query_paid_readonly_retained" });
    const result = await actor.query(api.organization.queries.getManagerSettingsOverview, {
      shopId: ids.shopId,
      now: NOW,
    });
    expect(result).toMatchObject({
      kind: "ready",
      usage: { activeManagers: 5, maxManagers: 5 },
    });
    if (result.kind !== "ready") throw new Error("overview not ready");
    expect(result.managers).toHaveLength(7);
    expect(result.managers.filter(({ role }) => role === "active")).toHaveLength(5);
    expect(result.managers.filter(({ role }) => role === "readOnly")).toHaveLength(2);
    await expect(
      actor.query(api.organization.queries.getManagerCandidates, { shopId: ids.shopId, now: NOW }),
    ).resolves.toEqual({ kind: "ready", candidates: [] });
  });

  it("Free・restricted・readOnly actorのaction capabilityをserver policyから閉じる", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const free = await seedOrganizationManagerShop(ctx, { subject: "manager_query_free", plan: "free" });
      await seedPerson(ctx, {
        organizationId: free.organizationId,
        shopId: free.shopId,
        key: "manager_query_free_candidate",
        name: "Free候補",
      });
      const restricted = await seedOrganizationManagerShop(ctx, {
        subject: "manager_query_restricted",
        plan: "pro",
      });
      const restrictedBilling = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", restricted.organizationId))
        .unique();
      if (!restrictedBilling) throw new Error("billing missing");
      await ctx.db.patch(restrictedBilling._id, {
        state: {
          kind: "restricted",
          reason: "paymentGraceExpired",
          previousPlan: "pro",
          recoveryManagerPersonIds: [restricted.personId],
          previousActiveShopIds: [restricted.shopId],
          restrictedAt: NOW,
        },
      });
      const readOnly = await seedOrganizationManagerShop(ctx, { subject: "manager_query_readonly_actor", plan: "pro" });
      await seedPerson(ctx, {
        organizationId: readOnly.organizationId,
        key: "manager_query_readonly_successor",
        name: "有効管理者",
        memberStatus: "active",
      });
      await ctx.db.patch(readOnly.memberId, { status: "readOnly" });
      return { free, restricted, readOnly };
    });
    const free = await t
      .withIdentity({ subject: "manager_query_free" })
      .query(api.organization.queries.getManagerSettingsOverview, { shopId: ids.free.shopId, now: NOW });
    expect(free).toMatchObject({
      kind: "ready",
      mode: "managerAddition",
      usage: { activeManagers: 1, projectedManagers: 1, maxManagers: 2 },
      actions: { canInviteExistingStaff: true, canInviteExternal: true },
    });
    const restricted = await t
      .withIdentity({ subject: "manager_query_restricted" })
      .query(api.organization.queries.getManagerSettingsOverview, { shopId: ids.restricted.shopId, now: NOW });
    expect(restricted).toMatchObject({
      kind: "ready",
      mode: "restricted",
      actions: { canInviteExistingStaff: false, canInviteExternal: false },
    });
    const readOnly = await t
      .withIdentity({ subject: "manager_query_readonly_actor" })
      .query(api.organization.queries.getManagerSettingsOverview, { shopId: ids.readOnly.shopId, now: NOW });
    expect(readOnly).toMatchObject({
      kind: "ready",
      mode: "restricted",
      actions: { canInviteExistingStaff: false, canInviteExternal: false },
    });
  });

  it.each([
    { reason: "freeConditionsNotMet" as const },
    { reason: "planLimitExceeded" as const, limitPlan: "free" as const },
  ])("$reasonのrestrictedは契約上限をread boundにせずreadyで操作を閉じる", async ({ reason, limitPlan }) => {
    const t = convexTest(schema, modules);
    const subject = `manager_query_free_over_limit_${reason}`;
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject,
        plan: "business",
      });
      for (let index = 0; index < 2; index += 1) {
        await seedPerson(ctx, {
          organizationId: base.organizationId,
          key: `manager_query_over_limit_manager_${index}`,
          name: `超過管理者${index}`,
          memberStatus: "active",
        });
      }
      for (let index = 0; index < 4; index += 1) {
        await seedPerson(ctx, {
          organizationId: base.organizationId,
          shopId: base.shopId,
          key: `manager_query_over_limit_staff_${index}`,
          name: `超過スタッフ${index}`,
        });
      }
      await seedInvitation(ctx, {
        organizationId: base.organizationId,
        inviterMemberId: base.memberId,
        email: "over-limit-pending@example.com",
        invitedName: "超過中の招待",
      });
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", base.organizationId))
        .unique();
      if (!billingState) throw new Error("billing state not found");
      await ctx.db.patch(billingState._id, {
        state: {
          kind: "restricted",
          reason,
          previousPlan: "business",
          ...(limitPlan ? { limitPlan } : {}),
          recoveryManagerPersonIds: [base.personId],
          previousActiveShopIds: [base.shopId],
          restrictedAt: NOW,
        },
      });
      return base;
    });
    const actor = t.withIdentity({ subject });

    await expect(
      actor.query(api.organization.queries.getManagerSettingsOverview, { shopId: ids.shopId, now: NOW }),
    ).resolves.toMatchObject({
      kind: "ready",
      mode: "restricted",
      usage: {
        activeManagers: 3,
        activeInvitationCount: 1,
        projectedManagers: 4,
        maxManagers: 2,
      },
      actions: { canInviteExistingStaff: false, canInviteExternal: false },
    });
    const candidates = await actor.query(api.organization.queries.getManagerCandidates, {
      shopId: ids.shopId,
      now: NOW,
    });
    expect(candidates.kind).toBe("ready");
    if (candidates.kind !== "ready") throw new Error("candidates not ready");
    expect(candidates.candidates).toHaveLength(4);
    expect(candidates.candidates.every((candidate) => !candidate.canSelect)).toBe(true);
  });

  it("candidateはstaff資格だけを列挙し、manager・readOnly・pending・不正メールを理由付きで閉じる", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, { subject: "manager_candidates_owner", plan: "business" });
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
      const readOnly = await seedPerson(ctx, {
        organizationId: base.organizationId,
        shopId: base.shopId,
        key: "candidate_readonly",
        name: "C 閲覧管理者",
        memberStatus: "readOnly",
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
      return { ...base, selectable, current, readOnly, pending, noEmail, invalidEmail, noStaff };
    });
    const result = await t
      .withIdentity({ subject: "manager_candidates_owner" })
      .query(api.organization.queries.getManagerCandidates, { shopId: ids.shopId, now: NOW });
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") throw new Error("candidates not ready");
    expect(result.candidates.map((candidate) => candidate.name)).toEqual([
      "A 選択可能",
      "B 現管理者",
      "C 閲覧管理者",
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
        personId: ids.readOnly.personId,
        canSelect: false,
        disabledReason: expect.stringContaining("閲覧のみ"),
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
