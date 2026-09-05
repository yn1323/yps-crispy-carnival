import { useCallback, useEffect, useState } from "react";

export type AppRoute =
  | { name: "overview" }
  | { name: "shops" }
  | { name: "shop"; shopId: string }
  | { name: "staff"; shopId: string; staffId: string }
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
  if (segments.length === 1 && segments[0] === "shops") return { name: "shops" };
  if (segments.length === 2 && segments[0] === "shops" && segments[1]) {
    return { name: "shop", shopId: segments[1] };
  }
  if (segments.length === 4 && segments[0] === "shops" && segments[1] && segments[2] === "cycles" && segments[3]) {
    return { name: "cycle", recruitmentId: segments[3], shopId: segments[1] };
  }
  if (segments.length === 4 && segments[0] === "shops" && segments[1] && segments[2] === "staff" && segments[3]) {
    return { name: "staff", staffId: segments[3], shopId: segments[1] };
  }
  if (segments.length === 1 && segments[0] === "requests") return { name: "requests" };
  return { name: "notFound" };
}

export function routePath(route: Exclude<AppRoute, { name: "notFound" }>) {
  switch (route.name) {
    case "overview":
      return "/";
    case "shops":
      return "/shops";
    case "shop":
      return `/shops/${encodeURIComponent(route.shopId)}`;
    case "staff":
      return `/shops/${encodeURIComponent(route.shopId)}/staff/${encodeURIComponent(route.staffId)}`;
    case "cycle":
      return `/shops/${encodeURIComponent(route.shopId)}/cycles/${encodeURIComponent(route.recruitmentId)}`;
    case "requests":
      return "/requests";
  }
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
