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

export async function getOrCreateMagicLinkToken(args: {
  recruitmentId?: string;
  staffEmail: string;
  purpose: MagicLinkPurpose;
}): Promise<CreatedMagicLinkResult> {
  // 通知 action は scheduler 経由で非同期実行される。
  // まず実際に発行された token を待ち、無ければテスト用 internal API で補助発行してシナリオを進める。
  for (let i = 0; i < POLL_ATTEMPTS; i++) {
    const result = convexRunJson<MagicLinkResult>("testing:getLatestMagicLinkToken", args);
    if (result.token) return result as CreatedMagicLinkResult;
    await sleep(POLL_INTERVAL_MS);
  }

  return convexRunJson<CreatedMagicLinkResult>("testing:createMagicLinkTokenForLatestRecruitment", args);
}

export async function waitForMagicLinkToken(args: {
  recruitmentId?: string;
  staffEmail: string;
  purpose: MagicLinkPurpose;
}): Promise<CreatedMagicLinkResult> {
  // 追送・follow起点の通知は「発行されること」自体が検証対象なので、補助発行せず待ち切れなければ失敗にする。
  for (let i = 0; i < POLL_ATTEMPTS * 2; i++) {
    const result = convexRunJson<MagicLinkResult>("testing:getLatestMagicLinkToken", args);
    if (result.token) return result as CreatedMagicLinkResult;
    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(`Magic link token was not issued for ${args.staffEmail}`);
}

export async function getOrCreateLineLinkToken(staffEmail: string): Promise<CreatedLineLinkResult> {
  // LINE Login の外部画面には遷移しない。E2Eではアプリ側で連携URLを発行できることだけ確認する。
  for (let i = 0; i < POLL_ATTEMPTS; i++) {
    const result = convexRunJson<LineLinkResult>("testing:getLatestLineLinkToken", { staffEmail });
    if (result.token) return result as CreatedLineLinkResult;
    await sleep(POLL_INTERVAL_MS);
  }

  return convexRunJson<CreatedLineLinkResult>("testing:createLineLinkTokenForStaff", { staffEmail });
}
