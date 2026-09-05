export type BaselineArchive = { checksum: string; imageCount: number; bytes: number };
export function createBaselineArchive(options: { source: string; archivePath: string }): Promise<BaselineArchive>;
export function extractBaselineArchive(options: {
  archivePath: string;
  destination: string;
  checksum: string;
  imageCount: number;
}): Promise<{ imageCount: number }>;
export function downloadBaseline(options: {
  baseUrl: string;
  branch: "develop" | "main";
  destination: string;
  fetchImpl?: typeof fetch;
}): Promise<{ imageCount: number }>;
