#!/usr/bin/env tsx

import { execSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

const main = async () => {
  try {
    console.log("==========================================");
    console.log("Convexデータベースにシードデータをインポートします...");
    console.log("==========================================");

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

    // seedsディレクトリの確認
    const seedsDir = "./convex-seeds/seeds";
    console.log("\nseedsディレクトリの確認...");
    console.log("----------------------------------------");

    try {
      await fs.access(seedsDir);
      console.log("✅ seedsディレクトリが見つかりました");

      const files = await fs.readdir(seedsDir);
      console.log("seedsディレクトリの内容:");
      for (const file of files) {
        const filePath = path.join(seedsDir, file);
        const stat = await fs.stat(filePath);
        const type = stat.isDirectory() ? "ディレクトリ" : "ファイル";
        console.log(`  - ${file} (${type})`);
      }
    } catch {
      console.log(`❌ seedsディレクトリが見つかりません: ${seedsDir}`);
      try {
        const currentFiles = await fs.readdir(".");
        console.log("現在のディレクトリの内容:");
        currentFiles.forEach((file) => {
          console.log(`  - ${file}`);
        });
      } catch {
        console.log("現在のディレクトリの内容を取得できません");
      }
      process.exit(1);
    }

    // .jsonlファイルの確認
    console.log("\n処理対象ファイルの確認...");
    console.log("----------------------------------------");

    const files = await fs.readdir(seedsDir);
    const jsonlFiles = files.filter((file) => file.endsWith(".jsonl") && file !== "empty.jsonl");

    if (jsonlFiles.length === 0) {
      console.log("❌ インポートするJSONLファイルが見つかりません");
      process.exit(1);
    }

    for (const file of jsonlFiles) {
      const tableName = file.replace(".jsonl", "");
      console.log(`  - ${file} -> ${tableName} テーブル`);
    }

    console.log("\nインポートを開始します...");
    console.log("==========================================");

    // ファイルを処理
    for (const file of jsonlFiles) {
      const filePath = path.join(seedsDir, file);
      const tableName = file.replace(".jsonl", "");

      console.log("\n==================================================");
      console.log(`インポート中: ${file} -> テーブル: ${tableName}`);
      console.log(`ファイルパス: ${filePath}`);
      console.log("==================================================");

      // ファイルサイズとプレビューを表示
      try {
        const stat = await fs.stat(filePath);
        console.log(`ファイルサイズ: ${stat.size} バイト`);

        const content = await fs.readFile(filePath, "utf8");
        const lines = content.split("\n").slice(0, 3);
        console.log("ファイルの最初の3行:");
        lines.forEach((line, index) => {
          if (line.trim()) console.log(`  ${index + 1}: ${line}`);
        });
        console.log("----------------------------------------");
      } catch {
        console.log("ファイルの読み取りに失敗");
      }

      // Convexインポートコマンドを実行
      const command = `npx convex import --table "${tableName}" --replace "${filePath}" --yes`;
      console.log(`実行コマンド: ${command}`);
      console.log("");

      try {
        execSync(command, {
          stdio: "inherit",
          cwd: process.cwd(),
        });
        console.log(`\n✅ ${tableName} テーブルのインポートが完了しました`);
        // biome-ignore lint/suspicious/noExplicitAny: temp
      } catch (error: any) {
        console.log(`\n❌ ${tableName} テーブルのインポートでエラーが発生しました`);
        console.log("\n🔍 デバッグ情報:");
        console.log(`  - PWD: ${process.cwd()}`);
        console.log(`  - ファイル存在確認: ${filePath}`);
        try {
          await fs.access(filePath);
          console.log("  - ファイルは存在します");
        } catch {
          console.log("  - ファイルが見つかりません");
        }

        // エラー詳細
        if (error.message) {
          console.log(`  - エラー: ${error.message}`);
        }
      }

      console.log("");
    }

    console.log("==========================================");
    console.log("全ての処理が完了しました！");
    console.log("==========================================");
  } catch (error) {
    console.error("\n❌ 予期しないエラーが発生しました:");
    console.error(error);
    process.exit(1);
  }
};

main();
