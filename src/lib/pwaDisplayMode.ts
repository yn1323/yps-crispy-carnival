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

const APP_WINDOW_SESSION_KEY = "shiftori:app-window-opened";

let wasAppOpenedEarlierInWindow = false;

// documentの読込ごとに1回呼び、同じウィンドウでアプリを既に開いていたかを記録する。
// アプリ画面は`Referrer-Policy: no-referrer`で配信するため、referrerではアプリ内遷移とホーム画面起動を区別できない。
export function recordAppDocumentLoad(): void {
  try {
    wasAppOpenedEarlierInWindow = window.sessionStorage.getItem(APP_WINDOW_SESSION_KEY) !== null;
    window.sessionStorage.setItem(APP_WINDOW_SESSION_KEY, "1");
  } catch {
    wasAppOpenedEarlierInWindow = false;
  }
}

// ホーム画面のアイコンから`pathname`を直接開いた起動かを判定する。
// ログアウトやTOPリンクによるアプリ内のdocument遷移では、同じウィンドウのsessionStorageに記録が残る。
export function isCurrentDocumentStandaloneLaunchAt(pathname: string): boolean {
  if (!isCurrentWindowStandaloneWebApp()) return false;

  const [navigationEntry] =
    typeof performance.getEntriesByType === "function" ? performance.getEntriesByType("navigation") : [];
  const initialDocumentUrl = new URL(navigationEntry?.name || window.location.href);
  if (initialDocumentUrl.pathname !== pathname) return false;

  return !wasAppOpenedEarlierInWindow;
}
