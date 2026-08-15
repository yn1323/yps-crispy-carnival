import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { ClerkVerifiedEmailProviderError } from "../_lib/clerkVerifiedEmailProvider";
import { seedOrganizationManagerShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { runInvitationAcceptance } from "./acceptanceActions";
import { deriveInvitationToken } from "./token";

const ISSUER = "https://quick-fox-12.clerk.accounts.dev";
const TOKEN = "a".repeat(43);
const SIGNING_SECRET = "test-only-organization-invitation-secret-123456";

type Deferred<T = void> = {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
};

beforeEach(() => {
  vi.stubEnv("FEATURE_MANAGER_INVITATION", "true");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("organizationInvitation/acceptanceActions", () => {
  it("JWT issuerと設定したClerk instanceが異なる場合はprepare前に閉じる", async () => {
    const { ctx, runMutation } = acceptanceContext([]);
    const provider = providerStub(new Set());

    await expect(
      runInvitationAcceptance(ctx, provider, { ...configuration(), expectedIssuer: "https://other.clerk.dev" }, TOKEN),
    ).resolves.toEqual({ status: "unavailable", retryable: false });
    expect(runMutation).not.toHaveBeenCalled();
    expect(provider.assertReady).not.toHaveBeenCalled();
  });

  it("未連携招待でverified EmailAddressに招待先がなければ確定せずverificationRequiredを返す", async () => {
    const { ctx, runMutation } = acceptanceContext([
      {
        status: "ready",
        invitationId: "invitation_1",
        expectedVersion: 1,
        tokenDigest: "digest_1",
        emailNormalized: "invite@example.com",
        requiresVerifiedEmail: true,
      },
    ]);
    const provider = providerStub(new Set(["other@example.com"]));

    await expect(runInvitationAcceptance(ctx, provider, configuration(), TOKEN)).resolves.toEqual({
      status: "verificationRequired",
    });
    expect(runMutation).toHaveBeenCalledTimes(1);
  });

  it("Clerk照会失敗時は招待を消費せずretryableだけを公開する", async () => {
    const { ctx, runMutation } = acceptanceContext([
      {
        status: "ready",
        invitationId: "invitation_1",
        expectedVersion: 1,
        tokenDigest: "digest_1",
        emailNormalized: "invite@example.com",
        requiresVerifiedEmail: true,
      },
    ]);
    const provider = providerStub(new Set());
    provider.getVerifiedEmails = vi.fn(async () => {
      throw new ClerkVerifiedEmailProviderError(true, "provider_network");
    });

    await expect(runInvitationAcceptance(ctx, provider, configuration(), TOKEN)).resolves.toEqual({
      status: "unavailable",
      retryable: true,
    });
    expect(runMutation).toHaveBeenCalledTimes(1);
  });

  it("Clerk providerの一時失敗で永続状態を変えず、同じ招待を復旧後に受諾できる", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-04T12:00:00+09:00"));
    vi.stubEnv("ORGANIZATION_INVITATION_SIGNING_SECRET", SIGNING_SECRET);

    const t = convexTest(schema, modules);
    const manager = await t.run((ctx) =>
      seedOrganizationManagerShop(ctx, { subject: "provider_failure_owner", plan: "pro" }),
    );
    const invitationEmail = "provider-failure-target@example.com";
    const created = await t
      .withIdentity({ subject: "provider_failure_owner" })
      .mutation(api.organizationInvitation.mutations.issue, {
        shopId: manager.shopId,
        recipient: { kind: "external", invitedName: "Provider復旧対象", email: invitationEmail },
        requestId: "provider-failure-create",
      });
    const invitation = await t.run((ctx) => ctx.db.get(created.invitationId));
    if (!invitation) throw new Error("invitation not found");
    const token = await deriveInvitationToken({
      invitationId: invitation._id,
      version: invitation.version,
      signingSecret: SIGNING_SECRET,
    });
    const actorSubject = "provider_failure_target";
    const actorTokenIdentifier = `${ISSUER}|${actorSubject}`;
    const actor = t.withIdentity({
      subject: actorSubject,
      issuer: ISSUER,
      tokenIdentifier: actorTokenIdentifier,
      email: "different-login@example.com",
    });
    await expect(
      t.run(async (ctx) =>
        ctx.db
          .query("organizationPeople")
          .withIndex("by_organizationId_and_emailNormalized", (q) =>
            q.eq("organizationId", manager.organizationId).eq("emailNormalized", invitationEmail),
          )
          .collect(),
      ),
    ).resolves.toEqual([]);
    const beforeFailure = await invitationAcceptancePersistentState(t, invitation._id, manager.organizationId);
    const unavailableProvider = providerStub(new Set());
    unavailableProvider.getVerifiedEmails = vi.fn(async () => {
      throw new ClerkVerifiedEmailProviderError(true, "provider_network");
    });

    await expect(
      actor.action(async (ctx) => await runInvitationAcceptance(ctx, unavailableProvider, configuration(), token)),
    ).resolves.toEqual({ status: "unavailable", retryable: true });

    // prepareでのrate limit budget消費だけを許容し、招待と業務副作用は完全に不変とする。
    expect(await invitationAcceptancePersistentState(t, invitation._id, manager.organizationId)).toEqual(beforeFailure);

    await expect(
      actor.action(
        async (ctx) =>
          await runInvitationAcceptance(ctx, providerStub(new Set([invitationEmail])), configuration(), token),
      ),
    ).resolves.toEqual({
      status: "linked",
      organizationId: manager.organizationId,
      shopId: manager.shopId,
    });

    const accepted = await t.run(async (ctx) => {
      const user = await ctx.db
        .query("users")
        .withIndex("by_authTokenIdentifier", (q) => q.eq("authTokenIdentifier", actorTokenIdentifier))
        .unique();
      const people = user
        ? await ctx.db
            .query("organizationPeople")
            .withIndex("by_organizationId_and_userId", (q) =>
              q.eq("organizationId", manager.organizationId).eq("userId", user._id),
            )
            .collect()
        : [];
      const members = user
        ? await ctx.db
            .query("organizationMembers")
            .withIndex("by_userId_and_organizationId", (q) =>
              q.eq("userId", user._id).eq("organizationId", manager.organizationId),
            )
            .collect()
        : [];
      return {
        invitation: await ctx.db.get(invitation._id),
        user,
        people,
        members,
      };
    });
    expect(accepted.user).toMatchObject({ authTokenIdentifier: actorTokenIdentifier });
    expect(accepted.people).toHaveLength(1);
    expect(accepted.people[0]).toMatchObject({
      email: invitationEmail,
      emailNormalized: invitationEmail,
      status: "active",
    });
    expect(accepted.members).toHaveLength(1);
    expect(accepted.members[0]).toMatchObject({ personId: accepted.people[0]._id, status: "active" });
    expect(accepted.invitation).toMatchObject({
      status: "linked",
      linkedByPersonId: accepted.people[0]._id,
      reservedSeat: false,
      version: invitation.version + 1,
    });
  });

  it("連携済み人物はprovider照会なしでactorと招待にbindしたproofを確定へ渡す", async () => {
    const { ctx, runMutation } = acceptanceContext([
      {
        status: "ready",
        invitationId: "invitation_1",
        expectedVersion: 3,
        tokenDigest: "digest_1",
        emailNormalized: "contact@example.com",
        requiresVerifiedEmail: false,
      },
      { status: "linked", organizationId: "organization_1", shopId: "shop_1" },
    ]);
    const provider = providerStub(new Set());

    await expect(runInvitationAcceptance(ctx, provider, configuration(), TOKEN)).resolves.toEqual({
      status: "linked",
      organizationId: "organization_1",
      shopId: "shop_1",
    });
    expect(provider.assertReady).not.toHaveBeenCalled();
    expect(provider.getVerifiedEmails).not.toHaveBeenCalled();
    expect(runMutation).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.objectContaining({
        token: TOKEN,
        proof: {
          actorTokenIdentifier: `${ISSUER}|user_actor`,
          actorSubject: "user_actor",
          invitationId: "invitation_1",
          expectedVersion: 3,
          tokenDigest: "digest_1",
        },
      }),
    );
  });

  it("未連携招待はClerk serverで確認した招待先だけをproofへ含める", async () => {
    const { ctx, runMutation } = acceptanceContext([
      {
        status: "ready",
        invitationId: "invitation_1",
        expectedVersion: 1,
        tokenDigest: "digest_1",
        emailNormalized: "invite@example.com",
        requiresVerifiedEmail: true,
      },
      { status: "linked", organizationId: "organization_1" },
    ]);
    const provider = providerStub(new Set(["invite@example.com"]));

    await expect(runInvitationAcceptance(ctx, provider, configuration(), TOKEN)).resolves.toMatchObject({
      status: "linked",
    });
    expect(provider.getVerifiedEmails).toHaveBeenCalledWith("user_actor");
    expect(runMutation).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.objectContaining({
        proof: expect.objectContaining({ verifiedEmailNormalized: "invite@example.com" }),
      }),
    );
  });

  it("同じtokenを二actorが実並行で受諾しても一人だけを連携し、副作用を一組だけ作る", async () => {
    const fixture = await seedAcceptanceFixture("parallel_token");
    const barrier = deferred<void>();
    const providerInvoked = deferred<void>();
    const firstProvider = providerStub(new Set([fixture.email]));
    firstProvider.getVerifiedEmails = vi.fn(async () => {
      providerInvoked.resolve();
      await barrier.promise;
      return new Set([fixture.email]);
    });
    const firstActor = invitationActor(fixture.t, "parallel_token_first", "parallel-first@example.com");
    const secondActor = invitationActor(fixture.t, "parallel_token_second", "parallel-second@example.com");

    const firstAcceptance = firstActor.action(
      async (ctx) => await runInvitationAcceptance(ctx, firstProvider, configuration(), fixture.token),
    );
    await providerInvoked.promise;
    const secondAcceptance = await secondActor.action(
      async (ctx) =>
        await runInvitationAcceptance(ctx, providerStub(new Set([fixture.email])), configuration(), fixture.token),
    );
    barrier.resolve();
    const firstResult = await firstAcceptance;

    expect([firstResult.status, secondAcceptance.status].sort()).toEqual(["conflict", "linked"]);
    const winnerSubject = firstResult.status === "linked" ? "parallel_token_first" : "parallel_token_second";
    const state = await invitationAcceptancePersistentState(
      fixture.t,
      fixture.invitation._id,
      fixture.manager.organizationId,
    );
    const targetPeople = state.people.filter((person) => person.emailNormalized === fixture.email);
    const targetMembers = targetPeople.flatMap((person) =>
      state.members.filter((member) => member.personId === person._id),
    );
    expect(targetPeople).toHaveLength(1);
    expect(targetPeople[0]?.userId).toBeDefined();
    const winnerUser = state.users.find((user) => user.authTokenIdentifier === `${ISSUER}|${winnerSubject}`);
    expect(winnerUser).toBeDefined();
    expect(
      state.users
        .map((user) => user.authTokenIdentifier)
        .filter((identifier) =>
          [`${ISSUER}|parallel_token_first`, `${ISSUER}|parallel_token_second`].includes(identifier),
        ),
    ).toEqual([`${ISSUER}|${winnerSubject}`]);
    expect(targetPeople[0]?.userId).toBe(winnerUser?._id);
    expect(targetMembers).toHaveLength(1);
    expect(targetMembers[0]).toMatchObject({ userId: winnerUser?._id, status: "active" });
    expect(state.invitation).toMatchObject({
      status: "linked",
      linkedByPersonId: targetPeople[0]?._id,
      reservedSeat: false,
      version: fixture.invitation.version + 1,
    });
    expect(
      state.audits
        .filter((audit) => audit.action === "organization.manager_invitation_linked")
        .map((audit) => ({
          actorUserId: audit.actorUserId,
          targetId: audit.targetId,
        })),
    ).toEqual([{ actorUserId: winnerUser?._id, targetId: fixture.invitation._id }]);
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

  it.each(["resend", "revoke"] as const)(
    "prepare後に%sされた古いtokenはconflictになり、人物・所属・受諾通知を作らない",
    async (operation) => {
      const fixture = await seedAcceptanceFixture(`accept_${operation}`);
      const barrier = deferred<void>();
      const providerInvoked = deferred<void>();
      const provider = providerStub(new Set([fixture.email]));
      provider.getVerifiedEmails = vi.fn(async () => {
        providerInvoked.resolve();
        await barrier.promise;
        return new Set([fixture.email]);
      });
      const targetActor = invitationActor(
        fixture.t,
        `accept_${operation}_target`,
        `different-${operation}@example.com`,
      );
      const acceptance = targetActor.action(
        async (ctx) => await runInvitationAcceptance(ctx, provider, configuration(), fixture.token),
      );
      await providerInvoked.promise;

      if (operation === "resend") {
        await fixture.owner.mutation(api.organizationInvitation.mutations.resend, {
          shopId: fixture.manager.shopId,
          invitationId: fixture.invitation._id,
          requestId: `accept-${operation}-rotate`,
        });
      } else {
        await fixture.owner.mutation(api.organizationInvitation.mutations.revoke, {
          shopId: fixture.manager.shopId,
          invitationId: fixture.invitation._id,
          requestId: `accept-${operation}-revoke`,
        });
      }
      const beforeFinalize = await invitationAcceptancePersistentState(
        fixture.t,
        fixture.invitation._id,
        fixture.manager.organizationId,
      );
      barrier.resolve();

      await expect(acceptance).resolves.toEqual({ status: "conflict" });
      expect(
        await invitationAcceptancePersistentState(fixture.t, fixture.invitation._id, fixture.manager.organizationId),
      ).toEqual(beforeFinalize);
      const targetPeople = beforeFinalize.people.filter((person) => person.emailNormalized === fixture.email);
      expect(targetPeople).toEqual([]);
      expect(
        beforeFinalize.scheduled.filter(
          (job) => job.name === "organizationInvitation/actions:enqueueAcceptanceNotifications",
        ),
      ).toEqual([]);
      expect(beforeFinalize.invitation).toMatchObject({ status: "revoked", reservedSeat: false });
      if (operation === "resend") {
        const issuedSuccessors = beforeFinalize.invitations.filter(
          (invitation) =>
            invitation.predecessorInvitationId === fixture.invitation._id && invitation.status === "issued",
        );
        expect(issuedSuccessors).toHaveLength(1);
      }
    },
  );
});

function acceptanceContext(results: unknown[]) {
  const runMutation = vi.fn();
  for (const result of results) runMutation.mockResolvedValueOnce(result);
  const ctx = {
    auth: {
      getUserIdentity: vi.fn(async () => ({
        subject: "user_actor",
        issuer: ISSUER,
        tokenIdentifier: `${ISSUER}|user_actor`,
      })),
    },
    runMutation,
  } as unknown as Parameters<typeof runInvitationAcceptance>[0];
  return { ctx, runMutation };
}

function providerStub(verifiedEmails: ReadonlySet<string>) {
  return {
    assertReady: vi.fn(async () => undefined),
    getVerifiedEmails: vi.fn(async () => verifiedEmails),
  };
}

function configuration() {
  return {
    appOrigin: "https://app.example.com",
    secretKey: "sk_test_example",
    publishableKey: "pk_test_example",
    expectedIssuer: ISSUER,
  };
}

async function seedAcceptanceFixture(caseKey: string) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-04T12:00:00+09:00"));
  vi.stubEnv("ORGANIZATION_INVITATION_SIGNING_SECRET", SIGNING_SECRET);
  const t = convexTest(schema, modules);
  const manager = await t.run((ctx) => seedOrganizationManagerShop(ctx, { subject: `${caseKey}_owner`, plan: "pro" }));
  const email = `${caseKey.replaceAll("_", "-")}-target@example.com`;
  const owner = t.withIdentity({ subject: `${caseKey}_owner` });
  const issued = await owner.mutation(api.organizationInvitation.mutations.issue, {
    shopId: manager.shopId,
    recipient: { kind: "external", invitedName: "受諾競合対象", email },
    requestId: `${caseKey}-issue`,
  });
  const invitation = await t.run((ctx) => ctx.db.get(issued.invitationId));
  if (!invitation) throw new Error("invitation not found");
  const token = await deriveInvitationToken({
    invitationId: invitation._id,
    version: invitation.version,
    signingSecret: SIGNING_SECRET,
  });
  return { t, manager, owner, email, invitation, token };
}

function invitationActor(t: TestConvex<typeof schema>, subject: string, email: string) {
  return t.withIdentity({
    subject,
    issuer: ISSUER,
    tokenIdentifier: `${ISSUER}|${subject}`,
    email,
  });
}

function deferred<T>(): Deferred<T> {
  let resolve!: Deferred<T>["resolve"];
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

async function invitationAcceptancePersistentState(
  t: TestConvex<typeof schema>,
  invitationId: Id<"organizationInvitations">,
  organizationId: Id<"organizations">,
) {
  return await t.run(async (ctx) => ({
    invitation: await ctx.db.get(invitationId),
    invitations: await ctx.db
      .query("organizationInvitations")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .collect(),
    users: await ctx.db.query("users").collect(),
    people: await ctx.db
      .query("organizationPeople")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .collect(),
    members: await ctx.db
      .query("organizationMembers")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .collect(),
    audits: await ctx.db
      .query("organizationAuditEvents")
      .withIndex("by_organizationId_and_occurredAt", (q) => q.eq("organizationId", organizationId))
      .collect(),
    outbox: await ctx.db.query("notificationOutbox").collect(),
    scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
  }));
}
