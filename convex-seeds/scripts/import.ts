#!/usr/bin/env tsx

import { execSync } from "node:child_process";
import { promises as fs } from "node:fs";

const main = async () => {
  try {
    console.log("==========================================");
    console.log("Convexデータベースにシードデータをインポートします...");
    console.log("==========================================");

    // 全テーブルをクリア
    console.log("\n全テーブルのデータをクリア中...");
    console.log("----------------------------------------");
    try {
      execSync("npx convex run testing:clearAllTables", {
        stdio: "inherit",
        cwd: process.cwd(),
      });
      console.log("✅ 全テーブルのクリアが完了しました\n");
    } catch {
      console.log("⚠️ テーブルクリアをスキップしました（Convexが起動していない可能性があります）\n");
    }

    console.log(`作業ディレクトリ: ${process.cwd()}`);

    // package.jsonの存在確認
    try {
      await fs.access("package.json");
      console.log("✅ package.jsonを確認しました");
    } catch {
      console.log("❌ package.jsonが見つかりません。Convexプロジェクトのルートディレクトリで実行してください。");
      process.exit(1);
    }

    // Node.js環境の確認
    console.log("\nNode.js環境の確認...");
    console.log("----------------------------------------");

    try {
      const nodeVersion = execSync("node --version", { encoding: "utf8" }).trim();
      console.log(`✅ Node.js バージョン: ${nodeVersion}`);
    } catch {
      console.log("❌ Node.jsが見つかりません");
      process.exit(1);
    }

    try {
      const npxVersion = execSync("npx --version", { encoding: "utf8" }).trim();
      console.log(`✅ npx バージョン: ${npxVersion}`);
    } catch {
      console.log("❌ npxが見つかりません");
      process.exit(1);
    }

    // db.zipの存在確認
    const zipFile = "convex-seeds/seeds/db.zip";
    console.log("\ndb.zipの確認...");
    console.log("----------------------------------------");

    try {
      const stat = await fs.stat(zipFile);
      console.log(`✅ db.zipが見つかりました (${stat.size} バイト)`);
    } catch {
      console.log(`❌ db.zipが見つかりません: ${zipFile}`);
      process.exit(1);
    }

    // Convexインポートコマンドを実行
    console.log("\nインポートを開始します...");
    console.log("==========================================");

    const command = `npx convex import --replace-all ${zipFile} --yes`;
    console.log(`実行コマンド: ${command}\n`);

    try {
      execSync(command, {
        stdio: "inherit",
        cwd: process.cwd(),
      });
      console.log("\n✅ インポートが完了しました");
    } catch (error) {
      console.log("\n❌ インポートでエラーが発生しました");
      if (error instanceof Error) {
        console.log(`  - エラー: ${error.message}`);
      }
      process.exit(1);
    }

    console.log("\n==========================================");
    console.log("全ての処理が完了しました！");
    console.log("==========================================");
  } catch (error) {
    console.error("\n❌ 予期しないエラーが発生しました:");
    console.error(error);
    process.exit(1);
  }
};

main();
