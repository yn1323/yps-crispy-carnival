#!/usr/bin/env tsx

import { execSync } from "node:child_process";
import { promises as fs } from "node:fs";

const main = async () => {
  try {
    console.log("==========================================");
    console.log("Convexデータベースをエクスポートします...");
    console.log("==========================================");

    // backup配下のファイル・ディレクトリを削除（.gitkeep以外）
    console.log("backup配下をクリーンアップ中...");
    const backupDir = "convex-seeds/backup";

    try {
      const files = await fs.readdir(backupDir);
      for (const file of files) {
        if (file !== ".gitkeep") {
          const filePath = `${backupDir}/${file}`;
          const stat = await fs.lstat(filePath);
          if (stat.isDirectory()) {
            await fs.rm(filePath, { recursive: true, force: true });
          } else {
            await fs.unlink(filePath);
          }
        }
      }
      console.log("✅ クリーンアップ完了");
    } catch {
      console.log("📁 backupディレクトリが存在しないため作成します");
      await fs.mkdir(backupDir, { recursive: true });
    }

    // タイムスタンプ生成
    const timestamp = new Date().toISOString().replace(/[:-]/g, "").replace("T", "_").split(".")[0];
    const zipFile = `convex-seeds/backup/${timestamp}.zip`;

    // Convexエクスポート実行
    console.log("\nエクスポート中...");
    console.log(`実行コマンド: npx convex export --path ${zipFile}`);

    execSync(`npx convex export --path ${zipFile}`, {
      stdio: "inherit",
      cwd: process.cwd(),
    });

    // seedsフォルダにzipファイルをコピー
    console.log("\nzipファイルをseedsフォルダにコピー中...");
    const seedsDir = "convex-seeds/seeds";
    await fs.mkdir(seedsDir, { recursive: true });
    const seedsZipFile = `${seedsDir}/db.zip`;
    await fs.copyFile(zipFile, seedsZipFile);
    console.log(`✅ ${zipFile} → ${seedsZipFile}`);

    console.log("\n==========================================");
    console.log("✅ エクスポートが完了しました！");
    console.log(`📦 バックアップファイル: ${zipFile}`);
    console.log("==========================================");
  } catch (error) {
    console.error("\n❌ エラーが発生しました:");
    console.error(error);
    process.exit(1);
  }
};

main();
