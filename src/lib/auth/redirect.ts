const AUTH_PATHS = new Set(["/login", "/signup", "/forgot-password", "/sso-callback"]);

type RestartAuthMode = "login" | "signup";

function withoutTrailingSlash(pathname: string) {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

export function normalizeAuthRedirect(value: unknown) {
  if (typeof value !== "string") return "/dashboard";

  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return "/dashboard";

  try {
    const url = new URL(trimmed, "https://shiftli.local");
    if (url.origin !== "https://shiftli.local") return "/dashboard";
    // URL正規化後に`//host`へ変わるpathも、protocol-relative URLとして扱われる前に拒否する。
    if (!url.pathname.startsWith("/") || url.pathname.startsWith("//")) return "/dashboard";
    if (AUTH_PATHS.has(withoutTrailingSlash(url.pathname))) return "/dashboard";

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/dashboard";
  }
}

export function buildSsoCallbackUrl(value: unknown) {
  const search = new URLSearchParams({ redirect: normalizeAuthRedirect(value) });
  return `/sso-callback?${search.toString()}`;
}

export function buildRestartAuthUrl(mode: RestartAuthMode, value: unknown) {
  const search = new URLSearchParams({ redirect: normalizeAuthRedirect(value) });
  return `/${mode}?${search.toString()}`;
}
