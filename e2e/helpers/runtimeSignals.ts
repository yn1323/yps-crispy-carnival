import type { ConsoleMessage, Page, Response, TestInfo } from "@playwright/test";
import { getSafePathname, sanitizeDiagnosticMessage } from "./diagnostics";

const MAX_ATTACHED_SIGNALS = 100;
const REACT_FIRST_CHILD_SSR_WARNING =
  'The pseudo class ":first-child" is potentially unsafe when doing server-side rendering. Try changing it to ":first-of-type".';

export type E2ERuntimeSignal = {
  kind: "console-error" | "pageerror" | "same-origin-5xx";
  message?: string;
  pathname?: string;
  status?: number;
};

type RuntimeSignalOptions<T> = {
  page: Page;
  testInfo: Pick<TestInfo, "attach">;
  baseURL?: string;
  attachmentName?: string;
  action: () => Promise<T>;
  cleanup?: () => Promise<void>;
};

export function isAllowedE2EConsoleError(message: string) {
  // 既存CalendarPickerの開発時SSR警告だけを限定許容し、他のconsole.errorは失敗させる。
  return message === REACT_FIRST_CHILD_SSR_WARNING;
}

export async function runWithE2ERuntimeSignalMonitoring<T>({
  page,
  testInfo,
  baseURL,
  attachmentName = "e2e-safe-browser-signals",
  action,
  cleanup,
}: RuntimeSignalOptions<T>): Promise<T> {
  const signals: E2ERuntimeSignal[] = [];
  const signalCounts = new Map<E2ERuntimeSignal["kind"], number>();
  const recordSignal = (signal: E2ERuntimeSignal) => {
    signalCounts.set(signal.kind, (signalCounts.get(signal.kind) ?? 0) + 1);
    if (signals.length < MAX_ATTACHED_SIGNALS) signals.push(signal);
  };
  const expectedOrigin = getOrigin(baseURL);
  const onPageError = (error: Error) => {
    recordSignal({ kind: "pageerror", message: sanitizeDiagnosticMessage(error.message) });
  };
  const onConsole = (message: ConsoleMessage) => {
    if (message.type() !== "error" || isAllowedE2EConsoleError(message.text())) return;
    recordSignal({ kind: "console-error", message: sanitizeDiagnosticMessage(message.text()) });
  };
  const onResponse = (response: Response) => {
    if (response.status() < 500 || !expectedOrigin || getOrigin(response.url()) !== expectedOrigin) return;
    recordSignal({
      kind: "same-origin-5xx",
      pathname: sanitizeDiagnosticMessage(getSafePathname(response.url())),
      status: response.status(),
    });
  };

  page.on("pageerror", onPageError);
  page.on("console", onConsole);
  page.on("response", onResponse);

  let actionResult: T | undefined;
  let actionError: unknown;
  let actionFailed = false;
  let cleanupError: unknown;
  let cleanupFailed = false;

  try {
    actionResult = await action();
  } catch (error) {
    actionError = error;
    actionFailed = true;
  } finally {
    // context closeやroute解除は製品操作ではない。意図的な破棄中のReact warningをruntime regressionへ数えない。
    page.off("pageerror", onPageError);
    page.off("console", onConsole);
    page.off("response", onResponse);
  }

  try {
    await cleanup?.();
  } catch (error) {
    cleanupError = error;
    cleanupFailed = true;
  }

  let signalError: Error | undefined;
  if (signalCounts.size > 0) {
    try {
      await testInfo.attach(attachmentName, {
        body: Buffer.from(
          JSON.stringify({
            signals,
            totals: Object.fromEntries(
              [...signalCounts.entries()].sort(([left], [right]) => left.localeCompare(right)),
            ),
          }),
        ),
        contentType: "application/json",
      });
      signalError = new Error(`E2E browser runtime signals detected (${summarizeSignalCounts(signalCounts)})`);
    } catch {
      signalError = new Error("E2E browser signal attachment failed");
    }
  }

  // assertionや操作の失敗をruntime signalやcleanupの失敗で上書きしない。
  if (actionFailed) throw actionError;
  if (cleanupFailed) throw cleanupError;
  if (signalError) throw signalError;
  return actionResult as T;
}

function getOrigin(rawUrl?: string) {
  if (!rawUrl) return undefined;
  try {
    return new URL(rawUrl).origin;
  } catch {
    return undefined;
  }
}

function summarizeSignalCounts(counts: Map<E2ERuntimeSignal["kind"], number>) {
  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([kind, count]) => `${kind}=${count}`)
    .join(", ");
}
