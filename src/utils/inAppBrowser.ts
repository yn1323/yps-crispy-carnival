/**
 * LINEアプリ内ブラウザ（WebView）の判定。
 * iOS/AndroidともにUAに " Line/x.y.z" が含まれる。
 * LINE内ブラウザではGoogle OAuthがブロックされる（403: disallowed_useragent）ため、
 * 検出時は `withOpenExternalBrowser`（@/convex/_lib/lineUrl）で外部ブラウザに誘導する。
 */
export function isLineInAppBrowser(userAgent: string): boolean {
  return / Line\//.test(userAgent);
}
