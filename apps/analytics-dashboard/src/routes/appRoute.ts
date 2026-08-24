import { useCallback, useEffect, useState } from "react";
import { upgradeAnalyticsPlanSearchParams } from "@/api/analyticsPlanIds";

export type AppRoute =
  | { name: "overview" }
  | { name: "organizations" }
  | { name: "organization"; organizationId: string }
  | { name: "shops" }
  | { name: "shop"; shopId: string }
  | { name: "cycle"; shopId: string; recruitmentId: string }
  | { name: "requests" }
  | { name: "notFound" };

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function parseAppRoute(pathname: string): AppRoute {
  const segments = pathname.replace(/\/+$/, "").split("/").filter(Boolean).map(safeDecode);

  if (segments.length === 0) return { name: "overview" };
  if (segments.length === 1 && segments[0] === "organizations") return { name: "organizations" };
  if (segments.length === 2 && segments[0] === "organizations" && segments[1]) {
    return { name: "organization", organizationId: segments[1] };
  }
  if (segments.length === 1 && segments[0] === "shops") return { name: "shops" };
  if (segments.length === 2 && segments[0] === "shops" && segments[1]) {
    return { name: "shop", shopId: segments[1] };
  }
  if (segments.length === 4 && segments[0] === "shops" && segments[1] && segments[2] === "cycles" && segments[3]) {
    return { name: "cycle", recruitmentId: segments[3], shopId: segments[1] };
  }
  if (segments.length === 1 && segments[0] === "requests") return { name: "requests" };
  return { name: "notFound" };
}

export function routePath(route: Exclude<AppRoute, { name: "notFound" }>) {
  switch (route.name) {
    case "overview":
      return "/";
    case "organizations":
      return "/organizations";
    case "organization":
      return `/organizations/${encodeURIComponent(route.organizationId)}`;
    case "shops":
      return "/shops";
    case "shop":
      return `/shops/${encodeURIComponent(route.shopId)}`;
    case "cycle":
      return `/shops/${encodeURIComponent(route.shopId)}/cycles/${encodeURIComponent(route.recruitmentId)}`;
    case "requests":
      return "/requests";
  }
}

export function withCurrentSearch(path: string, options: { dropSort?: boolean } = {}) {
  return withSearchPatch(path, {}, options);
}

export function withSearchPatch(
  path: string,
  patch: Record<string, string | undefined>,
  options: { dropSort?: boolean } = {},
) {
  const params = new URLSearchParams(window.location.search);
  upgradeAnalyticsPlanSearchParams(params);
  params.delete("cursor");
  params.delete("segmentCursor");
  if (options.dropSort) {
    params.delete("sort");
    params.delete("direction");
  }
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) params.delete(key);
    else params.set(key, value);
  }
  const search = params.toString();
  return search ? `${path}?${search}` : path;
}

export function useAppRoute() {
  const [route, setRoute] = useState(() => parseAppRoute(window.location.pathname));

  useEffect(() => {
    const handlePopState = () => setRoute(parseAppRoute(window.location.pathname));
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigate = useCallback((path: string) => {
    window.history.pushState(null, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
    window.scrollTo({ top: 0 });
    window.requestAnimationFrame(() => document.querySelector<HTMLElement>("h1")?.focus());
  }, []);

  return { navigate, route };
}
