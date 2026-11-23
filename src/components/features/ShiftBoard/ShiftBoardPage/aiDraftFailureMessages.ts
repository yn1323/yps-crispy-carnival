import type { AiDraftFailureKind } from "@/convex/shiftBoard/autoCreate/ai/aiDraftFailure";

const RETRY_LATER = "しばらく時間をおいてから再実行してください";
const ERROR = { title: "エラー", description: RETRY_LATER };

/**
 * AIで作成できなかったときに、店長へ見せる文。
 * 店長に見せる文は、原因が違っても同じものが多い。原因は種類（キー）で分けたまま持ち、サーバーのログにも種類を残す。
 * 利用料の残高や設定の話は、店長には出さない。
 */
export const AI_DRAFT_FAILURE_MESSAGES: Record<AiDraftFailureKind, { title: string; description?: string }> = {
  // 短い時間に続けて押した。
  rateLimited: { title: "しばらく時間をおいてから実行してください" },
  // この募集で使える回数に達した。残りが0のときは選べなくするため、画面が古いまま押した場合に出る。
  limitReached: { title: "回数の上限に達しました" },
  // AI側の混雑、障害、接続の失敗、待ち時間切れ。
  busy: { title: "混み合っています", description: RETRY_LATER },
  // AIが応じなかった、返答が途中で切れた、返ってきた形が壊れていた。
  declined: ERROR,
  // 利用料の残高切れ、月の利用上限。
  billing: ERROR,
  // APIキーやモデル名の誤り、送る量の超過など、設定と要求の誤り。
  unavailable: ERROR,
  // AIを使えない環境。画面が古いまま押した場合に出る。
  notConfigured: ERROR,
  // 時間指定でない募集。画面が古いまま押した場合に出る。
  unsupported: ERROR,
};
