import { convexRunJson } from "./convex";
import { pollUntil } from "./poll";

type MagicLinkPurpose = "submit" | "view";

type MagicLinkResult = {
  token: string | null;
  recruitmentId?: string;
  staffId?: string;
  usedAt?: number | null;
};

type CreatedMagicLinkResult = Omit<MagicLinkResult, "token"> & { token: string };

const POLL_DEADLINE_MS = 10_000;
const POLL_INTERVAL_MS = 500;

type MagicLinkArgs = {
  recruitmentId?: string;
  shopId?: string;
  staffEmail: string;
  purpose: MagicLinkPurpose;
};

export function createMagicLinkTokenForLatestRecruitment(args: MagicLinkArgs): CreatedMagicLinkResult {
  return convexRunJson<CreatedMagicLinkResult>("testing:createMagicLinkTokenForLatestRecruitment", args);
}

export async function waitForMagicLinkToken(args: MagicLinkArgs): Promise<CreatedMagicLinkResult> {
  try {
    const result = await pollUntil({
      deadlineMs: POLL_DEADLINE_MS,
      commandTimeoutMs: 8_000,
      intervalMs: POLL_INTERVAL_MS,
      errorCode: "magic-link-token-unavailable",
      probe: ({ commandTimeoutMs }) =>
        convexRunJson<MagicLinkResult>("testing:getLatestMagicLinkToken", args, { timeoutMs: commandTimeoutMs }),
      accept: (candidate) => Boolean(candidate.token),
    });
    return result as CreatedMagicLinkResult;
  } catch (error) {
    if (error instanceof Error && error.name === "E2EPollDeadlineError") {
      throw new Error("E2E capability was not issued: magic-link-token");
    }
    throw error;
  }
}
