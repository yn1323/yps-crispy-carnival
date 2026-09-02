#!/usr/bin/env tsx

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { parse as parseDotenv } from "dotenv";
import {
  DEVELOPMENT_SEED_CONTRACT_FINGERPRINT,
  DEVELOPMENT_SEED_CONTRACT_VERSION,
  DEVELOPMENT_SEED_EXPECTED_TABLE_COUNT,
  DEVELOPMENT_SEED_SCENARIO_KEYS,
} from "../convex/developmentSeed/catalog";

export type DevelopmentSeedTarget = "local" | "dev";

type DevelopmentSeedTargetConfig = {
  envFile: ".env.local" | ".env.develop";
};

type DevelopmentSeedCommandRunner = (args: readonly string[], env: Readonly<NodeJS.ProcessEnv>) => string;
type DevelopmentSeedFileReader = (filePath: string) => string;
type DevelopmentSeedLogger = Pick<Console, "log">;

type DevelopmentSeedDependencies = {
  commandRunner?: DevelopmentSeedCommandRunner;
  environmentRunner?: DevelopmentSeedCommandRunner;
  fileReader?: DevelopmentSeedFileReader;
  logger?: DevelopmentSeedLogger;
};

type PreflightResult = {
  contractVersion: string;
  contractFingerprint: string;
  deploymentUrl: string;
  today: string;
  scenarioKeys: string[];
  tableCount: number;
};

type CancelScheduledFunctionsResult = {
  auditToken: string;
  continueCursor: string;
  isDone: boolean;
  cancelledCount: number;
  inProgressCount: number;
};

type ClearAllTablesResult = {
  done: boolean;
  nextTableIndex: number;
  deletedCount: number;
  tableName: string | null;
};

type SeedActorsResult = {
  createdCount: number;
};

type SeedScenarioResult = {
  scenarioKey: string;
  insertedCount: number;
};

type VerifyResult = {
  contractVersion: string;
  contractFingerprint: string;
  scenarioCount: number;
  tableCount: number;
  organizationCount: number;
  shopCount: number;
  staffCount: number;
  recruitmentCount: number;
  openFailureCount: number;
  activeOutboxCount: number;
  activeFanoutCount: number;
  delayedDeadlineCount: number;
  liveScheduledFunctionCount: number;
};

export type DevelopmentSeedSummary = {
  target: DevelopmentSeedTarget;
  today: string;
  scenarioCount: number;
  tableCount: number;
  cancelledScheduledFunctionCount: number;
  deletedDocumentCount: number;
  insertedDocumentCount: number;
  verification: VerifyResult;
};

const TARGET_CONFIGS: Record<DevelopmentSeedTarget, DevelopmentSeedTargetConfig> = {
  local: { envFile: ".env.local" },
  dev: { envFile: ".env.develop" },
};

export {
  DEVELOPMENT_SEED_CONTRACT_FINGERPRINT,
  DEVELOPMENT_SEED_CONTRACT_VERSION,
  DEVELOPMENT_SEED_EXPECTED_TABLE_COUNT,
  DEVELOPMENT_SEED_SCENARIO_KEYS,
};

const EXPECTED_SCENARIO_KEYS = new Set<string>(DEVELOPMENT_SEED_SCENARIO_KEYS);
const MAX_PAGINATED_CALLS = 10_000;
const COMMAND_TIMEOUT_MS = 60_000;
const COMMAND_MAX_BUFFER_BYTES = 1024 * 1024;
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

class DevelopmentSeedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DevelopmentSeedError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isPreflightResult(value: unknown): value is PreflightResult {
  if (!isRecord(value)) return false;
  return (
    typeof value.contractVersion === "string" &&
    typeof value.contractFingerprint === "string" &&
    typeof value.deploymentUrl === "string" &&
    typeof value.today === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value.today) &&
    Array.isArray(value.scenarioKeys) &&
    value.scenarioKeys.every((scenarioKey) => typeof scenarioKey === "string") &&
    isNonNegativeInteger(value.tableCount) &&
    value.tableCount > 0
  );
}

function isCancelScheduledFunctionsResult(value: unknown): value is CancelScheduledFunctionsResult {
  if (!isRecord(value)) return false;
  return (
    typeof value.auditToken === "string" &&
    value.auditToken.length > 0 &&
    typeof value.continueCursor === "string" &&
    typeof value.isDone === "boolean" &&
    isNonNegativeInteger(value.cancelledCount) &&
    isNonNegativeInteger(value.inProgressCount)
  );
}

function isClearAllTablesResult(value: unknown): value is ClearAllTablesResult {
  if (!isRecord(value)) return false;
  return (
    typeof value.done === "boolean" &&
    isNonNegativeInteger(value.nextTableIndex) &&
    isNonNegativeInteger(value.deletedCount) &&
    (typeof value.tableName === "string" || value.tableName === null)
  );
}

function isSeedActorsResult(value: unknown): value is SeedActorsResult {
  if (!isRecord(value)) return false;
  return Object.keys(value).length === 1 && isNonNegativeInteger(value.createdCount);
}

function isSeedScenarioResult(value: unknown): value is SeedScenarioResult {
  if (!isRecord(value)) return false;
  return typeof value.scenarioKey === "string" && isNonNegativeInteger(value.insertedCount);
}

function isVerifyResult(value: unknown): value is VerifyResult {
  if (!isRecord(value)) return false;
  return (
    typeof value.contractVersion === "string" &&
    typeof value.contractFingerprint === "string" &&
    [
      value.scenarioCount,
      value.tableCount,
      value.organizationCount,
      value.shopCount,
      value.staffCount,
      value.recruitmentCount,
      value.openFailureCount,
      value.activeOutboxCount,
      value.activeFanoutCount,
      value.delayedDeadlineCount,
      value.liveScheduledFunctionCount,
    ].every(isNonNegativeInteger)
  );
}

function defaultCommandRunner(args: readonly string[], env: Readonly<NodeJS.ProcessEnv>): string {
  return execFileSync(pnpmCommand, [...args], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: COMMAND_TIMEOUT_MS,
    maxBuffer: COMMAND_MAX_BUFFER_BYTES,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...env },
  });
}

function defaultFileReader(filePath: string): string {
  return readFileSync(path.resolve(repoRoot, filePath), "utf8");
}

function parseJsonResult(stdout: string, phase: string): unknown {
  const trimmed = stdout.trim();
  if (!trimmed) throw new DevelopmentSeedError(`${phase}の応答が空でした。後続処理は実行していません。`);

  const candidateIndexes = [0];
  for (let index = 0; index < trimmed.length; index += 1) {
    if (trimmed[index] !== "\n") continue;
    let candidateIndex = index + 1;
    while (candidateIndex < trimmed.length && /\s/.test(trimmed[candidateIndex] ?? "")) candidateIndex += 1;
    if (trimmed[candidateIndex] === "{" || trimmed[candidateIndex] === "[") candidateIndexes.push(candidateIndex);
  }

  for (const candidateIndex of candidateIndexes.reverse()) {
    try {
      return JSON.parse(trimmed.slice(candidateIndex)) as unknown;
    } catch {
      // Convex CLI may emit safe progress lines before the final JSON result.
    }
  }

  throw new DevelopmentSeedError(`${phase}の応答形式を確認できませんでした。後続処理は実行していません。`);
}

function invokeDevelopmentSeedFunction(
  commandRunner: DevelopmentSeedCommandRunner,
  childEnv: Readonly<NodeJS.ProcessEnv>,
  phase: string,
  functionName: string,
  args: Record<string, unknown>,
): unknown {
  let stdout: string;
  try {
    stdout = commandRunner(["exec", "convex", "run", functionName, JSON.stringify(args)], childEnv);
  } catch {
    throw new DevelopmentSeedError(`${phase}に失敗しました。生のエラーは表示せず、後続処理を停止しました。`);
  }
  return parseJsonResult(stdout, phase);
}

const FORBIDDEN_COMMON_DEPLOYMENT_SELECTOR_NAMES = [
  "CONVEX_DEPLOYMENT_TOKEN",
  "CONVEX_SELF_HOSTED_URL",
  "CONVEX_SELF_HOSTED_ADMIN_KEY",
] as const;

type ValidatedDevelopmentSeedDeployment =
  | {
      kind: "personalDev";
      configuredDeployment: string;
      deploymentName: string;
    }
  | {
      kind: "deployKey";
      deployKey: string;
      deploymentName: string;
    };

function countAssignments(contents: string, name: string): number {
  return contents.split(/\r?\n/).filter((line) => new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=`).test(line)).length;
}

function validateDevelopmentSeedDeployment(
  target: DevelopmentSeedTarget,
  contents: string,
): ValidatedDevelopmentSeedDeployment {
  const parsed = parseDotenv(contents);
  if (FORBIDDEN_COMMON_DEPLOYMENT_SELECTOR_NAMES.some((name) => countAssignments(contents, name) > 0)) {
    throw new DevelopmentSeedError(
      `${TARGET_CONFIGS[target].envFile}に許可されていないdeployment selectorがあります。処理は開始していません。`,
    );
  }

  if (target === "local") {
    const configuredDeployment = parsed.CONVEX_DEPLOYMENT?.trim() ?? "";
    if (countAssignments(contents, "CONVEX_DEPLOYMENT") !== 1 || !configuredDeployment) {
      throw new DevelopmentSeedError(".env.localのCONVEX_DEPLOYMENTを一意に確認できません。処理は開始していません。");
    }
    if (countAssignments(contents, "CONVEX_DEPLOY_KEY") > 0) {
      throw new DevelopmentSeedError(".env.localにCONVEX_DEPLOY_KEYは設定できません。処理は開始していません。");
    }
    const match = configuredDeployment.match(/^dev:([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)$/);
    if (!match) {
      throw new DevelopmentSeedError(".env.localが個人用dev deploymentを指していません。処理は開始していません。");
    }
    return { kind: "personalDev", configuredDeployment, deploymentName: match[1] ?? "" };
  }

  const deployKey = parsed.CONVEX_DEPLOY_KEY?.trim() ?? "";
  if (countAssignments(contents, "CONVEX_DEPLOY_KEY") !== 1 || !deployKey) {
    throw new DevelopmentSeedError(".env.developのCONVEX_DEPLOY_KEYを一意に確認できません。処理は開始していません。");
  }
  if (countAssignments(contents, "CONVEX_DEPLOYMENT") > 0) {
    throw new DevelopmentSeedError(".env.developにCONVEX_DEPLOYMENTは設定できません。処理は開始していません。");
  }
  const match = deployKey.match(/^prod:([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)\|.+$/);
  if (!match) {
    throw new DevelopmentSeedError(
      ".env.developが固定したDevelopment deploymentのkeyを持っていません。処理は開始していません。",
    );
  }
  return { kind: "deployKey", deployKey, deploymentName: match[1] ?? "" };
}

export function assertDevelopmentSeedDeployment(target: DevelopmentSeedTarget, contents: string): void {
  validateDevelopmentSeedDeployment(target, contents);
}

function buildDevelopmentSeedChildEnv(
  validatedDeployment: ValidatedDevelopmentSeedDeployment,
): Readonly<NodeJS.ProcessEnv> {
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    CONVEX_DEPLOYMENT: "",
    CONVEX_DEPLOY_KEY: "",
    CONVEX_DEPLOYMENT_TOKEN: "",
    CONVEX_SELF_HOSTED_URL: "",
    CONVEX_SELF_HOSTED_ADMIN_KEY: "",
  };
  if (validatedDeployment.kind === "personalDev") {
    childEnv.CONVEX_DEPLOYMENT = validatedDeployment.configuredDeployment;
  } else {
    childEnv.CONVEX_DEPLOY_KEY = validatedDeployment.deployKey;
  }
  return Object.freeze(childEnv);
}

function enableDevelopmentSeedGuard(
  environmentRunner: DevelopmentSeedCommandRunner,
  childEnv: Readonly<NodeJS.ProcessEnv>,
): void {
  try {
    environmentRunner(["exec", "convex", "env", "set", "DEVELOPMENT_SEED_ENABLED", "true"], childEnv);
  } catch {
    throw new DevelopmentSeedError("破壊操作guardの一時有効化に失敗しました。シード処理は開始していません。");
  }
}

function disableAndVerifyDevelopmentSeedGuard(
  environmentRunner: DevelopmentSeedCommandRunner,
  childEnv: Readonly<NodeJS.ProcessEnv>,
): boolean {
  try {
    environmentRunner(["exec", "convex", "env", "set", "DEVELOPMENT_SEED_ENABLED", "false"], childEnv);
  } catch {
    // A timed-out command may still have updated the remote value, so verify independently below.
  }

  try {
    const value = environmentRunner(["exec", "convex", "env", "get", "DEVELOPMENT_SEED_ENABLED"], childEnv);
    return value.trim() === "false";
  } catch {
    return false;
  }
}

export function parseDevelopmentSeedCliArgs(args: readonly string[]): DevelopmentSeedTarget {
  if (args.length === 1 && args[0] === "local") return "local";
  if (args.length === 2 && args[0] === "dev" && args[1] === "--yes") return "dev";
  if (args.length === 3 && args[0] === "dev" && args[1] === "--" && args[2] === "--yes") return "dev";

  if (args[0] === "dev" && !args.includes("--yes")) {
    throw new DevelopmentSeedError("開発deploymentの全データ置換には --yes が必要です。処理は開始していません。");
  }

  throw new DevelopmentSeedError(
    "Usage: pnpm convex:seed:local または pnpm convex:seed:dev（対象やenv fileは変更できません）",
  );
}

function validateScenarioKeys(scenarioKeys: string[]): void {
  const uniqueKeys = new Set(scenarioKeys);
  const matchesCatalog =
    scenarioKeys.length === DEVELOPMENT_SEED_SCENARIO_KEYS.length &&
    uniqueKeys.size === DEVELOPMENT_SEED_SCENARIO_KEYS.length &&
    scenarioKeys.every((scenarioKey) => EXPECTED_SCENARIO_KEYS.has(scenarioKey));
  if (!matchesCatalog) {
    throw new DevelopmentSeedError("preflightのシナリオ一覧がCLIの契約と一致しません。後続処理は実行していません。");
  }
}

function normalizeDeploymentUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function validatePreflightContract(
  result: PreflightResult,
  target: DevelopmentSeedTarget,
  deploymentName: string,
): void {
  if (
    result.contractVersion !== DEVELOPMENT_SEED_CONTRACT_VERSION ||
    result.contractFingerprint !== DEVELOPMENT_SEED_CONTRACT_FINGERPRINT ||
    result.tableCount !== DEVELOPMENT_SEED_EXPECTED_TABLE_COUNT
  ) {
    throw new DevelopmentSeedError("preflightのbackend契約がCLIと一致しません。cancel・削除は実行していません。");
  }
  const deploymentUrl = normalizeDeploymentUrl(result.deploymentUrl);
  if (!deploymentUrl) {
    throw new DevelopmentSeedError("preflightのdeployment URLを確認できません。cancel・削除は実行していません。");
  }
  let parsedDeploymentUrl: URL;
  try {
    parsedDeploymentUrl = new URL(deploymentUrl);
  } catch {
    throw new DevelopmentSeedError("preflightのdeployment URLを確認できません。cancel・削除は実行していません。");
  }
  const expectedDeploymentUrl = `https://${deploymentName}.convex.cloud`;
  if (parsedDeploymentUrl.href !== `${expectedDeploymentUrl}/` || deploymentUrl !== expectedDeploymentUrl) {
    throw new DevelopmentSeedError(
      `preflightの${target === "local" ? "個人用dev" : "Development"} deploymentが固定env fileと一致しません。cancel・削除は実行していません。`,
    );
  }
}

function validateVerification(result: VerifyResult, preflight: PreflightResult): void {
  const inactiveWorkflowCounts =
    result.activeOutboxCount === 0 &&
    result.activeFanoutCount === 0 &&
    result.delayedDeadlineCount === 0 &&
    result.liveScheduledFunctionCount === 0;
  if (
    result.contractVersion !== DEVELOPMENT_SEED_CONTRACT_VERSION ||
    result.contractFingerprint !== DEVELOPMENT_SEED_CONTRACT_FINGERPRINT ||
    result.scenarioCount !== DEVELOPMENT_SEED_SCENARIO_KEYS.length ||
    result.organizationCount !== DEVELOPMENT_SEED_SCENARIO_KEYS.length ||
    result.tableCount !== preflight.tableCount ||
    !inactiveWorkflowCounts
  ) {
    throw new DevelopmentSeedError("seed後の検証条件を満たしません。再実行または復旧手順を確認してください。");
  }
}

function executeDevelopmentSeedWorkflow(
  target: DevelopmentSeedTarget,
  commandRunner: DevelopmentSeedCommandRunner,
  logger: DevelopmentSeedLogger,
  childEnv: Readonly<NodeJS.ProcessEnv>,
  deploymentName: string,
): DevelopmentSeedSummary {
  logger.log(
    `[development-seed] ${target === "local" ? "個人用dev" : "Development"} deploymentの全データ置換を開始します。`,
  );

  const preflightValue = invokeDevelopmentSeedFunction(
    commandRunner,
    childEnv,
    "事前確認",
    "developmentSeed/mutations:preflight",
    {},
  );
  if (!isPreflightResult(preflightValue)) {
    throw new DevelopmentSeedError("事前確認の応答形式が契約と一致しません。後続処理は実行していません。");
  }
  validatePreflightContract(preflightValue, target, deploymentName);
  validateScenarioKeys(preflightValue.scenarioKeys);
  logger.log(
    `[development-seed] 事前確認完了（${preflightValue.scenarioKeys.length}シナリオ、${preflightValue.tableCount}テーブル）。`,
  );

  let cursor: string | null = null;
  let auditToken: string | null = null;
  let cancelledScheduledFunctionCount = 0;
  let inProgressScheduledFunctionCount = 0;
  for (let callCount = 0; callCount < MAX_PAGINATED_CALLS; callCount += 1) {
    const resultValue = invokeDevelopmentSeedFunction(
      commandRunner,
      childEnv,
      "予約処理の停止",
      "developmentSeed/mutations:cancelScheduledFunctions",
      { cursor, auditToken },
    );
    if (!isCancelScheduledFunctionsResult(resultValue)) {
      throw new DevelopmentSeedError("予約処理停止の応答形式が契約と一致しません。後続処理を停止しました。");
    }
    if (auditToken && resultValue.auditToken !== auditToken) {
      throw new DevelopmentSeedError("予約処理停止のaudit tokenが一致しません。後続処理を停止しました。");
    }
    auditToken = resultValue.auditToken;
    cancelledScheduledFunctionCount += resultValue.cancelledCount;
    inProgressScheduledFunctionCount += resultValue.inProgressCount;
    if (resultValue.isDone) break;
    if (!resultValue.continueCursor || resultValue.continueCursor === cursor) {
      throw new DevelopmentSeedError("予約処理停止のcursorが進みません。後続処理を停止しました。");
    }
    cursor = resultValue.continueCursor;
    if (callCount === MAX_PAGINATED_CALLS - 1) {
      throw new DevelopmentSeedError("予約処理停止が安全上限内に完了しません。後続処理を停止しました。");
    }
  }
  if (inProgressScheduledFunctionCount > 0) {
    throw new DevelopmentSeedError("実行中の予約処理が残っています。全テーブル削除は開始していません。");
  }
  if (!auditToken) {
    throw new DevelopmentSeedError("予約処理停止のaudit証跡を確認できません。全テーブル削除は開始していません。");
  }
  logger.log(
    `[development-seed] 予約処理の確認完了（pending取消: ${cancelledScheduledFunctionCount}件、実行中: 0件）。`,
  );

  let tableIndex = 0;
  let deletedDocumentCount = 0;
  for (let callCount = 0; callCount < MAX_PAGINATED_CALLS; callCount += 1) {
    const resultValue = invokeDevelopmentSeedFunction(
      commandRunner,
      childEnv,
      "全テーブル削除",
      "developmentSeed/mutations:clearAllTables",
      { tableIndex, auditToken },
    );
    if (!isClearAllTablesResult(resultValue)) {
      throw new DevelopmentSeedError("全テーブル削除の応答形式が契約と一致しません。後続処理を停止しました。");
    }
    deletedDocumentCount += resultValue.deletedCount;
    if (resultValue.done) break;
    if (
      resultValue.nextTableIndex < tableIndex ||
      (resultValue.nextTableIndex === tableIndex && resultValue.deletedCount === 0)
    ) {
      throw new DevelopmentSeedError("全テーブル削除の進捗を確認できません。後続処理を停止しました。");
    }
    tableIndex = resultValue.nextTableIndex;
    if (callCount === MAX_PAGINATED_CALLS - 1) {
      throw new DevelopmentSeedError("全テーブル削除が安全上限内に完了しません。後続処理を停止しました。");
    }
  }
  logger.log(`[development-seed] 全テーブル削除完了（${deletedDocumentCount}件）。`);

  const actorsValue = invokeDevelopmentSeedFunction(
    commandRunner,
    childEnv,
    "actor作成",
    "developmentSeed/mutations:seedActors",
    { today: preflightValue.today, auditToken },
  );
  if (!isSeedActorsResult(actorsValue)) {
    throw new DevelopmentSeedError("actor作成の応答形式が契約と一致しません。後続処理を停止しました。");
  }
  let insertedDocumentCount = actorsValue.createdCount;
  logger.log(`[development-seed] 共通actor作成完了（${actorsValue.createdCount}件）。`);

  for (const [scenarioIndex, scenarioKey] of preflightValue.scenarioKeys.entries()) {
    const scenarioValue = invokeDevelopmentSeedFunction(
      commandRunner,
      childEnv,
      `シナリオ${scenarioIndex + 1}作成`,
      "developmentSeed/mutations:seedScenario",
      { scenarioKey, today: preflightValue.today, auditToken },
    );
    if (!isSeedScenarioResult(scenarioValue) || scenarioValue.scenarioKey !== scenarioKey) {
      throw new DevelopmentSeedError("シナリオ作成の応答形式が契約と一致しません。後続処理を停止しました。");
    }
    insertedDocumentCount += scenarioValue.insertedCount;
    logger.log(
      `[development-seed] シナリオ ${scenarioIndex + 1}/${preflightValue.scenarioKeys.length} 作成完了（${scenarioValue.insertedCount}件）。`,
    );
  }

  const verifyValue = invokeDevelopmentSeedFunction(
    commandRunner,
    childEnv,
    "完了検証",
    "developmentSeed/queries:verify",
    { today: preflightValue.today, auditToken },
  );
  if (!isVerifyResult(verifyValue)) {
    throw new DevelopmentSeedError("完了検証の応答形式が契約と一致しません。seedを完了扱いにしていません。");
  }
  validateVerification(verifyValue, preflightValue);
  logger.log(
    `[development-seed] 完了（組織: ${verifyValue.organizationCount}、店舗: ${verifyValue.shopCount}、スタッフ: ${verifyValue.staffCount}、募集: ${verifyValue.recruitmentCount}）。`,
  );

  return {
    target,
    today: preflightValue.today,
    scenarioCount: preflightValue.scenarioKeys.length,
    tableCount: preflightValue.tableCount,
    cancelledScheduledFunctionCount,
    deletedDocumentCount,
    insertedDocumentCount,
    verification: verifyValue,
  };
}

export function runDevelopmentSeed(
  target: DevelopmentSeedTarget,
  dependencies: DevelopmentSeedDependencies = {},
): DevelopmentSeedSummary {
  const config = TARGET_CONFIGS[target];
  const commandRunner = dependencies.commandRunner ?? defaultCommandRunner;
  const environmentRunner = dependencies.environmentRunner ?? defaultCommandRunner;
  const fileReader = dependencies.fileReader ?? defaultFileReader;
  const logger = dependencies.logger ?? console;

  let envContents: string;
  try {
    envContents = fileReader(config.envFile);
  } catch {
    throw new DevelopmentSeedError(`${config.envFile}を確認できません。処理は開始していません。`);
  }
  const validatedDeployment = validateDevelopmentSeedDeployment(target, envContents);
  const childEnv = buildDevelopmentSeedChildEnv(validatedDeployment);

  let summary: DevelopmentSeedSummary | undefined;
  let operationError: unknown;
  let guardEnableAttempted = false;
  let guardDisabled = false;
  try {
    guardEnableAttempted = true;
    enableDevelopmentSeedGuard(environmentRunner, childEnv);
    summary = executeDevelopmentSeedWorkflow(
      target,
      commandRunner,
      logger,
      childEnv,
      validatedDeployment.deploymentName,
    );
  } catch (error) {
    operationError = error;
  } finally {
    if (guardEnableAttempted) {
      guardDisabled = disableAndVerifyDevelopmentSeedGuard(environmentRunner, childEnv);
      if (guardDisabled) logger.log("[development-seed] 破壊操作guardの無効化を確認しました。");
    }
  }

  if (!guardDisabled) {
    const operationMessage = operationError ? `${formatDevelopmentSeedError(operationError)} ` : "";
    throw new DevelopmentSeedError(
      `${operationMessage}破壊操作guardの無効化を確認できません。対象deploymentでDEVELOPMENT_SEED_ENABLED=falseを確認してください。`,
    );
  }
  if (operationError) throw operationError;
  if (!summary) throw new DevelopmentSeedError("開発シードの完了状態を確認できませんでした。");
  return summary;
}

export function formatDevelopmentSeedError(error: unknown): string {
  if (error instanceof DevelopmentSeedError) return error.message;
  return "開発シードで予期しないエラーが発生しました。生のエラーは表示していません。";
}

export function main(args = process.argv.slice(2), dependencies: DevelopmentSeedDependencies = {}): void {
  try {
    const target = parseDevelopmentSeedCliArgs(args);
    runDevelopmentSeed(target, dependencies);
  } catch (error) {
    console.error(`[development-seed] ${formatDevelopmentSeedError(error)}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
