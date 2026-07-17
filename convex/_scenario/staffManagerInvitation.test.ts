import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SCENARIO_NOW } from "../_test/scenarioBuilders";
import { createScenario } from "../_test/scenarioFixtures";
import { seedOrganizationManagerShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { deriveInvitationToken } from "../organizationInvitation/token";

const SIGNING_SECRET = "test-only-organization-invitation-secret-123456";

describe("既存スタッフの管理者招待シナリオ", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(SCENARIO_NOW);
    vi.stubEnv("ORGANIZATION_INVITATION_SIGNING_SECRET", SIGNING_SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("スタッフ詳細から招待した本人がログインすると同じ人物とスタッフのまま管理者になる", async () => {
    const t = convexTest(schema, modules);
    const scenario = createScenario(t);
    const owner = scenario.manager({ subject: "staff_invitation_owner", email: "owner@example.com" });
    const target = scenario.manager({
      subject: "staff_invitation_target",
      name: "招待対象スタッフ",
      email: "target@example.com",
      emailVerified: true,
    });

    const seeded = await t.run((ctx) =>
      seedOrganizationManagerShop(ctx, {
        subject: "staff_invitation_owner",
        email: "owner@example.com",
        shopName: "管理者招待テスト店舗",
        plan: "pro",
      }),
    );
    const [staffId] = await owner.addStaffs([{ name: "招待対象スタッフ", email: "target@example.com" }]);
    const before = await t.run(async (ctx) => {
      const staff = await ctx.db.get(staffId);
      if (!staff?.organizationPersonId) throw new Error("組織に紐づくスタッフが作成されていません");
      return {
        staff,
        person: await ctx.db.get(staff.organizationPersonId),
      };
    });
    if (!before.person) throw new Error("招待対象の人物が見つかりません");
    const personId = before.person._id;

    const created = await owner.inviteStaffAsManager(staffId);
    expect(created.status).toBe("created");
    const invitation = await t.run((ctx) => ctx.db.get(created.invitationId));
    if (!invitation) throw new Error("管理者招待が見つかりません");
    expect(invitation).toMatchObject({
      organizationId: seeded.organizationId,
      targetPersonId: personId,
      status: "issued",
      purpose: "managerAddition",
    });

    const token = await deriveInvitationToken({
      invitationId: invitation._id,
      version: invitation.version,
      signingSecret: SIGNING_SECRET,
    });
    await expect(target.linkManagerInvitationAccount(token)).resolves.toEqual({
      status: "linked",
      organizationId: seeded.organizationId,
      shopId: seeded.shopId,
    });

    const state = await t.run(async (ctx) => {
      const staff = await ctx.db.get(staffId);
      const people = await ctx.db
        .query("organizationPeople")
        .withIndex("by_organizationId_and_emailNormalized", (q) =>
          q.eq("organizationId", seeded.organizationId).eq("emailNormalized", "target@example.com"),
        )
        .collect();
      const members = await ctx.db
        .query("organizationMembers")
        .withIndex("by_organizationId_and_personId", (q) =>
          q.eq("organizationId", seeded.organizationId).eq("personId", personId),
        )
        .collect();
      return { staff, people, members };
    });
    expect(state.staff).toEqual(before.staff);
    expect(state.people).toHaveLength(1);
    expect(state.people[0]).toMatchObject({
      _id: personId,
      organizationId: seeded.organizationId,
      emailNormalized: "target@example.com",
      status: "active",
    });
    expect(state.people[0]?.userId).toBeDefined();
    expect(state.members).toHaveLength(1);
    expect(state.members[0]).toMatchObject({
      personId: before.person._id,
      userId: state.people[0]?.userId,
      status: "active",
    });

    const dashboardStaffs = await owner.getDashboardStaffs();
    expect(dashboardStaffs.page.find((staff) => staff._id === staffId)).toMatchObject({
      _id: staffId,
      isManager: true,
      isOrganizationLinked: true,
    });
  });
});
