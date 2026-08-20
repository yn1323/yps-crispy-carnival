import type {
  AppFeatureRequestScope,
  AppFeatureRequestShop,
} from "@/src/components/features/FeatureRequestDialog/appScope";

type Input = {
  pathname: string;
  homeShopId?: string;
  activeShops: AppFeatureRequestShop[];
};

/** 画面から分かる店舗は、canonical organization queryが返したactive店舗との一致だけで採用する。 */
export function resolveAppFeatureRequestScope({ pathname, homeShopId, activeShops }: Input): AppFeatureRequestScope {
  const routePathname = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const requestedShopId =
    routePathname.toLowerCase() === "/dashboard" ? homeShopId : resolveScopedShopId(routePathname);
  const verifiedShop = requestedShopId ? activeShops.find((shop) => shop.id === requestedShopId) : undefined;

  return verifiedShop ? { kind: "shop", shop: verifiedShop } : { kind: "organization" };
}

function resolveScopedShopId(pathname: string): string | undefined {
  const match = pathname.match(/^\/manage\/shops\/([^/]+)$/i) ?? pathname.match(/^\/staff\/[^/]+\/shops\/([^/]+)$/i);
  if (!match?.[1]) return undefined;

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return undefined;
  }
}
