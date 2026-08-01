import type { Id } from "../_generated/dataModel";
import { APP_URL } from "./config";

export function buildShopDashboardUrl(shopId: Id<"shops">): string {
  const url = new URL("/dashboard", APP_URL);
  url.searchParams.set("shop", shopId);
  return url.toString();
}
