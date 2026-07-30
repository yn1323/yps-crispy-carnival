import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  assertOutputDirectory,
  collectPublicRoutes,
  createCloudflareHeaders,
  createCloudflareRedirects,
  STATIC_CLIENT_OUTPUT_DIR,
} from "./staticSite";

export async function prepareStaticDeployment(
  outputDirectory = STATIC_CLIENT_OUTPUT_DIR,
  repoRoot = process.cwd(),
): Promise<void> {
  const resolvedOutput = assertOutputDirectory(outputDirectory, repoRoot);
  const publicRoutes = collectPublicRoutes(repoRoot);

  await mkdir(resolvedOutput, { recursive: true });
  await Promise.all([
    writeFile(join(resolvedOutput, "_redirects"), createCloudflareRedirects(publicRoutes), "utf8"),
    writeFile(join(resolvedOutput, "_headers"), createCloudflareHeaders(publicRoutes), "utf8"),
  ]);

  console.log(`[static-deploy] Wrote _redirects and _headers for ${publicRoutes.length} public routes`);
}

await prepareStaticDeployment();
