import type {
  ConfirmStaffRegistrationCodeInput,
  ResendStaffRegistrationCodeInput,
  SubmitStaffRegistrationInput,
} from "@/convex/staffRegistration/schemas";
import { CONVEX_SITE_URL } from "@/src/configs/publicEnv";

export type StaffRegistrationApiErrorCode =
  | "code_mismatch"
  | "code_unusable"
  | "cooldown"
  | "send_limit"
  | "verification_unusable";

const API_ERROR_CODES: readonly string[] = [
  "code_mismatch",
  "code_unusable",
  "cooldown",
  "send_limit",
  "verification_unusable",
] satisfies readonly StaffRegistrationApiErrorCode[];

/** serverが返した安全な文言と、画面の分岐に使う分類を運ぶ。 */
export class StaffRegistrationApiError extends Error {
  readonly code: StaffRegistrationApiErrorCode | undefined;
  /** 次に確認コードを送れるまでの残り時間。serverが返した場合だけ持つ。 */
  readonly resendAfterMs: number | undefined;

  constructor(message: string, options: { code?: StaffRegistrationApiErrorCode; resendAfterMs?: number } = {}) {
    super(message);
    this.name = "StaffRegistrationApiError";
    this.code = options.code;
    this.resendAfterMs = options.resendAfterMs;
  }
}

/** 端末の時計のずれに左右されないよう、serverは絶対時刻ではなく残り時間を返す。 */
export type StaffRegistrationCodeSent = {
  resendAfterMs: number;
  codeTtlMs: number;
};

type ResponseBody = {
  status?: unknown;
  error?: unknown;
  code?: unknown;
  verificationToken?: unknown;
  resendAfterMs?: unknown;
  codeTtlMs?: unknown;
} | null;

const START_FALLBACK_ERROR = "確認コードを送れませんでした。\n少し時間をおいてお試しください。";
const CONFIRM_FALLBACK_ERROR = "スタッフ登録を申請できませんでした。\n少し時間をおいてお試しください。";

function isDuration(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

async function post(path: string, data: unknown): Promise<{ ok: boolean; body: ResponseBody }> {
  const response = await fetch(`${CONVEX_SITE_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
  });
  const body = (await response.json().catch(() => null)) as ResponseBody;
  return { ok: response.ok, body };
}

function toApiError(body: ResponseBody, fallbackMessage: string): StaffRegistrationApiError {
  const code = typeof body?.code === "string" && API_ERROR_CODES.includes(body.code) ? body.code : undefined;
  return new StaffRegistrationApiError(typeof body?.error === "string" ? body.error : fallbackMessage, {
    code: code as StaffRegistrationApiErrorCode | undefined,
    resendAfterMs: isDuration(body?.resendAfterMs) ? body.resendAfterMs : undefined,
  });
}

function readCodeSent(body: ResponseBody): StaffRegistrationCodeSent | null {
  if (body?.status !== "code_sent" || !isDuration(body.resendAfterMs) || !isDuration(body.codeTtlMs)) return null;
  return { resendAfterMs: body.resendAfterMs, codeTtlMs: body.codeTtlMs };
}

/** 入力内容を送り、確認コードのメールを受け取るための引換tokenを得る。 */
export async function startStaffRegistrationVerification(
  data: SubmitStaffRegistrationInput,
): Promise<StaffRegistrationCodeSent & { verificationToken: string }> {
  const { ok, body } = await post("/staff-registration/verification/start", data);
  const sent = ok ? readCodeSent(body) : null;
  if (!sent || typeof body?.verificationToken !== "string") throw toApiError(body, START_FALLBACK_ERROR);
  return { ...sent, verificationToken: body.verificationToken };
}

/** 確認コードを照合する。合えば参加申請が受け付けられる。 */
export async function confirmStaffRegistrationCode(data: ConfirmStaffRegistrationCodeInput): Promise<void> {
  const { ok, body } = await post("/staff-registration/verification/confirm", data);
  if (!ok || body?.status !== "accepted") throw toApiError(body, CONFIRM_FALLBACK_ERROR);
}

export async function resendStaffRegistrationCode(
  data: ResendStaffRegistrationCodeInput,
): Promise<StaffRegistrationCodeSent> {
  const { ok, body } = await post("/staff-registration/verification/resend", data);
  const sent = ok ? readCodeSent(body) : null;
  if (!sent) throw toApiError(body, START_FALLBACK_ERROR);
  return sent;
}
