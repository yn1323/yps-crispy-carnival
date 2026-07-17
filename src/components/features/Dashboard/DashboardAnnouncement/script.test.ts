import { describe, expect, it } from "vitest";
import { selectDashboardAnnouncementForContext } from "./script";

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
  organizationPlan: "business" as const,
};

describe("selectDashboardAnnouncementForContext", () => {
  it("queryの読み込み中はお知らせを選ばない", () => {
    expect(selectDashboardAnnouncementForContext(undefined, currentContext)).toBeNull();
  });

  it("店舗未選択でも全体向けのお知らせを選ぶ", () => {
    expect(selectDashboardAnnouncementForContext([globalAnnouncement], null)).toBe(globalAnnouncement);
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
      target: { organizationPlan: `pro, ${currentContext.organizationPlan}` },
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
  ])("$labelが現在の選択先と一致する最新のお知らせを選ぶ", ({ target }) => {
    const targetedAnnouncement: Announcement = { key: "targeted", ...target };
    const announcements: Announcement[] = [
      { key: "other", organizationId: "organization-other", shopId: "shop-other" },
      targetedAnnouncement,
      globalAnnouncement,
    ];

    expect(selectDashboardAnnouncementForContext(announcements, currentContext)).toBe(targetedAnnouncement);
  });

  it("空白と空要素を無視して対象値を完全一致で判定する", () => {
    const announcements: Announcement[] = [
      { key: "substring", shopId: `${currentContext.shopId}-other` },
      { key: "plan-substring", organizationPlan: `${currentContext.organizationPlan}-plus` },
      { key: "empty", organizationId: " , , ", shopId: "", organizationPlan: " , " },
      { key: "matched", shopId: ` , ${currentContext.shopId}, , ` },
    ];

    expect(selectDashboardAnnouncementForContext(announcements, currentContext)?.key).toBe("matched");
  });

  it("対象が一致しなければ次の全体向けお知らせを選ぶ", () => {
    const announcements: Announcement[] = [
      { key: "other", organizationId: "organization-other", shopId: "shop-other" },
      { key: "other-plan", organizationPlan: "pro" },
      globalAnnouncement,
    ];

    expect(selectDashboardAnnouncementForContext(announcements, currentContext)).toBe(globalAnnouncement);
  });

  it("複数が対象なら対象範囲より候補の新しい順を優先する", () => {
    const targetedAnnouncement: Announcement = { key: "targeted", shopId: currentContext.shopId };

    expect(selectDashboardAnnouncementForContext([globalAnnouncement, targetedAnnouncement], currentContext)).toBe(
      globalAnnouncement,
    );
  });

  it("店舗未選択では対象指定のあるお知らせを表示しない", () => {
    const announcements: Announcement[] = [
      { key: "organization", organizationId: currentContext.organizationId },
      { key: "shop", shopId: currentContext.shopId },
      { key: "plan", organizationPlan: currentContext.organizationPlan },
      { key: "empty", organizationId: " , ", organizationPlan: "" },
    ];

    expect(selectDashboardAnnouncementForContext(announcements, null)).toBeNull();
  });

  it("有効な契約プランがない事業者ではプラン指定のお知らせを表示しない", () => {
    const announcements: Announcement[] = [
      { key: "plan", organizationPlan: currentContext.organizationPlan },
      globalAnnouncement,
    ];
    const contextWithoutPlan = { ...currentContext, organizationPlan: null };

    expect(selectDashboardAnnouncementForContext(announcements, contextWithoutPlan)).toBe(globalAnnouncement);
  });
});
