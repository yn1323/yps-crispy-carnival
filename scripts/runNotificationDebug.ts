#!/usr/bin/env tsx

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const DEV_ENV_FILE = ".env.local";
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

export type NotificationDebugMode = "cron" | "recruitment" | "shop";

export type NotificationDebugInvocation = {
  functionName: string;
  args: Record<string, string>;
};

/**
 * 手動実行でも既存のinternal actionとOutbox経路を使い、productionへ向かう引数は受け付けない。
 */
export function buildNotificationDebugPlan(
  mode: NotificationDebugMode,
  targetId?: string,
): NotificationDebugInvocation[] {
  if (mode === "cron") {
    if (targetId?.trim()) throw new Error("cronモードにはIDを指定しないでください");
    return [
      { functionName: "staffRegistration/actions:sendOwnerDailyDigest", args: {} },
      { functionName: "notificationOutbox/failureReminderActions:sendFailureReminderDigest", args: {} },
    ];
  }

  const normalizedTargetId = targetId?.trim();
  if (!normalizedTargetId) {
    throw new Error(`${mode}モードには対象IDが必要です`);
  }

  if (mode === "recruitment") {
    return [
      { functionName: "notification/reminderActions:sendReminderEmails", args: { recruitmentId: normalizedTargetId } },
      {
        functionName: "shiftConfirmationReminder/actions:sendManagerConfirmationReminder",
        args: { recruitmentId: normalizedTargetId },
      },
    ];
  }

  return [
    { functionName: "staffRegistration/actions:sendOwnerDailyDigest", args: { shopId: normalizedTargetId } },
    {
      functionName: "notificationOutbox/failureReminderActions:sendFailureReminderDigest",
      args: { shopId: normalizedTargetId },
    },
    { functionName: "shopActivationReminder/actions:sendReminder", args: { shopId: normalizedTargetId } },
  ];
}

export function getDeploymentReferenceFromEnvFile(contents: string): string {
  const line = contents.split(/\r?\n/).find((entry) => entry.trimStart().startsWith("CONVEX_DEPLOYMENT="));
  const value = line?.trim().slice("CONVEX_DEPLOYMENT=".length).split("#", 1)[0]?.trim();
  if (!value) throw new Error(`${DEV_ENV_FILE}にCONVEX_DEPLOYMENTがありません`);
  return value;
}

export function isDevDeploymentReference(deployment: string): boolean {
  return deployment === "local" || /^dev(?:[:/]|$)/.test(deployment);
}

function assertDevDeployment(envFile: string): void {
  const deployment = getDeploymentReferenceFromEnvFile(readFileSync(envFile, "utf8"));
  if (!isDevDeploymentReference(deployment)) {
    throw new Error(`${envFile}はdev/local deploymentだけ指定できます（現在: ${deployment}）`);
  }
}

function runNotificationDebug(mode: NotificationDebugMode, targetId?: string): void {
  assertDevDeployment(DEV_ENV_FILE);
  const plan = buildNotificationDebugPlan(mode, targetId);

  for (const invocation of plan) {
    console.log(`[notification-debug] ${invocation.functionName}`);
    execFileSync(
      pnpmCommand,
      ["exec", "convex", "run", "--env-file", DEV_ENV_FILE, invocation.functionName, JSON.stringify(invocation.args)],
      { cwd: process.cwd(), stdio: "inherit" },
    );
  }
}

function parseArgs(args: string[]): { mode: NotificationDebugMode; targetId?: string } {
  const [mode, targetId, ...extra] = args;
  if (extra.length > 0 || (mode !== "cron" && mode !== "recruitment" && mode !== "shop")) {
    throw new Error(
      "Usage: pnpm convex:notify:cron | pnpm convex:notify:recruitment -- <recruitmentId> | pnpm convex:notify:shop -- <shopId>",
    );
  }
  return { mode, ...(targetId ? { targetId } : {}) };
}

export function main(args = process.argv.slice(2)): void {
  try {
    const { mode, targetId } = parseArgs(args);
    runNotificationDebug(mode, targetId);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
