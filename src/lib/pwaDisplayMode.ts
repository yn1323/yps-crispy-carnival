export const STANDALONE_DISPLAY_QUERY = "(display-mode: standalone)";

type NavigatorWithStandalone = Navigator & {
  standalone?: boolean;
};

export function isStandaloneWebApp(displayModeMatches: boolean, navigator: Navigator): boolean {
  return displayModeMatches || (navigator as NavigatorWithStandalone).standalone === true;
}

export function isCurrentWindowStandaloneWebApp(): boolean {
  if (typeof window === "undefined") return false;

  const displayModeMatches =
    typeof window.matchMedia === "function" && window.matchMedia(STANDALONE_DISPLAY_QUERY).matches;
  return isStandaloneWebApp(displayModeMatches, window.navigator);
}

// ホーム画面のアイコンから`pathname`を直接開いた起動かを判定する。
// アプリ内のリンクから移動した場合は、同一originのreferrerが付くか、最初のdocumentが別のpathになる。
export function isCurrentDocumentStandaloneLaunchAt(pathname: string): boolean {
  if (!isCurrentWindowStandaloneWebApp()) return false;

  const [navigationEntry] =
    typeof performance.getEntriesByType === "function" ? performance.getEntriesByType("navigation") : [];
  const initialDocumentUrl = new URL(navigationEntry?.name || window.location.href);
  if (initialDocumentUrl.pathname !== pathname) return false;

  return !isSameOriginUrl(document.referrer, window.location.origin);
}

function isSameOriginUrl(url: string, origin: string): boolean {
  if (url === "") return false;

  try {
    return new URL(url).origin === origin;
  } catch {
    return false;
  }
}
