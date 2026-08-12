import { cp, mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASELINE_IMAGE_EXTENSIONS = new Set([".jpeg", ".jpg", ".png", ".webp"]);

export type RegSuitBaselineState = {
  exists: boolean;
  imageCount: number;
  isDirectory: boolean;
};

export function assertRegSuitBaseline(state: RegSuitBaselineState, required: boolean): void {
  if (!required) return;

  if (!state.exists) {
    throw new Error("Required RegSuit baseline directory was not found.");
  }
  if (!state.isDirectory) {
    throw new Error("Required RegSuit baseline path is not a directory.");
  }
  if (state.imageCount === 0) {
    throw new Error("Required RegSuit baseline directory contains no images.");
  }
}

async function countBaselineImages(directory: string): Promise<number> {
  let count = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      count += await countBaselineImages(entryPath);
    } else if (entry.isFile() && BASELINE_IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      count += 1;
    }
  }
  return count;
}

async function inspectRegSuitBaseline(baselineDir: string): Promise<RegSuitBaselineState> {
  try {
    const baselineStat = await stat(baselineDir);
    if (!baselineStat.isDirectory()) {
      return { exists: true, imageCount: 0, isDirectory: false };
    }
    return {
      exists: true,
      imageCount: await countBaselineImages(baselineDir),
      isDirectory: true,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { exists: false, imageCount: 0, isDirectory: false };
    }
    throw error;
  }
}

export async function prepareRegSuitBaseline({
  baselineDir,
  expectedDir,
  required,
}: {
  baselineDir: string;
  expectedDir: string;
  required: boolean;
}): Promise<RegSuitBaselineState> {
  const state = await inspectRegSuitBaseline(baselineDir);
  assertRegSuitBaseline(state, required);

  await rm(expectedDir, { force: true, recursive: true });
  await mkdir(expectedDir, { recursive: true });

  if (!state.exists || !state.isDirectory) {
    console.log(`RegSuit baseline not found. Starting with an empty baseline: ${baselineDir}`);
    return state;
  }

  await cp(baselineDir, expectedDir, { force: true, recursive: true });
  console.log(`RegSuit baseline copied from ${baselineDir} to ${expectedDir} (${state.imageCount} images)`);
  return state;
}

async function main(): Promise<void> {
  const cwd = process.cwd();
  await prepareRegSuitBaseline({
    baselineDir: path.resolve(cwd, process.env.REGSUIT_BASELINE_DIR ?? "vrt-work/baseline"),
    expectedDir: path.resolve(cwd, process.env.REGSUIT_EXPECTED_DIR ?? "vrt-work/reg/expected"),
    required: process.env.REGSUIT_REQUIRE_BASELINE === "true",
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "RegSuit baseline preparation failed.");
    process.exitCode = 1;
  });
}
