#!/usr/bin/env tsx

import { execSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

const main = async () => {
  try {
    console.log("==========================================");
    console.log("Current DB state will be reflected in seeds...");
    console.log("==========================================");

    // Step 1: Execute export.ts to export data
    console.log("\nExporting data...");
    execSync("pnpm tsx convex-seeds/scripts/export.ts", {
      stdio: "inherit",
      cwd: process.cwd(),
    });

    // Step 2: Get the latest backup folder
    console.log("\nSearching for the latest backup folder...");
    const backupDir = "convex-seeds/backup";
    const entries = await fs.readdir(backupDir, { withFileTypes: true });

    // Extract directories only and sort by timestamp (descending)
    const directories = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
      .reverse();

    if (directories.length === 0) {
      throw new Error("No backup folder found");
    }

    const latestBackup = directories[0];
    const dataDir = path.join(backupDir, latestBackup, "data");

    console.log(`Latest backup folder: ${latestBackup}`);

    // Step 3: Check if data folder exists
    try {
      await fs.access(dataDir);
    } catch {
      throw new Error(`Data folder not found: ${dataDir}`);
    }

    // Step 4: Copy all files in data folder to seeds folder
    console.log("\nCopying data folder contents to seeds folder...");
    const seedsDir = "convex-seeds/seeds";

    // Create seeds folder if it doesn't exist
    await fs.mkdir(seedsDir, { recursive: true });

    const dataFiles = await fs.readdir(dataDir);
    const jsonlFiles = dataFiles.filter((file) => file.endsWith(".jsonl"));

    if (jsonlFiles.length === 0) {
      console.log("No files to copy found");
      return;
    }

    console.log(`Copying ${jsonlFiles.length} files...`);

    for (const file of jsonlFiles) {
      const sourceFile = path.join(dataDir, file);
      const targetFile = path.join(seedsDir, file);

      try {
        await fs.copyFile(sourceFile, targetFile);
        console.log(`Copied: ${file} -> seeds/${file}`);
      } catch (error) {
        console.log(`Failed to copy ${file}`);
        console.error(error);
      }
    }

    console.log("\n==========================================");
    console.log("Current DB state has been reflected in seeds!");
    console.log(`Source: backup/${latestBackup}/data`);
    console.log(`Destination: seeds/`);
    console.log("==========================================");
  } catch (error) {
    console.error("\nAn error occurred:");
    console.error(error);
    process.exit(1);
  }
};

main();
