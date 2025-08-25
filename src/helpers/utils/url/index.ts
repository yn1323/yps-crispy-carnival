/**
 * 動的にベースURLを生成する
 * Server ActionsとRoute Handlersで共通利用
 */
export const createBaseUrl = async () => {
  const { headers } = await import("next/headers");
  const headersList = await headers();
  const host = headersList.get("host") || "localhost:3000";
  const protocol = host.includes("localhost") ? "http" : "https";
  return `${protocol}://${host}`;
};

/**
 * リクエストからオリジンURLを取得する
 * Route Handlersで利用
 */
export const getOriginFromRequest = (requestUrl: string) => {
  const { origin } = new URL(requestUrl);
  return origin;
};
