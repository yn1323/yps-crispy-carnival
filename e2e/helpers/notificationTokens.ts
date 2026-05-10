import { convexRunJson } from "./convex";

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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollConvexToken<T extends { token: string | null }>(
  fn: string,
  args: Record<string, unknown>,
  attempts: number,
): Promise<(T & { token: string }) | null> {
  for (let i = 0; i < attempts; i++) {
    const result = convexRunJson<T>(fn, args);
    if (result.token) return result as T & { token: string };
    await sleep(POLL_INTERVAL_MS);
  }

  return null;
}

export async function getOrCreateMagicLinkToken(args: {
  recruitmentId?: string;
  shopId?: string;
  staffEmail: string;
  purpose: MagicLinkPurpose;
}): Promise<CreatedMagicLinkResult> {
  // 通知 action は scheduler 経由で非同期実行される。
  // まず実際に発行された token を待ち、無ければテスト用 internal API で補助発行してシナリオを進める。
  const existing = await pollConvexToken<MagicLinkResult>("testing:getLatestMagicLinkToken", args, POLL_ATTEMPTS);
  if (existing) return existing;

  return convexRunJson<CreatedMagicLinkResult>("testing:createMagicLinkTokenForLatestRecruitment", args);
}

export async function waitForMagicLinkToken(args: {
  recruitmentId?: string;
  shopId?: string;
  staffEmail: string;
  purpose: MagicLinkPurpose;
}): Promise<CreatedMagicLinkResult> {
  // 追送・follow起点の通知は「発行されること」自体が検証対象なので、補助発行せず待ち切れなければ失敗にする。
  const issued = await pollConvexToken<MagicLinkResult>("testing:getLatestMagicLinkToken", args, POLL_ATTEMPTS * 2);
  if (issued) return issued;

  throw new Error(`Magic link token was not issued for ${args.staffEmail}`);
}

export async function getOrCreateLineLinkToken(args: {
  shopId?: string;
  staffEmail: string;
}): Promise<CreatedLineLinkResult> {
  // LINE Login の外部画面には遷移しない。E2Eではアプリ側で連携URLを発行できることだけ確認する。
  const existing = await pollConvexToken<LineLinkResult>("testing:getLatestLineLinkToken", args, POLL_ATTEMPTS);
  if (existing) return existing;

  return convexRunJson<CreatedLineLinkResult>("testing:createLineLinkTokenForStaff", args);
}
