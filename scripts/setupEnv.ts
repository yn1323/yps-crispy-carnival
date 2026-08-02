#!/usr/bin/env tsx

/**
 * .env から Convex 環境変数を一括設定するスクリプト
 *
 * 対象変数:
 * - RESEND_API_KEY
 * - RESEND_WEBHOOK_SECRET
 * - APP_URL
 * - CLERK_JWT_ISSUER_DOMAIN
 * - CLERK_SECRET_KEY
 * - VITE_CLERK_PUBLISHABLE_KEY
 * - ORGANIZATION_INVITATION_SIGNING_SECRET
 * - SHIFTORI_INTERNAL_API_SECRET
 * - STRIPE_SECRET_KEY
 * - STRIPE_WEBHOOK_SECRET
 * - STRIPE_PRO_PRICE_ID
 * - STRIPE_BUSINESS_PRICE_ID
 * - STRIPE_PORTAL_CONFIGURATION_ID
 * - FEATURE_SHOP_ADDITION
 * - FEATURE_BILLING
 * - FEATURE_ORGANIZATION_CREATION
 * - FEATURE_MANAGER_INVITATION
 */
import { execFileSync } from "node:child_process";
import { config } from "dotenv";

const CONVEX_ENV_KEYS = [
  "RESEND_API_KEY",
  "RESEND_WEBHOOK_SECRET",
  "APP_URL",
  "CLERK_JWT_ISSUER_DOMAIN",
  "CLERK_SECRET_KEY",
  "VITE_CLERK_PUBLISHABLE_KEY",
  "ORGANIZATION_INVITATION_SIGNING_SECRET",
  "SHIFTORI_INTERNAL_API_SECRET",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRO_PRICE_ID",
  "STRIPE_BUSINESS_PRICE_ID",
  "STRIPE_PORTAL_CONFIGURATION_ID",
  // ダークローンチの段階解放用。未設定のdeploymentでは閉じた状態になる。
  "FEATURE_SHOP_ADDITION",
  "FEATURE_BILLING",
  "FEATURE_ORGANIZATION_CREATION",
  "FEATURE_MANAGER_INVITATION",
] as const;
const DARK_LAUNCH_ENV_KEYS = new Set<string>([
  "FEATURE_SHOP_ADDITION",
  "FEATURE_BILLING",
  "FEATURE_ORGANIZATION_CREATION",
  "FEATURE_MANAGER_INVITATION",
]);
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

const main = () => {
  config(); // .env を読み込み

  console.log("==========================================");
  console.log("Convex 環境変数を .env から設定します...");
  console.log("==========================================\n");

  let successCount = 0;

  for (const key of CONVEX_ENV_KEYS) {
    // deploymentに過去のenabledが残っていても、.envの未指定を明示的な閉状態として同期する。
    const value = DARK_LAUNCH_ENV_KEYS.has(key) ? process.env[key]?.trim() || "disabled" : process.env[key];

    if (!value) {
      console.log(`⏭️  ${key}: .env に未設定のためスキップ`);
      continue;
    }

    try {
      execFileSync(pnpmCommand, ["exec", "convex", "env", "set", key], {
        input: `${value}\n`,
        stdio: ["pipe", "pipe", "pipe"],
        cwd: process.cwd(),
      });
      console.log(`✅ ${key}: 設定完了`);
      successCount++;
    } catch {
      // child processの出力にはsecretが含まれる可能性があるため、固定メッセージだけを表示する。
      console.error(`❌ ${key}: 設定失敗`);
    }
  }

  console.log(`\n==========================================`);
  console.log(`完了: ${successCount}/${CONVEX_ENV_KEYS.length} 件設定しました`);
  console.log("==========================================");
};

main();
