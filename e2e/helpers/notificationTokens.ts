import { convexRun } from "./convex";

type MagicLinkPurpose = "submit" | "view";

type MagicLinkResult = {
  token: string | null;
  recruitmentId?: string;
  staffId?: string;
};

type LineLinkResult = {
  token: string | null;
  authorizeUrl?: string | null;
};

type CreatedMagicLinkResult = Omit<MagicLinkResult, "token"> & { token: string };
type CreatedLineLinkResult = Omit<LineLinkResult, "token"> & { token: string };

const POLL_ATTEMPTS = 6;
const POLL_INTERVAL_MS = 500;

function parseConvexResult<T>(raw: string): T {
  return JSON.parse(raw.trim()) as T;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function convexRunJson<T>(fn: string, args: Record<string, unknown> = {}): T {
  return parseConvexResult<T>(convexRun(fn, args));
}

export async function getOrCreateMagicLinkToken(args: {
  recruitmentId?: string;
  staffEmail: string;
  purpose: MagicLinkPurpose;
}): Promise<CreatedMagicLinkResult> {
  for (let i = 0; i < POLL_ATTEMPTS; i++) {
    const result = convexRunJson<MagicLinkResult>("testing:getLatestMagicLinkToken", args);
    if (result.token) return result as CreatedMagicLinkResult;
    await sleep(POLL_INTERVAL_MS);
  }

  return convexRunJson<CreatedMagicLinkResult>("testing:createMagicLinkTokenForLatestRecruitment", args);
}

export async function getOrCreateLineLinkToken(staffEmail: string): Promise<CreatedLineLinkResult> {
  for (let i = 0; i < POLL_ATTEMPTS; i++) {
    const result = convexRunJson<LineLinkResult>("testing:getLatestLineLinkToken", { staffEmail });
    if (result.token) return result as CreatedLineLinkResult;
    await sleep(POLL_INTERVAL_MS);
  }

  return convexRunJson<CreatedLineLinkResult>("testing:createLineLinkTokenForStaff", { staffEmail });
}
