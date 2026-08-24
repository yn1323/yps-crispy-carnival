import { describe, expect, it } from "vitest";
import {
  assertHelpIndexBundleBoundary,
  assertNoBakedMeasurementScripts,
  assertNoStripeBuildValues,
  assertPublicPlanPriceMarkup,
} from "./validateStaticBuild";

describe("static build help bundle boundary", () => {
  const helpIndexPreloads = [
    '<link rel="modulepreload" href="/assets/help.index-AbCd1234.js">',
    '<link rel="modulepreload" href="/assets/helpIndexData-AbCd1234.js">',
  ];

  it("/helpだけが全文検索bundleを読み込む", () => {
    for (const preload of helpIndexPreloads) {
      expect(() => assertHelpIndexBundleBoundary("/help", preload)).not.toThrow();
    }
    expect(() => assertHelpIndexBundleBoundary("/help/add-staff", "<html></html>")).not.toThrow();
  });

  it.each(["/", "/help/add-staff", "/articles"])("%sで全文検索bundleの先読みを拒否する", (route) => {
    for (const preload of helpIndexPreloads) {
      expect(() => assertHelpIndexBundleBoundary(route, preload)).toThrow(
        "must not preload the /help full-text search bundle",
      );
    }
  });
});

type PriceMarkupOptions = {
  plan: string;
  currency?: string;
  unitAmount?: string;
  interval?: string;
  intervalCount?: string;
  taxBehavior?: string;
  text?: string;
};

function createPriceMarkup({
  plan,
  currency = "jpy",
  unitAmount = plan === "business" ? "6000" : "3000",
  interval = "month",
  intervalCount = "1",
  taxBehavior = "inclusive",
  text,
}: PriceMarkupOptions): string {
  const intervalLabel = { day: "日", week: "週間", month: "か月", year: "年" }[interval] ?? interval;
  const visibleText =
    text ??
    `${plan === "business" ? "¥6,000" : "¥3,000"}/${intervalCount}${intervalLabel}（${taxBehavior === "inclusive" ? "税込" : "税別"}）`;
  return `<span data-public-plan-price="${plan}" data-currency="${currency}" data-unit-amount="${unitAmount}" data-interval="${interval}" data-interval-count="${intervalCount}" data-tax-behavior="${taxBehavior}">${visibleText}</span>`;
}

function createValidPublicPriceHtml(): string {
  return `<main>${createPriceMarkup({ plan: "pro" })}${createPriceMarkup({ plan: "business" })}</main>`;
}

describe("static build measurement boundary", () => {
  it.each(["/", "_shell.html", "404.html"])("%sにthird-party計測scriptを直書きしない", (label) => {
    expect(() =>
      assertNoBakedMeasurementScripts(
        label,
        '<!doctype html><html><head><script type="module" src="/assets/app.js"></script></head></html>',
      ),
    ).not.toThrow();
  });

  it.each([
    "https://www.googletagmanager.com/gtm.js?id=GTM-TEST1234",
    "https://www.google-analytics.com/g/collect",
    "https://www.clarity.ms/tag/test",
  ])("baked measurement script %sを拒否する", (scriptUrl) => {
    expect(() =>
      assertNoBakedMeasurementScripts("/", `<html><script async src="${scriptUrl}"></script></html>`),
    ).toThrow("contains baked GTM, Google Analytics, or Clarity markup");
  });

  it("GTMのnoscript iframeを拒否する", () => {
    expect(() =>
      assertNoBakedMeasurementScripts(
        "_shell.html",
        '<html><noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-TEST1234"></iframe></noscript></html>',
      ),
    ).toThrow("contains baked GTM, Google Analytics, or Clarity markup");
  });

  it("本文中の運用説明だけではbaked scriptと判定しない", () => {
    expect(() =>
      assertNoBakedMeasurementScripts(
        "/help",
        "<html><body><p>googletagmanager.comへの通信は同意後だけ許可します。</p></body></html>",
      ),
    ).not.toThrow();
  });
});

describe("static build public plan price boundary", () => {
  it.each(["/", "/commercial-transactions"])("%sのStandardとPro公開料金を完全一致で受け入れる", (route) => {
    expect(() => assertPublicPlanPriceMarkup(route, createValidPublicPriceHtml())).not.toThrow();
  });

  it("Develop用の同じ短周期を完全一致で受け入れる", () => {
    const html = `${createPriceMarkup({ plan: "pro", interval: "day", intervalCount: "2" })}${createPriceMarkup({ plan: "business", interval: "day", intervalCount: "2" })}`;
    expect(() => assertPublicPlanPriceMarkup("/commercial-transactions", html)).not.toThrow();
  });

  it.each([
    ["欠落", createPriceMarkup({ plan: "pro" })],
    ["重複", `${createPriceMarkup({ plan: "pro" })}${createPriceMarkup({ plan: "pro" })}`],
    [
      "対象外plan",
      `${createPriceMarkup({ plan: "pro" })}${createPriceMarkup({ plan: "enterprise", text: "¥6,000/月（税込）" })}`,
    ],
  ])("公開料金のplanが%sしていれば拒否する", (_caseName, html) => {
    expect(() => assertPublicPlanPriceMarkup("/commercial-transactions", html)).toThrow();
  });

  it.each([
    ["正でない金額", createPriceMarkup({ plan: "pro", unitAmount: "0", text: "¥0/月（税込）" })],
    ["未対応の周期", createPriceMarkup({ plan: "pro", interval: "quarter" })],
    ["正でない周期数", createPriceMarkup({ plan: "pro", intervalCount: "0" })],
    ["不明な税区分", createPriceMarkup({ plan: "pro", taxBehavior: "unspecified" })],
    ["通貨属性なし", createPriceMarkup({ plan: "pro", currency: "" })],
  ])("%sを拒否する", (_caseName, invalidProMarkup) => {
    const html = `${invalidProMarkup}${createPriceMarkup({ plan: "business" })}`;
    expect(() => assertPublicPlanPriceMarkup("/commercial-transactions", html)).toThrow();
  });

  it("2プランで異なる通貨を拒否する", () => {
    const html = `${createPriceMarkup({ plan: "pro" })}${createPriceMarkup({
      plan: "business",
      currency: "usd",
      text: "USD 60.00/月（税込）",
    })}`;
    expect(() => assertPublicPlanPriceMarkup("/commercial-transactions", html)).toThrow(
      "public plan prices must use one currency",
    );
  });

  it("2プランで異なる請求周期を拒否する", () => {
    const html = `${createPriceMarkup({ plan: "pro" })}${createPriceMarkup({
      plan: "business",
      interval: "year",
    })}`;
    expect(() => assertPublicPlanPriceMarkup("/commercial-transactions", html)).toThrow(
      "public plan prices must use one billing interval",
    );
  });

  it.each([
    ["金額", createPriceMarkup({ plan: "pro", text: "¥4,000/1か月（税込）" })],
    ["請求周期", createPriceMarkup({ plan: "pro", text: "¥3,000/1年（税込）" })],
    ["税区分", createPriceMarkup({ plan: "pro", text: "¥3,000/1か月（税別）" })],
    ["余分な料金", createPriceMarkup({ plan: "pro", text: "¥3,000/1か月（税込）＋¥500" })],
  ])("属性と一致しない表示%sを拒否する", (_caseName, invalidProMarkup) => {
    const html = `${invalidProMarkup}${createPriceMarkup({ plan: "business" })}`;
    expect(() => assertPublicPlanPriceMarkup("/commercial-transactions", html)).toThrow();
  });

  it.each([
    "【手動入力：Standardの月額料金と税込・税別】",
    "【手動入力：Proの月額料金と税込・税別】",
    "【手動入力：Businessの月額料金と税込・税別】",
  ])("価格placeholder %sを拒否する", (placeholder) => {
    expect(() =>
      assertPublicPlanPriceMarkup("/commercial-transactions", `${createValidPublicPriceHtml()}${placeholder}`),
    ).toThrow("price placeholder");
  });
});

describe("static build Stripe value boundary", () => {
  it("公開bundleで使う料金状態名はStripe Price IDと誤判定しない", () => {
    expect(() => assertNoStripeBuildValues("assets/app.js", 'reason: "price_unavailable"')).not.toThrow();
  });

  it.each([
    "STRIPE_SECRET_KEY",
    "STRIPE_PRICE_READ_KEY",
    "rk_live_secret",
    "rk_test_secret",
    "sk_live_secret",
    "sk_test_secret",
  ])("HTMLまたはJS内のStripe secret %sを拒否する", (secret) => {
    expect(() => assertNoStripeBuildValues("assets/app.js", `const leaked = "${secret}"`)).toThrow(
      "contains a Stripe secret",
    );
  });

  it("HTMLまたはJS内のStripe Price IDを拒否する", () => {
    expect(() => assertNoStripeBuildValues("assets/app.js", 'const leaked = "price_1Public123456789"')).toThrow(
      "contains a Stripe Price ID",
    );
  });
});
