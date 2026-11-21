import { convexTest, type TestConvex } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { seedOrganizationManagerShop, seedUser } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { deriveInvitationToken } from "./token";

const SIGNING_SECRET = "test-only-organization-invitation-secret-123456";
const ISSUER = "https://convex.test";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("organizationInvitation/acceptanceActions", () => {
  it("未認証の呼び出しは受け付けず、招待と所属を変更しない", async () => {
    const fixture = await seedAcceptanceFixture("unauthenticated");
    const before = await persistentState(fixture);

    await expect(
      fixture.t.action(api.organizationInvitation.acceptanceActions.accept, { token: fixture.token }),
    ).resolves.toEqual({ status: "unavailable" });

    expect(await persistentState(fixture)).toEqual(before);
  });

  it("招待先と違うメールアドレスのアカウントでも参加でき、アカウント・人物・管理者所属を招待へ連携する", async () => {
    const fixture = await seedAcceptanceFixture("different_email");
    const actorSubject = "different_email_target";
    const actor = invitationActor(fixture.t, actorSubject, "different-login@example.com");

    await expect(
      actor.action(api.organizationInvitation.acceptanceActions.accept, { token: fixture.token }),
    ).resolves.toEqual({
      status: "linked",
      organizationId: fixture.manager.organizationId,
      shopId: fixture.manager.shopId,
    });

    const state = await persistentState(fixture);
    const actorUsers = state.users.filter((user) => user.authTokenIdentifier === `${ISSUER}|${actorSubject}`);
    expect(actorUsers).toHaveLength(1);
    const targetPeople = state.people.filter((person) => person.emailNormalized === fixture.email);
    expect(
      targetPeople.map((person) => ({
        userId: person.userId,
        name: person.name,
        email: person.email,
        status: person.status,
      })),
    ).toEqual([{ userId: actorUsers[0]._id, name: "受諾対象", email: fixture.email, status: "active" }]);
    expect(
      state.members
        .filter((member) => member.personId === targetPeople[0]._id)
        .map((member) => ({ userId: member.userId, status: member.status })),
    ).toEqual([{ userId: actorUsers[0]._id, status: "active" }]);
    expect(state.invitation).toMatchObject({
      status: "linked",
      linkedByPersonId: targetPeople[0]._id,
      reservedSeat: false,
      version: fixture.invitation.version + 1,
    });
    expect(
      state.scheduled
        .filter((job) => job.name === "organizationInvitation/actions:enqueueAcceptanceNotifications")
        .map((job) => job.args[0]),
    ).toEqual([
      {
        invitationId: fixture.invitation._id,
        expectedVersion: fixture.invitation.version + 1,
        organizationBillingVersionAtOrigin: 1,
      },
    ]);
  });

  it("アカウントへ接続済みの人物への招待は、別のアカウントでは拒否して状態を変えず、接続済みの本人だけが参加できる", async () => {
    const fixture = await seedConnectedPersonFixture("connected_person");
    const before = await persistentState(fixture);

    await expect(
      invitationActor(fixture.t, "connected_person_other", fixture.email).action(
        api.organizationInvitation.acceptanceActions.accept,
        { token: fixture.token },
      ),
    ).resolves.toEqual({ status: "conflict", accountAlreadyRegistered: false });
    expect(await persistentState(fixture)).toEqual(before);

    await expect(
      fixture.t
        .withIdentity({ subject: fixture.connectedSubject })
        .action(api.organizationInvitation.acceptanceActions.accept, { token: fixture.token }),
    ).resolves.toEqual({
      status: "linked",
      organizationId: fixture.manager.organizationId,
      shopId: fixture.manager.shopId,
    });
    const after = await persistentState(fixture);
    expect(
      after.members
        .filter((member) => member.personId === fixture.connectedPersonId)
        .map((member) => ({ userId: member.userId, status: member.status })),
    ).toEqual([{ userId: fixture.connectedUserId, status: "active" }]);
    expect(after.people).toHaveLength(before.people.length);
  });

  it("この組織に別の人物として登録済みのアカウントは拒否し、登録済みであることだけを返して状態を変えない", async () => {
    const fixture = await seedAcceptanceFixture("already_registered");
    const before = await persistentState(fixture);

    await expect(
      fixture.owner.action(api.organizationInvitation.acceptanceActions.accept, { token: fixture.token }),
    ).resolves.toEqual({ status: "conflict", accountAlreadyRegistered: true });

    expect(await persistentState(fixture)).toEqual(before);
  });

  it.each(["revoke", "resend"] as const)("%s後の古いURLでは参加できず、人物と所属を作らない", async (operation) => {
    const fixture = await seedAcceptanceFixture(`stale_${operation}`);
    if (operation === "resend") {
      await fixture.owner.mutation(api.organizationInvitation.mutations.resendForOrganization, {
        organizationId: fixture.manager.organizationId,
        invitationId: fixture.invitation._id,
        requestId: `stale-${operation}-rotate`,
      });
    } else {
      await fixture.owner.mutation(api.organizationInvitation.mutations.revokeForOrganization, {
        organizationId: fixture.manager.organizationId,
        invitationId: fixture.invitation._id,
        requestId: `stale-${operation}-revoke`,
      });
    }
    const before = await persistentState(fixture);

    await expect(
      invitationActor(fixture.t, `stale_${operation}_target`, fixture.email).action(
        api.organizationInvitation.acceptanceActions.accept,
        { token: fixture.token },
      ),
    ).resolves.toEqual({ status: "revoked" });

    expect(await persistentState(fixture)).toEqual(before);
  });

  it("有効期限を過ぎたURLでは参加できず、人物と所属を作らない", async () => {
    const fixture = await seedAcceptanceFixture("expired");
    const before = await persistentState(fixture);
    vi.setSystemTime(new Date(fixture.invitation.expiresAt));

    await expect(
      invitationActor(fixture.t, "expired_target", fixture.email).action(
        api.organizationInvitation.acceptanceActions.accept,
        { token: fixture.token },
      ),
    ).resolves.toEqual({ status: "expired" });

    expect(await persistentState(fixture)).toEqual(before);
  });

  it("同じURLを二つのアカウントが受諾しても一人だけを連携し、後からの受諾は使用済みとして状態を変えない", async () => {
    const fixture = await seedAcceptanceFixture("second_actor");
    const first = invitationActor(fixture.t, "second_actor_first", "first@example.com");
    const second = invitationActor(fixture.t, "second_actor_second", "second@example.com");

    const [firstResult, secondResult] = await Promise.all([
      first.action(api.organizationInvitation.acceptanceActions.accept, { token: fixture.token }),
      second.action(api.organizationInvitation.acceptanceActions.accept, { token: fixture.token }),
    ]);

    expect([firstResult.status, secondResult.status].sort()).toEqual(["linked", "used"]);
    const winnerSubject = firstResult.status === "linked" ? "second_actor_first" : "second_actor_second";
    const state = await persistentState(fixture);
    expect(
      state.users
        .map((user) => user.authTokenIdentifier)
        .filter((identifier) => [`${ISSUER}|second_actor_first`, `${ISSUER}|second_actor_second`].includes(identifier)),
    ).toEqual([`${ISSUER}|${winnerSubject}`]);
    const targetPeople = state.people.filter((person) => person.emailNormalized === fixture.email);
    expect(targetPeople).toHaveLength(1);
    expect(state.members.filter((member) => member.personId === targetPeople[0]._id)).toHaveLength(1);
    expect(
      state.audits
        .filter((audit) => audit.action === "organization.manager_invitation_linked")
        .map((audit) => audit.targetId),
    ).toEqual([fixture.invitation._id]);
    expect(
      state.scheduled.filter((job) => job.name === "organizationInvitation/actions:enqueueAcceptanceNotifications"),
    ).toHaveLength(1);

    // 参加した本人がもう一度開いた場合は、新しい人物・所属・通知を作らず同じ結果を返す。
    const winner = firstResult.status === "linked" ? first : second;
    await expect(
      winner.action(api.organizationInvitation.acceptanceActions.accept, { token: fixture.token }),
    ).resolves.toEqual({
      status: "linked",
      organizationId: fixture.manager.organizationId,
      shopId: fixture.manager.shopId,
    });
    expect(await persistentState(fixture)).toEqual(state);
  });

  it("同じアカウントが1分間に5回を超えて試すと、6回目は招待を調べずに閉じる", async () => {
    const fixture = await seedAcceptanceFixture("rate_limit");
    const actor = invitationActor(fixture.t, "rate_limit_target", fixture.email);
    const wrongTokens = ["b", "c", "d", "e", "f"].map((character) => character.repeat(43));

    for (const token of wrongTokens) {
      await expect(actor.action(api.organizationInvitation.acceptanceActions.accept, { token })).resolves.toEqual({
        status: "invalid",
      });
    }
    const before = await persistentState(fixture);

    await expect(
      actor.action(api.organizationInvitation.acceptanceActions.accept, { token: fixture.token }),
    ).resolves.toEqual({ status: "unavailable" });
    expect(await persistentState(fixture)).toEqual(before);
  });
});

type AcceptanceFixture = {
  t: TestConvex<typeof schema>;
  manager: { organizationId: Id<"organizations"> };
  invitation: { _id: Id<"organizationInvitations"> };
};

async function seedAcceptanceFixture(caseKey: string) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-04T12:00:00+09:00"));
  vi.stubEnv("ORGANIZATION_INVITATION_SIGNING_SECRET", SIGNING_SECRET);
  const t = convexTest(schema, modules);
  const manager = await t.run((ctx) =>
    seedOrganizationManagerShop(ctx, { subject: `${caseKey}_owner`, plan: "standard" }),
  );
  const email = `${caseKey.replaceAll("_", "-")}-target@example.com`;
  const owner = t.withIdentity({ subject: `${caseKey}_owner` });
  const issued = await owner.mutation(api.organizationInvitation.mutations.issueForOrganization, {
    organizationId: manager.organizationId,
    recipient: { kind: "external", invitedName: "受諾対象", email },
    requestId: `${caseKey}-issue`,
  });
  return { t, manager, owner, email, ...(await readInvitationWithToken(t, issued.invitationId)) };
}

/** 過去に管理者だった人のように、アカウントへ接続済みで管理者所属のない人物を既存スタッフとして招待する。 */
async function seedConnectedPersonFixture(caseKey: string) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-04T12:00:00+09:00"));
  vi.stubEnv("ORGANIZATION_INVITATION_SIGNING_SECRET", SIGNING_SECRET);
  const t = convexTest(schema, modules);
  const manager = await t.run((ctx) =>
    seedOrganizationManagerShop(ctx, { subject: `${caseKey}_owner`, plan: "standard" }),
  );
  const email = `${caseKey.replaceAll("_", "-")}-staff@example.com`;
  const connectedSubject = `${caseKey}_connected`;
  const connected = await t.run(async (ctx) => {
    const now = Date.now();
    const connectedUserId = await seedUser(ctx, connectedSubject, "connected-login@example.com");
    const connectedPersonId = await ctx.db.insert("organizationPeople", {
      organizationId: manager.organizationId,
      userId: connectedUserId,
      name: "接続済みスタッフ",
      email,
      emailNormalized: email,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("staffs", {
      excludedFromShift: false,
      shopId: manager.shopId,
      organizationId: manager.organizationId,
      organizationPersonId: connectedPersonId,
      name: "接続済みスタッフ",
      email,
      emailNormalized: email,
      isDeleted: false,
    });
    return { connectedUserId, connectedPersonId };
  });
  const owner = t.withIdentity({ subject: `${caseKey}_owner` });
  const issued = await owner.mutation(api.organizationInvitation.mutations.issueForOrganization, {
    organizationId: manager.organizationId,
    recipient: { kind: "existingStaff", personId: connected.connectedPersonId },
    requestId: `${caseKey}-issue`,
  });
  return {
    t,
    manager,
    owner,
    email,
    connectedSubject,
    ...connected,
    ...(await readInvitationWithToken(t, issued.invitationId)),
  };
}

async function readInvitationWithToken(t: TestConvex<typeof schema>, invitationId: Id<"organizationInvitations">) {
  const invitation = await t.run((ctx) => ctx.db.get(invitationId));
  if (!invitation) throw new Error("invitation not found");
  const token = await deriveInvitationToken({
    invitationId: invitation._id,
    version: invitation.version,
    signingSecret: SIGNING_SECRET,
  });
  return { invitation, token };
}

function invitationActor(t: TestConvex<typeof schema>, subject: string, email: string) {
  return t.withIdentity({ subject, email });
}

/** 招待の受諾が変更し得る永続状態。回数制限の消費は含めない。 */
async function persistentState({ t, manager, invitation }: AcceptanceFixture) {
  return await t.run(async (ctx) => ({
    invitation: await ctx.db.get(invitation._id),
    invitations: await ctx.db
      .query("organizationInvitations")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", manager.organizationId))
      .collect(),
    users: await ctx.db.query("users").collect(),
    people: await ctx.db
      .query("organizationPeople")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", manager.organizationId))
      .collect(),
    members: await ctx.db
      .query("organizationMembers")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", manager.organizationId))
      .collect(),
    audits: await ctx.db
      .query("organizationAuditEvents")
      .withIndex("by_organizationId_and_occurredAt", (q) => q.eq("organizationId", manager.organizationId))
      .collect(),
    outbox: await ctx.db.query("notificationOutbox").collect(),
    scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
  }));
}
