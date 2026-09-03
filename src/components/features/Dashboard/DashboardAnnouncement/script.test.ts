import { describe, expect, it } from "vitest";
import { selectDashboardAnnouncementsForContext } from "./script";

type Announcement = {
  key: string;
  organizationId?: string;
  shopId?: string;
  organizationPlan?: string;
};

const globalAnnouncement: Announcement = { key: "global" };
const currentContext = {
  organizationId: "organization-current",
  shopId: "shop-current",
  organizationPlan: "standard" as const,
};

describe("selectDashboardAnnouncementsForContext", () => {
  it("queryの読み込み中はお知らせを選ばない", () => {
    expect(selectDashboardAnnouncementsForContext(undefined, currentContext)).toEqual([]);
  });

  it("店舗未選択でも全体向けのお知らせをすべて選ぶ", () => {
    const olderGlobalAnnouncement: Announcement = { key: "global-older" };

    expect(
      selectDashboardAnnouncementsForContext(
        [
          globalAnnouncement,
          { key: "organization", organizationId: currentContext.organizationId },
          olderGlobalAnnouncement,
        ],
        null,
      ),
    ).toEqual([globalAnnouncement, olderGlobalAnnouncement]);
  });

  it.each([
    {
      target: { organizationId: `organization-other, ${currentContext.organizationId}` },
      label: "カンマ区切りの事業者",
    },
    {
      target: { shopId: `shop-other, ${currentContext.shopId},` },
      label: "カンマ区切りの店舗",
    },
    {
      target: { organizationPlan: `free, ${currentContext.organizationPlan}` },
      label: "カンマ区切りの契約プラン",
    },
    {
      target: {
        organizationId: "organization-other",
        shopId: "shop-other",
        organizationPlan: currentContext.organizationPlan,
      },
      label: "契約プランまたはIDの片方",
    },
    {
      target: { organizationId: currentContext.organizationId, shopId: "shop-other" },
      label: "事業者または店舗の片方",
    },
    {
      target: { organizationId: "organization-other", shopId: currentContext.shopId },
      label: "店舗または事業者の片方",
    },
  ])("$labelが現在の選択先と一致するお知らせを選ぶ", ({ target }) => {
    const targetedAnnouncement: Announcement = { key: "targeted", ...target };
    const announcements: Announcement[] = [
      { key: "other", organizationId: "organization-other", shopId: "shop-other" },
      targetedAnnouncement,
      globalAnnouncement,
    ];

    expect(selectDashboardAnnouncementsForContext(announcements, currentContext)).toEqual([
      targetedAnnouncement,
      globalAnnouncement,
    ]);
  });

  it("空白と空要素を無視して対象値を完全一致で判定する", () => {
    const announcements: Announcement[] = [
      { key: "substring", shopId: `${currentContext.shopId}-other` },
      { key: "plan-substring", organizationPlan: `${currentContext.organizationPlan}-plus` },
      { key: "empty", organizationId: " , , ", shopId: "", organizationPlan: " , " },
      { key: "matched", shopId: ` , ${currentContext.shopId}, , ` },
    ];

    expect(selectDashboardAnnouncementsForContext(announcements, currentContext).map(({ key }) => key)).toEqual([
      "matched",
    ]);
  });

  it("対象が一致しないお知らせを除外して全体向けを選ぶ", () => {
    const announcements: Announcement[] = [
      { key: "other", organizationId: "organization-other", shopId: "shop-other" },
      { key: "other-plan", organizationPlan: "trial" },
      globalAnnouncement,
    ];

    expect(selectDashboardAnnouncementsForContext(announcements, currentContext)).toEqual([globalAnnouncement]);
  });

  it("全体向けと現在の組織・店舗・契約プラン向けを候補順のまますべて選ぶ", () => {
    const announcements: Announcement[] = [
      globalAnnouncement,
      { key: "organization", organizationId: currentContext.organizationId },
      { key: "other", organizationId: "organization-other" },
      { key: "shop", shopId: currentContext.shopId },
      { key: "plan", organizationPlan: currentContext.organizationPlan },
      { key: "global-older" },
    ];

    expect(selectDashboardAnnouncementsForContext(announcements, currentContext).map(({ key }) => key)).toEqual([
      "global",
      "organization",
      "shop",
      "plan",
      "global-older",
    ]);
  });

  it("店舗未選択では対象指定のあるお知らせを表示しない", () => {
    const announcements: Announcement[] = [
      { key: "organization", organizationId: currentContext.organizationId },
      { key: "shop", shopId: currentContext.shopId },
      { key: "plan", organizationPlan: currentContext.organizationPlan },
      { key: "empty", organizationId: " , ", organizationPlan: "" },
    ];

    expect(selectDashboardAnnouncementsForContext(announcements, null)).toEqual([]);
  });

  it("有効な契約プランがない事業者ではプラン指定のお知らせを表示しない", () => {
    const announcements: Announcement[] = [
      { key: "plan", organizationPlan: currentContext.organizationPlan },
      globalAnnouncement,
    ];
    const contextWithoutPlan = { ...currentContext, organizationPlan: null };

    expect(selectDashboardAnnouncementsForContext(announcements, contextWithoutPlan)).toEqual([globalAnnouncement]);
  });
});
