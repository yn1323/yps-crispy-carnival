export function prepareHostedReport(options: {
  reportType: "vrt" | "playwright";
  source: string;
  destination: string;
}): Promise<{ fileCount: number; bytes: number }>;
export function assertReportPath(value: string): string;
export function collectReportFiles(root: string): Promise<Map<string, { absolute: string; size: number }>>;
export function assertReportPrivacy(root: string): Promise<void>;
export function createReportDestination(source: string, destination: string): Promise<string>;
export function readReportZipEntries(buffer: Uint8Array): Map<string, Buffer>;
