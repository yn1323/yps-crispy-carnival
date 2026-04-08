import { execSync } from "node:child_process";

export function convexRun(fn: string, args: Record<string, unknown> = {}): string {
  const previewFlag = process.env.CONVEX_PREVIEW_NAME ? `--preview-name ${process.env.CONVEX_PREVIEW_NAME}` : "";
  return execSync(`npx convex run --no-push ${fn} '${JSON.stringify(args)}' ${previewFlag}`, {
    encoding: "utf-8",
    cwd: process.cwd(),
  });
}
