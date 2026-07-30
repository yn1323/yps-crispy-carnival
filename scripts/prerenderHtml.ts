const LOOPBACK_URL_PATTERN = /https?:\/\/(?:localhost|127(?:\.\d{1,3}){3}|\[::1\])(?::\d+)?(?:\/[^\s"'<>]*)?/i;

/**
 * prerender 用の一時 origin を、デプロイ先でも解決できる同一 origin の URL に戻す。
 * page.content() は React が動的に追加した preload の href を絶対 URL で返すため、
 * そのまま配信すると閲覧端末の loopback へのアクセスになってしまう。
 */
export function normalizePrerenderedHtml(html: string, renderingBaseUrl: string): string {
  const renderingOrigin = new URL(renderingBaseUrl).origin;
  return html.replaceAll(renderingOrigin, "");
}

export function assertNoLoopbackUrls(route: string, html: string): void {
  const match = html.match(LOOPBACK_URL_PATTERN);
  if (!match) return;

  throw new Error(`[prerender] ${route} contains a loopback URL (${match[0]})`);
}
