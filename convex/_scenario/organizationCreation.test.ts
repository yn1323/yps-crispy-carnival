import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "../_generated/dataModel";
import { SCENARIO_NOW, scenarioDate } from "../_test/scenarioBuilders";
import { createScenario } from "../_test/scenarioFixtures";
import { modules, schema } from "../_test/setup.test-helper";
import { deriveInvitationToken } from "../organizationInvitation/token";

const MANAGER_SUBJECT = "scenario_organization_creation";
const FIRST_SHOP_NAME = "一つ目の店舗";
const SECOND_SHOP_NAME = "二つ目の店舗";
const SIGNING_SECRET = "test-only-organization-invitation-secret-123456";

describe("組織追加作成シナリオ", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(SCENARIO_NOW);
    vi.stubEnv("ORGANIZATION_INVITATION_SIGNING_SECRET", SIGNING_SECRET);
    vi.stubEnv("CONVEX_CLOUD_URL", "");
    vi.stubEnv("DEBUG_TRIAL_DURATION_DEPLOYMENT_URL", "");
    vi.stubEnv("DEBUG_TRIAL_DURATION_DAYS", "");
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("初回はTrial、追加組織は独立Freeで始まり、互いの権限とデータへ混入しない", async () => {
    const t = convexTest(schema, modules);
    const scenario = createScenario(t);
    const asManager = scenario.manager({
      subject: MANAGER_SUBJECT,
      name: "山田 太郎",
      email: "manager@example.com",
    });

    // Arrange: 初回セットアップでTrialの組織を持つ管理者を作る。
    const firstShopId = await asManager.setupShopAndManager({
      shopName: FIRST_SHOP_NAME,
      submissionPattern: { kind: "dateOnly" },
      managerName: "山田 太郎",
      managerEmail: "manager@example.com",
      acceptedLegal: true,
    });
    await asManager.addStaffs([{ name: "一つ目のスタッフ", email: "first-staff@example.com" }]);
    const firstRecruitmentId = await asManager.createRecruitment({
      periodStart: scenarioDate(7),
      periodEnd: scenarioDate(13),
      deadline: scenarioDate(3),
    });

    // Act: 組織設定から二つ目の組織を作る。
    const created = await asManager.createOrganization({
      shopName: SECOND_SHOP_NAME,
      submissionPattern: { kind: "dateOnly" },
    });
    expect(created.created).toBe(true);

    // Assert: 両組織が選択候補に並び、それぞれのプランを保つ。
    const myShops = await asManager.getMyShops();
    expect(myShops).toHaveLength(2);
    expect(myShops).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          shopId: firstShopId,
          shopName: FIRST_SHOP_NAME,
          organizationPlan: "trial",
          memberStatus: "active",
        }),
        expect.objectContaining({
          shopId: created.shopId,
          shopName: SECOND_SHOP_NAME,
          organizationPlan: "free",
          memberStatus: "active",
        }),
      ]),
    );
    const firstOrganizationId = myShops.find((shop) => shop.shopId === firstShopId)?.organizationId;
    const secondOrganizationId = myShops.find((shop) => shop.shopId === created.shopId)?.organizationId;
    expect(firstOrganizationId).not.toBe(secondOrganizationId);

    // Assert: 二つ目の組織には自分だけが居て、一つ目のスタッフを引き継がない。
    asManager.selectShop(created.shopId);
    const secondSettings = await asManager.getOrganizationSettings();
    expect(secondSettings?.organizationName).toBe(`${SECOND_SHOP_NAME}グループ`);
    expect(secondSettings?.people).toEqual([
      expect.objectContaining({ name: "山田 太郎", email: "manager@example.com", managerRole: "active" }),
    ]);
    expect(secondSettings?.shops).toEqual([expect.objectContaining({ name: SECOND_SHOP_NAME })]);
    expect(secondSettings?.billing.currentPlan).toBe("free");
    expect(secondSettings?.billing.isComplimentary).toBe(false);

    // Assert: FreeはFree枠のentitlementを持つ。
    expect(secondSettings?.canAddShop).toBe(false);
    expect(secondSettings?.billing.peopleUsage).toMatchObject({ current: 1, max: 5 });
    expect(secondSettings?.billing.shopUsage).toMatchObject({ current: 1, max: 1 });
    expect(secondSettings?.billing.managerUsage).toMatchObject({ current: 1, max: 2 });

    // Assert: 一つ目の店舗にある募集は、新しい組織の初期データへ複製しない。
    const recruitmentsByShop = await t.run(async (ctx) => ({
      first: await ctx.db
        .query("recruitments")
        .withIndex("by_shopId", (q) => q.eq("shopId", firstShopId))
        .collect(),
      second: await ctx.db
        .query("recruitments")
        .withIndex("by_shopId", (q) => q.eq("shopId", created.shopId))
        .collect(),
    }));
    expect(recruitmentsByShop.first.map((recruitment) => recruitment._id)).toEqual([firstRecruitmentId]);
    expect(recruitmentsByShop.second).toEqual([]);

    // Assert: 一つ目の組織の権限とスタッフは変わらない。
    asManager.selectShop(firstShopId);
    const firstSettings = await asManager.getOrganizationSettings();
    expect(firstSettings?.organizationName).toBe(`${FIRST_SHOP_NAME}グループ`);
    expect(firstSettings?.billing.currentPlan).toBe("trial");
    expect(firstSettings?.billing.isComplimentary).toBe(false);
    expect(firstSettings?.canAddShop).toBe(true);
    expect(firstSettings?.people.map((person) => person.email).sort()).toEqual([
      "first-staff@example.com",
      "manager@example.com",
    ]);
    expect(firstSettings?.shops).toEqual([expect.objectContaining({ name: FIRST_SHOP_NAME })]);

    // Assert: 二つ目を作った後も、上限まではさらに作成できる。
    expect(firstSettings?.canCreateOrganization).toBe(true);
  });

  it("招待所属を上限に数えず自己作成3組織まで許可し、4件目だけ拒否する", async () => {
    const t = convexTest(schema, modules);
    const scenario = createScenario(t);
    const asManager = scenario.manager({
      subject: `${MANAGER_SUBJECT}_limit`,
      name: "山田 太郎",
      email: "limit@example.com",
    });
    const inviter = scenario.manager({
      subject: `${MANAGER_SUBJECT}_inviter`,
      name: "招待元管理者",
      email: "inviter@example.com",
    });

    const firstShopId = await asManager.setupShopAndManager({
      shopName: FIRST_SHOP_NAME,
      submissionPattern: { kind: "dateOnly" },
      managerName: "山田 太郎",
      managerEmail: "limit@example.com",
      acceptedLegal: true,
    });
    const invitedShopId = await inviter.setupShopAndManager({
      shopName: "招待元店舗",
      submissionPattern: { kind: "dateOnly" },
      managerName: "招待元管理者",
      managerEmail: "inviter@example.com",
      acceptedLegal: true,
    });

    // 招待所属を先に作る。これを自己作成数へ誤算入する実装は、後続の三つ目作成で失敗する。
    const issued = await inviter.issueExternalManagerInvitation({
      invitedName: "山田 太郎",
      email: "limit@example.com",
    });
    expect(issued.status).toBe("issued");
    const invitation = await t.run((ctx) => ctx.db.get(issued.invitationId));
    if (!invitation) throw new Error("organization invitation not found");
    const token = await deriveInvitationToken({
      invitationId: invitation._id,
      version: invitation.version,
      signingSecret: SIGNING_SECRET,
    });
    const accepted = await asManager.acceptManagerInvitation(token, new Set(["limit@example.com"]));
    expect(accepted).toEqual({
      status: "linked",
      organizationId: invitation.organizationId,
      shopId: invitedShopId,
    });

    // rate limitは分単位のため、作成のたびに時計を進めて自己作成上限だけを確かめる。
    const second = await asManager.createOrganization({
      shopName: SECOND_SHOP_NAME,
      submissionPattern: { kind: "dateOnly" },
    });
    vi.setSystemTime(SCENARIO_NOW + 60_000);
    const third = await asManager.createOrganization({
      shopName: "三つ目の店舗",
      submissionPattern: { kind: "dateOnly" },
    });
    vi.setSystemTime(SCENARIO_NOW + 120_000);

    const organizationIds = await t.run(async (ctx) => {
      const resolveOrganizationId = async (shopId: Id<"shops">) => {
        const shop = await ctx.db.get(shopId);
        if (!shop?.organizationId) throw new Error("organization not found");
        return shop.organizationId;
      };
      return {
        first: await resolveOrganizationId(firstShopId),
        second: await resolveOrganizationId(second.shopId),
        third: await resolveOrganizationId(third.shopId),
      };
    });
    const beforeRejected = await asManager.getMyShops();
    const sortByShopId = <T extends { shopId: string }>(shops: readonly T[]) =>
      [...shops].sort((left, right) => left.shopId.localeCompare(right.shopId));
    expect(sortByShopId(beforeRejected)).toEqual(
      sortByShopId([
        {
          shopId: firstShopId,
          shopName: FIRST_SHOP_NAME,
          shopStatus: "active",
          organizationId: organizationIds.first,
          organizationName: `${FIRST_SHOP_NAME}グループ`,
          organizationPlan: "trial",
          memberStatus: "active",
        },
        {
          shopId: invitedShopId,
          shopName: "招待元店舗",
          shopStatus: "active",
          organizationId: invitation.organizationId,
          organizationName: "招待元店舗グループ",
          organizationPlan: "trial",
          memberStatus: "active",
        },
        {
          shopId: second.shopId,
          shopName: SECOND_SHOP_NAME,
          shopStatus: "active",
          organizationId: organizationIds.second,
          organizationName: `${SECOND_SHOP_NAME}グループ`,
          organizationPlan: "free",
          memberStatus: "active",
        },
        {
          shopId: third.shopId,
          shopName: "三つ目の店舗",
          shopStatus: "active",
          organizationId: organizationIds.third,
          organizationName: "三つ目の店舗グループ",
          organizationPlan: "free",
          memberStatus: "active",
        },
      ]),
    );

    await expect(
      asManager.createOrganization({ shopName: "四つ目の店舗", submissionPattern: { kind: "dateOnly" } }),
    ).rejects.toThrow("作成できる組織は3つまでです");
    expect(await asManager.getMyShops()).toEqual(beforeRejected);

    asManager.selectShop(firstShopId);
    const firstSettings = await asManager.getOrganizationSettings();
    expect(firstSettings?.canCreateOrganization).toBe(false);
    expect(firstSettings?.createOrganizationDisabledReason).toBe("作成できる組織は3つまでです");

    asManager.selectShop(third.shopId);
    const thirdSettings = await asManager.getOrganizationSettings();
    expect(thirdSettings?.canCreateOrganization).toBe(false);

    // 実際の組織削除受付で自己作成枠を空ければ、cleanup完了を待たずに別組織を作成できる。
    await expect(asManager.deleteOrganization()).resolves.toEqual({
      organizationId: organizationIds.third,
      changed: true,
      accepted: true,
    });
    vi.setSystemTime(SCENARIO_NOW + 180_000);
    asManager.selectShop(firstShopId);
    const replacement = await asManager.createOrganization({
      shopName: "入れ替え後の店舗",
      submissionPattern: { kind: "dateOnly" },
    });
    expect(replacement.created).toBe(true);

    const afterReplacement = await asManager.getMyShops();
    expect(afterReplacement.map((shop) => shop.shopId).sort()).toEqual(
      [firstShopId, invitedShopId, second.shopId, replacement.shopId].sort(),
    );
    expect(afterReplacement.map((shop) => shop.shopId)).not.toContain(third.shopId);
  });
});
