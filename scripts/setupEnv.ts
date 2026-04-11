#!/usr/bin/env tsx

/**
 * .env から Convex 環境変数を一括設定するスクリプト
 *
 * 対象変数:
 * - RESEND_API_KEY
 * - APP_URL
 * - CLERK_JWT_ISSUER_DOMAIN
 */
import { execFileSync } from "node:child_process";
import { config } from "dotenv";

const CONVEX_ENV_KEYS = ["RESEND_API_KEY", "APP_URL", "CLERK_JWT_ISSUER_DOMAIN"] as const;

const main = () => {
  config(); // .env を読み込み

  console.log("==========================================");
  console.log("Convex 環境変数を .env から設定します...");
  console.log("==========================================\n");

  let successCount = 0;

  for (const key of CONVEX_ENV_KEYS) {
    const value = process.env[key];

    if (!value) {
      console.log(`⏭️  ${key}: .env に未設定のためスキップ`);
      continue;
    }

    try {
      execFileSync("npx", ["convex", "env", "set", key, value], {
        stdio: "pipe",
        cwd: process.cwd(),
      });
      console.log(`✅ ${key}: 設定完了`);
      successCount++;
    } catch (e) {
      console.error(`❌ ${key}: 設定失敗`, e instanceof Error ? e.message : e);
    }
  }

  console.log(`\n==========================================`);
  console.log(`完了: ${successCount}/${CONVEX_ENV_KEYS.length} 件設定しました`);
  console.log("==========================================");
};

main();
