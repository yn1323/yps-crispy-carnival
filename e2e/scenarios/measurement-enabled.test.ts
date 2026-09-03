import type { Page, Request, Route } from "@playwright/test";
import { expect, artifactSafeTest as test } from "../fixtures/artifactSafeTest";
import { expectAppHydrated } from "../helpers/appReadiness";

const GTM_TEST_ID = "GTM-TEST1234";
const MEASUREMENT_CONTRACT_RELEASE = "measurement-contract";
const CAPABILITY_TOKEN = "measurement-contract-dummy";
const CAPABILITY_PATH = `/manager-invite?token=${CAPABILITY_TOKEN}`;
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

    // Browser contractから実providerへ送信しない。予期せぬtransportも記録後に空応答へ閉じる。
    await route.fulfill({ status: 204, body: "" });
  });

  return requests;
}

async function getDataLayerEvents(page: Page): Promise<DataLayerEvent[]> {
  return page.evaluate(() => (window as typeof window & { dataLayer?: DataLayerEvent[] }).dataLayer ?? []);
}

async function expectDocumentMeasurement(page: Page, requests: string[], routeFamily: string): Promise<void> {
  await expect.poll(() => requests.filter(isGtmLoaderRequest), { timeout: 10_000 }).toHaveLength(1);
  await expect
    .poll(async () => (await getDataLayerEvents(page)).filter((event) => event.event === "page_view"), {
      timeout: 10_000,
    })
    .toEqual([
      {
        app_environment: "preview",
        event: "page_view",
        release_id: MEASUREMENT_CONTRACT_RELEASE,
        route_family: routeFamily,
      },
    ]);

  expect(requests).toEqual([`https://www.googletagmanager.com/gtm.js?id=${GTM_TEST_ID}`]);
  expect(await page.locator('script[src*="googletagmanager.com/gtm.js"]').count()).toBe(1);
  expect((await getDataLayerEvents(page)).filter((event) => event.event === "gtm.js")).toHaveLength(1);
  expect(
    await page.evaluate(
      () => (window as typeof window & { __measurementContractGtmLoaded?: boolean }).__measurementContractGtmLoaded,
    ),
  ).toBe(true);
}

test.describe("常時発火Web計測browser contract", { tag: ["@release", "@measurement"] }, () => {
  test("[MEASUREMENT-BROWSER-01] 同意値なしの公開・認証documentでGTMとpage_viewを開始する", async ({
    baseURL,
    page,
  }) => {
    if (!baseURL) throw new Error("Measurement browser contract requires a configured baseURL.");

    const measurementRequests = await installMeasurementTransportStub(page);
    const runtimeErrors: string[] = [];
    page.on("pageerror", (error) => runtimeErrors.push(error.message));

    const response = await page.goto("/");
    expect(response?.ok(), `/ returned ${response?.status() ?? "no response"}`).toBe(true);
    await expect(page.getByRole("heading", { level: 1, name: /シフトのやり取りを/ })).toBeVisible();
    await expectAppHydrated(page);
    await expectDocumentMeasurement(page, measurementRequests, "home");

    await page.evaluate(() => {
      (window as typeof window & { measurementDocumentProbe?: string }).measurementDocumentProbe = "present";
    });
    measurementRequests.length = 0;
    await page.getByRole("link", { name: "ログイン" }).click();
    await expect(page).toHaveURL((url) => url.origin === new URL(baseURL).origin && url.pathname === "/login");
    await expectAppHydrated(page);
    await expectDocumentMeasurement(page, measurementRequests, "auth");
    expect(
      await page.evaluate(
        () => (window as typeof window & { measurementDocumentProbe?: string }).measurementDocumentProbe,
      ),
    ).toBeUndefined();
    expect(runtimeErrors).toEqual([]);
  });

  test("[MEASUREMENT-BROWSER-02] token付きCapability documentも計測しdataLayerへcredentialを載せない", async ({
    baseURL,
    page,
  }) => {
    if (!baseURL) throw new Error("Measurement browser contract requires a configured baseURL.");
    const expectedOrigin = new URL(baseURL).origin;
    const measurementRequests = await installMeasurementTransportStub(page);

    await page.goto(CAPABILITY_PATH);
    await expect(page).toHaveURL(
      (url) => url.origin === expectedOrigin && url.pathname === "/manager-invite" && url.searchParams.has("token"),
    );
    await expectAppHydrated(page);
    await expectDocumentMeasurement(page, measurementRequests, "capability");

    const serializedDataLayer = JSON.stringify(await getDataLayerEvents(page));
    expect(serializedDataLayer).not.toContain(CAPABILITY_TOKEN);
    expect(serializedDataLayer).not.toContain("manager-invite");

    measurementRequests.length = 0;
    await page.goto("/privacy");
    await expect(page).toHaveURL((url) => url.origin === expectedOrigin && url.pathname === "/privacy");
    await expectAppHydrated(page);
    await expectDocumentMeasurement(page, measurementRequests, "legal");
  });
});
