// AIの呼び出しが失敗した理由を、画面で伝え分ける種類に直す。
// DBアクセス・Convex APIのインポート禁止（shiftBoard/validation.tsと同じ共有規約）。

/**
 * - notConfigured: この環境ではAI作成を使えない。
 * - unsupported: 時間指定でない募集。AI作成は時間指定の募集だけを扱う。
 * - rateLimited: 短い時間に続けて押した。少し待てば使える。
 * - limitReached: 1つの募集で使える回数に達した。時間がたっても戻らない。
 * - billing: 利用料の残高がない、または月の上限に達した。待っても直らないため、運営側の対応が要る。
 * - busy: 混雑や一時的な障害。少し待てば直る見込みがある。
 * - declined: AIが応じなかった、または返答が途中で切れた。
 * - unavailable: 設定の誤りなど、それ以外の失敗。
 */
export const AI_DRAFT_FAILURE_KINDS = [
  "notConfigured",
  "unsupported",
  "rateLimited",
  "limitReached",
  "billing",
  "busy",
  "declined",
  "unavailable",
] as const;
export type AiDraftFailureKind = (typeof AI_DRAFT_FAILURE_KINDS)[number];

/** 月の上限に達したときに、429の応答に入るコード。 */
const SPEND_LIMIT_ERROR_CODE = "enforced_spend_limit_reached";

type ApiErrorLike = { status?: number; type?: string | null; errorCode?: string | null };

/**
 * APIが返したエラーを種類に直す。
 * 残高切れは402、月の上限は429で届く。同じ429でも、混雑は待てば直るため、コードで見分ける。
 */
export function classifyAiDraftApiError(error: ApiErrorLike): "billing" | "busy" | "unavailable" {
  if (error.status === 402 || error.type === "billing_error") return "billing";
  if (error.status === 429) return error.errorCode === SPEND_LIMIT_ERROR_CODE ? "billing" : "busy";
  // statusのないエラーは、接続の失敗と時間切れである。
  if (error.status === undefined || error.status >= 500) return "busy";
  return "unavailable";
}
