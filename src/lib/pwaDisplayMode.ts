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
