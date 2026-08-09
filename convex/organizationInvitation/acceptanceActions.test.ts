import { convexTest, type TestConvex } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
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
    vi.stubEnv("FEATURE_MANAGER_INVITATION", "enabled");

    const t = convexTest(schema, modules);
    const manager = await t.run((ctx) =>
      seedOrganizationManagerShop(ctx, { subject: "provider_failure_owner", plan: "pro" }),
    );
    const invitationEmail = "provider-failure-target@example.com";
    const created = await t
      .withIdentity({ subject: "provider_failure_owner" })
      .mutation(api.organizationInvitation.mutations.createExternal, {
        shopId: manager.shopId,
        name: "Provider復旧対象",
        email: invitationEmail,
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

async function invitationAcceptancePersistentState(
  t: TestConvex<typeof schema>,
  invitationId: Id<"organizationInvitations">,
  organizationId: Id<"organizations">,
) {
  return await t.run(async (ctx) => ({
    invitation: await ctx.db.get(invitationId),
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
