import { ConvexError } from "convex/values";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SCENARIO_NOW } from "../_test/scenarioBuilders";
import { createScenario } from "../_test/scenarioFixtures";
import { modules, schema } from "../_test/setup.test-helper";

const MANAGER_SUBJECT = "scenario_organization_creation";
const FIRST_SHOP_NAME = "一つ目の店舗";
const SECOND_SHOP_NAME = "二つ目の店舗";

describe("グループ追加作成シナリオ", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(SCENARIO_NOW);
    // ダークローンチ中は既定で閉じている。このシナリオは公開済みの契約を検証する。
    vi.stubEnv("FEATURE_ORGANIZATION_CREATION", "enabled");
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("二つ目のグループはFreeで始まり、既存グループの権限とデータへ混入しない", async () => {
    const t = convexTest(schema, modules);
    const scenario = createScenario(t);
    const asManager = scenario.manager({
      subject: MANAGER_SUBJECT,
      name: "山田 太郎",
      email: "manager@example.com",
    });

    // Arrange: 初回セットアップで支払い不要Businessのグループを持つ管理者を作る。
    const firstShopId = await asManager.setupShopAndManager({
      shopName: FIRST_SHOP_NAME,
      submissionPattern: { kind: "dateOnly" },
      managerName: "山田 太郎",
      managerEmail: "manager@example.com",
      acceptedLegal: true,
    });
    await asManager.addStaffs([{ name: "一つ目のスタッフ", email: "first-staff@example.com" }]);

    // Act: グループ設定から二つ目のグループを作る。
    const created = await asManager.createOrganization({
      shopName: SECOND_SHOP_NAME,
      submissionPattern: { kind: "dateOnly" },
    });
    expect(created.created).toBe(true);

    // Assert: 両グループが選択候補に並び、それぞれのプランを保つ。
    const myShops = await asManager.getMyShops();
    expect(myShops).toHaveLength(2);
    expect(myShops).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          shopId: firstShopId,
          shopName: FIRST_SHOP_NAME,
          organizationPlan: "business",
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

    // Assert: 二つ目のグループには自分だけが居て、一つ目のスタッフを引き継がない。
    asManager.selectShop(created.shopId);
    const secondSettings = await asManager.getOrganizationSettings();
    expect(secondSettings?.organizationName).toBe(SECOND_SHOP_NAME);
    expect(secondSettings?.people).toEqual([
      expect.objectContaining({ name: "山田 太郎", email: "manager@example.com", managerRole: "active" }),
    ]);
    expect(secondSettings?.shops).toEqual([expect.objectContaining({ name: SECOND_SHOP_NAME })]);
    expect(secondSettings?.billing.currentPlan).toBe("free");
    expect(secondSettings?.billing.isComplimentary).toBe(false);

    // Assert: Freeの上限がそのまま効き、店舗追加も管理者招待もできない。
    expect(secondSettings?.canAddShop).toBe(false);
    expect(secondSettings?.addShopDisabledReason).toBe("無料では店舗を追加できません。有料プランを選択してください。");
    expect(secondSettings?.billing.peopleUsage).toMatchObject({ current: 1, max: 5 });
    expect(secondSettings?.billing.shopUsage).toMatchObject({ current: 1, max: 1 });
    expect(secondSettings?.billing.managerUsage).toMatchObject({ current: 1, max: 1 });
    await expect(asManager.addShop({ shopName: "Freeでは追加できない店舗" })).rejects.toThrow(ConvexError);

    // Assert: 一つ目のグループの権限とスタッフは変わらない。
    asManager.selectShop(firstShopId);
    const firstSettings = await asManager.getOrganizationSettings();
    expect(firstSettings?.organizationName).toBe(FIRST_SHOP_NAME);
    expect(firstSettings?.billing.currentPlan).toBe("business");
    expect(firstSettings?.billing.isComplimentary).toBe(true);
    expect(firstSettings?.canAddShop).toBe(true);
    expect(firstSettings?.people.map((person) => person.email).sort()).toEqual([
      "first-staff@example.com",
      "manager@example.com",
    ]);
    expect(firstSettings?.shops).toEqual([expect.objectContaining({ name: FIRST_SHOP_NAME })]);

    // Assert: 二つ目を作った後も、上限まではさらに作成できる。
    expect(firstSettings?.canCreateOrganization).toBe(true);
  });

  it("上限まで作成すると、どのグループの設定でも作成不可と理由を返す", async () => {
    const t = convexTest(schema, modules);
    const scenario = createScenario(t);
    const asManager = scenario.manager({
      subject: `${MANAGER_SUBJECT}_limit`,
      name: "山田 太郎",
      email: "limit@example.com",
    });

    const firstShopId = await asManager.setupShopAndManager({
      shopName: FIRST_SHOP_NAME,
      submissionPattern: { kind: "dateOnly" },
      managerName: "山田 太郎",
      managerEmail: "limit@example.com",
      acceptedLegal: true,
    });
    // rate limitは分単位のため、作成のたびに時計を進めて上限判定だけを確かめる。
    await asManager.createOrganization({ shopName: SECOND_SHOP_NAME, submissionPattern: { kind: "dateOnly" } });
    vi.setSystemTime(SCENARIO_NOW + 60_000);
    const third = await asManager.createOrganization({
      shopName: "三つ目の店舗",
      submissionPattern: { kind: "dateOnly" },
    });
    vi.setSystemTime(SCENARIO_NOW + 120_000);

    await expect(
      asManager.createOrganization({ shopName: "四つ目の店舗", submissionPattern: { kind: "dateOnly" } }),
    ).rejects.toThrow("作成できるグループは3つまでです。");

    asManager.selectShop(firstShopId);
    const firstSettings = await asManager.getOrganizationSettings();
    expect(firstSettings?.canCreateOrganization).toBe(false);
    expect(firstSettings?.createOrganizationDisabledReason).toBe(
      "作成できるグループは3つまでです。使っていないグループを削除すると、また作成できます。",
    );

    asManager.selectShop(third.shopId);
    const thirdSettings = await asManager.getOrganizationSettings();
    expect(thirdSettings?.canCreateOrganization).toBe(false);

    const myShops = await asManager.getMyShops();
    expect(myShops).toHaveLength(3);
  });
});
