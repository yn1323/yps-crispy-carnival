import { cp, mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";

const cwd = process.cwd();
const baselineDir = path.resolve(cwd, process.env.REGSUIT_BASELINE_DIR ?? "vrt-work/baseline");
const expectedDir = path.resolve(cwd, process.env.REGSUIT_EXPECTED_DIR ?? "vrt-work/reg/expected");

await rm(expectedDir, { force: true, recursive: true });
await mkdir(expectedDir, { recursive: true });

try {
  const baselineStat = await stat(baselineDir);
  if (!baselineStat.isDirectory()) {
    console.log(`RegSuit baseline is not a directory: ${baselineDir}`);
    process.exit(0);
  }
} catch (error) {
  if ((error as NodeJS.ErrnoException).code === "ENOENT") {
    console.log(`RegSuit baseline not found. Starting with an empty baseline: ${baselineDir}`);
    process.exit(0);
  }

  throw error;
}

await cp(baselineDir, expectedDir, { force: true, recursive: true });
console.log(`RegSuit baseline copied from ${baselineDir} to ${expectedDir}`);
