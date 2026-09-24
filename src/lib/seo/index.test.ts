import { describe, expect, it } from "vitest";
import { buildMeta } from ".";
import { organizationJsonLd, softwareApplicationJsonLd, webSiteJsonLd } from "./siteJsonLd";

type MetaRecord = Record<string, unknown>;

const findTitles = (title: string) => {
  const entries = buildMeta({ title }) as unknown as MetaRecord[];
  return {
    title: entries.find((entry) => "title" in entry)?.title,
    ogTitle: entries.find((entry) => entry.property === "og:title")?.content,
    twitterTitle: entries.find((entry) => entry.name === "twitter:title")?.content,
  };
};

describe("buildMeta title", () => {
  it("サイト名を含まないtitleへ全角区切りでサイト名を付け、OGPとTwitter Cardへ同じ値を使う", () => {
    expect(findTitles("機能一覧｜希望シフトの回収から確定シフトの共有まで")).toEqual({
      title: "機能一覧｜希望シフトの回収から確定シフトの共有まで｜シフトリ",
      ogTitle: "機能一覧｜希望シフトの回収から確定シフトの共有まで｜シフトリ",
      twitterTitle: "機能一覧｜希望シフトの回収から確定シフトの共有まで｜シフトリ",
    });
  });

  it.each(["シフトリ", "お問い合わせ｜シフトリ", "シフトリ｜LINEで希望シフトを集めるシフト管理ツール"])(
    "サイト名を含むtitle「%s」へは重ねて付けない",
    (title) => {
      expect(findTitles(title).title).toBe(title);
    },
  );
});

describe("site JSON-LD", () => {
  it("WebSiteとOrganizationは同じ別名を持ち、Organizationは公式プロフィールをsameAsに持つ", () => {
    expect(webSiteJsonLd).toMatchObject({ "@type": "WebSite", name: "シフトリ", alternateName: "Shiftori" });
    expect(organizationJsonLd).toMatchObject({
      "@type": "Organization",
      name: "シフトリ",
      alternateName: "Shiftori",
      sameAs: ["https://line.me/R/ti/p/@800kzcfc"],
    });
  });

  it("WebSiteのpublisherとSoftwareApplicationのproviderは同じOrganizationの@idを参照する", () => {
    const organizationRef = { "@id": organizationJsonLd["@id"] };

    expect(webSiteJsonLd.publisher).toEqual(organizationRef);
    expect(softwareApplicationJsonLd.provider).toEqual(organizationRef);
  });
});
