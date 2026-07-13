import { readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const requiredVrtArtifactNames = [
  "features-authpage--mobile.png",
  "features-dashboard-dashboardcontent--normal.png",
  "features-dashboard-dashboardcontent--empty.png",
  "features-dashboard-dashboardcontent--with-notification-failures.png",
  "features-dashboard-recruitmentboard--multiple-groups-mobile.png",
  "features-dashboard-recruitmentboard--past-loaded-can-load-more.png",
  "features-dashboard-staffregistrationrequests--mobile-dialog-open.png",
  "features-shiftboard-shiftboardpage--pc.png",
  "features-shiftboard-shiftboardpage--sp.png",
  "features-staffguidecontent--default.png",
  "features-staffguidecontent--mobile.png",
  "features-staffregistration--form.png",
  "features-staffregistration--confirm.png",
  "features-staffregistration--submitted.png",
  "features-staffregistration--expired.png",
  "features-staffsubmit-shiftsubmitpage--state-a-unsubmitted.png",
] as const;

export const forbiddenVrtArtifactNames = [
  "features-dashboard-addstaffform--valid-submit-passes-normalized-payload.png",
  "features-dashboard-createrecruitmentform--interactive-double-submit-guard.png",
  "features-dashboard-editstaffform--validation-and-submit.png",
  "features-dashboard-notificationfailuredialog--interactive.png",
  "features-dashboard-setupmodal--interactive-double-submit-guard.png",
  "features-shiftboard-shiftboardpage--sp-dialog-interaction.png",
  "features-staffregistration--interactive-double-submit-guard.png",
  "ui-tour--interactive.png",
] as const;

export function assertVrtArtifactContract(fileNames: readonly string[]) {
  const pngNames = new Set(fileNames.filter((fileName) => fileName.endsWith(".png")));
  if (pngNames.size === 0) {
    throw new Error("VRT capture produced no PNG artifacts.");
  }

  const missing = requiredVrtArtifactNames.filter((fileName) => !pngNames.has(fileName));
  if (missing.length > 0) {
    throw new Error(`VRT capture is missing required stories:\n${missing.join("\n")}`);
  }

  const unexpected = forbiddenVrtArtifactNames.filter((fileName) => pngNames.has(fileName));
  if (unexpected.length > 0) {
    throw new Error(`VRT capture includes behavior-only stories:\n${unexpected.join("\n")}`);
  }
}

async function readArtifactNames(rootDir: string): Promise<string[]> {
  const entries = await readdir(rootDir, { recursive: true, withFileTypes: true });
  return entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
}

async function main() {
  const artifactDir = path.resolve(process.cwd(), process.argv[2] ?? "vrt-actual");
  const fileNames = await readArtifactNames(artifactDir);
  assertVrtArtifactContract(fileNames);
  console.log(`VRT artifact contract passed: ${fileNames.filter((name) => name.endsWith(".png")).length} PNGs.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
