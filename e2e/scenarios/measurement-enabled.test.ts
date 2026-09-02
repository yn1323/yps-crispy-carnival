import type { Page, Request, Route } from "@playwright/test";
import { expect, artifactSafeTest as test } from "../fixtures/artifactSafeTest";
import { expectAppHydrated } from "../helpers/appReadiness";

const GTM_TEST_ID = "GTM-TEST1234";
const MEASUREMENT_CONTRACT_RELEASE = "measurement-contract";
const WEB_MEASUREMENT_CONSENT_STORAGE_KEY = "shiftori_web_measurement_consent_v1";
const CAPABILITY_PATH = "/manager-invite?token=measurement-contract-dummy";
const THIRD_PARTY_MEASUREMENT_URL =
  /^https:\/\/(?:[^/.]+\.)*(?:googletagmanager\.com|google-analytics\.com|clarity\.ms)\//i;

type DataLayerEvent = Record<string, unknown>;

function isGtmLoaderRequest(requestUrl: string): boolean {
  const url = new URL(requestUrl);
  return (
    url.hostname === "www.googletagmanager.com" &&
    url.pathname === "/gtm.js" &&
    url.searchParams.get("id") === GTM_TEST_ID
  );
}

async function installMeasurementTransportStub(page: Page): Promise<string[]> {
  const requests: string[] = [];

  await page.route(THIRD_PARTY_MEASUREMENT_URL, async (route: Route, request: Request) => {
    requests.push(request.url());
    if (isGtmLoaderRequest(request.url())) {
      await route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: "window.__measurementContractGtmLoaded = true;",
      });
      return;
    }

    // Browser contractから実providerへ送信しない。予期せぬtransportは記録後に空応答へ閉じる。
    await route.fulfill({ status: 204, body: "" });
  });

  return requests;
}

async function grantConsentBeforeDocument(page: Page): Promise<void> {
  await page.addInitScript((storageKey) => {
    window.localStorage.setItem(storageKey, "granted");
  }, WEB_MEASUREMENT_CONSENT_STORAGE_KEY);
}

async function getPageViewEvents(page: Page): Promise<DataLayerEvent[]> {
  return page.evaluate(() => {
    const dataLayer = (window as typeof window & { dataLayer?: DataLayerEvent[] }).dataLayer ?? [];
    return dataLayer.filter((event) => event.event === "page_view");
  });
}

test.describe("計測ON専用browser contract", { tag: ["@release", "@measurement"] }, () => {
  test("[MEASUREMENT-BROWSER-01] 同意済み公開direct loadだけでGTMとpage_viewを開始しlogin境界で破棄する", async ({
    baseURL,
    page,
  }) => {
    if (!baseURL) throw new Error("Measurement browser contract requires a configured baseURL.");

    await grantConsentBeforeDocument(page);
    const measurementRequests = await installMeasurementTransportStub(page);
    const runtimeErrors: string[] = [];
    page.on("pageerror", (error) => runtimeErrors.push(error.message));

    const response = await page.goto("/");
    expect(response?.ok(), `/ returned ${response?.status() ?? "no response"}`).toBe(true);
    await expect(page.getByRole("heading", { level: 1, name: /シフトのやり取りを/ })).toBeVisible();
    await expectAppHydrated(page);

    await expect.poll(() => measurementRequests.filter(isGtmLoaderRequest), { timeout: 10_000 }).toHaveLength(1);
    await expect
      .poll(() => getPageViewEvents(page), { timeout: 10_000 })
      .toEqual([
        {
          app_environment: "preview",
          event: "page_view",
          release_id: MEASUREMENT_CONTRACT_RELEASE,
          route_family: "home",
        },
      ]);
    expect(measurementRequests).toEqual([`https://www.googletagmanager.com/gtm.js?id=${GTM_TEST_ID}`]);
    expect(
      await page.evaluate(
        () => (window as typeof window & { __measurementContractGtmLoaded?: boolean }).__measurementContractGtmLoaded,
      ),
    ).toBe(true);

    await page.evaluate(() => {
      (window as typeof window & { measurementBoundaryProbe?: string }).measurementBoundaryProbe = "present";
    });
    measurementRequests.length = 0;
    await page.getByRole("link", { name: "ログイン" }).click();
    await expect(page).toHaveURL((url) => url.origin === new URL(baseURL).origin && url.pathname === "/login");
    await expectAppHydrated(page);

    expect(
      await page.evaluate(
        () => (window as typeof window & { measurementBoundaryProbe?: string }).measurementBoundaryProbe,
      ),
    ).toBeUndefined();
    expect(measurementRequests).toEqual([]);

    measurementRequests.length = 0;
    await page.goBack();
    await expect(page).toHaveURL((url) => url.origin === new URL(baseURL).origin && url.pathname === "/");
    await expectAppHydrated(page);
    await expect.poll(() => getPageViewEvents(page), { timeout: 10_000 }).toHaveLength(1);
    await page.evaluate(() => {
      (window as typeof window & { measurementBoundaryProbe?: string }).measurementBoundaryProbe = "returned-public";
    });

    // 公開documentのBFCache復帰と再読み込みはどちらも許容し、closed phaseだけをrequest 0へ固定する。
    measurementRequests.length = 0;
    await page.goForward();
    await expect(page).toHaveURL((url) => url.origin === new URL(baseURL).origin && url.pathname === "/login");
    await expectAppHydrated(page);
    expect(
      await page.evaluate(
        () => (window as typeof window & { measurementBoundaryProbe?: string }).measurementBoundaryProbe,
      ),
    ).toBeUndefined();
    expect(measurementRequests).toEqual([]);
    expect(runtimeErrors).toEqual([]);
  });

  test("[MEASUREMENT-BROWSER-02] capability direct loadとclosed history移動では計測requestを開始しない", async ({
    baseURL,
    page,
  }) => {
    if (!baseURL) throw new Error("Measurement browser contract requires a configured baseURL.");
    const expectedOrigin = new URL(baseURL).origin;

    await grantConsentBeforeDocument(page);
    const measurementRequests = await installMeasurementTransportStub(page);

    await page.goto(CAPABILITY_PATH);
    await expect(page).toHaveURL(
      (url) => url.origin === expectedOrigin && url.pathname === "/manager-invite" && url.searchParams.has("token"),
    );
    await expectAppHydrated(page);
    expect(measurementRequests).toEqual([]);

    await page.goto("/login");
    await expect(page).toHaveURL((url) => url.origin === expectedOrigin && url.pathname === "/login");
    await expectAppHydrated(page);
    expect(measurementRequests).toEqual([]);

    measurementRequests.length = 0;
    await page.goBack();
    await expect(page).toHaveURL(
      (url) => url.origin === expectedOrigin && url.pathname === "/manager-invite" && url.searchParams.has("token"),
    );
    expect(measurementRequests).toEqual([]);

    measurementRequests.length = 0;
    await page.goForward();
    await expect(page).toHaveURL((url) => url.origin === expectedOrigin && url.pathname === "/login");
    expect(measurementRequests).toEqual([]);
  });
});
