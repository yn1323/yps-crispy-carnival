import type { Browser, BrowserContextOptions, Page, TestInfo } from "@playwright/test";
import { runWithE2ERuntimeSignalMonitoring } from "./runtimeSignals";

type AnonymousStaffPageOptions = {
  browser: Browser;
  baseURL: string | undefined;
  testInfo: Pick<TestInfo, "attach">;
  attachmentName: string;
  contextOptions?: BrowserContextOptions;
  action: (page: Page) => Promise<void>;
};

/** 管理者のstorage stateを持たない新しいcontextで、スタッフのcapability導線を監視付きで操作する。 */
export async function withAnonymousStaffPage({
  browser,
  baseURL,
  testInfo,
  attachmentName,
  contextOptions,
  action,
}: AnonymousStaffPageOptions) {
  const context = await browser.newContext({
    ...contextOptions,
    baseURL,
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    storageState: { cookies: [], origins: [] },
  });
  const page = await context.newPage();
  await runWithE2ERuntimeSignalMonitoring({
    page,
    testInfo,
    baseURL,
    attachmentName,
    action: () => action(page),
    cleanup: () => context.close(),
  });
}
