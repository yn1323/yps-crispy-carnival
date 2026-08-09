import { performance } from "node:perf_hooks";
import { recordE2EMetric } from "./metrics";

type PollProbeContext = {
  commandTimeoutMs: number;
};

type PollUntilOptions<T> = {
  deadlineMs: number;
  commandTimeoutMs: number;
  intervalMs: number;
  errorCode: string;
  probe: (context: PollProbeContext) => T | Promise<T>;
  accept: (value: T) => boolean;
  now?: () => number;
  sleep?: (durationMs: number) => Promise<void>;
};

export class E2EPollDeadlineError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(`E2E poll deadline exceeded: ${code}`);
    this.name = "E2EPollDeadlineError";
    this.code = code;
  }
}

export async function pollUntil<T>({
  deadlineMs,
  commandTimeoutMs,
  intervalMs,
  errorCode,
  probe,
  accept,
  now = () => performance.now(),
  sleep = (durationMs) => new Promise((resolve) => setTimeout(resolve, durationMs)),
}: PollUntilOptions<T>): Promise<T> {
  if (deadlineMs <= 0 || commandTimeoutMs <= 0 || intervalMs < 0) {
    throw new Error("E2E poll timing must use positive deadlines and command timeouts.");
  }

  const deadlineAt = now() + deadlineMs;
  while (true) {
    const remainingBeforeProbe = deadlineAt - now();
    if (remainingBeforeProbe <= 0) throw new E2EPollDeadlineError(errorCode);

    recordE2EMetric("pollAttempts");
    const value = await probe({ commandTimeoutMs: Math.max(1, Math.min(commandTimeoutMs, remainingBeforeProbe)) });
    if (accept(value)) return value;

    const remainingAfterProbe = deadlineAt - now();
    // 最終試行後や、次のprobeへ最低1msも残せない場合はsleepしない。
    const sleepDurationMs = Math.min(intervalMs, remainingAfterProbe - 1);
    if (sleepDurationMs <= 0) throw new E2EPollDeadlineError(errorCode);
    await sleep(sleepDurationMs);
  }
}
