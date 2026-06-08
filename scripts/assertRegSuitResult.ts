import { readFile } from "node:fs/promises";
import path from "node:path";

type RegSuitResult = {
  failedItems?: string[];
  newItems?: string[];
  deletedItems?: string[];
  passedItems?: string[];
};

const resultPath = path.resolve(process.cwd(), process.env.REGSUIT_RESULT_JSON ?? "vrt-work/reg/out.json");
const result = JSON.parse(await readFile(resultPath, "utf8")) as RegSuitResult;

const changedCount = result.failedItems?.length ?? 0;
const newCount = result.newItems?.length ?? 0;
const deletedCount = result.deletedItems?.length ?? 0;
const passedCount = result.passedItems?.length ?? 0;

console.log(
  `RegSuit result: ${changedCount} changed, ${newCount} new, ${deletedCount} deleted, ${passedCount} passed.`,
);

if (changedCount > 0 || newCount > 0 || deletedCount > 0) {
  process.exitCode = 1;
}
