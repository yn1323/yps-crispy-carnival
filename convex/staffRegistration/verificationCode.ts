import { sha256Hex } from "../_lib/sha256";
import { STAFF_REGISTRATION_VERIFICATION_CODE_LENGTH } from "../constants";

/** 確認コードメールの送信context。メールproviderの失敗ログを、この送信と結び付けるために使う。 */
export const STAFF_REGISTRATION_VERIFICATION_CODE_CONTEXT = "staffRegistration.sendVerificationCode";

const CODE_SPACE = 10 ** STAFF_REGISTRATION_VERIFICATION_CODE_LENGTH;
const UINT32_RANGE = 2 ** 32;
// 剰余の偏りを避けるため、コード空間の倍数に収まる乱数だけを採用する。
const UNBIASED_LIMIT = UINT32_RANGE - (UINT32_RANGE % CODE_SPACE);

/** 暗号学的に安全な乱数から、先頭の0を保った数字だけの確認コードを作る。 */
export function generateVerificationCode(): string {
  const buffer = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buffer);
    const value = buffer[0];
    if (value < UNBIASED_LIMIT) {
      return (value % CODE_SPACE).toString().padStart(STAFF_REGISTRATION_VERIFICATION_CODE_LENGTH, "0");
    }
  }
}

/** ブラウザへ返す引換tokenは保存せず、このdigestだけで確認待ちを引く。 */
export async function digestVerificationHandle(verificationToken: string): Promise<string> {
  return await sha256Hex(`staff-registration-verification-handle:${verificationToken}`);
}

/** 確認コードは引換tokenごとに別のdigestになるようにし、別の確認待ちへ使い回せないようにする。 */
export async function digestVerificationCode(handleDigest: string, code: string): Promise<string> {
  return await sha256Hex(`staff-registration-verification-code:${handleDigest}:${code}`);
}

/** HTTP入口と再送で同じbudgetを消費するため、rate limitのkeyを1か所で作る。生のtoken・メール・IPは保存しない。 */
export async function hashStaffRegistrationRateLimitKey(
  namespace: "email" | "link" | "ip",
  value: string,
): Promise<string> {
  return await sha256Hex(`${namespace}:${value}`);
}

export async function staffRegistrationEmailRateLimitKey(token: string, emailNormalized: string): Promise<string> {
  return await hashStaffRegistrationRateLimitKey("email", `${token}:${emailNormalized}`);
}
