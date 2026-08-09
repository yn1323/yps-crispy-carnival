import { describe, expect, it, vi } from "vitest";
import { convexRun, convexRunJson, E2EConvexCommandError } from "../e2e/helpers/convex";
import { E2EPollDeadlineError, pollUntil } from "../e2e/helpers/poll";

describe("E2E deadline poller", () => {
  it("最初のprobeを即時実行し、成立後はsleepしない", async () => {
    let now = 0;
    const sleep = vi.fn(async (durationMs: number) => {
      now += durationMs;
    });
    const probe = vi.fn(({ commandTimeoutMs }) => ({ ready: true, commandTimeoutMs }));

    const result = await pollUntil({
      deadlineMs: 1_000,
      commandTimeoutMs: 500,
      intervalMs: 100,
      errorCode: "test-ready",
      probe,
      accept: (value) => value.ready,
      now: () => now,
      sleep,
    });

    expect(result.commandTimeoutMs).toBe(500);
    expect(probe).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("deadline到達時は最終probe後にsleepしない", async () => {
    let now = 0;
    const sleep = vi.fn(async (durationMs: number) => {
      now += durationMs;
    });

    const promise = pollUntil({
      deadlineMs: 100,
      commandTimeoutMs: 100,
      intervalMs: 100,
      errorCode: "test-timeout",
      probe: () => {
        now = 100;
        return { ready: false };
      },
      accept: (value) => value.ready,
      now: () => now,
      sleep,
    });
    await expect(promise).rejects.toBeInstanceOf(E2EPollDeadlineError);
    await expect(promise).rejects.toHaveProperty("code", "test-timeout");
    expect(sleep).not.toHaveBeenCalled();
  });

  it("各command timeoutを残りdeadline以下にする", async () => {
    let now = 90;
    const seenTimeouts: number[] = [];

    await pollUntil({
      deadlineMs: 10,
      commandTimeoutMs: 500,
      intervalMs: 0,
      errorCode: "bounded-command",
      probe: ({ commandTimeoutMs }) => {
        seenTimeouts.push(commandTimeoutMs);
        return { ready: true };
      },
      accept: (value) => value.ready,
      now: () => now,
      sleep: async () => {
        now += 1;
      },
    });

    expect(seenTimeouts).toEqual([10]);
  });
});

describe("E2E Convex command", () => {
  it("CLIへ1 commandのtimeoutを渡す", () => {
    const executor = vi.fn(() => '{"ok":true}\n');

    expect(convexRun("testing:safeProbe", {}, { timeoutMs: 321, executor })).toContain("ok");
    expect(executor).toHaveBeenCalledWith(
      process.execPath,
      expect.arrayContaining(["testing:safeProbe"]),
      expect.objectContaining({ timeout: 321 }),
    );
  });

  it("child process errorからemail、token、生stderrを除き分類だけを返す", () => {
    const rawEmail = "person@gmail.com";
    const rawToken = "secret-capability-token";
    const executor = () => {
      throw Object.assign(new Error(`failed ${rawEmail} ${rawToken}`), {
        code: "ETIMEDOUT",
        stderr: `provider payload ${rawToken}`,
      });
    };

    let caught: unknown;
    try {
      convexRun("testing:safeProbe", { email: rawEmail, token: rawToken }, { executor });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(E2EConvexCommandError);
    expect(caught).toEqual(expect.objectContaining({ kind: "timeout" }));
    expect(String(caught)).not.toContain(rawEmail);
    expect(String(caught)).not.toContain(rawToken);
    expect(String(caught)).not.toContain("provider payload");
  });

  it("不正JSONのstdoutを値を含めず分類する", () => {
    const rawValue = "person@gmail.com secret-capability-token";
    const executor = () => `not-json ${rawValue}`;

    let caught: unknown;
    try {
      convexRunJson("testing:safeProbe", {}, { executor });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(E2EConvexCommandError);
    expect(caught).toEqual(expect.objectContaining({ kind: "invalid-json" }));
    expect(String(caught)).not.toContain(rawValue);
  });
});
