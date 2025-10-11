#!/usr/bin/env tsx

import { execSync } from "node:child_process";
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import unzipper from "unzipper";

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
          const filePath = path.join(backupDir, file);
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

    // zip展開
    console.log("\nzipファイルを展開中...");
    const extractDir = `convex-seeds/backup/${timestamp}`;
    await fs.mkdir(extractDir, { recursive: true });

    try {
      await new Promise((resolve, reject) => {
        createReadStream(zipFile)
          .pipe(unzipper.Extract({ path: extractDir }))
          .on("finish", resolve)
          .on("error", reject);
      });
    } catch (e) {
      console.log("⚠️ zipファイルの展開に失敗しました。zipファイルのみ保存されました。");
      console.error(e);
    }

    // ファイルシステムへの書き込み完了を待つ
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // dataフォルダを作成
    console.log("\ndataフォルダを作成中...");
    const dataDir = path.join(extractDir, "data");
    await fs.mkdir(dataDir, { recursive: true });

    // _tablesを除く各フォルダのdocuments.jsonlをコピー
    console.log("documents.jsonlをコピー中...");
    const entries = await fs.readdir(extractDir, { withFileTypes: true });

    console.log(
      `📂 検出されたエントリ: ${entries.map((e) => `${e.name}(${e.isDirectory() ? "dir" : "file"})`).join(", ")}`,
    );

    for (const entry of entries) {
      console.log(`🔍 チェック中: ${entry.name}, isDirectory: ${entry.isDirectory()}`);

      // ディレクトリかつ、_tablesとdataフォルダ以外を対象
      if (entry.isDirectory() && entry.name !== "_tables" && entry.name !== "data") {
        const sourceFile = path.join(extractDir, entry.name, "documents.jsonl");
        const targetFile = path.join(dataDir, `${entry.name}.jsonl`);

        console.log(`📄 コピー試行: ${sourceFile}`);

        try {
          await fs.copyFile(sourceFile, targetFile);
          console.log(`✅ ${entry.name}/documents.jsonl → data/${entry.name}.jsonl`);
        } catch (error) {
          console.log(`⚠️ ${entry.name}/documents.jsonl のコピーに失敗しました`);
          console.error(error);
        }
      }
    }

    console.log("✅ データコピー完了");

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
