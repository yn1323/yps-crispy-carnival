import type { ConsoleMessage, Page, Response, TestInfo } from "@playwright/test";
import { getSafePathname, sanitizeDiagnosticMessage } from "./diagnostics";

const MAX_ATTACHED_SIGNALS = 100;
const REACT_FIRST_CHILD_SSR_WARNING =
  'The pseudo class ":first-child" is potentially unsafe when doing server-side rendering. Try changing it to ":first-of-type".';
const REACT_NOT_YET_MOUNTED_WARNING =
  "Can't perform a React state update on a component that hasn't mounted yet. This indicates that you have a side-effect in your render function that asynchronously tries to update the component. Move this work to useEffect instead.";
const REACT_CALLER_MARKER = "[e2e-react-not-yet-mounted-caller]";

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
  registerStop?: (stop: () => void) => void;
};

type ReactCallerDiagnosticOptions = {
  callerMarker: string;
  targetMessage: string;
};

export function installE2EReactCallerDiagnostic({ callerMarker, targetMessage }: ReactCallerDiagnosticOptions) {
  const diagnosticWindow = window as typeof window & { __e2eReactCallerDiagnosticInstalled?: boolean };
  if (diagnosticWindow.__e2eReactCallerDiagnosticInstalled) return;
  diagnosticWindow.__e2eReactCallerDiagnosticInstalled = true;
  const originalError = console.error;
  console.error = (...values: unknown[]) => {
    if (values[0] !== targetMessage) {
      Reflect.apply(originalError, console, values);
      return;
    }
    const stackFrames = new Error().stack
      ?.split("\n")
      .slice(2)
      .map((frame) =>
        frame.replace(/https?:\/\/[^\s)]+/g, (rawUrl) => {
          try {
            const queryStart = rawUrl.indexOf("?");
            const sourceUrl = queryStart === -1 ? rawUrl : rawUrl.slice(0, queryStart);
            const locationSuffix =
              queryStart === -1 ? "" : (rawUrl.slice(queryStart + 1).match(/:\d+:\d+$/)?.[0] ?? "");
            const segments = new URL(sourceUrl).pathname.split("/").filter(Boolean);
            return `/${segments.slice(-2).join("/")}${locationSuffix}`;
          } catch {
            return "browser-source";
          }
        }),
      );
    const frames = stackFrames
      ? [...stackFrames.slice(0, 3), ...stackFrames.slice(-5)]
          .filter((frame, index, allFrames) => allFrames.indexOf(frame) === index)
          .join("\n")
      : "stack unavailable";
    Reflect.apply(originalError, console, [`${callerMarker}\n${frames}`, ...values]);
  };
}

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
  registerStop,
}: RuntimeSignalOptions<T>): Promise<T> {
  await page.addInitScript(installE2EReactCallerDiagnostic, {
    callerMarker: REACT_CALLER_MARKER,
    targetMessage: REACT_NOT_YET_MOUNTED_WARNING,
  });

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
  let isMonitoring = true;
  const stopMonitoring = () => {
    if (!isMonitoring) return;
    isMonitoring = false;
    page.off("pageerror", onPageError);
    page.off("console", onConsole);
    page.off("response", onResponse);
  };
  registerStop?.(stopMonitoring);

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
    stopMonitoring();
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
