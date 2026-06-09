/**
 * LINEメッセージ本文に載せるURLには必ずこの関数を通すこと。
 *
 * LINEアプリ内ブラウザ（WebView）ではGoogle OAuthがブロックされる
 * （403: disallowed_useragent）ため、LINE公式のクエリパラメータ
 * `openExternalBrowser=1` を付与して端末の既定ブラウザで開かせる。
 */
export function withOpenExternalBrowser(url: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set("openExternalBrowser", "1");
  return parsed.toString();
}
