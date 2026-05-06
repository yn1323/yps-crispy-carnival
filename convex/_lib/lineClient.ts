/**
 * LINE API クライアント（fetch ラッパー）
 *
 * - Messaging API: push / reply / quota
 * - LINE Login: token / profile
 *
 * 環境変数:
 *   LINE_LOGIN_CHANNEL_ID
 *   LINE_LOGIN_CHANNEL_SECRET
 *   LINE_MESSAGING_CHANNEL_ACCESS_TOKEN
 */

const LINE_API_BASE = "https://api.line.me";

function getMessagingAccessToken(): string {
  const token = process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN;
  if (!token) throw new Error("LINE_MESSAGING_CHANNEL_ACCESS_TOKEN is not set");
  return token;
}

export type LineTextMessage = { type: "text"; text: string };

/** Push 送信。連携済みかつ友達追加中のスタッフに対して使う */
export async function pushTextMessage(toUserId: string, text: string): Promise<void> {
  const res = await fetch(`${LINE_API_BASE}/v2/bot/message/push`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getMessagingAccessToken()}`,
    },
    body: JSON.stringify({ to: toUserId, messages: [{ type: "text", text } satisfies LineTextMessage] }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`LINE push failed: ${res.status} ${body}`);
  }
}

/** Reply 送信。replyToken を消費する。課金対象外 */
export async function replyTextMessage(replyToken: string, text: string): Promise<void> {
  const res = await fetch(`${LINE_API_BASE}/v2/bot/message/reply`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getMessagingAccessToken()}`,
    },
    body: JSON.stringify({ replyToken, messages: [{ type: "text", text } satisfies LineTextMessage] }),
  });
  if (!res.ok) {
    // reply はトークン期限切れ等でも 400 が返る。Webhook 全体は止めない
    const body = await res.text().catch(() => "");
    throw new Error(`LINE reply failed: ${res.status} ${body}`);
  }
}

/** Quota（当月上限）取得 */
export async function getMessageQuota(): Promise<{ type: "limited" | "none"; value: number }> {
  const res = await fetch(`${LINE_API_BASE}/v2/bot/message/quota`, {
    headers: { Authorization: `Bearer ${getMessagingAccessToken()}` },
  });
  if (!res.ok) throw new Error(`LINE quota fetch failed: ${res.status}`);
  const data = (await res.json()) as { type: "limited" | "none"; value?: number };
  return { type: data.type, value: data.value ?? 0 };
}

/** 当月消費通数を取得 */
export async function getMessageQuotaConsumption(): Promise<number> {
  const res = await fetch(`${LINE_API_BASE}/v2/bot/message/quota/consumption`, {
    headers: { Authorization: `Bearer ${getMessagingAccessToken()}` },
  });
  if (!res.ok) throw new Error(`LINE quota consumption fetch failed: ${res.status}`);
  const data = (await res.json()) as { totalUsage: number };
  return data.totalUsage;
}

/** LINE Login の認可コードを access_token に交換 */
export async function exchangeAuthorizationCode(params: {
  code: string;
  redirectUri: string;
  channelId: string;
  channelSecret: string;
}): Promise<{ accessToken: string }> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: params.redirectUri,
    client_id: params.channelId,
    client_secret: params.channelSecret,
  });
  const res = await fetch(`${LINE_API_BASE}/oauth2/v2.1/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`LINE token exchange failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as { access_token: string };
  return { accessToken: data.access_token };
}

/** LINE Login のプロフィール取得（userId のみ使う） */
export async function fetchLineProfile(accessToken: string): Promise<{ userId: string; displayName: string }> {
  const res = await fetch(`${LINE_API_BASE}/v2/profile`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`LINE profile fetch failed: ${res.status}`);
  const data = (await res.json()) as { userId: string; displayName: string };
  return { userId: data.userId, displayName: data.displayName };
}

/** LINEログインチャネルに紐づく公式アカウントとの友だち状態を取得 */
export async function fetchLineFriendshipStatus(accessToken: string): Promise<{ friendFlag: boolean }> {
  const res = await fetch(`${LINE_API_BASE}/friendship/v1/status`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`LINE friendship status fetch failed: ${res.status}`);
  const data = (await res.json()) as { friendFlag: boolean };
  return { friendFlag: data.friendFlag };
}

/**
 * 認可URL組み立て
 * `bot_prompt=aggressive` で公式アカウント友達追加チェックを目立たせる
 */
export function buildLineAuthorizeUrl(params: { channelId: string; redirectUri: string; state: string }): string {
  const url = new URL("https://access.line.me/oauth2/v2.1/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", params.channelId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("state", params.state);
  url.searchParams.set("scope", "profile openid");
  url.searchParams.set("bot_prompt", "aggressive");
  return url.toString();
}
